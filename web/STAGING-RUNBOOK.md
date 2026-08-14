# GANU · Staging Runbook (ganu-staging) — migration / doğrulama / rollback

> Sıra: **kod açıkları (tamam)** → staging Supabase → migration/test → production.
> Bu belge staging üzerinde uygulanır. Gerçek müşteri verisi / gerçek PayTR
> tahsilatı KULLANILMAZ (PAYTR_TEST_MODE=1). Secret'lar yalnız Supabase secret
> store'a girer; sohbete/GitHub'a yazılmaz.

## 0) Ön koşul
- `ganu-staging` projesi. Project URL + anon key → `web/.env` (public).
- Secret'lar: `supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SITE_URL=... PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=... PAYTR_TEST_MODE=1`

## 1) Migration sırası (SQL editor ya da `supabase db push`)
1. `supabase-schema.sql`            — ana şema (tablolar, RLS, portal RPC, pos_orders, security_events)
2. `supabase/migrations/0001_pricing_catalog.sql`  — packages, discount_codes, pos_orders fiyat alanları, **pos_settle**
3. `supabase/migrations/0002_private_storage.sql`  — secure-docs bucket + RLS + owns_secure_object
4. `supabase/migrations/0003_auth_hardening.sql`   — bcrypt _pw_match, set_portal_password (yetkili), staff_roles, legacy reset

Storage bucket: 0002 `insert into storage.buckets` ile açar; Dashboard → Storage'da
`secure-docs` **public=false** olduğunu teyit et.

Edge Function: `supabase functions deploy pos-payment --no-verify-jwt`
Personel: Auth → Users → invite; `insert into public.staff_roles(user_id, role) values ('<uid>','owner');`

---

## 2) Doğrulama SQL'leri (SQL editor'de çalıştır)

### P0.2 — katalog + fail-closed
```sql
-- (poz) katalog var ve tek kaynak
select id, list_amount, is_custom, active, price_version from public.packages order by sort;
-- (poz) gizli kod anon'a KAPALI olmalı: anon rolüyle select boş dönmeli (RLS)
--   → Dashboard "RLS policies" ile teyit; discount_codes'ta anon policy YOK.
```
> Fiyat manipülasyonu (amount=1) ve bilinmeyen paket testleri Edge seviyesindedir
> (§3 curl). computeOrder fallback YOK → katalog tablosu düşerse ödeme fail-closed.

### P0.5 — owns_secure_object (parantez + boş/yanlış kod)
```sql
-- hazırlık: bir müşteri ve access_code
select id, access_code from public.customers limit 1;   -- diyelim id=CID, code='ISIK03'

-- (poz) doğru kod + kendi yolu → true
select public.owns_secure_object('ISIK03', 'mail/CID/abc.jpg');       -- t
-- (neg) yanlış kod → false
select public.owns_secure_object('YANLIS', 'mail/CID/abc.jpg');       -- f
-- (neg) BOŞ kod → false  (parantez hatası olsaydı true dönebilirdi)
select public.owns_secure_object('', 'mail/CID/abc.jpg');             -- f
-- (neg) başka müşterinin yolu → false
select public.owns_secure_object('ISIK03', 'mail/BASKA_ID/abc.jpg');  -- f
```

### P0.6 — parola hash (yalnız bcrypt) + yetki + legacy reset
```sql
-- (neg) düz metin ve sha256 REDDEDİLİR
select public._pw_match('duzmetin', 'duzmetin');                       -- f
select public._pw_match('sha256:'||encode(digest('x','sha256'),'hex'), 'x'); -- f
-- (poz) bcrypt eşleşir
select public._pw_match('bcrypt:'||crypt('Gizli1234', gen_salt('bf',12)), 'Gizli1234'); -- t
-- (poz) legacy kayıtlar sıfırlandı ve işaretlendi
select count(*) from public.customers
 where coalesce(portal_password,'') <> '' and portal_password not like 'bcrypt:%';  -- 0
select count(*) from public.customers where must_reset_password;       -- >=0 (eskiler)
-- (neg) yetkisiz set_portal_password → exception (owner/admin değil)
--   anon/normal authenticated ile çağır → 'yetki yok' hatası beklenir.
```

### P0.3 — atomik POS settle (idempotency + tutar)
```sql
-- hazırlık: test siparişi (amount 189.90 → 18990 kuruş)
insert into public.pos_orders(merchant_oid, customer_id, amount, pkg, provider, status)
 values ('TEST_OID_1', (select id from public.customers limit 1), 189.90, 'Pro', 'paytr', 'bekliyor');

-- (poz) doğru tutar → 'ok' + müşteri işaretlenir
select public.pos_settle('TEST_OID_1', 'success', 18990);             -- ok
-- (neg) idempotency: aynı çağrı → 'idempotent', çift işlem YOK
select public.pos_settle('TEST_OID_1', 'success', 18990);             -- idempotent
-- (neg) tutar uyuşmazlığı (yeni sipariş)
insert into public.pos_orders(merchant_oid, customer_id, amount, pkg, provider, status)
 values ('TEST_OID_2', (select id from public.customers limit 1), 189.90, 'Pro', 'paytr', 'bekliyor');
select public.pos_settle('TEST_OID_2', 'success', 100);              -- mismatch
select kind, detail from public.security_events where kind='pos_amount_mismatch'; -- kayıt var
select status from public.pos_orders where merchant_oid='TEST_OID_2';            -- şüpheli
-- temizlik
delete from public.pos_orders where merchant_oid in ('TEST_OID_1','TEST_OID_2');
```

---

## 3) Edge Function negatif testleri (curl — fonksiyon deploy sonrası)
```bash
FN="$SUPABASE_URL/functions/v1/pos-payment"
# (neg) istemci amount enjekte etse bile sunucu YOK SAYAR (fiyat DB'den)
curl -s -X POST "$FN" -H "content-type: application/json" \
  -d '{"action":"init","provider":"paytr","customer_id":"<CID>","package_id":"Pro","amount":1}'
#   → dönen amount 18990/100 = 189.90; PayTR tutarı 18990 kuruş. amount:1 etkisiz.
# (neg) bilinmeyen paket → "Geçersiz paket"
curl -s -X POST "$FN" -H "content-type: application/json" \
  -d '{"action":"init","provider":"paytr","customer_id":"<CID>","package_id":"YOK"}'
# (neg) Kurumsal (is_custom) → "özel tekliftir; online ödeme alınmaz"
curl -s -X POST "$FN" -H "content-type: application/json" \
  -d '{"action":"init","provider":"paytr","customer_id":"<CID>","package_id":"Kurumsal"}'
# Not: callback idempotency §2 pos_settle ile SQL'de doğrulandı; PayTR hash'i
#      gerçek callback'te test_mode ile denenir.
```

---

## 4) Rollback planı (staging'de sorun çıkarsa)
Sıra TERSİNE. Her migration geri alınabilir:

```sql
-- 0003 geri al
drop function if exists public.set_portal_password(uuid, text);
drop function if exists public.current_staff_role();
drop table if exists public.staff_roles;
alter table public.customers drop column if exists must_reset_password;
-- _pw_match'i eski (sha256/düz metin) haline döndürmek İSTENMEZ (güvenlik);
-- gerekiyorsa schema'daki eski tanımı elle geri yükle.

-- 0002 geri al
drop function if exists public.owns_secure_object(text, text);
drop policy if exists "staff_rw_secure_docs" on storage.objects;
-- bucket'ı silmeden önce nesneleri boşalt:
-- delete from storage.objects where bucket_id='secure-docs';
delete from storage.buckets where id='secure-docs';

-- 0001 geri al
drop function if exists public.pos_settle(text, text, bigint);
alter table public.pos_orders
  drop column if exists price_version, drop column if exists list_amount,
  drop column if exists discount_code, drop column if exists discount_pct,
  drop column if exists currency;
drop table if exists public.discount_codes;
drop table if exists public.packages;
```
- **Kod tarafı rollback:** `git revert be8ba55` (7 madde) — ancak staging düzeltmeleri
  geçerse gerek yok. Frontend katalog wiring, Supabase yoksa sabitlere düşer (güvenli).
- **Veri:** staging'de gerçek veri yok; tablo drop güvenli. Production'da ASLA drop'la
  başlama — önce yedek/PITR.

## 5) Çıkış kriteri (production'a geçiş)
§2 + §3 tüm pozitif/negatif testler geçmeden `pos_enabled` açılmaz, production
Supabase kurulmaz, gerçek PayTR tahsilatı yapılmaz.
