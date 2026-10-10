// Sanal ofis hizmet sözleşmesinin madde metinleri (tek kaynak). Panel belgesi (contract-document.js) ve
// sozlesmeler/01-sanal-ofis-hizmet-sozlesmesi.md (scripts/render-contract-template.mjs) bu listeden üretilir.
// Saf modül: içe aktarım yok, Node betiği de kullanır. Metin değişince sürüm artırılır ve şablon yeniden üretilir.
// Kaynak: 06 numaralı iki dilli şablon + süreç denetimi (ChatGPT, 10.10.2026, 3. tur) madde önerileri. Avukat onayı bekler.
export const CONTRACT_VERSION = '2026-10'

// {adres}: Hizmet Veren'in tahsis edilen adresi. Madde 1 (taraflar) belgeye özel üretilir; numaralar 2'den başlar.
export const CLAUSES = [
  { title: 'Sözleşmenin konusu ve niteliği', paras: [
    "İşbu Sözleşme'nin konusu; Hizmet Veren'in, Müşteri'ye EK-1'de belirtilen hizmet paketi kapsamında yasal iş adresi kullanımı, posta ve kargo karşılama ve bildirim hizmetleri ile pakete dahil diğer hizmetleri sunması ve Müşteri'nin bunun karşılığında hizmet bedelini ödemesidir.",
    "Sözleşme bir hizmet sözleşmesidir; Müşteri'ye adres üzerinde zilyetlik ya da münhasır kullanım hakkı vermez. Hizmet bedeli KDV eklenerek faturalandırılır ve Müşteri bu bedelden stopaj kesintisi yapmaz. Sözleşmenin niteliğine uygulanması zorunlu emredici hükümler saklıdır.",
  ] },
  { title: 'Hizmet kapsamı', paras: [
    "Yasal iş adresi: Hizmet Veren, Müşteri'nin Sözleşme süresince {adres} adresini ticaret sicili, vergi dairesi ve diğer resmî kayıtlarında iş adresi olarak göstermesine izin verir ve bunun için gerekli adres tahsis / muvafakat belgesini (EK-2) düzenler.",
    "Posta ve kargo: Hizmet Veren, Müşteri adına gelen olağan posta ve kargoyu çalışma saatleri içinde karşılar, kayıt altına alır, muhafaza eder ve EK-1'de belirtilen iletişim kanalı üzerinden teslim aldığı iş günü, en geç izleyen iş günü Müşteri'ye bildirir. Yönlendirme ve teslim işlemleri tarafların belirlediği usule göre yapılır; kargo taşıma bedeli Müşteri'ye aittir.",
    "Resmî tebligat: Resmî tebligatların kabulü ilgili mevzuattaki yetki ve usul şartlarına tabidir; bu Sözleşme Hizmet Veren personeline kanunen sahip olmadığı tebligat kabul yetkisi vermez. Hizmet Veren'e ulaşan resmî evrak ve tebligat girişimleri kayıt altına alınır ve gecikmeksizin Müşteri'ye bildirilir.",
    "Pakete dahil diğer hizmetler ve kullanım sınırları EK-1'de gösterilir. Posta açma ve tarama yalnız Müşteri'nin ayrıca vereceği yazılı onayla yapılır. EK-1'de yer almayan hizmetler ayrıca fiyatlandırılır ve ayrı belgeyle düzenlenir.",
  ] },
  { title: 'Hizmet bedeli ve ödeme', paras: [
    'Hizmet bedeli, ödeme periyodu (aylık ya da yıllık peşin), KDV hariç tutar, KDV ve KDV dahil toplam EK-1\'de gösterilir.',
    "Müşteri, düzenlenen faturayı fatura tarihinden itibaren 7 gün içinde EK-1'de belirtilen banka hesabına ya da Hizmet Veren'in ilettiği ödeme bağlantısıyla öder.",
    "Yıllık ödeme fiyat avantajı EK-1'deki yıllık bedele dahildir; ikinci kez uygulanmaz. Müşteriye özel indirimin oranı ve geçerli olduğu dönem EK-1'de gösterilir.",
    "Depozito (güvence bedeli) yalnız EK-1'de kararlaştırılmışsa alınır; alınmışsa Sözleşme sona erdiğinde belgeli borç ve zararlar mahsup edilerek hesap mutabakatıyla iade edilir.",
    "Ödemenin gecikmesi hâlinde mevzuata uygun temerrüt faizi ve bildirim hükümleri uygulanır. Hizmet Veren, yazılı bildirim ve uygulanması gereken süreler sonrasında hukuken mümkün olduğu ölçüde ek hizmetleri kısıtlayabilir. Resmî tebligat işlemleri ile mevcut evrakın muhafazası ve bildirimine ilişkin yükümlülükler bu kısıtlama nedeniyle ortadan kalkmaz.",
  ] },
  { title: 'Yenileme döneminin bedeli', paras: [
    "Yenileme dönemi bedeli, EK-1'de gösterilen KDV hariç yenileme esas bedeline, yenileme tarihinde son açıklanmış TÜİK on iki aylık ortalamalara göre TÜFE değişim oranı uygulanarak ve yasal sınırlar aşılmadan hesaplanır.",
    "Hizmet Veren yeni dönem bedelini ve hesap dayanağını dönem bitiminden en az 45 gün önce yazılı olarak bildirir; bildirim yapılmamışsa yeni dönemde önceki dönemin bedeli uygulanır. Bu yöntem dışındaki bedel ya da kapsam değişiklikleri tarafların yazılı mutabakatını gerektirir.",
  ] },
  { title: 'Damga vergisi', paras: [
    "İşbu Sözleşme ve vergiye tabi eklerine ilişkin damga vergisi, tarafların kanuni yükümlülükleri ve müşterek sorumlulukları saklı kalmak üzere, aralarındaki iç ilişkide Müşteri tarafından karşılanır.",
    "Hizmet Veren tarafından beyan edilip ödenen tutar, ödeme belgesiyle tevsik edilerek kâr ilavesi olmaksızın Müşteri'ye ayrıca yansıtılır; bu tutar hizmet bedeline dahil edilmez. Sözleşme tek nüsha düzenlendiğinden vergi tek nüsha üzerinden hesaplanır; tahmini tutar EK-1'de gösterilir.",
  ] },
  { title: 'Süre ve yenileme', paras: [
    "Sözleşme, EK-1'de gösterilen başlangıç tarihinde yürürlüğe girer ve EK-1'deki süre için geçerlidir.",
    "EK-1'de kendiliğinden yenileme öngörülmüşse, taraflardan biri dönem bitiminden en az 30 gün önce yazılı yenilememe bildiriminde bulunmadıkça Sözleşme, uygulanabilir emredici mevzuat saklı kalmak üzere 12 ay için kendiliğinden yenilenir. Yenilemede hizmet kapsamı ve diğer hükümler aynı kalır; bedel 5. maddedeki yönteme göre belirlenir.",
  ] },
  { title: "Müşteri'nin yükümlülükleri", paras: [
    'Müşteri hizmet bedelini zamanında öder ve adresi yalnız hukuka uygun ticari faaliyeti için kullanır.',
    'Müşteri kimlik, şirket ve iletişim bilgilerini doğru ve eksiksiz verir; değişiklikleri 7 gün içinde yazılı olarak bildirir.',
    "Müşteri, adresi Hizmet Veren'in yazılı izni olmadan başka bir kişiye devredemez ya da kullandıramaz.",
    "Müşteri, UETS ve GİB elektronik tebligat hesaplarını bizzat ya da yetkili temsilcileri aracılığıyla takip etmekten sorumludur; Hizmet Veren bu hesapların takibini ayrıca ve açıkça üstlenmedikçe bu hizmeti vermez. Hizmet Veren'in fiziksel evraka ilişkin yükümlülükleri, hukuken geçerli teslim işlemleri ve üstlendiği bildirim hizmetinin kapsamıyla sınırlıdır.",
  ] },
  { title: "Hizmet Veren'in yükümlülükleri", paras: [
    'Hizmet Veren, paket kapsamındaki hizmetleri özenle sunar.',
    "Hizmet Veren, Müşteri'nin resmî kayıt işlemleri için gereken adres tahsis / muvafakat belgesini (EK-2) sağlar.",
    'Hizmet Veren, planlı hizmet kesintilerini makul süre önceden bildirir.',
  ] },
  { title: 'Kimlik tespiti ve yasaklı kullanım', paras: [
    "Müşteri, 5549 sayılı Kanun ve ilgili mevzuat gereği kimlik ve gerçek faydalanıcı bilgilerini (EK-4) eksiksiz ve doğru verir.",
    "Müşteri adresi ve hizmetleri; hukuka aykırı faaliyet, dolandırıcılık, suç gelirlerinin aklanması ve paravan şirket işlemleri, gerçekte faaliyet yokken yanıltıcı adres gösterimi, üçüncü kişileri zarara uğratacak işler ile Hizmet Veren'in yazılı izni olmadan stok, depolama ya da üretim için kullanamaz.",
    "Bu maddeye aykırılık, gerçeğe aykırı beyan ya da mevzuat gereği şüpheli işlem değerlendirmesi gerektiren durumlarda Hizmet Veren Sözleşme'yi derhal feshedebilir; doğan zararlardan Müşteri sorumludur.",
  ] },
  { title: 'Posta sınırları ve saklama', paras: [
    'Hizmete dahil posta ve kargo, olağan ticari kullanımla ve azami 50×50×50 cm ebatla sınırlıdır; bunu aşan gönderiler için Hizmet Veren önceden bildirerek ek ücret uygulayabilir.',
    "Bildirime rağmen 30 gün içinde teslim alınmayan olağan posta ve kargo için Hizmet Veren, Müşteri'ye ek bildirimde bulunarak saklama ücreti uygulayabilir ya da gönderiyi bedeli Müşteri'ye ait olmak üzere Müşteri'nin bildirdiği adrese gönderebilir. Resmî tebligat ve resmî kurum evrakı imha edilmez.",
  ] },
  { title: 'Kişisel verilerin korunması ve gizlilik', paras: [
    'Taraflar 6698 sayılı Kişisel Verilerin Korunması Kanunu\'na uygun hareket eder. Hizmet Veren verileri yalnız hizmetin ifası ve yasal yükümlülükler için işler; yasal zorunluluk dışında üçüncü kişilerle paylaşmaz.',
    "Hizmet Veren aydınlatma yükümlülüğünü EK-3'teki aydınlatma metniyle yerine getirir. Kanunda öngörülen diğer işleme şartlarına dayanan işlemler için ayrıca açık rıza istenmez; açık rıza gerektiren seçimlik işlemler varsa bunlar için ayrı ve özgür iradeye dayanan rıza alınır.",
    'Gizlilik yükümlülüğü Sözleşme sona erse de 3 yıl devam eder.',
  ] },
  { title: 'Sorumluluk', paras: [
    'Hizmet Veren, posta ve kargonun içeriğinden ve taşıyıcıdan kaynaklanan kayıp ya da gecikmeden sorumlu değildir.',
    "Müşteri'nin ticari faaliyetleri, vergi, SGK ve diğer resmî yükümlülükleri ile üçüncü kişilerle ilişkilerinden Hizmet Veren sorumlu değildir.",
    "Hizmet Veren'in Sözleşme'den doğan toplam sorumluluğu, kast ve ağır kusur hâlleri ile emredici hükümler saklı kalmak üzere, zararın doğduğu tarihten önceki son 3 aylık hizmet bedeliyle sınırlıdır.",
  ] },
  { title: 'Fesih ve sona erme', paras: [
    "Dönem sonundaki yenilememe bildirimi 7. madde hükümlerine tabidir. Sözleşme süresi içindeki fesih, tarafların hukuken geçerli haklı nedenleri ve sözleşmenin niteliğine uygulanan emredici hükümler çerçevesinde değerlendirilir.",
    'Hizmet Veren; usulüne uygun bildirime rağmen ödenmeyen hizmet bedeli, 10. maddeye aykırılık ya da diğer esaslı ihlallerde Sözleşme\'yi haklı nedenle feshedebilir.',
    "Sözleşmenin sona ermesi üzerine Müşteri, Hizmet Veren adresini resmî kayıtlarından değiştirmek için gerekli işlemleri gecikmeksizin başlatır ve en geç 15 gün içinde başvuru kanıtını, değişiklik tamamlandığında da doğrulama belgesini Hizmet Veren'e iletir. Adres değişikliği tamamlanmazsa Hizmet Veren hukuka uygun bildirim ve başvuru haklarını kullanabilir.",
    'Sözleşme sona erdiğinde peşin tahsil edilmiş hizmet bedelleri; sunulan hizmet süresi, fesih sebebi ve Sözleşme hükümleri dikkate alınarak hesap mutabakatına konu edilir. Tarafların emredici mevzuattan doğan iade, zarar ve tazminat hakları saklıdır.',
  ] },
  { title: 'Bildirimler ve tebligat', paras: [
    "Tarafların iletişim bilgileri 1. madde ve EK-1'de gösterilir; değişiklikler gecikmeksizin karşı tarafa bildirilir.",
    'Temerrüt, fesih ya da sözleşmeden dönmeye ilişkin ihbar ve ihtarlar Türk Ticaret Kanunu 18/3\'te belirtilen usullerle yapılır; günlük operasyon bildirimleri için EK-1\'deki e-posta ve mesaj kanalları kullanılır. Resmî kurumların tebligatları ilgili tebligat mevzuatına tabidir; bu madde sıradan e-postayı ya da KEP adresini UETS yerine geçirmez.',
  ] },
  { title: 'Mücbir sebep', paras: [
    "Doğal afet, salgın, savaş, resmî makam kararları ve altyapı kesintileri gibi tarafların kontrolü dışındaki hâller mücbir sebep sayılır; bu süre boyunca etkilenen yükümlülükler askıya alınır. 30 günü aşan mücbir sebepte taraflar Sözleşme'yi feshedebilir.",
  ] },
  { title: 'Uyuşmazlıkların çözümü', paras: [
    'Taraflar uyuşmazlıkları öncelikle iyi niyetle çözmeye çalışır. Sözleşme\'ye Türk hukuku uygulanır; uyuşmazlıklarda İstanbul (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir.',
  ] },
  { title: 'Yürürlük, ekler ve nüsha', paras: [
    "Ekler Sözleşme'nin ayrılmaz parçasıdır: EK-1 Hizmet paketi, bedel ve ödeme bilgileri; EK-2 Adres tahsis / muvafakat belgesi; EK-3 Kişisel verilerin korunması aydınlatma metni; EK-4 Gerçek faydalanıcı beyanı; varsa EK-5 Posta açma ve tarama onayı.",
    "Sözleşme tek nüsha olarak düzenlenip imzalanmıştır; asıl nüsha Hizmet Veren'de saklanır, imzalı suretinin elektronik kopyası Müşteri'ye verilir.",
  ] },
]

// Belge numarası: madde sayısı (taraflar dahil).
export const ARTICLE_COUNT = CLAUSES.length + 1
