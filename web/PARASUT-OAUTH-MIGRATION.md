# Paraşüt OAuth geçişi

08.11.2026 — yerel uygulama ve test runbook'u. Bu belge canlı kurulumun yapılmış olduğu anlamına gelmez.

## Doğrulanan sağlayıcı sözleşmesi

**DOĞRULANDI —** [Paraşüt resmî OAuth rehberi](https://devhub.parasut.com/oauth-rehberi), 08.11.2026: confidential client için Authorization Code, zorunlu S256 PKCE ve backend client secret kullanılır. Scope `openid`; yetkilendirme/token/userinfo uçları `id.parasut.com/realms/parasut/protocol/openid-connect/` altındadır. API adresi `https://api.parasut.com/v4` olarak kalır. Dönen son refresh token sonraki yenilemede kullanılmalıdır; süreler yanıtın `expires_in` ve `refresh_expires_in` alanlarından okunur. 401/403 yanıtları otomatik tekrar edilmez.

**DOĞRULANDI —** [DevHub başvuru sayfası](https://devhub.parasut.com/api-basvuru), 08.11.2026: kendi firması için başvuru ve iş ortaklığı seçenekleri ayrıdır. Rehber redirect URI'nin başvurudan sonra değiştirilemediğini belirtir. Başvuru formunun oturum gerektiren iç alanları bu çalışmada görülmedi; form gönderilmedi.

**Kaynak sınırı:** Şimdiki kod yalnız yukarıdaki doğrulanmış production kimlik uçlarını kullanır. Ayrı staging IdP URL'si tahmin edilmemiştir. Canlı kullanıcı onayı, DevHub yeni istemci bilgileri ve sağlayıcıyla gerçek refresh çalışması henüz doğrulanmamıştır.

## Akış ve güvenlik sınırları

`ParasutConnectionCard` mevcut personel fatura sayfasına bağlanır. Personel JWT'si ile `parasut-oauth` POST `start` çağrılır; Edge doğrulanmış Supabase kullanıcı kimliği ve `is_staff` sonucunu ister. Sunucu 32 byte rastgele state ve verifier üretir; state'in SHA-256 özeti, personel UID'si, şirket, client ve şifreli verifier DB'ye yazılır. Aynı personelin önceki bekleyen akışı iptal olur. Süre 10 dakikadır.

Tarayıcı sağlayıcıya gider. Dönüş sayfası standart OAuth code/state parametrelerini history'den hemen temizler ve mevcut personel JWT'siyle POST `complete` çağırır. State yalnız aynı UID/client/şirket tarafından tek sefer tüketilebilir. İptal, yanlış personel, replay veya süre aşımı token isteği yapmaz. Callback URL'si kullanıcı girdisinden alınmaz; açık yönlendirme yoktur. React StrictMode effect tekrarı aynı callback'i iki kez göndermez.

Token değişimi sunucuda yapılır. Resmî `userinfo` yanıtından geçerli `sub` okunur; `/v4/me?include=companies` yanıtı sabit şirketle eşleşmelidir. Önceden doğrulanmış bir subject biliniyorsa isteğe bağlı `PARASUT_OAUTH_EXPECTED_SUB` onu ayrıca zorunlu kılar. Bilinmiyorsa ilk başarılı personel onayı ve şirket doğrulaması sonrası subject SQL'de atomik olarak pinlenir. Sonraki consent'lerde, aynı şirkete yetkili olsa bile farklı subject mevcut pini değiştiremez; refresh de pinlenen subject'i doğrular. Eşzamanlı ilk consent'lerden yalnız ilki pin kurabilir. Kullanıcı onayı ve bu kontroller başarılı olmadan panel “bağlı” demez. Reddedilen yeni bir consent mevcut çalışan bağlantıyı bozmaz.

Token'lar ve verifier AES-256-GCM ile şifrelenir. Anahtar Edge secret store'dadır. Şirket/client/subject ve amaç AAD ile bağlanır; ciphertext başka hesaba taşınamaz. DB tablolarında RLS ve anon/authenticated için tüm erişim iptali vardır; RPC'ler hem ACL hem `auth.role()` ile service role ister. API/token/verifier/provider hata gövdeleri frontend veya loglara aktarılmaz. Şema secret değerini içermez.

`issue-einvoice`, `auto-einvoice`, `paytr-link` ve `parasut-sync`, `parasutEnv` üzerinden aynı token provider'ı kullanır. Var olan fatura ve tahsilat sahipliği/tek seferlik işlem kuralları korunur.

Access token son 60 saniyesine girince atomik DB claim alınır. Yalnız o owner ve generation yenilenmiş token'ı kaydedebilir. Eşzamanlı diğer çağrılar en çok 12 kez 250 ms bekler; yeni kaydı kullanır veya anlaşılır bekleme hatası verir. Refresh token POST'u tekrar edilmez. Yanıt kaybı/IdP hatası/kimlik uyuşmazlığı yeniden consent gerektirir. İşlem sahibi çökerse claim otomatik devralınmaz: eski refresh token'ın sağlayıcıda dönmüş olması mümkündür. Yeni consent kilidi kaldırır; eski owner yeni bağlantıyı bozamaz. Eski access token'ın 401 yanıtı da generation koşuluyla yeni bağlantıyı iptal edemez. 403 izin hatasıdır, fatura yazımı tekrar edilmez.

## Açık geçiş modu

| Sunucu ayarı | Davranış |
|---|---|
| `PARASUT_AUTH_MODE` boş veya `transition` | Mevcut eski client/password bağlantısı korunur; yeni OAuth onayı ayrı hazırlanabilir. |
| `PARASUT_AUTH_MODE=oauth` | Yalnız yeni kalıcı OAuth bağlantısı kullanılır. Consent/token/config eksikse işlem durur; eski yönteme düşmez. |
| Diğer değer | Fail-closed; fatura/eşitleme açılmaz. |

Eski giriş, Türkiye saatiyle **10.12.2026 00:00** itibarıyla hem env kapısında hem ortak API client'ında katı biçimde durur. Mevcut client ile yeni DevHub client farklı secret adları kullanır. Consent tamamlandıktan sonra `oauth` etkinleştirme ayrı ve görünür bir operatör adımıdır; “bağlı ama geçiş bekliyor” durumu panelde açıkça gösterilir. `EINVOICE_ENABLED=true` ayrıca gereklidir.

## Somut kurulum listesi

1. Gerçek staff panel origin/base yolu ve `/panel/faturalar` dağıtımını doğrulayın. Bu sayfa `ParasutConnectionCard` içermeli ve callback query'siyle doğrudan açıldığında staff oturumunu korumalı. URI'yi **dağıtım yolu kesinleşmeden DevHub'a kaydetmeyin**. Kod yalnız `SITE_URL` base yolunun altındaki `/panel/faturalar` callback'ini kabul eder; farklı aynı-origin path de reddedilir. HTTPS, sorgusuz/fragment'siz kesin URI gereklidir; alt dizin kullanılan ortamda o alt dizin dahil edilir. Production ile staging için ayrı Supabase projeleri ve istemciler kullanın.
2. Yetkili kullanıcı DevHub'dan kendi şirketi için yeni **confidential** istemci başvurusunu tamamlar. Başvuru, gerçek login/consent ve secret girişi bu yerel uygulama çalışmasında yapılmadı.
3. İlk consent'i yetkilendirilmiş entegrasyon hesabıyla tamamlayın; staff oturumu/state ve sabit şirket doğrulaması ilk hesabı kalıcı pinler. Normal operatörün önceden opaque OIDC `sub` bulması gerekmez. Önceden güvenilir kaynaktan bilinen bir `sub` varsa isteğe bağlı strict ayar kullanılabilir; e-posta veya eski v4 kullanıcı numarasıyla aynı olduğu varsayılmaz. Sonradan hesap değiştirmek normal “yeniden bağla” işlemiyle mümkün değildir; yetkili yönetim müdahalesi ve ayrı doğrulama gerekir.
4. Secret manager'da 32 rastgele byte anahtar üretin; base64url biçiminde `PARASUT_OAUTH_ENCRYPTION_KEY` olarak saklayın. Secret'ları repo, frontend `VITE_*`, komut satırı argümanı, chat veya log içine koymayın. CLI kullanılacaksa dar izinli, git dışı geçici env dosyası ve `supabase secrets set --env-file <dosya>` kullanın; dosyayı sonra güvenli biçimde kaldırın. Yeni klasörler `~/Documents/Claude/Projects` altında olmalı.
5. Edge secret store'a `PARASUT_OAUTH_CLIENT_ID`, `PARASUT_OAUTH_CLIENT_SECRET`, açık `PARASUT_COMPANY_ID`, kesin `PARASUT_OAUTH_REDIRECT_URI`, `PARASUT_OAUTH_ENCRYPTION_KEY` eklenir. Önceden bilinen strict kimlik kontrolü istenirse `PARASUT_OAUTH_EXPECTED_SUB` ayrıca eklenebilir. Mevcut `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` de gereklidir. İlk aşamada mod `transition` kalır. Ürün/tahsilat hesabı ayarları mevcut akıştaki gibidir.
6. Yetkili dağıtım sürecinde 0019 migration'ı uygulayın; staff paneli ve `parasut-oauth` ile onu kullanan dört Edge Function'ı birlikte dağıtın. `config.toml` içindeki `parasut-oauth` JWT doğrulaması açık kalır. SQL canlıya uygulanmış sayılmaz; gerçek staging migration readiness ayrıca doğrulanmalıdır.
7. Staff panelinde “Paraşüt hesabını bağla” ile gerçek sağlayıcı consent'i tamamlanır. Yanlış hesap/şirket kontrolü bağlantıyı reddetmelidir. Ardından “kullanıcı onayı tamamlandı, geçiş bekliyor” görülür. **Token veya verifier'ın tarayıcı network/history/storage alanlarında bulunmadığını** doğrulayın; standart code/state dışında auth hassas verisi frontend'e çıkmamalıdır.
8. `PARASUT_AUTH_MODE=oauth` etkinleştirin. “Bağlantıyı test et” yalnız okuma yapar; şirket, ürün ve tahsilat hesabını doğrular. Bu salt okuma kontrolü geçmeden fatura/ödeme üretmeyin. Ayrı staging hesabında expiry/refresh ve izin durumunu doğruladıktan sonra production'a aynı kontrollü geçiş yapılır.
9. Başarılı geçişten sonra eski `PARASUT_EMAIL/PASSWORD` ve eski client secret'larını kaldırın. Yeni encryption key veya client secret değişirse şifreli kayıtların/IdP'nin davranışını dikkate alın: encryption key'i plansız değiştirip eski token'ları okunamaz hale getirmeyin; yeni key ile yeniden consent en basit geçiştir. Secret değerlerini loglamayın.

## Yerel doğrulama

```sh
node --experimental-strip-types scripts/test-parasut-oauth.mjs
node --experimental-strip-types scripts/test-einvoice.mjs
node --experimental-strip-types scripts/test-parasut-sync.mjs
node --experimental-strip-types scripts/test-paytr-link.mjs
```

OAuth testi ağ yerine sahte sağlayıcı ve RPC adapter kullanır. PKCE/state/replay/UID/iptal/expiry, ciphertext kurcalama, yanlış hesap/şirket, concurrent refresh, son rotation token'ı, eksik rotation'ın mutlak süresi, refresh yanıt kaybı/429/invalid grant, eski owner/generation, 401/403 tekrar etmeme, shared issuer/sync ve fail-closed geçiş modunu sınar.

0019 SQL testi ayrı, boş yerel PG16 DB üzerinde uygulanabilir. Önce Supabase test rollerini (`anon`, `authenticated`, `service_role BYPASSRLS`) ve `auth.role()` JWT claim fixture'ını kurun; yalnız bu test DB'sinde 0019'u yükleyin. `supabase/tests/staging_0019_parasut_oauth_tests.sql` 66 assertion koşturur ve fixture yazılarını geri alır. Sonra:

```sh
PSQL_BIN=/opt/homebrew/opt/postgresql@16/bin/psql \
TEST_DATABASE_URL=postgresql://localhost:56319/ganu_oauth_0019_test \
node scripts/test-parasut-oauth-sql.mjs
```

Bu ikinci test başka DB adı veya uzak host'u reddeder. İki gerçek PG oturumuyla ilk işlem row lock tutarken ikincinin `pg_stat_activity` üzerinde `Lock` beklediğini doğrular; commit sonrası ikinci claim boş, sahip sayısı bir olmalıdır. Test fixture'ı temizlenir. Geçici PG verisi/socket/log klasörü Projects altında açılır, test bitince sunucu kapatılır ve klasör kaldırılır. Üretim connection string'i bu komuta verilmez.

**DOĞRULANDI — 08.11.2026 yerel koşu:** OAuth 16 senaryo grubu, önceki e-Belge 26 / sync 19 / PayTR 14 senaryosu geçti. PG16 minimal test DB'de 0019 migration, 66 assertion, iki gerçek oturum yarışı ve rollback çalıştırıldı. Test PG kapatıldı ve geçici klasörü temizlendi. Bunlar production bağlantısı, gerçek token rotation veya fatura gönderimi kanıtı değildir.

## Arıza ve geri dönüş

- `reconnect_required`, kalıcı “yenileme sürüyor” veya `invalid_grant`: personel yeni consent başlatır. DB refresh owner'ını elle silip eski token'ı tekrar çalıştırmayın.
- 403: Paraşüt şirket/rol/entegrasyon izinlerini kontrol edin; otomatik tekrar yoktur. 401: güncel generation yeniden yetkilendirme ister.
- Yanlış account/company: beklenen subject ve şirket kaynağı doğrulanır. Rastgele görülen subject'i kabul etmek için kontrol gevşetilmez.
- `transition`'a dönmek yalnız kapanış tarihinden önce, eski hesabın hâlâ çalıştığı bağımsız doğrulanmışsa operatörün açık seçimidir. OAuth hatasında otomatik dönülmez. 10 Aralık sonrası çözüm yeni consent'tir.
- 0019 rollback token/flow kayıtlarını kaldırır ve yeniden consent gerektirir; eski password grant'i geri getirmez. Şifreli auth tabloları sıradan müşteri veri dışa aktarımına dahil edilmemeli, DB yedekleri secret kapsamıyla korunmalıdır.

`parasut_import_invoice` RPC'sinin canlı eksik olması 0017 deployment durumudur; OAuth kurulumu bunu düzeltmez. 0017'nin canlı readiness kanıtı ayrı alınmalıdır.
