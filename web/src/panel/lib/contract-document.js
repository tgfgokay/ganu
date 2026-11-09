import { COMPANY } from './quote-document.js'
import { buildContractPackage,contractNumber,contractAmounts,formatDate,money } from '../../../supabase/functions/_shared/contract-documents.js'
export { buildContractPackage }
export { requiresOriginalContract } from '../../../supabase/functions/_shared/contract-documents.js'
export const SERVICE_ADDRESS=COMPANY.address
export const contractNo=contractNumber
export const contractFigures=contractAmounts
export function contractPackageInput(doc){
  return {...doc,company:doc.company||COMPANY,privacyNotice:doc.privacyNotice||doc.contract?.privacy_notice||null,documentSettings:doc.documentSettings||doc.contract?.document_settings||{}}
}
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function contractHtml(doc){
  const pkg=buildContractPackage(contractPackageInput(doc))
  const block=(b)=>b.type==='heading'?`<h3>${esc(b.text)}</h3>`:b.type==='row'?`<div class="row"><b>${esc(b.label)}</b><span>${esc(b.text)}</span></div>`:b.type==='signatures'?`<div class="sign">${[[b.company,'HİZMET SAĞLAYICI',''],[b.customer,'ÜYE',b.representative]].map(([name,label,rep])=>`<section><small>${label}</small><b>${esc(name)}</b><p>Yetkili ad soyad: ${esc(rep)||'____________________'}</p><p>İmza tarihi: ____________________</p><p>İmza / kaşe:</p><div class="signature-space"></div></section>`).join('')}</div>`:`<p>${esc(b.text).replace(/\n/g,'<br>')}</p>`
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(pkg.number)} · Belge paketi</title><style>
*{box-sizing:border-box}body{margin:0;background:#F4EFE7;color:#0a2540;font:11px/1.5 system-ui,-apple-system,'Segoe UI',Arial,sans-serif}.document{width:min(210mm,calc(100% - 24px));margin:16px auto;padding:14mm 16mm;background:white;box-shadow:0 3px 18px #0a25401a;overflow-wrap:anywhere}.header{border-bottom:2px solid #0a2540;padding-bottom:8px;position:relative;font-size:10px;color:#5b6b80}.header::after{content:"";position:absolute;bottom:-2px;left:0;width:32px;height:2px;background:#00D4B2}.header b{color:#0a2540;letter-spacing:.1em}.warning{padding:10px;border:1px solid #d38d67;background:#fff5ef;color:#803712;margin-bottom:12px}h1{font-family:Georgia,serif;font-weight:500;font-size:21px;line-height:1.3;margin:14px 0}h3{font-size:12px;margin:14px 0 5px;break-after:avoid}p{margin:0 0 6px;orphans:2;widows:2}.row{display:grid;grid-template-columns:34% 1fr;border-bottom:1px solid #e0e6ec;break-inside:avoid}.row b,.row span{padding:5px 8px}.row b{background:#F4EFE7;font-weight:600}.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;break-inside:avoid}.sign section{border-top:1px solid #0a2540;padding-top:8px}.sign small,.sign b{display:block;margin-bottom:5px}.signature-space{height:50px;border:1px solid #e0e6ec}.footer{font-size:9px;color:#5b6b80;border-top:1px solid #e0e6ec;margin-top:12px;padding-top:5px}@page{size:A4;margin:14mm 0}@media print{body{background:#fff}.document{width:210mm;margin:0 auto;box-shadow:none;padding:0 16mm;break-before:page}.document:first-child{break-before:auto}}
</style></head><body>${pkg.documents.map(d=>`<article class="document"><div class="header"><b>GANU</b> · ${esc(pkg.number)} · ${esc(pkg.version)}</div>${!pkg.ready?`<div class="warning">${esc(pkg.reviewLabel)}</div>`:''}<h1>${esc(d.title)}</h1><p style="font-size:9px;color:#5b6b80">Kaynak: ${esc(d.source)}${d.sourceVersion?` · ${esc(d.sourceVersion)}`:''}</p>${d.blocks.map(block).join('')}<div class="footer">${esc(pkg.number)} · ${esc(pkg.version)} · ${esc(pkg.fingerprint)}</div></article>`).join('')}</body></html>`
}
// Bu fonksiyon ileti taslağı döndürür; gönderim yapmaz. Backend PDF ekli gönderimi ayrıca yürütür.
export function contractEmail(doc){
  const input=contractPackageInput(doc),pkg=buildContractPackage(input),{contract,customer,quote}=input
  return {to:customer.email||'',subject:`GANU sanal ofis belge paketi · ${pkg.number}`,body:[
    `Sayın ${customer.contact||customer.title},`,'',
    `${quote?'Kabul ettiğiniz teklife göre hazırlanan':'Hazırlanan'} sanal ofis sözleşmesi ve ekleri ekte sunulmuştur.`,
    `Paket: ${contract.package} · ${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}`,
    `Dönem bedeli (KDV dahil): ${pkg.figures.price===null?'Veri eksik':money(pkg.figures.price)+' TL'}`,
    'Hizmet bedeli, aksi yazılı kararlaştırılmadıkça hizmet dönemi başlamadan önce peşin ödenir.',
    'Sözleşme iki nüsha düzenlenir. Lütfen belgeleri inceleyip imza alanlarını tamamlayın; her sayfayı paraflayın.',
    'İmzalı belgeleri ve istenen kimlik/yetki belgelerini tarafımıza iletin.','',COMPANY.name,
  ].join('\n'),ready:pkg.ready,missing:pkg.missing}
}
