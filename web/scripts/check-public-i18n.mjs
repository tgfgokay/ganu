import fs from 'node:fs'
import { PUBLIC_ROUTES, counterpartHash, publicRoute } from '../src/site/routes.js'
import { tr } from '../src/site/locales/tr.js'
import { en } from '../src/site/locales/en.js'
import { partnershipPayload, showPartnerCommercialFields } from '../src/site/partnership.js'

function directKeys(source, marker) {
  const markerAt=source.indexOf(marker)
  const start=source.indexOf('{',markerAt)
  if(markerAt<0||start<0)throw new Error(`object marker bulunamadı: ${marker}`)
  const keys=[];let depth=0
  for(let i=start;i<source.length;i++){
    const c=source[i]
    if(c==="'"||c==='"'||c==='`'){
      const quote=c
      for(i++;i<source.length;i++){if(source[i]==='\\'){i++;continue}if(source[i]===quote)break}
      continue
    }
    if(c==='/'&&source[i+1]==='/'){i=source.indexOf('\n',i);if(i<0)break;continue}
    if(c==='/'&&source[i+1]==='*'){i=source.indexOf('*/',i+2);if(i<0)break;i++;continue}
    if(c==='{'){depth++;continue}
    if(c==='}'){depth--;if(depth===0)break;continue}
    if(depth===1&&/[A-Za-z_$]/.test(c)){
      const match=source.slice(i).match(/^[A-Za-z_$][\w$]*/)
      const key=match[0],rest=source.slice(i+key.length)
      if(/^\s*:/.test(rest))keys.push(key)
      i+=key.length-1
    }
  }
  return keys
}
function noDuplicateKeys(keys,label){
  const duplicate=keys.find((key,index)=>keys.indexOf(key)!==index)
  if(duplicate)throw new Error(`duplicate ${label} key: ${duplicate}`)
}

const routes=fs.readFileSync(new URL('../src/site/routes.js',import.meta.url),'utf8')
const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const appRoutes=fs.readFileSync(new URL('../src/SiteRoutes.jsx',import.meta.url),'utf8')
const expected=['/','/avukat','/mali-musavir','/is-ortakligi','/en','/en/lawyers','/en/accountants','/en/partnership']
for(const path of expected){if(!routes.includes(`path:'${path}'`)||!appRoutes.includes(`path="${path}"`))throw new Error(`route eksik: ${path}`)}
const titles=[...routes.matchAll(/title:'([^']+)'/g)].map((m)=>m[1])
if(titles.length!==8||new Set(titles).size!==8)throw new Error('SEO title sayısı/benzersizliği başarısız')
for(const route of PUBLIC_ROUTES){const other=publicRoute(route.counterpart);if(!other||other.counterpart!==route.path||other.locale===route.locale)throw new Error(`counterpart bozuk: ${route.path}`)}
if(/\/en\/satin-al/.test(main+appRoutes+routes))throw new Error('İngilizce checkout route yasak')
const sw=fs.readFileSync(new URL('../src/site/LanguageSwitch.jsx',import.meta.url),'utf8')
if(/location\.search|searchParams/.test(sw))throw new Error('language switch query taşıyor')
if(!routes.includes("hizmetler:'services'")||!routes.includes("basvuru:'apply'"))throw new Error('section hash eşlemesi eksik')
if(counterpartHash(publicRoute('/'),'#hizmetler')!=='#services'||counterpartHash(publicRoute('/en/partnership'),'#apply')!=='#basvuru')throw new Error('section hash dönüşümü bozuk')
const trSource=fs.readFileSync(new URL('../src/site/locales/tr.js',import.meta.url),'utf8')
const trSegments=fs.readFileSync(new URL('../src/site/locales/trSegments.js',import.meta.url),'utf8')
for(const text of ['Yüklenemedi','Teklif','Müşterine değer','Düzenli hakediş','Tebligat & UETS takibi','Toplu anlaşma']){
  if(!(trSource+trSegments).includes(text))throw new Error(`TR içerik regresyonu: ${text}`)
}
noDuplicateKeys(directKeys(trSource,'export const tr'),'tr top-level')
noDuplicateKeys(directKeys(trSource,'\n home:{'),'tr.home')
if(en.home.pricing.perMonth!=='TRY / month'||tr.home.pricing.perMonth!=='₺ / ay')throw new Error('locale fiyat birimi bozuk')
if(!en.segments.lawyers?.hero?.lead||!en.segments.accountants?.hero?.lead||!en.partnership?.hero?.lead)throw new Error('EN route içeriği bağlı değil')
if(!appRoutes.includes('data={en.segments.lawyers}')||!appRoutes.includes('data={en.segments.accountants}')||!appRoutes.includes('content={en} locale="en"'))throw new Error('EN route/component import bağlantısı eksik')
const minimized=partnershipPayload({tax_no:'SECRET',iban:'TR00',name:'Firm'},'en')
if(showPartnerCommercialFields('en')||minimized.tax_no||minimized.iban)throw new Error('EN partnership veri minimizasyonu bozuk')
const publicComponents=['App.jsx','SegmentPage.jsx','IsOrtakligi.jsx','partnership/PartnerApply.jsx'].map((name)=>fs.readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8')).join('\n')
if(/dangerouslySetInnerHTML/.test(publicComponents))throw new Error('public componentte tehlikeli HTML renderı var')
if(!publicComponents.includes('showPartnerCommercialFields(locale)'))throw new Error('EN hassas alan UI kapısı eksik')
console.log('public i18n static checks PASS')
