export const PUBLIC_ROUTES = [
  { id:'home-tr', locale:'tr', path:'/', counterpart:'/en', sections:['hizmetler','nasil','paketler','sss','iletisim'], seo:{ title:'GANU · Anahtar Teslim Sanal Ofis · İstanbul', description:'İstanbul’da yasal iş adresi, posta ve kargo yönetimi, telefon karşılama ve toplantı odası hizmetleri tek elden.' } },
  { id:'lawyers-tr', locale:'tr', path:'/avukat', counterpart:'/en/lawyers', sections:['neden','nasil','iletisim'], seo:{ title:'GANU · Avukatlar için Sanal Ofis', description:'Avukatlar için İstanbul iş adresi, tebligat ve posta takibi ile idari ofis desteği.' } },
  { id:'accountants-tr', locale:'tr', path:'/mali-musavir', counterpart:'/en/accountants', sections:['neden','nasil','iletisim'], seo:{ title:'GANU · Mali Müşavirler için Sanal Ofis', description:'Mali müşavirler ve mükellefleri için İstanbul yasal adresi, posta yönetimi ve iş ortaklığı desteği.' } },
  { id:'partnership-tr', locale:'tr', path:'/is-ortakligi', counterpart:'/en/partnership', sections:['neden','nasil','basvuru'], seo:{ title:'GANU · İş Ortaklığı — Komisyonlu Yönlendirme', description:'Avukat, mali müşavir ve şirket kuruluşu danışmanları için şeffaf komisyonlu GANU iş ortaklığı programı.' } },
  { id:'home-en', locale:'en', path:'/en', counterpart:'/', sections:['services','process','plans','faq','contact'], seo:{ title:'GANU · Virtual Office and Registered Address in Istanbul', description:'A professional registered office address in Istanbul with mail handling, call answering and meeting-room support.' } },
  { id:'lawyers-en', locale:'en', path:'/en/lawyers', counterpart:'/avukat', sections:['why','process','contact'], seo:{ title:'GANU · Virtual Office in Istanbul for Law Firms', description:'A professional Istanbul office address with mail and notice handling for international and local legal practices.' } },
  { id:'accountants-en', locale:'en', path:'/en/accountants', counterpart:'/mali-musavir', sections:['why','process','contact'], seo:{ title:'GANU · Istanbul Office Address for Accountants and Advisers', description:'Registered-address and mail-handling support for accountants, advisers and their clients entering Türkiye.' } },
  { id:'partnership-en', locale:'en', path:'/en/partnership', counterpart:'/is-ortakligi', sections:['why','process','apply'], seo:{ title:'GANU · International Referral Partnership', description:'A transparent referral programme for advisers helping founders and businesses establish a presence in Istanbul.' } },
]

const normalized = (p) => p !== '/' ? String(p || '/').replace(/\/+$/, '') : '/'
export function publicRoute(pathname) { return PUBLIC_ROUTES.find((r) => r.path === normalized(pathname)) || null }
export function counterpartHash(route, hash) {
  const id = String(hash || '').replace(/^#/, '')
  if (!id || !route?.sections.includes(id)) return ''
  const other = publicRoute(route.counterpart)
  const pairs={hizmetler:'services',nasil:'process',paketler:'plans',sss:'faq',iletisim:'contact',neden:'why',basvuru:'apply'}
  const target=route.locale==='tr'?(pairs[id]||id):(Object.entries(pairs).find(([,v])=>v===id)?.[0]||id)
  return other?.sections.includes(target) ? `#${target}` : ''
}

export const SEO_ROUTE_COUNT = 8
