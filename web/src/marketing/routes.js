const routes=[
  ['/satin-al','GANU · Teklif Al','GANU sanal ofis hizmetleri için yazılı teklif isteyin: telefon, WhatsApp veya e-posta.'],
  ['/panel','GANU · Personel Girişi','GANU personel paneli — yalnız yetkili personel.'],
  ['/musteri','GANU · Müşteri Portalı','GANU müşteri portalı yakında açılıyor.'],
  ['/ortak','GANU · İş Ortağı Portalı','GANU iş ortağı portalı yakında açılıyor.'],
]
export const MARKETING_ROUTES=routes.map(([path,title,description])=>Object.freeze({path,locale:'tr',counterpart:null,kind:'marketing-closed',indexable:false,seo:{title,description}}))
export const marketingRoute=(pathname)=>{
  const value=String(pathname||'/').replace(/\/+$/,'')||'/'
  return MARKETING_ROUTES.find((route)=>value===route.path||value.startsWith(`${route.path}/`))||null
}
