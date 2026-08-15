# GANU · Supabase Kurulum ve Bağlantı Planı (P0.2 / P0.5 / P0.6)

> Amaç: Gerçek müşteri ve ödeme için lansman kapısı olan üç maddeyi (sunucu
> fiyat kataloğu, private storage, güçlü kimlik doğrulama) canlıya hazırlamak.
> **Secret'lar repoya YAZILMAZ.** Bu belge; migration'ları, RLS'i, bucket'ları,
> Auth'u, env ayrımını ve test kontrol listesini tanımlar.

## Önerilen sıra
1. Supabase projesi + ortam ayrımı (dev / staging / prod)
2. Migration + RLS
3. Private storage
4. Auth/OTP + personel MFA
5. Sunucu tarafı fiyat kataloğu
6. Ödeme manipülasyonu ve yetkisiz dosya erişimi testleri
7. Ardından yasal footer sayfaları (B1 — hukukçu onayı bekler)

---

## 1) Proje ve ortam ayrımı
- **Ayrı projeler:** `ganu-dev`, `ganu-staging`, `ganu-prod` (her biri farklı URL + anon key).
- İstemci env (**public**): `web/.env.local` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Sunucu secret'ları (**repoya girmez**): `supabase secrets set ...`
  (SERVICE_ROLE_KEY, PAYTR_*, IYZICO_*, PARASUT_*, SITE_URL). Bkz. `.env.example`.
- `.gitignore` → `.env` hariç tutulmalı (yalnız `.env.example` commit'lenir).

## 2) Migration + RLS
Sırayla uygula (Supabase SQL editor ya da `supabase db push`):
1. `supabase-schema.sql` — ana şema (13 tablo, RLS, portal RPC'leri, pos_orders, security_events).
2. `supabase/migrations/0001_pricing_catalog.sql` — **packages** + **discount_codes** (gizli) + pos_orders fiyat alanları.
3. `supabase/migrations/0002_private_storage.sql` — **secure-docs** private bucket + RLS + `owns_secure_object`.
4. `supabase/migrations/0003_auth_hardening.sql` — bcrypt `_pw_match` (düz metin/sha256 RED), `set_portal_password`, `staff_roles` (RBAC).
5. `supabase/migrations/0004_prod_gate.sql` — production readiness audit tablosu ve izole gate-probe müşterisi.
6. `supabase/migrations/0005_rbac_auth_storage.sql` — `authenticated=staff` varsayımını kaldıran RBAC ve JWT/auth_uid storage erişimi.
7. `supabase/migrations/0006_customer_portal_auth.sql` — doğrulanmış e-posta claim, JWT portal RPC ve legacy anon portal kapatma.
8. `supabase/migrations/0007_purchase_flow.sql` — Edge-only aday/dekont, HMAC purchase token, rate-limit ve POS session binding.
9. `supabase/migrations/0008_pos_reconciliation.sql` — callback/session terminal mutabakatı, opak dönüş tokenı ve minimal ödeme durumu.
10. `supabase/migrations/0009_legal_consent_evidence.sql` — satış öncesi exact metin sürümü, immutable ön bilgilendirme/erken ifa kanıtı ve staging proof gate.

RLS notları:
- `packages`: anon yalnız `active` okur; yazma personel.
- `discount_codes`: anon **okuyamaz** (gizli kodlar); Edge Function service-role ile okur.
- `security_events`: personel okur; Edge service-role yazar.

## 3) Private storage
- Bucket **secure-docs** `public=false`. Eski `mail-photos` (public) kullanımdan kalkar.
- Yükleme: `store.js uploadToStorage` → `secure:<path>` referansı (public URL değil).
- Görüntüleme: `resolveStoredUrl()` → kısa ömürlü (300 sn) signed URL.
- **Kalan wiring (cutover'da):** panellerde dosya gösteren yerler `resolveStoredUrl` ile
  çözecek (async). Etkilenen alanlar: posta foto, dekont, belge kasası, imzalı sözleşme.
- Müşteri erişimi: signed URL yalnız gerçek Supabase JWT doğrulandıktan ve
  `customers.auth_uid=auth.uid()` sahipliği görüldükten sonra `get-file` tarafından üretilir;
  access-code portalı OTP/auth_uid geçişine kadar private dosyalarda fail-closed kalır.

## 4) Auth/OTP + MFA
- **Personel (/panel):** Supabase Auth (e-posta+parola veya magic link) + **MFA (TOTP)**.
  `auth.js` zaten Supabase modunu destekliyor; yerel demo mod artık **yalnız DEV**
  (prod'da kapalı — `authMode='disabled'`).
- **Müşteri portalı:** e-posta **OTP/magic-link** + `auth_uid`; `access_code` cloud giriş
  sırrı değildir ve legacy RPC execute yetkileri 0006 ile kapatılır. Portal RPC'leri
  yalnız doğrulanmış JWT sahibine kendi verisini döndürür. Auth redirect allow-list'e
  `/musteri` URL'si eklenmelidir. **Ortak portalı** ayrı bir geçiş işi olarak kalır.
- Parola gerekiyorsa **bcrypt** (0003) — uygulama içinde SHA-256 parola üretimi YOK.
- Rate limit + artan gecikme + geçici kilit: Auth ayarları + Edge/gateway.

## 5) Sunucu tarafı fiyat kataloğu
- **Tek gerçek kaynak:** `packages` tablosu (fiyat, KDV, sürüm, geçerlilik).
- Edge Function `pos-payment` fiyatı **DB'den** hesaplar (`computeOrder`); katalog veya
  indirim sorgusu hata verirse **fail-closed** durur, sabit fiyat fallback'i YOKTUR.
  İstemci tutarı **yok sayılır** (istemci yalnız `package_id`+kod yollar).
- Sipariş kaydında `price_version`, `list_amount`, `discount_code/pct`, `currency` saklanır.
- Site ve checkout cloud modda boş/fail-closed katalogla başlar; `loadCatalog()`
  `packages` tablosunu yükleyince `PACKAGE_PRICES` görünümünü günceller. Sorgu hatası,
  boş/pasif katalog veya geçersiz tutarda fiyat gösterimi ve satın alma kapalı kalır.
  Yerel sabit demo fiyatları yalnız Supabase'siz geliştirme modundadır. Panelde paket
  seçimi aynı yüklenmiş katalog görünümünü kullanır; canlı doğrulama staging bağlantısı ister.

## 6) Bağlantı tamamlama (URL + anon key gelince)
```bash
cd web
cp .env.example .env           # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY doldur
# migration'ları uygula (SQL editor veya):
supabase db push
# secret'ları koy (repoya değil):
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SITE_URL=...
supabase secrets set PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=... PAYTR_TEST_MODE=1
supabase secrets set PROD_GATE_HMAC_SECRET=... # en az 32 karakter; CI secret ile aynı
supabase secrets set PURCHASE_FLOW_SECRET=...  # >=32 rastgele; purchase-flow + pos-payment ortak
supabase secrets set LEGAL_TEXT_VERSION=2026-08-15.v1  # purchase-flow + pos-payment exact sürüm
supabase functions deploy purchase-flow --no-verify-jwt
supabase functions deploy pos-payment --no-verify-jwt
supabase functions deploy admin-gate           # JWT doğrulaması açık; --no-verify-jwt YOK
supabase functions deploy get-file             # JWT açık; access_code dosya erişimi YOK
supabase functions deploy send-notification    # JWT açık; panel gerçek bildirim gönderimi
supabase functions deploy issue-einvoice       # JWT açık; panel e-belge kesimi
# personel kullanıcısı + rolü:
#   Auth → Users → invite;  insert into staff_roles(user_id, role) values ('<uid>','owner');
npm run build                    # production canonical ganu.com.tr kökünde; env gömülür
# ardından gh-pages deploy
```

---

## TEST KONTROL LİSTESİ (bağlantı sonrası çalıştırılır)

### P0.2 — fiyat kataloğu
- [ ] (poz) `packages`'ta Pro=18990 iken checkout/POS 18990 kuruşla oturum açar.
- [ ] (poz) Fiyatı tabloda değiştir → tek yerde değişince POS init yeni tutarı kullanır.
- [ ] (neg) İstemciden `amount=1` enjekte et → sunucu yok sayar, tutar tablo değeri kalır.
- [ ] (neg) `is_custom` paket (Kurumsal) için init → "özel teklif, online ödeme alınmaz".
- [ ] (neg) Bilinmeyen `package_id` → "Geçersiz paket".

### P0.5 — private storage
- [ ] (poz) Personel dosya yükler → `secure:<path>` saklanır; panelde signed URL ile görünür.
- [ ] (neg) `secure-docs` public URL tahmini (oturumsuz) → 400/403 (erişilemez).
- [ ] (neg) Süresi geçmiş signed URL (>300 sn) → çalışmaz.
- [ ] (neg) Başka müşterinin path'i için signed URL talebi → `owns_secure_object` reddeder.
- [ ] (poz) Erişim/görüntüleme audit kaydı oluşur.

### P0.6 — kimlik doğrulama
- [ ] (poz) Personel Supabase Auth + MFA ile giriş yapar.
- [ ] (neg) Prod'da Supabase yokken yerel parola girişi → "yapılandırılmadı" (kapalı).
- [ ] (neg) `_pw_match` düz metin/sha256 parola → **reddedilir** (yalnız bcrypt).
- [ ] (neg) Erişim kodu brute force → rate limit/kilit devreye girer.
- [ ] (poz) `set_portal_password` bcrypt saklar; eski hash formatları geçersiz.

### Ödeme bütünlüğü (P0.3 ile birlikte)
- [ ] (neg) `amount=1` → tahsilat/aktivasyon YOK.
- [ ] (neg) Yanlış `total_amount`/currency callback → 400 + `security_events` kaydı.
- [ ] (neg) Aynı callback ×10 → tek sipariş sonucu (idempotency).
- [ ] (neg) Sipariş DB'ye yazılamazsa → ödeme oturumu üretilmez.

> Testler geçmeden `pos_enabled` ve gerçek satış AÇILMAZ.
