# GANU Panel — Teklif → Ödeme → Fatura → Sözleşme → Aktif Müşteri modülü (taslak v1)

## Mevcut altyapı (repo: tgfgokay/ganu, web/)
- Stack: React (Vite) panel + Supabase (Postgres + RLS + Edge Functions/Deno). Personel yetkisi `is_staff()`.
- Tablolar: customers (status: aday|aktif|askıda|ayrıldı, tax_no=VKN, tc=TCKN, address/city/district), contracts (package, start/end, price KDV dahil, billing_period aylık|yıllık), invoices (amount, status bekliyor|ödendi|gecikti, contract_id, payment_link, paytr_*, parasut_*, einvoice_*), documents (secure-docs bucket), packages (Başlangıç 9.990, Pro 18.990 yıllık KDV dahil, Kurumsal is_custom), discount_codes, audit_log (0013), legal consent evidence (0009: IP/UA HMAC hash, metin sürümü).
- Edge: purchase-flow (site üzerinden anon aday kaydı + HMAC token), paytr-link (personel kart linki üretir; PayTR bildirimi imza doğrulayıp `paytr_mark_paid` ile faturayı "ödendi" yapar, EINVOICE_AUTO=true ise Paraşüt e-Belge keser), issue-einvoice (Paraşüt; einvoice_claim ile tek sahiplik, kaldığı yerden devam), send-notification (Resend e-posta / Netgsm SMS, yalnız personel).
- Bilinen açık: Paraşüt canlı bağlantı testi 403 (oturum açılamadı) — teşhis eklendi, çözülmedi.

## İstenen akış (iş sahibi)
1. Personel panelde teklif formu doldurur: ad/unvan, telefon, e-posta, adres; şahıs → TCKN; şirket → VKN (şirket henüz kurulmamışsa VKN boş bırakılabilir). Paket seçilir (+ dönem aylık/yıllık, indirim).
2. Teklif oluşturulur, müşteriye e-posta ile gider (teklif linki + PDF/özet).
3. Müşteri teklifi onaylar → ödeme (PayTR kart linki veya havale).
4. Ödeme gelince fatura (Paraşüt e-Arşiv/e-Fatura) ve sözleşme hazırlanıp müşteriye gönderilir.
5. Sözleşme imzalanıp ödeme tamamlanınca müşteri "aktif" olur ve tüm sisteme dahil olur (portal erişimi, posta takibi, yenileme takibi).

## Önerilen tasarım
### Veri
`quotes` tablosu (yeni migration 0014):
- id, quote_no (GANU-T-2026-0001, sıra), customer_id (aday müşteri, teklifle birlikte oluşturulur ya da mevcut seçilir)
- party_type (şahıs|şirket|kuruluş_aşamasında), package_id, billing_period, list_amount, discount_pct, amount (KDV dahil), tax_rate, price_version (snapshot)
- status: taslak → gönderildi → görüldü → onaylandı → ödendi → sözleşme_gönderildi → imzalandı → aktif | reddedildi | süresi_doldu | iptal
- valid_until (varsayılan +15 gün), public_token_hash (müşteri linki için; ham token yalnız e-postada), sent_at, viewed_at, accepted_at, accept_evidence (IP/UA HMAC, metin sürümü), invoice_id, contract_id, signed_at, signature_method (online_onay|ıslak_imza_yükleme), activated_at
- Her geçiş audit_log'a yazılır; geçişler yalnız SECURITY DEFINER RPC ile (durum makinesi DB'de).

### Edge Functions
- `quote-flow` (personel JWT): create / send (Resend HTML e-posta + teklif linki) / resend / cancel.
- `quote-public` (verify_jwt=false, token ile): GET teklif özeti; POST accept (KVKK + ön bilgilendirme onayı, kanıt kaydı) → fatura satırı (bekliyor) + PayTR link üretilir, müşteri ödeme sayfasına yönlenir. Havale seçeneği: IBAN + referans gösterilir, personel "ödendi (elle)" işaretler.
- Ödeme tetikleyicisi: paytr_mark_paid → 'ödendi' olunca (veya personel elle ödendi) → quote 'ödendi'; e-Belge (Paraşüt, mevcut runEInvoice) + sözleşme üretimi (contracts satırı + şablondan PDF) + sözleşme e-postası (imza linki).
- İmza: Aşama 1 = online onay (e-posta linki + e-postaya giden 6 haneli OTP; kanıt: zaman, IP/UA hash, sözleşme PDF SHA-256) + ıslak imzalı PDF yükleme alternatifi (vergi dairesi/ticaret sicili için gerekebilir). Aşama 2 = e-imza/KEP entegrasyonu.
- Aktivasyon: ödeme=ödendi VE sözleşme=imzalandı → customer.status='aktif', contract.status='aktif', portal erişimi (magic link e-postası), hoş geldin e-postası.

### Panel UI
- "Teklifler" sayfası (menüde Müşteriler altında): liste + durum filtreleri + "Yeni teklif" formu + teklif detayında zaman çizelgesi ve elle müdahale düğmeleri (yeniden gönder, ödendi işaretle, ıslak imzalı sözleşme yükle, iptal).

### Riskler / açık sorular
- Paraşüt 403 çözülmeden otomatik fatura kesilemez → fallback: fatura "kesilecek" kuyruğunda kalır, personel elle keser/işaretler; akış bloklanmaz.
- RESEND_API_KEY ve alan doğrulaması (ganu.com.tr SPF/DKIM) canlıda var mı? Yoksa e-posta gitmez.
- Kuruluş aşamasındaki şirket: VKN yok → fatura kime? Seçenek: kurucu ortağın TCKN'si ile e-Arşiv; şirket kurulunca sonraki faturalar VKN'ye.
- Sözleşme online onay hukuken yeterli mi (6098 TBK md.12-15 şekil serbestisi; 6563/mesafeli sözleşmeler)? Adres tahsis muvafakatnamesi ıslak imza isteyebilir.
- Fiyat/KDV snapshot; kampanya kodu; teklif süresi dolunca fiyat değişimi.
- Güvenlik: public token brute-force, rate limit, e-posta enjeksiyonu, PII (TCKN) maskeleme.
