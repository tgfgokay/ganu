# Tek kişi operasyonu — kurulum ve doğrulama

Kabul → tek müşteri/sözleşme/ilk iç fatura/damga taslağı → belge gönderim işi. Kabul hukuki imza değildir. Mevcut kimlik eşleşmesi tekse müşteri yeniden açılmaz. İlk bedel peşindir; kabuldeki iç fatura kaydı kesilmiş e-belge sayılmaz.

Personel, gönderilmiş teklif üzerinde **Kabul et ve hazırla** düğmesine bir kez basar. Sözleşmenin eksikleri müşteri ekranındaki **Gönderim ve otomatik işlemler** kartında görünür. Belgeler/sabit ticari profil tamamlanınca **Düzeltildi · tekrar dene** ile aynı iş hazırlanır. Ödeme bankada görüldüğünde tarih/yöntem/tutar/işlem referansı girilir. Aynı kanıtın tekrar gönderilmesi ikinci ödeme üretmez. Kart tahsilatı yalnız imzası doğrulanmış PayTR callback'i ile kapanır. Ödeme ve e-belge ayrı durumlardır. Normal sağlayıcı işleme/PDF hazırlama yanıtı 5 dakika arayla en çok 12 kez otomatik kontrol edilir; süre aşımı, kurulum veya yetki sorunu açık iş olarak kalır. İlk ödeme, gerçek imzalı belge ve adres kullanım belgesi tamamlanmadan aktivasyon RPC'si reddeder.

Kargo için **Yeni giriş → müşteri seç → Kaydet** yeterlidir; tarih bugün, tür kargo ve durum geldi. Gönderen/barkod/raf/foto isteğe bağlıdır. Tebligat ayrı türdür, acil bildirilir; hukuki kabul yetkisi ve girişim bilgileri ayrıca kaydedilir. Müşterinin e-postası eksikse kargo kaydı korunur ve düzeltilecek iş görünür. Durum yalnız sağlayıcı kabulünden sonra bildirildi olur; teslim/okuma kanıtı sayılmaz. Gerçek evrakı otomatik imha eden iş yoktur.

## Sunucu ve dağıtım

0000–0020 migration zincirini, frontend'i ve `send-notification`, `contract-document`, `parasut-oauth`, `issue-einvoice`, `paytr-link`, `parasut-sync` fonksiyonlarını birlikte dağıtın. Önce staging, sonra canlı kontrol. 0020 rollback bekleyen/belirsiz işleri görürse durur; kabul ve gönderim kanıtlarını silmez.

Gerekli ürün e-posta kurulumu: `NOTIFICATION_PROVIDER=resend`, doğrulanmış gönderen alanı, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` (veya mevcut `MAIL_FROM`), isteğe bağlı `NOTIFICATION_REPLY_TO_EMAIL`. Resend'in doğrulanmış gönderici alanı ve SPF/DKIM kayıtları sağlayıcıda doğrulanmalıdır. Asistanın bağlı Gmail MCP oturumunu ürün backend'ine taşımayın.

Sunucuda `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; en az 32 karakter rastgele `NOTIFICATION_WORKER_SECRET` gerekir. Aynı worker secret'ını GitHub Actions'a ekleyin. `operation-jobs.yml` mevcut `GANU_STAFF_SUPABASE_URL` repo değişkeni ve `GANU_STAFF_SUPABASE_ANON_KEY` hedefini kullanır; doğru projeye bağlı olduklarını dağıtımda doğrulayın. Worker her 5 dakikada en çok 10 iş alır; kullanıcı kabul/kargo ekranı ilgili işi anında da tetikler. DB token kilidi eşzamanlı worker'ları ayırır.

Belge için `GANU_CONTRACT_COMPANY_JSON`, `GANU_CONTRACT_DOCUMENT_SETTINGS_JSON`, `GANU_CUSTOMER_PRIVACY_NOTICE_JSON` sunucu profillerini avukatın onayladığı gerçek bilgilerle hazırlayın. Gereken anahtarlar sözleşme kaynak modülünün `missing` listesinde ve sözleşme ekranında görünür; boş kaynak alanları için değer uydurulmaz. Sözleşmeye özel alanlar genel profilin önüne geçer. Hazır ofis satışı açılmaz. Ürün e-belge kurulumu ayrıca `PARASUT-OAUTH-MIGRATION.md` ve `EINVOICE_ENABLED/EINVOICE_AUTO` kapılarına bağlıdır; kurulum yoksa ödeme korunur, e-belge işi bekler.

## Belirsiz gönderim

DB `sending` durumu dış POST'tan önce yazılır. Zaman aşımı, sağlayıcı 5xx/409 veya sağlayıcı kabulünden sonra DB yanıt kaybı `uncertain` olur; 10 dakikayı aşan `sending` de aynı duruma taşınır. Böyle iş **körlemesine yeniden gönderilemez**. Operatör sağlayıcının kayıtlarında `ganu-operation/<job UUID>/<preparation generation>/<payload SHA256>` idempotency anahtarını ve orijinal alıcıyı araştırır. Sağlayıcı kimliği/olumlu veya olumsuz sonuç kanıtı alınmadan durum değiştirilmez. Sağlayıcı anahtarları 24 saat tutulduğu için süresiz yeniden deneme güvenli varsayılmaz. Uzlaştırma, yetkili DB operasyonu ve audit kaydıyla yapılmalıdır; arayüz belirsiz işi sent'e çeviremez. Yetkili işlem runbook'u gerçek sağlayıcı kanıtını içermeli; token/mesaj gövdesi loga yazılmamalıdır.

## Yerel kanıt ve canlı testte eksik veri

`npm run test:operations`: fake API + gerçek yerel HTTP sağlayıcı, attachment/izin/eksik bilgi/belirsizlik senaryoları.

`DB_URL=postgresql://...@127.0.0.1:.../ganu_test... npm run test:operations-db`: yalnız boş localhost test DB kabul eder; auth/storage fixture'ları ile 0000–0020, 0018/0019/0020 kontrolleri ve iki bağımsız psql bağlantısıyla kabul/kargo/outbox/tahsilat yarışları. Fixture gerçek Supabase servisinin yerine geçmez.

Gerçek işlem için kullanıcı tarafından seçilmiş müşteri ve kayıt kimliği, onaylı alıcı adresi, kesin test bedeli/para birimi, gerçek ödeme işlem referansı ve hangi faturaya mahsup edileceği, sağlayıcı staging/gerçek hesap seçimi, avukatın tamamlanmış ek ve ticari alan onayı gerekir. Rastgele gerçek müşteri seçilmez; tutar/kimlik/ödeme kanıtı uydurulmaz. Gerçek fatura, ödeme ve müşteri e-postası yerel test kapsamı dışındadır.

Kesin başarısız/eksik bilgi durumunda müşteri e-postası düzeltilirse tekrar deneme yeni alıcıyı kullanır; aynı PDF korunur ve hazırlama generation değeri artar. Worker güncel alıcıyı tekrar okur; DB de gönderim başlangıcında alıcıyı atomik doğrular. Belirsiz gönderimde alıcı değiştirilerek bu kapı aşılamaz.

Gönderilecek JSON içeriğinin SHA256 özeti DB'ye dış POST öncesi yazılır ve sağlayıcı idempotency anahtarına eklenir. Alıcı, gönderen/reply-to veya PDF içeriği güvenli yeniden denemede değişirse farklı içerik eski anahtarla çakışmaz; belirsiz sonuç yine otomatik tekrarlanmaz.


Ek uçtan uca kapı: `DB_URL=postgresql://...@127.0.0.1:.../ganu_test... npm run test:operations-e2e` gerçek production Deno PDF adapter'ını, gerçek PostgreSQL RPC/iş durumu kayıtlarını ve yerel HTTP sahte e-posta sağlayıcısını birleştirir. Hazır KVKK fixture'ı açıkça TEST yer tutucusudur. Storage nesne metadata'sı yerel DB'ye, PDF baytları test storage adapter'ına gider; bu, canlı Supabase Storage/SMTP veya gerçek hukuki onay kanıtı değildir. Son Deno komutu runtime ağı yalnız `127.0.0.1` ile sınırlar.

Kuyruğa bağlanmış sözleşme/fatura/kargonun müşteri bağlantısı normal düzenleme ile taşınamaz; fatura-sözleşme müşteri eşleşmesi sunucuda denetlenir. Gönderim öncesi kayıt aidiyeti tekrar okunur. Hazırlanan PDF baytları kalıcı SHA256 ile karşılaştırılır; değişmiş kaynak otomatik yenilenmez ve gönderilmez. Kargo bildirildi/zaman/kanal kanıtı yalnız kabul edilmiş provider işi üzerinden yazılır; normal Düzenle bu kanıtı üretemez.

Paraşüt geçmişi/eşitleme geçişi: `source=paraşüt` kayıtları ve `ganu.parasut_payment` uzlaştırma güncellemeleri otomatik kesim/PDF e-postası oluşturmaz. 0017 eksikliği giderildiğinde tarihî belgeler toplu müşteriye gönderilmez. Normal panel kaynaklı yeni ödeme ve PDF akışı korunur. Geçmiş belgeyi yeniden göndermek ayrı, açık personel eylemi gerektirir; bu sürümde böyle bir toplu eylem yoktur.
