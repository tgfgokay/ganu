const lawyers = {
  segLabel: 'Avukatlar için',
  hero: {
    eyebrow: 'Avukatlar için — İstanbul',
    eyebrow2: 'Tebligat güvenliği + baro uyumu',
    l1: 'Büronun',
    l2: 'prestijli',
    l3: 'adresi bizde',
    lead: 'Baro levhasına uygun İstanbul iş adresi; tebligat ve UETS takibi aynı gün bildirilir, ' +
      'tüm evrakın tek panelde toplanır. Re’sen terk riskini en aza indirir.',
    cta: 'Büro adresini al',
    stats: [
      { k: 'Aynı gün', v: 'tebligat bildirimi' },
      { k: 'Baro', v: 'levhasına uygun' },
      { k: 'Beykoz', v: 'Kavacık / İstanbul' },
    ],
  },
  marquee: ['Tebligat & UETS', 'Yoklamaya Hazır', 'Evrak Paneli', 'Baro Uyumu', 'Posta & Tebligat', 'Telefon Karşılama'],
  value: {
    kicker: 'Neden GANU — Hukuk büroları',
    title: 'Bir hukuk bürosunun<br />ihtiyacı olan <em>her şey</em><span class="dot">.</span>',
    items: [
      { n: '01', t: 'Tebligat & UETS takibi', d: 'Resmi tebligat ve elektronik tebligatlar (UETS) ulaştığı gün bildirilir; süre kaçırma riskini azaltır. Her tebligat panelde acil işaretlenir ve kaydı tutulur.' },
      { n: '02', t: 'Yoklama & re’sen terk desteği', d: 'Vergi dairesi adres yoklamasına (VUK 127) hazır fiziki adres; yoklama kayıtları panelde tutulur, re’sen terk riskini önemli ölçüde azaltır.' },
      { n: '03', t: 'Baro & levha uyumu', d: 'Büro adresi olarak kullanılabilen prestijli İstanbul adresi; levha ve resmi yazışmalarda güvenle gösterilir.' },
      { n: '04', t: 'Posta & kargo yönetimi', d: 'Gelen tebligat, evrak ve kargolar teslim alınır, aynı gün bildirilir; dilerseniz büronuza yönlendirilir.' },
      { n: '05', t: 'Telefon karşılama', d: 'Kurumsal numara ve profesyonel çağrı karşılama ile büronuza her zaman ulaşılsın; mesajlarınız panele işlenir.' },
      { n: '06', t: 'Tek panelde takip', d: 'Gelen evrak, tebligat, kargo ve faturalar tek ekranda; dilerseniz müvekkilleriniz için ayrı erişim portalı.' },
    ],
  },
  steps: {
    title: 'Dört adımda<br />büro adresin hazır<span class="dot">.</span>',
    items: [
      { n: '1', t: 'Görüşelim', d: 'Büronun ihtiyacını konuşalım, doğru paketi belirleyelim.' },
      { n: '2', t: 'Evrakları ilet', d: 'Gerekli belgeleri topla; tescili biz takip ederiz.' },
      { n: '3', t: 'Adresin aktif', d: 'Yasal büro adresin ve tebligat takibin devreye girer.' },
      { n: '4', t: 'Davalarına odaklan', d: 'Sen dosyalarına bak, idari yükü ve tebligat takibini bize bırak.' },
    ],
  },
  cross: {
    eyebrow: 'İş ortağımız olun',
    title: 'Müvekkil yönlendirin',
    text: 'Müvekkillerinizi GANU’ya yönlendirin; her müşteri için komisyon kazanın, adres ve posta sürecini tek elden biz yürütelim.',
    href: '/is-ortakligi',
    cta: 'İş Ortaklığı',
  },
  cta: {
    title: 'Büronun<br /><em>güvenli</em> adresi<span class="dot">.</span>',
    text: 'Tebligatı kaçırma, müvekkilini prestijli bir adreste karşıla. Bugün başla, adresin hazır olsun.',
  },
}

const accountants = {
  segLabel: 'Mali Müşavirler için',
  hero: {
    eyebrow: 'Mali müşavirler için — İstanbul',
    eyebrow2: 'Anlaşmalı ortaklık programı',
    l1: 'Mükellefine',
    l2: 'adres,',
    l3: 'gerisi bize',
    lead: 'Mükelleflerini GANU’ya yönlendir; prestijli İstanbul iş adresi, posta & tebligat ' +
      'yönetimi ve yoklama desteği tek elden yürütülsün. Sen mesleğine odaklan, adres tarafını biz üstlenelim.',
    cta: 'Ortak ol',
    stats: [
      { k: 'Tek elden', v: 'adres & posta' },
      { k: 'Panelden', v: 'mükellef takibi' },
      { k: 'Yoklama', v: 'desteği dahil' },
    ],
  },
  marquee: ['Ortaklık Programı', 'Yoklamaya Hazır', 'Mükellef Adresi', 'Posta & Tebligat', 'Toplu Anlaşma', 'Tek Muhatap'],
  value: {
    kicker: 'Neden GANU — Mali müşavirler',
    title: 'Mükelleflerine adres,<br />sana <em>tek muhatap</em><span class="dot">.</span>',
    items: [
      { n: '01', t: 'Anlaşmalı ortaklık', d: 'Mükelleflerini güvenle yönlendirebileceğin bir çözüm ortağın olur; adres ve posta ihtiyaçlarını tek elden karşılarız.' },
      { n: '02', t: 'Panelden mükellef takibi', d: 'Yönlendirdiğin mükelleflerin adres ve posta durumu İş Ortakları panelinde tek ekranda; şeffaf ve anlık.' },
      { n: '03', t: 'Mükelleflerine yasal adres', d: 'Mükelleflerinin ihtiyacı olan prestijli İstanbul iş adresini tek elden sağlarız — sen sadece yönlendir.' },
      { n: '04', t: 'Yoklama & re’sen terk desteği', d: 'Vergi dairesi yoklamasına (VUK 127) hazır fiziki adres; yoklama kayıtları tutulur, mükelleflerin re’sen terk riskini azaltır.' },
      { n: '05', t: 'Posta & tebligat yönetimi', d: 'Mükellefin gelen evrakı ve tebligatı bildirilir, kaydı tutulur; istersen sana da görünür olacak şekilde ayarlanır.' },
      { n: '06', t: 'Toplu anlaşma', d: 'Çok mükellefli müşavirlikler için özel toplu fiyat ve öncelikli destek.' },
    ],
  },
  steps: {
    title: 'Dört adımda<br />ortaklık başlasın<span class="dot">.</span>',
    items: [
      { n: '1', t: 'Ortak ol', d: 'Kısa bir görüşmeyle çalışma şeklimizi belirleyelim.' },
      { n: '2', t: 'Mükellefini yönlendir', d: 'Adres ihtiyacı olan mükelleflerini bize yönlendir.' },
      { n: '3', t: 'Süreci biz yürütelim', d: 'Adres ve posta yönetimini tek elden hallederiz.' },
      { n: '4', t: 'Mükellefini panelden izle', d: 'Yönlendirdiğin mükelleflerin adres ve posta durumunu panelden takip et.' },
    ],
  },
  cross: {
    eyebrow: 'İş ortağımız olun',
    title: 'Mükellef yönlendirin',
    text: 'Mükelleflerinizi GANU’ya yönlendirin; her müşteri için komisyon kazanın, adres ve posta sürecini tek elden biz yürütelim.',
    href: '/is-ortakligi',
    cta: 'İş Ortaklığı',
  },
  cta: {
    title: 'Mükellefine değer,<br />sana <em>tek muhatap</em><span class="dot">.</span>',
    text: 'Mali müşavirlik ortaklık programına katıl; mükelleflerine anahtar teslim adres sun, idari yükü bize bırak.',
  },
}
export const trSegments = {
  lawyers,
  accountants,
}
