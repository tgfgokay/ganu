import { useEffect } from 'react'
import SegmentPage from './SegmentPage.jsx'

const data = {
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

export default function Avukat() {
  useEffect(() => { document.title = 'GANU · Avukatlar için Sanal Ofis' }, [])
  return <SegmentPage data={data} />
}
