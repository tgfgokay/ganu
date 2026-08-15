import fs from 'node:fs'

const edge=fs.readFileSync('supabase/functions/purchase-flow/index.ts','utf8')
const checkout=fs.readFileSync('src/SatinAl.jsx','utf8')
const runbook=fs.readFileSync('STAGING-RUNBOOK.md','utf8')

const quote=edge.indexOf("const q=await quote(db,String(b.package_id||''),String(b.code||''))")
const custom=edge.indexOf("if(q.custom)throw new AppError(422")
const evidence=edge.indexOf('if(b.legal_text_version!==lv',custom)
const limited=edge.indexOf("await limited(db,req,'create')",custom)
const persist=edge.indexOf("purchase_create_candidate_legal",custom)
if(!(quote>=0&&quote<custom&&custom<evidence&&evidence<limited&&limited<persist))throw new Error('custom quote guard kabul/veri/rate-limit yazımından önce değil')
for(const marker of ['custom_quote_required','Bu paket çevrim içi satın alınamaz'])if(!edge.includes(marker))throw new Error(`purchase guard marker eksik: ${marker}`)

const corp=checkout.indexOf('if (isCorp) {')
const apply=checkout.indexOf('await customerApply',corp)
if(!(corp>=0&&apply>corp))throw new Error('Kurumsal frontend guard customerApply öncesi değil')
for(const marker of ["mode: 'teklif'",'ödeme/dekont adımı açılmaz','mailto:merhaba@ganu.com.tr'])if(!checkout.includes(marker))throw new Error(`Kurumsal frontend marker eksik: ${marker}`)
if(!runbook.includes('422')||!runbook.includes('custom_quote_required'))throw new Error('Kurumsal HTTP kontratı runbookta yok')

console.log('purchase guard static checks PASS')
