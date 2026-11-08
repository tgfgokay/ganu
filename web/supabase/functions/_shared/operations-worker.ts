// Durable queue executor. No process-local locks; every transition is token-conditional in PostgreSQL.
export type Job = {id:string;kind:string;customer_id:string;contract_id?:string;invoice_id?:string;mail_id?:string;claim_token:string;attempts?:number;generation?:number;prepared?:Prepared|null}
export type Prepared = {to:string;subject:string;text:string;attachments:{path:string;filename:string;sha256?:string}[];document_metadata?:{version:string;templateFingerprint:string;contentSha256:string;documentIds:string[]}}
export type WorkerDeps = {
 claim(id?:string):Promise<Job|null>; read(table:string,id:string):Promise<any>;
 prepare(job:Job,value:Prepared):Promise<void>; begin(job:Job,contentHash:string):Promise<boolean>; defer(job:Job,error:string,seconds:number):Promise<void>;
 finish(job:Job,state:string,error?:string,missing?:any[],provider?:string):Promise<void>;
 save(path:string,bytes:Uint8Array):Promise<void>; download(path:string):Promise<Uint8Array>;
 pdf(input:any):Promise<any>; issue(id:string):Promise<{state?:string;message?:string;pdf?:string|null}>;
 fetch:typeof fetch; config:{apiKey?:string;from?:string;replyTo?:string;company?:any;documentSettings?:any;privacyNotice?:any}
}
const validEmail=(value:unknown)=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const bytes64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
export function ownedPath(path:string,customer:string){return typeof path==='string'&&path.startsWith(`customers/${customer}/`)&&!path.includes('..')&&!path.includes('\\')}
const sha256=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),(b)=>b.toString(16).padStart(2,'0')).join('')
async function ownerMatches(job:Job,d:WorkerDeps){
 if(job.kind==='contract_package'){
  const contract=await d.read('contracts',job.contract_id!)
  if(contract?.customer_id!==job.customer_id)return false
  const quote=await d.read('quote_for_contract',job.contract_id!)
  return !quote||(quote.customer_id===job.customer_id&&quote.contract_id===job.contract_id)
 }
 if(job.kind==='einvoice_issue'||job.kind==='einvoice_pdf'){
  const invoice=await d.read('invoices',job.invoice_id!)
  return invoice?.customer_id===job.customer_id&&(!job.contract_id||invoice.contract_id===job.contract_id)
 }
 if(job.kind==='mail_arrived')return (await d.read('mail_items',job.mail_id!))?.customer_id===job.customer_id
 return false
}
export async function sendPrepared(job:Job,p:Prepared,d:WorkerDeps){
 if(!await ownerMatches(job,d)){await d.finish(job,'blocked','record_owner_changed',[{code:'record_owner_changed',label:'Kayıt müşteri eşleşmesi değişti; yetkili kontrolü gerekli',scope:'customer'}]);return 'blocked'}
 const current=await d.read('customers',job.customer_id)
 if(!validEmail(current?.email)){await d.finish(job,'blocked','customer_email_required',[{code:'customer_email_required',label:'Müşterinin e-posta adresini tamamlayın',scope:'customer'}]);return 'blocked'}
 if(current.email.trim()!==p.to){await d.finish(job,'blocked','recipient_changed',[{code:'recipient_changed',label:'Müşteri e-posta adresi değişti; yeni adresi doğrulayıp tekrar deneyin',scope:'customer'}]);return 'blocked'}
 if(!validEmail(p.to))throw new Error('invalid_prepared_recipient')
 const attachments=[]
 for(const a of p.attachments){
  if(!ownedPath(a.path,job.customer_id))throw new Error('attachment_customer_mismatch')
  const bytes=await d.download(a.path),expected=a.sha256||p.document_metadata?.contentSha256
  if(!expected||!/^[a-f0-9]{64}$/.test(expected)||await sha256(bytes)!==expected){await d.finish(job,'blocked','prepared_pdf_changed',[{code:'prepared_pdf_changed',label:'Hazırlanan PDF kaynağı değişmiş veya doğrulanamıyor; orijinal belgeyi kontrol edin',scope:'document'}]);return 'blocked'}
  attachments.push({filename:a.filename,content:bytes64(bytes)})
 }
 const body=JSON.stringify({from:d.config.from,to:[p.to],subject:p.subject,text:p.text,...(d.config.replyTo?{reply_to:d.config.replyTo}:{}),...(attachments.length?{attachments}:{})})
 const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body))),(b)=>b.toString(16).padStart(2,'0')).join('')
 if(!await d.begin(job,contentHash))return 'ownership_lost'
 // Begin has committed before the external POST. Any ambiguous result needs reconciliation, never blind retry.
 try{
  const res=await d.fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${d.config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`ganu-operation/${job.id}/${job.generation||1}/${contentHash}`},body,signal:AbortSignal.timeout(20000)})
  const responseBody=await res.json().catch(()=>null)
  if(res.ok&&typeof responseBody?.id==='string'&&responseBody.id){await d.finish(job,'sent',undefined,[],responseBody.id);return 'sent'}
  const definite=[400,401,403,404,413,422,429].includes(res.status)
  await d.finish(job,definite?'failed':'uncertain',definite?'provider_rejected':'provider_confirmation_required');return definite?'failed':'uncertain'
 }catch{
  // Includes successful POST followed by failed DB completion. Persisted 'sending' also expires to uncertain.
  try{await d.finish(job,'uncertain','provider_confirmation_required')}catch{/* durable sending record remains */}
  return 'uncertain'
 }
}
export async function runOperation(d:WorkerDeps,id?:string){
 const job=await d.claim(id);if(!job)return {state:'idle'}
 if(!await ownerMatches(job,d)){await d.finish(job,'blocked','record_owner_changed',[{code:'record_owner_changed',label:'Kayıt müşteri eşleşmesi değişti; yetkili kontrolü gerekli',scope:'customer'}]);return {state:'blocked',kind:job.kind}}
 if(job.kind==='einvoice_issue'){
  try{
   const result=await d.issue(job.invoice_id!),done=result.state==='kesildi'&&!!result.pdf
   const pending=result.state==='işleniyor'||result.state==='bekliyor'||result.state==='kesildi'&&!result.pdf
   if(pending&&(job.attempts||1)<12){await d.defer(job,'einvoice_processing',300);return {state:'queued',kind:job.kind}}
   const code=pending?'einvoice_wait_limit':'einvoice_action_required'
   await d.finish(job,done?'done':'blocked',done?undefined:code,[...(done?[]:[{code,label:pending?'e-Belge otomatik takip süresi aşıldı; Faturalar ekranından kontrol edin':'Faturalar ekranında e-Belge durumunu kontrol edin',scope:'invoice'}])]);return {state:done?'done':'blocked',kind:job.kind}
  }
  catch{await d.finish(job,'blocked','einvoice_action_required');return {state:'blocked',kind:job.kind}}
 }
 try{
  if(!d.config.apiKey||!d.config.from){await d.finish(job,'blocked','email_setup_required',[{code:'email_setup_required',label:'Ürün e-posta gönderim ayarları tamamlanmalı',scope:'setup'}]);return {state:'blocked'}}
  let p=job.prepared
  if(!p){
   const customer=await d.read('customers',job.customer_id)
   if(!validEmail(customer?.email)){await d.finish(job,'blocked','customer_email_required',[{code:'customer_email_required',label:'Müşterinin e-posta adresini tamamlayın',scope:'customer'}]);return {state:'blocked'}}
   p={to:customer.email.trim(),subject:'GANU bilgilendirme',text:'',attachments:[]}
   if(job.kind==='contract_package'){
    const contract=await d.read('contracts',job.contract_id!),quote=await d.read('quote_for_contract',job.contract_id!)
    const out=await d.pdf({contract,customer,quote,company:d.config.company||{},documentSettings:{...d.config.documentSettings,...contract.document_settings},privacyNotice:contract.privacy_notice||d.config.privacyNotice})
    const path=`customers/${job.customer_id}/contracts/${job.id}-${out.metadata.contentSha256}.pdf`
    await d.save(path,out.bytes)
    p.subject=`GANU · ${out.package.number} sözleşme ve ekleri`
    p.text='Sözleşme ve ekleri incelemeniz için ektedir. Teklif kabulü imza yerine geçmez. İmzalı belgeler, peşin ödeme ve adres belgesi doğrulandıktan sonra hizmetiniz aktifleştirilir.'
    p.attachments=[{path,filename:out.attachment.filename,sha256:out.metadata.contentSha256}]
    p.document_metadata={version:out.metadata.version,templateFingerprint:out.metadata.templateFingerprint,contentSha256:out.metadata.contentSha256,documentIds:out.metadata.documentIds}
   }else if(job.kind==='einvoice_pdf'){
    const inv=await d.read('invoices',job.invoice_id!),path=String(inv?.einvoice_pdf||'').replace(/^secure:/,'')
    if(inv?.einvoice_status!=='kesildi'||!ownedPath(path,job.customer_id))throw new Error('invoice_pdf_not_ready')
    p.subject='GANU · e-Belgeniz';p.text='Kesilmiş e-Belgeniz ektedir.';p.attachments=[{path,filename:`GANU-eBelge-${job.invoice_id}.pdf`,sha256:await sha256(await d.download(path))}]
   }else if(job.kind==='mail_arrived'){
    const mail=await d.read('mail_items',job.mail_id!)
    if(mail?.customer_id!==job.customer_id)throw new Error('mail_customer_mismatch')
    p.subject=mail.type==='tebligat'?'GANU · ACİL: Tebligat bildirimi':'GANU · Yeni posta/kargo'
    p.text=`GANU adresinize ${mail.type} geldi. Geliş tarihi: ${mail.received_date}.${mail.sender?` Gönderen: ${mail.sender}.`:''}${mail.tracking_no?` Takip no: ${mail.tracking_no}.`:''}${mail.type==='tebligat'?' Hukuki süreler bakımından gecikmeden bizimle iletişime geçin. Bu bildirim hukuki tebliğ tarihi veya kabul yetkisi doğrulaması değildir.':' Teslim veya yönlendirme için bizimle iletişime geçebilirsiniz.'}`
   }else throw new Error('unknown_operation')
   await d.prepare(job,p)
  }
  return {state:await sendPrepared(job,p,d),kind:job.kind}
 }catch(e){
  const missing=Array.isArray((e as any)?.missing)?(e as any).missing:[]
  await d.finish(job,missing.length?'blocked':'failed',missing.length?'contract_information_required':'preparation_failed',missing)
  return {state:missing.length?'blocked':'failed',kind:job.kind}
 }
}
