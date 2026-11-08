# Sözleşme ve belge paketi

Sanal ofis paketinde ana sözleşme, EK-1 tebligat yetkilendirmesi, EK-2 müşteri KVKK aydınlatması, EK-3 hizmet/ücret formu, EK-4 müşteri bilgi formu, EK-5 kullanım kuralları ve adres taahhütnamesi hazırlanır. Hazır ofis bu akışta etkin değildir. Toplantı ve demirbaş belgeleri yalnız açık seçimle eklenir.

## Kaynak ve kapsam

DOĞRULANDI — Kullanıcının sağladığı `ganuszlemeseti1.zip` içindeki yedi boş DOCX'in XML paragraf/tablo metinleri okundu. Ham ZIP/DOCX depoya eklenmedi. Üretim için gereken genel şablon metinleri ve yer tutucular `supabase/functions/_shared/contract-template-source.js` içindedir; her kaynak dosyanın SHA256 değeri ve ortak şablon fingerprint'i tutulur. Satır bölünmesinden kaynaklanan başlık parçaları birleştirildi; hukuki hükümler yeniden yazılmadı. Kaynaktaki `291.` gibi yazım özellikleri korunur. PDF'de çizgi karakterleri baskı tutarlılığı için ASCII tireye dönüştürülür.

DOĞRULANDI — Koordinatörün ayrıca incelediği, 15 Ekim tarihli “GANU sözleşme seti-1” e-postası aynı yedi belge adını ek listesinde gösteriyor. Bu, avukattan gelişe ilişkin kaynak kanıtıdır. Yerel ZIP ile e-posta eklerinin bayt bazında eşitliği bu iş kapsamında ölçülmedi.

BİLİNMİYOR — Kesin son avukat onayı ve avukatın kendi sürüm tarihi için ayrıca kanıt bulunmuyor. `lawyer-2026-11-08.v1` uygulamaya alınan kaynak sürümünü belirtir; hukuki onay tarihi değildir. Bu uygulama hukuki yeterlilik değerlendirmesi yapmaz.

DOĞRULANDI — Ana metindeki 32 madde ve beş ek esas alındı. Peşin ödeme, 7 günlük adres değişikliği ve iki nüsha korunur. Tebligat ekinin 30 gün sonrasına ilişkin kaynak hükmü değiştirilmedi; bu belge metni kendiliğinden evrak imha eden bir operasyon oluşturmaz.

Veri eksik: Arşivde ayrı müşteri KVKK aydınlatması, hizmet bilgi/ücret formu ve kimlik/müşteri bilgi formu yoktur. EK-3/EK-4 kayıt verisinden operasyonel form olarak oluşturulur ve bu kaynak farkı görünür. Müşteri KVKK eki için uygun kapsam/sürüm/kaynak kaydı olmadan son gönderim engellenir. Web ziyaretçi aydınlatması sessizce müşteri eki yapılmaz.

## Ortak API

`buildContractPackage(input)` saf fonksiyondur. `input`: `contract`, `customer`, `quote`, `company`, `documentSettings`, `privacyNotice`, isteğe bağlı `additionalDocuments`. Çıktı: `number`, `version`, `fingerprint`, `documents`, `checklist`, `missing`, `ready`, `figures`, `copies`. Eksik öğeleri `{code,label,scope}` biçimindedir. Fiyat KDV dahil dönem bedelidir; indirim ikinci defa uygulanmaz. Kabul edilen teklifle bedel/paket/periyot/süre uyuşmazlığı gönderimi engeller.

`createContractPdf(input,{allowIncomplete:false})` Edge adapter'ı `supabase/functions/_shared/contract-pdf.ts` içindedir. Gerçek `Uint8Array` baytları, base64 e-posta eki ve sürüm/şablon fingerprint/çıktı SHA256/sayfa aralıkları metadata'sı döndürür. Eksik paket normal çağrıda reddedilir. Açık inceleme seçeneği ile eksik uyarısı taşıyan PDF oluşturulabilir. Yetkili ad soyad ve imza tarihi alanları AcroForm olarak doldurulabilir; imza/kaşe çizilmez. İmza tarihi alanı kendiliğinden doldurulmaz.

İmzalı, aktif veya kaynak sürümünün uygulamaya alınmasından önceki tarihî kayıtlar yeni metinle asıl belge gibi yeniden üretilmez. Ekran doğrulama kaydına bağlı imzalı asıl dosyayı öncelikli açar. Yeni metin ancak ayrıca seçilen, her sayfası eski imzalı nüsha olmadığını söyleyen inceleme taslağı olabilir; final gönderim validator tarafından engellenir. Yeni inceleme üretmek eski kaydı veya kaynak PDF'ini değiştirmez. İç arşiv/şablon eksikliği açıklamaları personel ekranı ve bu rapordadır; müşteriye verilen EK-3/EK-4 formlarına basılmaz. Tarife ve demirbaş girişi ayrı tablo alanlarıyla yapılır.

`contract-document` yalnız personel JWT + `is_staff` + izinli origin ile kayıt kimliğinden bilgi/PDF okur. İstemciden müşteri, metin veya alıcı override'ı kabul etmez; hiçbir şey göndermez veya DB/storage'a yazmaz. PDF'e `Cache-Control: no-store` uygulanır. Frontend aynı sunucu motorunu kullanır; tarayıcı yazdırma penceresi gerekmez. Noto Sans alt kümeleri yereldir, lisansı yanında bulunur; font için dış istek yapılmaz. Kullanılan [pdf-lib API'si](https://pdf-lib.js.org/) özel font ve PDF bayt üretimini destekler.

## Tek seferlik kaynak profili

Sunucu ortamında `GANU_CONTRACT_COMPANY_JSON`: `name,address,taxNumber,taxOffice,mersis,phone,email`, isteğe bağlı `kep`. Gerçek değerleri kaynakla doğrulayın; buradaki örneklere kimlik/hesap bilgisi koymayın.

`GANU_CONTRACT_DOCUMENT_SETTINGS_JSON`: `daily_address_penalty`, `penalty_terms`, `deposit` (alınmayacaksa açık 0), `business_hours`, `rules_effective_date`, `extra_services` (yoksa açık boş metin), `extra_service_tariff` (yoksa açık boş dizi). Paket kapsamını `package_scopes` içinde paket adına göre string dizileriyle tanımlayın. Kabul edilen teklifte kapsam snapshot'ı varsa önce o kullanılır. Sözleşmeye özel `document_settings` profilden üstün gelir. `signature_date` imzaya sunulacak belgenin açık tarihidir; eski bir tarihi genel profile koyup yeni belgelere tekrar basmayın. Belge ekranı eksikleri gösterir ve sözleşmeye özel alanları kaydeder.

`GANU_CUSTOMER_PRIVACY_NOTICE_JSON` tek seferlik yetkili müşteri aydınlatma kaynağıdır: `scope:"customer-contract"`, `version`, `source`, `verified_at`. Metin için `paragraphs:string[]`; statik PDF için `storage_path:"legal/customer-privacy/<dosya>.pdf"` ve tam `sha256` gerekir. PDF `secure-docs` içinde yönetici tarafından bir defa yüklenir; kaynak/sürüm ve hash birlikte yapılandırılır. Bu iş canlı yükleme yapmamıştır. Kaynak PDF en fazla 8 MB/30 sayfa, şifresiz ve statik olmalıdır; form/imza alanı varsa birleştirilmez. Kaynak sayfaların düzeni korunur, üzerlerine ek çizilmez. Yol sınırı ve hash doğrulanır. Her müşteri aynı dosyayı yeniden yüklemez; sözleşmeye özel `privacy_notice` varsa o kullanılır.

## Doğrulama

`npm run test:contract-documents` saf model, tutar/KDV, kaynak/ek eksikleri, teklif eşleşmesi, rol/origin/override koruması, gerçek PDF baytları, AcroForm, statik kaynak PDF karması ve uzun Türkçe alanları sınar. `npm run test:staff-panel-build` 32 madde/atıf/fingerprint/Markdown eşleşmesi ve mevcut bundle sınırlarını da denetler. Deno check sunucu adapter'ını kapsar.

Sahte veri örneği: `output/pdf/ganu-sahte-veri-belge-paketi.pdf`. İçindeki KVKK satırı ve cezai şartlar yalnız test fixture'ıdır, işletmede kullanılacak karar veya hukuki metin değildir. Bağımsız pypdf/pdfplumber ve Poppler ile alan/Widget eşleşmesi, görünüm akışları, Türkçe metin ve sayfa sınırları doğrulanır; tüm sayfalar görsel olarak incelenir. Gerçek müşteri e-postası, imza, ödeme, fatura, deploy veya canlı kayıt yapılmaz.

DOĞRULANDI — 8 Kasım 2026 yerel koşu kanıtı: 19 sözleşme testi PASS; personel build/bundle/kaynak eşleşme kapıları PASS; gerçek yerel Deno adapter çağrısı 7 belgeli/22 sayfalı PDF baytları üretti. Orijinal ZIP karşılaştırmasında 7 DOCX SHA256 ve 184 uzun hukuki gövde paragrafı eşleşti. Son sahte PDF için bağımsız QA raporunda 24 terminal alan / 24 Widget değeri ve normal görünüm akışları eşleşti; Türkçe metin ve sayfa sınırları doğrulandı. Tüm 22 sayfa görsel incelendi. Bu kanıt canlı müşteri işlemini kapsamaz.
