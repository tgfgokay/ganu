import { supabase,usingSupabase } from './supabase.js'
async function request(contractId,mode,allowIncomplete=false){
  if(!usingSupabase)throw new Error('Belge servisi için personel sunucu bağlantısı gerekli.')
  const {data,error}=await supabase.functions.invoke('contract-document',{body:{contract_id:contractId,mode,allow_incomplete:allowIncomplete}})
  if(error){let detail=null;try{detail=await error.context?.json?.()}catch{/* güvenli genel mesaj */}throw Object.assign(new Error(detail?.error||'Belge servisine ulaşılamadı.'),{missing:detail?.missing||[],code:detail?.code})}
  return data
}
export const loadContractPackageInfo=(contractId)=>request(contractId,'info')
// Baytlar ortak sunucu motorundan gelir; tarayıcı yazdırma penceresi veya harici font servisi gerekmez.
export async function createContractPdf(input,options={}){
  const result=await request(input.contract.id,'pdf',options.allowIncomplete===true)
  const bytes=Uint8Array.from(atob(result.attachment.content),c=>c.charCodeAt(0))
  return {...result,bytes}
}
