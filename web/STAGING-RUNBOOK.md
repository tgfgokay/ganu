# GANU · Staging Runbook (ganu-staging) — migration / doğrulama / rollback

> Sıra: **kod açıkları (tamam)** → staging Supabase → migration/test → production.
> Bu belge staging üzerinde uygulanır. Gerçek müşteri verisi / gerçek PayTR
> tahsilatı KULLANILMAZ (PAYTR_TEST_MODE=1). Secret'lar yalnız Supabase secret
> store'a girer; sohbete/GitHub'a yazılmaz.

## 0) Ön koşul
- `ganu-staging` projesi. Project URL + anon key → `web/.env.local` (public).
- Secret'lar: `supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SITE_URL=... PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=... PAYTR_TEST_MODE=1`

Secret göstermeyen yerel ön kontrol: `bash scripts/staging-readiness.sh`.
Bu komut `READY` vermeden migration/deploy testine geçilmez; `READY` sonucu da canlı
migration veya testlerin geçtiği anlamına gelmez.

## 1) Migration sırası (SQL editor ya da aşağıdaki fail-fast `psql` sırası)
1. `supabase-schema.sql`            — ana şema (tablolar, RLS, portal RPC, pos_orders, security_events)
2. `supabase/migrations/0001_pricing_catalog.sql`  — packages, discount_codes, pos_orders fiyat alanları, **pos_settle**
3. `supabase/migrations/0002_private_storage.sql`  — secure-docs bucket + RLS + owns_secure_object
4. `supabase/migrations/0003_auth_hardening.sql`   — bcrypt _pw_match, set_portal_password (yetkili), staff_roles, legacy reset
5. `supabase/migrations/0004_prod_gate.sql`        — prod_gate_proof (service-role) + gate-probe müşteri
6. `supabase/migrations/0005_rbac_auth_storage.sql` — gerçek staff RBAC + JWT/auth_uid private storage
7. `supabase/migrations/0006_customer_portal_auth.sql` — doğrulanmış magic-link claim + JWT portal RPC; legacy anon portal kapalı

```bash
set -euo pipefail
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase-schema.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_pricing_catalog.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_private_storage.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_auth_hardening.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_prod_gate.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_rbac_auth_storage.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_customer_portal_auth.sql
```
`supabase-schema.sql` migration klasöründe olmadığı için boş bir projede yalnız
`supabase db push` çalıştırmak ana şemayı kurmaz; yukarıdaki sıra veya SQL Editor şarttır.

Storage bucket: 0002 `insert into storage.buckets` ile açar; Dashboard → Storage'da
`secure-docs` **public=false** olduğunu teyit et.

Edge Function:
- `supabase functions deploy pos-payment --no-verify-jwt`  (anon/callback erişir)
- `supabase functions deploy admin-gate`                   (JWT doğrulaması AÇIK — §6)
- `supabase functions deploy get-file`                     (JWT AÇIK; access_code kabul etmez)
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

### 3a) FAIL-CLOSED kapısı — katalog SORGU HATASI (kontrollü enjeksiyon)
> "Bilinmeyen/pasif paket" bunu KANITLAMAZ (o 'not found', DB hatası değil). Gerçek
> sorgu hatasını staging'de kontrollü enjekte ederiz. ⚠️ `POS_TEST_FAULT` yalnız
> `PAYTR_TEST_MODE=1` iken aktiftir; **production'a ASLA konmaz**. Test bitince kaldır.
```bash
# 1) Ölçüm öncesi sipariş sayısını al (SQL editor):
--   select count(*) as before_cnt from public.pos_orders;
# 2) Hata enjeksiyonunu aç ve yeniden deploy:
supabase secrets set POS_TEST_FAULT=catalog     # (PAYTR_TEST_MODE=1 olmalı)
supabase functions deploy pos-payment --no-verify-jwt
# 3) init çağır → 5xx beklenir (fiyat kataloğu okunamadı = fail-closed):
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$FN" \
  -H "content-type: application/json" \
  -d '{"action":"init","provider":"paytr","customer_id":"<CID>","package_id":"Pro"}'
#   → BEKLENEN: HTTP 5xx
# 4) Kanıt: sipariş EKLENMEDİ + PayTR ÇAĞRILMADI
--   select count(*) as after_cnt from public.pos_orders;   -- before_cnt ile AYNI
--   select count(*) from public.pos_orders where merchant_oid like 'GANU%'
--     and created_at > now() - interval '5 min';           -- 0 (yeni sipariş yok)
# 5) İNDİRİM yolu için de (dolu code ŞART — indirim sorgusu yalnız code doluyken çalışır):
supabase secrets set POS_TEST_FAULT=discount
supabase functions deploy pos-payment --no-verify-jwt
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$FN" \
  -H "content-type: application/json" \
  -d '{"action":"init","provider":"paytr","customer_id":"<CID>","package_id":"Pro","code":"BNINISANTASI"}'
#   → BEKLENEN: HTTP 5xx (indirim doğrulanamadı = fail-closed). Boş code ile bu yol
#     TETİKLENMEZ; bu yüzden test dolu code ile yapılır.
# 6) Enjeksiyonu KALDIR ve yeniden deploy:
supabase secrets unset POS_TEST_FAULT
supabase functions deploy pos-payment --no-verify-jwt
```
Beklenen sonuç: **HTTP 5xx** ve **after_cnt == before_cnt (sipariş 0)** — bunlar
**gözlenmiş** sonuçlardır.

**"PayTR çağrısı 0" — STATİK KONTROL-AKIŞI KANITI (gözlenmiş değil):**
`paytrInit` içinde sıra kesindir → `computeOrder()` **ilk** çağrılır; hata orada
fırlar. `pos_orders` insert'i ve `fetch('…/get-token')` (PayTR çağrısı) computeOrder'dan
**SONRA** yazılıdır; bir istisna fırladığında bu satırlara **erişilmez** (unreachable).
Yani PayTR'a hiç gidilmemesi runtime gözlemiyle değil, **kod sıralamasıyla** garanti
edilir. (İsteğe bağlı ek gözlem: PayTR panel/log'unda ilgili zaman diliminde çağrı yok.)

---

## 4) Rollback planı (staging'de sorun çıkarsa)
> ⚠️ **`git revert` yalnız KODU geri alır, veritabanını GERİ ALMAZ.** DB için
> her migration'ın ayrı **down** dosyası vardır. Uygulama sırası **TERSİNE**:

```bash
# TERS SIRA (uygulanan son migration önce geri alınır):
psql "$DB_URL" -f supabase/migrations/0006_customer_portal_auth.down.sql
psql "$DB_URL" -f supabase/migrations/0005_rbac_auth_storage.down.sql
psql "$DB_URL" -f supabase/migrations/0004_prod_gate.down.sql
psql "$DB_URL" -f supabase/migrations/0003_auth_hardening.down.sql
psql "$DB_URL" -f supabase/migrations/0002_private_storage.down.sql
psql "$DB_URL" -f supabase/migrations/0001_pricing_catalog.down.sql
# (ya da her dosyanın içeriğini Supabase SQL editor'e sırayla yapıştır)
```
Down dosyaları:
- `supabase/migrations/0005_rbac_auth_storage.down.sql` — RBAC policy/helper; eski geniş erişimi geri açmaz
- `supabase/migrations/0004_prod_gate.down.sql` — prod_gate_proof ve gate-probe müşteri
- `supabase/migrations/0001_pricing_catalog.down.sql` — pos_settle, kolonlar, discount_codes, packages
- `supabase/migrations/0002_private_storage.down.sql` — owns_secure_object, policy, secure-docs bucket (nesneleri boşaltır)
- `supabase/migrations/0003_auth_hardening.down.sql` — set_portal_password, staff_roles, must_reset_password

**Tek yönlü / dikkat:**
- 0003 down: legacy `portal_password` değerleri `''` yapıldı; **geri gelmez** (staging'de
  sorun değil; production'da bu migration öncesi **PITR/yedek zorunlu**).
- 0003 down: `_pw_match` güvenlik gereği eski (sha256/düz metin) sürüme **otomatik
  dönmez** — acil durumda elle.
- 0002 down: bucket silmeden önce **tüm secure-docs nesnelerini siler**.

- **Kod rollback (ayrı):** `git revert be8ba55` — yalnız uygulama kodu. Frontend katalog
  wiring Supabase yoksa sabitlere düşer (güvenli).

## 5) Çıkış kriteri (production'a geçiş)
§2 + §3 tüm pozitif/negatif testler geçmeden `pos_enabled` açılmaz, production
Supabase kurulmaz, gerçek PayTR tahsilatı yapılmaz. Ek zorunlu kapılar:

- **§3a fail-closed:** `POS_TEST_FAULT=catalog` ile HTTP 5xx + sipariş 0 gözlenmeli;
  PayTR çağrısının erişilemez olduğu kod sıralamasında statik olarak doğrulanmalı;
  test sonrası secret KALDIRILMIŞ olmalı (`supabase secrets unset POS_TEST_FAULT`).
- **admin gate (makine-kontrollü):** aşağıdaki §6 ile gerçek JWT kanıtı üretilmeli;
  `prod_readiness_gate.sql` PASS vermeli. Kanıt yoksa readiness workflow'u **FAIL** olur.
- **POS_TEST_FAULT** production secret'larında **bulunmamalı** (prod-gate script kontrol eder).

## 6) PROD READINESS GATE — admin RPC gerçek-JWT kanıtı (makine-kontrollü)
> Amaç: "owner/admin gerçek authenticated JWT ile admin RPC çalıştırabiliyor"
> kanıtını üretip deploy'u ona bağlamak. Sadece staff_roles kaydı ya da SQL
> editor'de elle set edilen claim uygulama kanıtı sayılmaz (`getUser` JWT'yi doğrular).
> Ancak ayrıcalıklı SQL Editor rolü `prod_gate_proof` kaydı yazabilir; tablo yalnız
> operasyonel audit'tir. Asıl gate, CI'ın rastgele nonce'ına `admin-gate` tarafından
> verilen HMAC imzasını CI tarafında doğrular. Bu, DB kaydı taklidini engeller; proje
> sahibi veya CI/Supabase secret yöneticisinin kötü niyetli olmadığı varsayılır.

**Kurulum (bir kez):**
1. Migration `0004_prod_gate.sql` uygulanmış olmalı (prod_gate_proof + probe müşteri).
2. `admin-gate` fonksiyonu **JWT doğrulaması AÇIK** deploy edilir (--no-verify-jwt YOK):
   `supabase functions deploy admin-gate`
   Secret: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   en az 32 karakterlik `PROD_GATE_HMAC_SECRET`.
3. Gerçek bir **owner** auth kullanıcısı (Auth → invite) + `staff_roles(user_id,'owner')`.

**Kanıt üretimi (gerçek owner access-token ile):**
```bash
# owner kullanıcısının access_token'ı (uygulamadan/oturumdan) — repoya KONMAZ:
curl -s -X POST "$SUPABASE_URL/functions/v1/admin-gate" \
  -H "Authorization: Bearer <OWNER_ACCESS_TOKEN>" -H "apikey: <ANON_KEY>" \
  -H 'content-type: application/json' -d '{"nonce":"<64_HEX_RANDOM>"}'
#   → jwt/nonce/issued_at/signature döner; prod-gate.sh HMAC'ı doğrular.
```

**Gate kontrolü (deploy öncesi / CI):**
```bash
DB_URL='postgres://...' bash web/scripts/prod-gate.sh
#   → PASS: DB/project-ref aynı hedef + remote fault yok + JWT/HMAC + DB audit var
#   → FAIL/eksik: non-zero exit; yalnız bağlı deploy job'ını durdurabilir
```
Aktif workflow: repo kökünde `.github/workflows/prod-gate.yml`.
Production deploy job'ı aynı workflow içindeyse `needs: gate` kullanmalı; başka bir
workflow ise bunu `workflow_call` ile çağırıp deploy'u başarılı sonuca bağlamalıdır.
**Mevcut dürüst durum:** repoda production deploy job'ı yoktur; bu workflow tek başına
deployment yapmaz veya haricî/manual deploy'u engelleyemez. Bu nedenle
`PROD_DEPLOY_INTEGRATED=true` repository variable'ı yokken workflow bilinçli olarak
hard-fail verir. Değişken yalnız gerçek deploy job'ı gate'e bağlandıktan ve branch/
environment koruması o job'ı zorunlu kıldıktan sonra açılmalıdır; salt değişkeni açmak
entegrasyon kanıtı değildir.

**CI secrets:** `PROD_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `PROD_OWNER_ACCESS_TOKEN`,
`PROD_GATE_HMAC_SECRET`, `SUPABASE_ANON_KEY`. **CI variable:** `SUPABASE_PROJECT_REF`.
Owner access token kısa ömürlüdür; manuel production gate öncesi tazelenir ve loglanmaz.
`SUPABASE_ACCESS_TOKEN`, Supabase CLI'ın hedef projenin gerçek remote secret listesini
okuyabilmesi içindir; yerel `POS_TEST_FAULT` env kontrolü kanıt sayılmaz.
`DB_URL` yalnız resmî Supabase direct/dedicated (`db.<ref>.supabase.co`) veya shared
pooler (`postgres.<ref>@*.pooler.supabase.com`) URI biçiminde kabul edilir; böylece
DB audit kontrolünün farklı bir Supabase projesine yöneltilmesi fail-closed reddedilir.

## 7) 0005 RBAC + JWT private-file testleri

SQL Editor'de gerçek staff UID ile:
```sql
set ganu.test_staff_uid = '<STAFF_AUTH_UID>';
set ganu.test_customer_uid = '<CUSTOMER_AUTH_UID>'; -- section2 self/JWT testi
-- ardından supabase/tests/staging_0005_rbac_tests.sql dosyasını çalıştır
```
Beklenen: staff olmayan authenticated kullanıcı `customers` okuyamaz; gerçek staff
`is_staff()=true`; anon/authenticated `owns_secure_object` çalıştıramaz; storage policy
`is_staff()` helper'a bağlıdır. Pozitif staff testi UID verilmezse SKIP olabilir,
production öncesi PASS zorunludur.

HTTP `get-file` testleri (`secure-docs` içinde gerçek bir test nesnesiyle):
```bash
GET_FILE="$SUPABASE_URL/functions/v1/get-file"
# JWT yok → gateway 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$GET_FILE" \
  -H "apikey: $ANON_KEY" -H 'content-type: application/json' -d '{"path":"mail/<CID>/test.jpg"}'
# staff_roles kaydı olmayan normal authenticated JWT → 403
# auth_uid=<CUSTOMER_UID> müşterinin KENDİ yolu → 200 + 300 sn URL
# aynı müşteri JWT + BAŞKA CID yolu → 403
# gerçek staff JWT + mevcut secure-docs yolu → 200
```
Eski access-code portal oturumu Supabase Auth JWT üretmediği için private dosya açamaz;
0006 sonrasında cloud access-code/parola RPC execute yetkileri de kapalıdır. Auth → URL
Configuration içinde production/staging `/musteri` redirect URL'lerini allow-list'e ekle.
`staging_0006_customer_portal_tests.sql` için dedicated, doğrulanmış Auth kullanıcısı ve
tam bir aktif/askıda customer eşleşmesi gerekir. Zorunlu negatifler: anon legacy RPC red;
doğrulanmamış/yanlış e-posta red; duplicate normalize e-posta red; başka auth_uid'ye
bağlı kayıt red; başka müşterinin talep/mail/dosya erişimi red; customer staff değildir.
Production öncesi bunların tümü gözlenmiş PASS olmalıdır.
