// Kamuya açık şirket künyesi (ticaret sicili / MERSİS). Hakkımızda, İletişim ve alt bilgide kullanılır.
// Hukuki metinlerin build-time kimliği (GANU_LEGAL_*) ayrı yönetilir; bu künye onların onay kapısına bağlı değildir.
export const COMPANY = Object.freeze({
  tradeName: 'GANU OFİS HİZMETLERİ LİMİTED ŞİRKETİ',
  taxOffice: 'Beykoz',
  taxNumber: '3892020110',
  mersis: '0389202011000001',
  registryOffice: 'İstanbul Ticaret Sicili Müdürlüğü',
  registryNumber: '1155060',
  founded: '18.08.2026',
  address: 'Kavacık Mah. Okul Cad. No:29 Kat:4 D.8 (Teras Katı) Beykoz / İstanbul',
  email: 'info@ganu.com.tr',
  phone: '0537 974 62 90',
  phoneHref: 'tel:+905379746290',
  contactPerson: 'Ali Topçu (Şirket Müdürü)',
  whatsapp: '905379746290',
})

// Teklif kanalları: sitede form yoktur, talep telefon/WhatsApp/e-posta ile alınır.
export const whatsappHref = (text) => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(text)}`
export const mailtoHref = (subject, body = '') => `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`

const normalized = (value) => value !== '/' ? String(value || '/').replace(/\/+$/, '') : '/'
export const COMPANY_ROUTES = [
  { id: 'about-tr', path: '/hakkimizda', type: 'about', title: 'Hakkımızda', description: 'GANU Ofis Hizmetleri Ltd. Şti. — Beykoz Kavacık\'ta sanal ofis, yasal iş adresi ve posta yönetimi hizmetleri; şirket künyesi.' },
  { id: 'contact-tr', path: '/iletisim', type: 'contact', title: 'İletişim', description: 'GANU Ofis Hizmetleri Ltd. Şti. iletişim bilgileri: adres, telefon, e-posta ve şirket künyesi.' },
].map((route) => Object.freeze({ ...route, locale: 'tr', counterpart: null, kind: 'company', indexable: true, seo: { title: `GANU · ${route.title}`, description: route.description } }))
export const companyRoute = (pathname) => COMPANY_ROUTES.find((route) => route.path === normalized(pathname)) || null
