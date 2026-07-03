import { useEffect } from 'react'
import SegmentPage from './SegmentPage.jsx'

const data = {
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

export default function MaliMusavir() {
  useEffect(() => { document.title = 'GANU · Mali Müşavirler için Sanal Ofis' }, [])
  return <SegmentPage data={data} />
}
