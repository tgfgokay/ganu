import { buildContractPackage } from './contract-documents.js'
type Dependencies={origin:string;authorized(req:Request):Promise<boolean>;load(id:string,req:Request):Promise<any>;pdf(input:any,options:any):Promise<any>}
export function contractDocumentHandler(d:Dependencies){
  return async(req:Request)=>{
    const cors={'Access-Control-Allow-Origin':d.origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
    const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
    if(!d.origin)return json({error:'SITE_URL yapılandırılmalı'},503)
    if(req.headers.get('origin')&&req.headers.get('origin')!==d.origin)return json({error:'Origin izinli değil'},403)
    if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
    if(req.method!=='POST')return json({error:'POST kullanın'},405)
    if(!await d.authorized(req))return json({error:'Personel yetkisi gerekli'},403)
    const text=await req.text()
    if(text.length>4096)return json({error:'İstek çok büyük'},400)
    let body:any;try{body=JSON.parse(text)}catch{return json({error:'Geçersiz istek'},400)}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.contract_id||''))return json({error:'Geçerli sözleşme kaydı gerekli'},400)
    if(!['info','pdf'].includes(body.mode))return json({error:'Geçerli belge işlemi gerekli'},400)
    try{
      // İstemciden belge metni, müşteri veya şirket override'ı kabul edilmez.
      const input=await d.load(body.contract_id,req)
      if(!input)return json({error:'Sözleşme veya müşteri kaydı okunamadı'},404)
      if(body.mode==='info')return json({package:buildContractPackage(input),company:input.company,documentSettings:input.documentSettings,privacyNotice:input.privacyNotice})
      const out=await d.pdf(input,{allowIncomplete:body.allow_incomplete===true})
      return json({attachment:out.attachment,metadata:out.metadata,package:out.package})
    }catch(error:any){
      if(error?.code==='contract_package_incomplete')return json({error:'Belge paketi eksik',code:error.code,missing:error.missing},422)
      if(String(error?.code||'').startsWith('privacy_pdf_')||error?.code==='contract_unsupported_character')return json({error:error.message,code:error.code,missing:error.missing||[]},422)
      return json({error:'Belge hazırlanamadı; kayıt ve kaynak yapılandırmasını kontrol edin.'},500)
    }
  }
}
