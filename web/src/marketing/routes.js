const routes=[
  ['/satin-al','GANU · Satış hazırlanıyor','GANU çevrim içi satış ve ödeme altyapısının güvenli yayına hazırlık durumu.'],
  ['/panel','GANU · Yönetim paneli kapalı','GANU yönetim paneli bu tanıtım yayınında kullanıma kapalıdır.'],
  ['/musteri','GANU · Müşteri portalı kapalı','GANU müşteri portalı bu tanıtım yayınında kullanıma kapalıdır.'],
  ['/ortak','GANU · İş ortağı portalı kapalı','GANU iş ortağı portalı bu tanıtım yayınında kullanıma kapalıdır.'],
]
export const MARKETING_ROUTES=routes.map(([path,title,description])=>Object.freeze({path,locale:'tr',counterpart:null,kind:'marketing-closed',indexable:false,seo:{title,description}}))
export const marketingRoute=(pathname)=>{
  const value=String(pathname||'/').replace(/\/+$/,'')||'/'
  return MARKETING_ROUTES.find((route)=>value===route.path||value.startsWith(`${route.path}/`))||null
}
