// Salt okunur personel önizleme/PDF indirme; belge göndermez, DB/storage yazmaz.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createContractPdf } from '../_shared/contract-pdf.ts'
import { contractProfiles,resolveContractInput } from '../_shared/contract-runtime-config.ts'
import { contractDocumentHandler } from '../_shared/contract-document-handler.ts'
let origin='';try{origin=new URL(Deno.env.get('SITE_URL')||'').origin}catch{/* fail closed */}
const client=(req:Request)=>createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{global:{headers:{Authorization:req.headers.get('Authorization')||''}},auth:{persistSession:false}})
Deno.serve(contractDocumentHandler({origin,
  authorized:async(req)=>{try{const {data,error}=await client(req).rpc('is_staff');return !error&&data===true}catch{return false}},
  load:async(id,req)=>{
    const db=client(req),k=await db.from('contracts').select('*').eq('id',id).maybeSingle()
    if(k.error||!k.data)return null
    const [c,q]=await Promise.all([db.from('customers').select('*').eq('id',k.data.customer_id).maybeSingle(),db.from('quotes').select('*').eq('contract_id',id).limit(1).maybeSingle()])
    if(c.error||!c.data||q.error)return null
    return resolveContractInput({contract:k.data,customer:c.data,quote:q.data},contractProfiles(key=>Deno.env.get(key)))
  },pdf:createContractPdf,
}))
