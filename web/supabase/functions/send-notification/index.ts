// Product notification worker. Inputs identify a durable job, never arbitrary recipients/message bodies.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { contractProfiles,resolveContractInput } from '../_shared/contract-runtime-config.ts'
import { createContractPdf } from '../_shared/contract-pdf.ts'
import { runOperation } from '../_shared/operations-worker.ts'
import { parasutEnv,runEInvoice } from '../_shared/einvoice-run.ts'
const get=(key:string)=>(Deno.env.get(key)||'').trim()
let origin='';try{origin=new URL(get('SITE_URL')).origin}catch{/* fail closed */}
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-worker-secret','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
const configJson=(key:string)=>{try{return JSON.parse(get(key)||'null')}catch{return null}}
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
Deno.serve(async(req)=>{
 if(!origin)return json({error:'SITE_URL yapılandırılmalı'},503)
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({error:'Origin izinli değil'},403)
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return json({error:'POST kullanın'},405)
 const authorization=req.headers.get('Authorization')||'',url=get('SUPABASE_URL'),key=get('SUPABASE_SERVICE_ROLE_KEY')
 if(!url||!key)return json({error:'Sunucu bağlantısı eksik'},503)
 const worker=get('NOTIFICATION_WORKER_SECRET'),scheduled=worker.length>=32&&equal(req.headers.get('x-worker-secret')||'',worker)
 if(!scheduled){const user=createClient(url,get('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const r=await user.rpc('is_staff');if(r.error||r.data!==true)return json({error:'Personel yetkisi gerekli'},403)}
 const body=await req.json().catch(()=>({})),id=body?.job_id
 if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'İş kimliği geçersiz'},400)
 const db=createClient(url,key,{auth:{persistSession:false}})
 const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await db.rpc(name,args);if(r.error)throw new Error('operation_store_failed');return r.data}
 const result=await runOperation({
  claim:async(jobId)=>{const r=await rpc('operation_claim',{p_id:jobId||null});return r?.[0]||null},
  read:async(table,recordId)=>{const query=table==='quote_for_contract'?db.from('quotes').select('*').eq('contract_id',recordId):db.from(table).select('*').eq('id',recordId);const r=await query.maybeSingle();if(r.error||!r.data&&table!=='quote_for_contract')throw new Error('operation_record_missing');return r.data},
  defer:(j,error,seconds)=>rpc('operation_defer',{p_id:j.id,p_token:j.claim_token,p_error:error,p_seconds:seconds}),
  prepare:(j,p)=>rpc('operation_prepare',{p_id:j.id,p_token:j.claim_token,p_prepared:p}),begin:(j,hash)=>rpc('operation_begin_send',{p_id:j.id,p_token:j.claim_token,p_content_hash:hash}),
  finish:(j,state,error,missing=[],provider)=>rpc('operation_finish',{p_id:j.id,p_token:j.claim_token,p_state:state,p_error:error||null,p_missing:missing,p_provider:provider||null}),
  save:async(path,bytes)=>{const r=await db.storage.from('secure-docs').upload(path,bytes,{contentType:'application/pdf',upsert:false});if(r.error&&r.error.statusCode!=='409')throw new Error('pdf_storage_failed')},
  download:async(path)=>{const r=await db.storage.from('secure-docs').download(path);if(r.error||!r.data)throw new Error('attachment_missing');return new Uint8Array(await r.data.arrayBuffer())},
  pdf:(input)=>createContractPdf(resolveContractInput(input,contractProfiles(get))),issue:async(invoiceId)=>{const env=parasutEnv(origin);if(!env||get('EINVOICE_AUTO')!=='true')return {state:'kapalı'};const r=await runEInvoice(db,invoiceId,env);return r.body},fetch,
  config:{apiKey:get('NOTIFICATION_PROVIDER')==='resend'?get('RESEND_API_KEY'):'',from:get('NOTIFICATION_FROM_EMAIL')||get('MAIL_FROM'),replyTo:get('NOTIFICATION_REPLY_TO_EMAIL'),company:configJson('GANU_CONTRACT_COMPANY_JSON'),documentSettings:configJson('GANU_CONTRACT_DOCUMENT_SETTINGS_JSON'),privacyNotice:configJson('GANU_CUSTOMER_PRIVACY_NOTICE_JSON')},
 },id)
 return json(result)
})
