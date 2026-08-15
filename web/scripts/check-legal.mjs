import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { publicConfig } from './url-config.mjs'
import { POS_RETURN_STORAGE_KEY } from '../src/site/storageInventory.js'
const config=publicConfig(),dist=path.resolve('dist')
const {render,prerenderRoutes}=await import(`${pathToFileURL(path.resolve('dist-ssr/entry-server.js')).href}?legal=${Date.now()}`)
const routes=prerenderRoutes(),legal=routes.filter((route)=>route.kind==='legal')
const draftMode=legal.every((route)=>route.indexable===false)
const fileFor=(route)=>path.join(dist,...route.path.slice(1).split('/'),'index.html')
if(legal.length!==6)throw new Error('legal route count')
for(const route of legal){
  const html=fs.readFileSync(fileFor(route),'utf8'),root=html.match(/<div id="root" data-prerendered>([\s\S]+)<\/div>\s*<\/body>/)?.[1]||''
  if(!/<h1[ >]/.test(root)||root.length<1200||(draftMode&&!root.includes('LEGAL DRAFT')&&!root.includes('HUKUKİ TASLAK')))throw new Error(`${route.path}: SSR legal body`)
  if(draftMode?!html.includes('noindex,nofollow'):!html.includes('index,follow'))throw new Error(`${route.path}: legal index status`)
  if(draftMode&&!/counsel/i.test(root)&&!root.includes('avukat'))throw new Error(`${route.path}: counsel disclaimer`)
}
const output=legal.map((route)=>fs.readFileSync(fileFor(route),'utf8')).join('\n')
for(const link of ['/mesafeli-satis','/iptal-iade','/kvkk','/cerezler','/en/privacy','/en/cookies'])if(!output.includes(config.path(link)))throw new Error(`footer/legal link yok: ${link}`)
if(/\b[1-9]\d{10}\b|\bTR\d{24}\b/.test(output))throw new Error('legal output kişisel TC/IBAN benzeri değer')
if(/Google Analytics|Meta Pixel/.test(output)&&!/do not currently|bulunmamaktadır/.test(output))throw new Error('uydurma analytics inventory')
const app=fs.readFileSync('src/App.jsx','utf8'),checkout=fs.readFileSync('src/SatinAl.jsx','utf8'),gate=fs.readFileSync('scripts/prod-gate.sh','utf8')
if(!app.includes("salesEnabled?'/satin-al'")||!checkout.includes('if (!salesEnabled)')||!gate.includes('check-legal-readiness.mjs'))throw new Error('sales/readiness fail-closed wiring')
if(!checkout.includes('LegalLinks locale="tr" compact'))throw new Error('checkout yakınında legal links')
if(/(?:TBD|TODO|PLACEHOLDER|ÖRNEK ŞİRKET|TEST GANU)/i.test(output))throw new Error('placeholder seller identity outputta')
if(!draftMode&&/(?:\bTaslak\b|\bDraft\b|must be confirmed|kesinleştirilmelidir|doğrulanmadan|henüz doğrulan)/i.test(output))throw new Error('approved legal copy unresolved/draft ifade içeriyor')
if(!draftMode){
  for(const marker of ['Veri sorumlusu','İşleme amaçları','Toplama yöntemi ve hukuki sebepler','Alıcı grupları ve aktarım','Saklama'])if(!output.includes(marker))throw new Error(`approved KVKK Art.10/retention marker yok: ${marker}`)
}
const cookieSource=fs.readFileSync('src/legal/LegalPage.jsx','utf8'),storageSource=fs.readFileSync('src/site/storageInventory.js','utf8'),checkoutSource=fs.readFileSync('src/SatinAl.jsx','utf8')
if(!cookieSource.includes('POS_RETURN_STORAGE_KEY')||!checkoutSource.includes('POS_RETURN_STORAGE_KEY')||!storageSource.includes(`'${POS_RETURN_STORAGE_KEY}'`)||!output.includes(POS_RETURN_STORAGE_KEY))throw new Error('payment return storage key tek kaynak/eşleşme kapısı')
for(const marker of ['ganu.panel.*','ganu.musteri.session','ganu.ortak.session','Supabase Auth'])if(!cookieSource.includes(marker))throw new Error(`cookie inventory marker yok: ${marker}`)
if(!checkout.includes('preinfoAccepted')||!checkout.includes('earlyPerformanceRequested')||!checkout.includes('LEGAL_TEXT_VERSION'))throw new Error('checkout legal acknowledgement wiring')
const edge=fs.readFileSync('supabase/functions/purchase-flow/index.ts','utf8'),pos=fs.readFileSync('supabase/functions/pos-payment/index.ts','utf8'),migration=fs.readFileSync('supabase/migrations/0009_legal_consent_evidence.sql','utf8')
for(const marker of ['purchase_create_candidate_legal','p_preinfo_accepted:true','p_early_performance_requested:true','p_ip_hash:ipHash','p_user_agent_hash:uaHash'])if(!edge.includes(marker))throw new Error(`purchase-flow legal evidence marker yok: ${marker}`)
for(const marker of ["keyedHash('legal-ip'","keyedHash('legal-ua'","keyedHash('rate-limit-ip'","`${domain}\\0${value}`"])if(!edge.includes(marker))throw new Error(`keyed HMAC evidence marker yok: ${marker}`)
for(const marker of ['legal_text_version','preinfo_accepted_at','early_performance_requested_at'])if(!pos.includes(marker)||!migration.includes(marker))throw new Error(`POS/DB legal binding marker yok: ${marker}`)
if(!pos.includes("keyedHashHex('rate-limit-ip'"))throw new Error('POS status rate-limit keyed HMAC marker yok')
for(const marker of ["revoke insert,update,delete,truncate,references,trigger on public.legal_sale_config from service_role","grant select on public.legal_sale_config to service_role","where id=true for share","coalesce(cfg.tested_project_ref,'') !~ '^[a-z0-9]{20}$'","coalesce(cfg.sql_proof_sha256,'') !~ '^[0-9a-f]{64}$'","coalesce(cfg.http_proof_sha256,'') !~ '^[0-9a-f]{64}$'","s.customer_id is distinct from new.customer_id"])if(!migration.includes(marker))throw new Error(`live proof/ownership gate marker yok: ${marker}`)
console.log(`legal hard checks PASS (6 SSR legal route + ${draftMode?'draft/noindex':'approved/indexed'} + sales/readiness wiring + code-backed storage inventory)`)
