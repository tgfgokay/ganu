import fs from 'node:fs'
import path from 'node:path'
import { publicConfig } from './url-config.mjs'

if(process.env.GANU_MARKETING_ONLY!=='true')throw new Error('GANU_MARKETING_ONLY exact true zorunlu')
if(process.env.VITE_SUPABASE_URL||process.env.VITE_SUPABASE_ANON_KEY)throw new Error('marketing build Supabase env kabul etmez')
const dist=path.resolve('dist'),config=publicConfig()
const html=(route)=>fs.readFileSync(route==='/'?path.join(dist,'index.html'):path.join(dist,route.slice(1),'index.html'),'utf8')
const indexed=['/','/avukat','/mali-musavir','/is-ortakligi','/en','/en/lawyers','/en/accountants','/en/partnership','/blog','/en/blog','/en/blog/company-formation-registered-address-turkiye','/blog/sanal-ofis-faydalari','/blog/turkiyede-sirket-kurulusu-yasal-adres','/en/blog/virtual-office-benefits']
const locs=[...fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m)=>m[1])
const expected=indexed.map((route)=>config.absolute(route))
if(JSON.stringify(locs)!==JSON.stringify(expected))throw new Error(`marketing sitemap exact 14 route değil: ${locs.length}`)
for(const route of ['/mesafeli-satis','/iptal-iade','/kvkk','/cerezler','/en/privacy','/en/cookies']){
  if(!html(route).includes('noindex,nofollow')||locs.includes(config.absolute(route)))throw new Error(`${route}: legal draft yayın sınırı`)
}
for(const route of ['/satin-al','/panel','/musteri','/ortak']){
  const page=html(route)
  if(!page.includes('noindex,nofollow')||!page.includes('data-marketing-only='))throw new Error(`${route}: closed/noindex değil`)
  if(/<(?:form|input|select|textarea)\b/i.test(page))throw new Error(`${route}: veri toplayan alan var`)
}
const sales=html('/satin-al')
if(!sales.toLocaleLowerCase('tr').includes('çevrim içi başvuru, belge yükleme, ödeme ve kişisel veri toplama yapılmaz'))throw new Error('satış kapalı beyanı eksik')
const publicSurface=indexed.map(html).join('\n')
const sourceFiles=fs.readdirSync(path.resolve('src'),{recursive:true}).filter((name)=>/\.(?:js|jsx|ts|tsx)$/.test(name))
const publicContactSource=sourceFiles.map((name)=>fs.readFileSync(path.join('src',name),'utf8')).join('\n')
if(/merhaba(?:@|%40)ganu\.com\.tr/i.test(publicContactSource)||/merhaba(?:@|%40)ganu\.com\.tr/i.test(publicSurface))throw new Error('doğrulanmamış eski public e-posta adresi bulundu')
if(!publicContactSource.includes('info@ganu.com.tr')||!publicSurface.includes('info@ganu.com.tr'))throw new Error('doğrulanmış info@ganu.com.tr public iletişim adresi eksik')
for(const marker of ['online öde','30 saniyede satın al','Ödeme Yap','Dekont Yükle'])if(publicSurface.includes(marker))throw new Error(`public marketing checkout çağrısı: ${marker}`)
for(const route of ['/is-ortakligi','/en/partnership']){
  const page=html(route)
  if(!page.includes('data-marketing-only="partner-enquiry-closed"')||/<(?:form|input|select|textarea)\b/i.test(page))throw new Error(`${route}: marketing ortaklık formu kapalı değil`)
}
for(const marker of ['999','1.899','TRY / month','₺ / ay','1 gün</dt>'])if(html('/').includes(marker)||html('/en').includes(marker))throw new Error(`marketing kesin fiyat/süre iddiası: ${marker}`)
const assets=fs.readdirSync(path.join(dist,'assets')).filter((name)=>name.endsWith('.js'))
if(assets.some((name)=>/^(?:PanelApp|SatinAl|MusteriPortal|OrtakPortal|panel|store|supabase-vendor)-/.test(name)))throw new Error('private/store/Supabase chunk üretildi')
const built=assets.map((name)=>fs.readFileSync(path.join(dist,'assets',name),'utf8')).join('\n')
for(const marker of ['supabase.co','purchase-flow','pos-payment','get-file','createClient','partnerApply','localStorage'])if(built.includes(marker))throw new Error(`marketing runtime integration marker: ${marker}`)
if(fs.readFileSync(path.join(dist,'CNAME'),'utf8').trim()!=='ganu.com.tr')throw new Error('CNAME korunmadı')
console.log('marketing-only hard checks PASS (14 indexed, sales/private closed, integration runtime absent)')
