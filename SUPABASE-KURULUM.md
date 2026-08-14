# GANU Panel · Supabase'e Geçiş Kılavuzu

Panel şu an **yerel modda** çalışıyor: veriler tarayıcında (localStorage) saklanıyor.
Bu, denemek ve tek bilgisayarda kullanmak için yeterli. Ama:

- Veriler sadece o tarayıcıda kalır (başka cihazdan görünmez).
- Ortakların (Gökay/Ali/Nurullah) aynı veriyi görmesi için buluta geçmek gerekir.
- Panel girişi yerelde tek ortak parola; bulutta her ortak **kendi e-posta + parolasıyla** girer.
- Müşteri paneli (Faz 2) için de gerçek kimlik doğrulama (auth) şart.

Aşağıdaki adımlar buluta geçişi tamamlar. **~15 dakika.**

---

## Yayına Geçiş Kontrol Listesi (özet)

Aşağıda **kimin ne yapacağı** net ayrılmıştır; her satırın yanında ilgili detay adımı var.

### A. Yalnızca senin yapabileceklerin — hesap · ödeme · anahtar
> Bu adımlarda kimlik bilgisi, banka kartı veya API anahtarı girilir. **Ben giremem** (güvenlik gereği); bunları sen ya da ortaklar yapmalı.

- [ ] **Supabase hesabı** aç + `ganu-panel` projesini oluştur, veritabanı parolasını belirle → *Adım 1*
- [ ] **Yönetici kullanıcıları** ekle — her ortak (Gökay / Ali / Nurullah) için e-posta + parola → *Adım 3*
- [ ] **API anahtarlarını** `web/.env`'e yaz — Project URL + anon key → *Adım 4*
- [ ] Supabase **plan/ödeme**: ücretsiz kota başlangıç için yeterli; büyüyünce kredi kartı gerekir (Supabase → Billing)
- [x] **Kurumsal e-posta** kutusu açık: `info@ganu.com.tr` (site ve footer bu adresi kullanıyor)
- [ ] *(SMS/e-posta göndereceksen)* **Netgsm** ve/veya **Resend** hesabı + anahtarları → *Adım 7*
- [ ] *(e-belge keseceksen)* **Entegratör** (Paraşüt / Uyumsoft / İzibiz…) hesabı + anahtarları → *Adım 8*
- [ ] **Alan adı + hosting** hesabı: `ganu.com.tr` DNS'ini yayın sağlayıcısına bağla → *Adım 10*

### B. Hazır — kod / altyapı tarafı (tamamlandı)
- [x] Veritabanı şeması + RLS güvenlik kuralları — `web/supabase-schema.sql`
- [x] Panel `.env`'i algılayınca **otomatik** buluta geçer; kod değişikliği gerekmez
- [x] Gerçek giriş (e-posta + parola) ve müşteri portalı erişim-kodu akışı
- [x] Bildirim gönderimi Edge Function — `send-notification` (anahtar bekliyor)
- [x] e-belge kesim Edge Function iskeleti — `issue-einvoice` (entegratör bekliyor)
- [x] SEO / paylaşım meta etiketleri, favicon, OG görseli, yasal açıklama notu

### C. Canlıya alma — siteyi yayına ver
- [ ] `cd web && npm run build` → `dist/` üretilir
- [ ] `dist/`'i statik bir host'a yükle (Netlify / Vercel / Cloudflare Pages) → *Adım 10*
- [ ] `.env` değerlerini host'un **Environment Variables** alanına da gir
- [ ] `ganu.com.tr`'yi host'a bağla (DNS) + HTTPS'i doğrula
- [ ] Canlıda duman testi: müşteri ekle → başka cihazdan giriş → aynı veri görünmeli

---

## 1. Supabase projesi aç
1. https://supabase.com → **Start your project** → GitHub/e-posta ile giriş.
2. **New project** → isim: `ganu-panel`, güçlü bir veritabanı parolası belirle (kaydet).
3. Bölge: **Frankfurt (eu-central)** — Türkiye'ye en yakın, hızlı.

> Not: Hesap açma ve parola belirleme adımlarını **sen** yapmalısın (ben kimlik bilgisi giremem).

## 2. Tabloları oluştur
1. Sol menü → **SQL Editor** → **New query**.
2. `web/supabase-schema.sql` dosyasının içeriğini yapıştır → **Run**.
3. "Success" görürsen tüm tablolar ve güvenlik kuralları (RLS) hazır:
   - `customers` — müşteriler (vergi no/daire, TC, durum, portal erişim kodu)
   - `contracts` — sözleşmeler (paket, başlangıç/bitiş, ücret, oto-yenileme)
   - `mail_items` — kargo/posta (foto, raf, teslim kanıtı, yönlendirme kargosu + takip no)
   - `invoices` — faturalar (durum, tahsilat + e-belge UUID/no/durum)
   - `documents` — belge kasası (imza sirküleri, vergi levhası, adres kullanım belgesi…)
   - `notifications` — bildirim günlüğü (e-posta/SMS/WhatsApp; kayıt/gönderildi/başarısız)
   - `requests` — müşteri talepleri (yönlendirme / gel-al / tara / imha)
   - `inspections` — vergi dairesi **yoklama** kayıtları (VUK 127; re'sen terk riskine karşı kanıt)

## 3. Yönetici kullanıcısı ekle
1. Sol menü → **Authentication** → **Users** → **Add user** → **Create new user**.
2. E-posta + parola gir (senin giriş bilgin). "Auto confirm user" işaretle.
3. (İstersen her ortak için birer kullanıcı ekle.)

## 4. Anahtarları `.env`'e koy
1. Sol menü → **Project Settings** → **API**.
2. `web/.env.example` dosyasını `web/.env` olarak kopyala.
3. Şu iki değeri doldur:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** anahtarı → `VITE_SUPABASE_ANON_KEY`

> `.env` dosyası `.gitignore`'da — kimseyle paylaşma, git'e girmez.
> `anon` anahtarı tarayıcıda kullanılmak için tasarlıdır; asıl güvenlik RLS kurallarında.

## 5. (Opsiyonel) Kargo fotoğrafı / belge deposu
Etiket/zarf fotoğrafı ve müşteri belgelerini saklamak istersen:
1. **Storage** → **New bucket** → ad: `mail-photos`, **Private**.
2. (İstersen) belge kasası için ikinci bir bucket: `documents`, **Private**.
3. Yerel modda foto/belge küçültülüp veritabanında (dataURL) tutulur; bulut modunda
   `store.js` içindeki `fileToStoredUrl` Storage'a yükleyip URL döndürecek şekilde güncellenir.

## 6. Çalıştır
```bash
cd web
npm run dev
```
Panel açılınca artık veriler Supabase'de **ve giriş de gerçek e-posta + parolaya geçer**:
`.env` varsa panel **otomatik** buluta bağlanır (kod değişikliği gerekmez — `store.js` veriyi,
`auth.js` girişi env'i algılayıp Supabase'e taşır). Giriş ekranında artık e-posta alanı çıkar;
**Adım 3'te oluşturduğun kullanıcıyla** gir. Parolanı Panel → Ayarlar'dan güncelleyebilirsin.

---

## 7. (Opsiyonel) Gerçek bildirim gönderimi — Edge Function
Panel varsayılan olarak **kayıt modunda**: mesajlar hazırlanır, log'a yazılır ama gönderilmez.
Gerçekten SMS/e-posta göndermek için:

1. [Supabase CLI](https://supabase.com/docs/guides/cli) kur ve projeye bağlan:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```
2. Fonksiyonu dağıt:
   ```bash
   cd web
   supabase functions deploy send-notification
   ```
3. Gizli anahtarları **secrets** olarak gir (istemciye ASLA konmaz):
   ```bash
   # SMS / WhatsApp (Netgsm)
   supabase secrets set NETGSM_USER=... NETGSM_PASS=... NETGSM_HEADER="ONAYLI_BASLIK"
   # E-posta (Resend)
   supabase secrets set RESEND_API_KEY=... MAIL_FROM="GANU <bilgi@ganu.com.tr>"
   # WhatsApp Cloud API (opsiyonel)
   supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_FROM=...
   ```
4. Panel → **Bildirimler** → kanalları aç + **“Gerçek gönderimi aç”** işaretle.
   Bundan sonra olaylar (kargo geldi, tebligat, teslim, yenileme) seçili kanallardan gönderilir;
   sonuç (gönderildi/başarısız) bildirim günlüğüne yazılır.

## 8. (Opsiyonel) e-Fatura / e-Arşiv kesimi — Edge Function
Türkiye'de e-belge GİB onaylı bir **entegratör** (Paraşüt, Uyumsoft, İzibiz, Foriba…) üzerinden kesilir.

1. Fonksiyonu dağıt:
   ```bash
   cd web
   supabase functions deploy issue-einvoice
   ```
2. Entegratör anahtarlarını secrets'a gir (örnek: Paraşüt):
   ```bash
   supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=...
   supabase secrets set PARASUT_COMPANY_ID=... PARASUT_EMAIL=... PARASUT_PASSWORD=...
   ```
3. Panel → **Fatura & Gelir** → **e-Belge** ayarları → entegratörü seç, belge tipini seç,
   **“e-Belge kesimini aç”** işaretle. Fatura satırındaki **e-Belge** düğmesiyle tek tıkla kes.

> `supabase/functions/issue-einvoice/index.ts` içindeki entegratör çağrısı **iskelet** halindedir;
> hesap açılınca ilgili entegratörün dokümanına göre uç noktalar tamamlanır.

## 9. Müşteri portalı (Faz 2)
Müşterilerin kendi kargolarını/sözleşmelerini/belgelerini görmesi ve talep açması için:

- **Yerel mod:** her müşterinin kartındaki **erişim kodu** ile `/musteri` adresinden girer
  (Müşteriler → Detay/Düzenle → erişim kodu; “Üret” ile otomatik kod).
- **Bulut mod:** gerçek kimlik doğrulama için Supabase Auth kullanılır. Müşteri kullanıcısı
  oluşturulup `customers.auth_uid` ile eşlenir; ardından müşterinin **yalnızca kendi** kayıtlarını
  görmesi için RLS policy'leri eklenir (`auth_uid = auth.uid()`). Bu policy'ler şema dosyasında
  “Faz 2” notu olarak işaretlidir; müşteri girişi devreye alınırken eklenir.

## 10. Canlıya alma (hosting + alan adı)
Site şu an geliştirme sunucusunda (`npm run dev`) çalışıyor. Yayına almak için statik derleyip bir host'a yüklemek yeterli — sunucu yönetmene gerek yok.

1. **Derle:**
   ```bash
   cd web
   npm run build      # dist/ klasörünü üretir
   ```
2. **Host seç ve `dist/`'i yayınla** — ücretsiz kotası yeten en kolay seçenekler:
   - **Netlify**, **Vercel** veya **Cloudflare Pages**.
   - Git deposunu bağlarsan her push'ta otomatik derlenir: *build komutu* `npm run build`, *yayın klasörü* `dist`.
3. **Ortam değişkenleri:** host panelinde `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini gir (yereldeki `.env` ile aynı). Bunlar derleme anında pakete gömülür.
4. **Alan adı:** host'un “Custom domain” bölümüne `ganu.com.tr` ekle; alan-adı panelinden DNS kaydını (A / CNAME) host'un verdiği hedefe yönlendir. HTTPS sertifikası otomatik gelir.
5. **SPA yönlendirme (önemli):** site tek-sayfa uygulaması (BrowserRouter). `/avukat`, `/mali-musavir`, `/panel`, `/musteri` gibi adreslere doğrudan girildiğinde host'un tüm istekleri `index.html`'e düşürmesi (SPA fallback) gerekir, yoksa 404 alırsın:
   - **Netlify / Cloudflare Pages:** depoda hazır olan `web/public/_redirects` dosyası bunu sağlar (`/* /index.html 200`).
   - **Vercel:** Vite framework'ü otomatik halleder (gerekirse `vercel.json` rewrite).

> Not: Alan adı satın alma, DNS ayarı ve host hesabı **senin** yapacağın adımlar (kart/kimlik gerekir).

---

## Doğrulama
- Panelde bir müşteri ekle → Supabase → **Table Editor** → `customers`'ta görünmeli.
- Başka bir tarayıcı/cihazdan giriş yap → aynı veriyi görmelisin.

## Sık sorunlar
- **Boş liste / hata:** `.env` değerleri yanlış olabilir; URL sonunda `/` olmasın.
- **"row-level security" hatası:** SQL'deki policy'ler çalışmamış — `supabase-schema.sql`'i tekrar Run et.
- **Giriş yapamıyorum:** Auth'ta kullanıcı "confirmed" mı? Adım 3'ü kontrol et.

## Şu anki giriş (yerel mod)
Bulut kurulana kadar panel parolası: **`ganu2026`** — Panel → Ayarlar'dan değiştir.

---

## Yol haritası
- **Faz 1 (bitti):** Admin panel — müşteri, kargo/posta, sözleşme takibi, yenileme uyarıları.
- **Faz 2 (bitti):** Müşteri portalı (`/musteri`, erişim kodu), belge kasası, müşteri talepleri,
  kargo fotoğrafı + teslim kanıtı, yönlendirme kargo takip linkleri, fatura & gelir, yoklama kayıtları.
- **Faz 3 (altyapı hazır):** Bildirim otomasyonu (e-posta/SMS/WhatsApp) — `send-notification`
  Edge Function; sözleşme yenileme hatırlatıcıları. Anahtarlar girilince gerçek gönderim açılır.
- **Faz 3 (altyapı hazır):** e-Fatura / e-Arşiv — `issue-einvoice` Edge Function; entegratör
  hesabı bağlanınca faturalar tek tıkla e-belgeye çevrilir.
- **Sıradaki:** Müşteri portalını Supabase Auth'a taşımak (müşteri-bazlı RLS), Storage'a foto/belge
  yükleme, otomatik yenileme hatırlatma zamanlaması (cron / scheduled function).
