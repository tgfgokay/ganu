// Real local PostgreSQL RPCs -> production PDF adapter -> local HTTP fake provider -> real queue/mail state.
// No real Resend/Paraşüt/PayTR service or recipient. Auth/storage tables are local Supabase fixtures.
import {createContractPdf} from '../supabase/functions/_shared/contract-pdf.ts'
import {contractProfiles,resolveContractInput} from '../supabase/functions/_shared/contract-runtime-config.ts'
import {runOperation,type Job,type Prepared} from '../supabase/functions/_shared/operations-worker.ts'
import {PDFDocument} from 'npm:pdf-lib@1.17.1'
const url=new URL(Deno.env.get('DB_URL')||'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.slice(1).startsWith('ganu_test'))throw new Error('Only isolated localhost ganu_test* DB permitted')
const literal=(v:unknown)=>v===null||v===undefined?'null':typeof v==='number'?String(v):`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`
async function sql(statement:string,role='service_role',user?:string){
 const claims=JSON.stringify({role,...(user?{sub:user}:{})})
 const command=new Deno.Command('psql',{args:[url.href,'-X','-qAt','-v','ON_ERROR_STOP=1'],stdin:'piped',stdout:'piped',stderr:'piped'})
 const p=command.spawn(),writer=p.stdin.getWriter();await writer.write(new TextEncoder().encode(`${role==='owner'?'':`set request.jwt.claims=${literal(claims)};set role ${role};`}\n${statement}`));await writer.close()
 const r=await p.output();if(!r.success)throw new Error('Local test SQL failed: '+new TextDecoder().decode(r.stderr))
 return new TextDecoder().decode(r.stdout).trim().split('\n').at(-1)||''
}
async function rpc(name:string,args:unknown[],role='service_role',user?:string){return sql(`select to_jsonb(r) from ${name}(${args.map(literal).join(',')}) r;`,role,user).then(s=>s?JSON.parse(s):null)}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error('FAIL: '+message)}
const staff=crypto.randomUUID(),quote=crypto.randomUUID(),intake=crypto.randomUUID()
await sql(`insert into auth.users(id,email) values(${literal(staff)},'e2e-staff@example.invalid');insert into staff_roles(user_id,role) values(${literal(staff)},'operations');insert into quotes(id,title,contact,email,phone,tax_no,tax_office,package,billing_period,term_months,price,list_price,valid_until) values(${literal(quote)},'TEST ONLY Çığ Şen Teknoloji','TEST Özgür Işık','e2e-customer@example.invalid','TEST-TELEFON','TEST-VKN-E2E','TEST VD','Pro','aylık',12,1200,1500,current_date+30);`,'owner')
await rpc('mark_quote_sent',[quote,'e-posta'],'authenticated',staff)
const accepted=await rpc('accept_quote',[quote,{address:'TEST ONLY Şehit Öğretmen Sokak No:7',district:'TEST İlçe',city:'İstanbul'},'2026-11-09'],'authenticated',staff)
const again=await rpc('accept_quote',[quote,{},'2026-11-09'],'authenticated',staff)
assert(accepted.customer_id===again.customer_id&&accepted.contract_id===again.contract_id,'acceptance must replay same rows')
const profile=contractProfiles(k=>({GANU_CONTRACT_COMPANY_JSON:JSON.stringify({name:'TEST ONLY Örnek Hizmet Şirketi',taxNumber:'TEST-VERGİ',taxOffice:'TEST VD',mersis:'TEST-MERSİS',address:'TEST ONLY Hizmet Adresi İstanbul',phone:'TEST-HİZMET',email:'e2e-company@example.invalid'}),GANU_CONTRACT_DOCUMENT_SETTINGS_JSON:JSON.stringify({signature_date:'2026-11-09',daily_address_penalty:0,penalty_terms:'TEST ONLY karar, işletmede kullanılmaz.',deposit:0,package_scopes:{Pro:['TEST yasal iş adresi','TEST posta bildirimi']},extra_service_tariff:[],extra_services:'',business_hours:'TEST Hafta içi 09:00-18:00',rules_effective_date:'2026-11-09'}),GANU_CUSTOMER_PRIVACY_NOTICE_JSON:JSON.stringify({scope:'customer-contract',version:'TEST-ONLY-E2E.v1',source:'SAHTE TEST KAYNAĞI; HUKUKİ ONAY DEĞİLDİR',verified_at:'2026-11-08',paragraphs:['YALNIZ YAZILIM TESTİ İÇİN SAHTE KVKK YER TUTUCUSU. Gerçek müşteriye gönderilmez.']})} as Record<string,string>)[k])
const storage=new Map<string,Uint8Array>(),received:any[]=[]
const stop=new AbortController(),server=Deno.serve({hostname:'127.0.0.1',port:0,signal:stop.signal,onListen:()=>{}},async req=>{received.push({key:req.headers.get('idempotency-key'),body:await req.json()});return Response.json({id:`local-fake-provider-${received.length}`})})
const address=server.addr as Deno.NetAddr
const deps={
 claim:async(id?:string)=>rpc('operation_claim',[id||null]) as Promise<Job|null>,
 read:async(table:string,id:string)=>{const names=['customers','contracts','invoices','mail_items','quote_for_contract'];if(!names.includes(table))throw new Error('table');const actual=table==='quote_for_contract'?'quotes':table,column=table==='quote_for_contract'?'contract_id':'id';const text=await sql(`select row_to_json(r) from (select * from ${actual} where ${column}=${literal(id)} limit 1) r;`);return text?JSON.parse(text):null},
 prepare:async(j:Job,p:Prepared)=>{await rpc('operation_prepare',[j.id,j.claim_token,p])},begin:async(j:Job,hash:string)=>rpc('operation_begin_send',[j.id,j.claim_token,hash]) as Promise<boolean>,
 defer:async(j:Job,error:string,seconds:number)=>{await rpc('operation_defer',[j.id,j.claim_token,error,seconds])},
 finish:async(j:Job,state:string,error?:string,missing:any[]=[],provider?:string)=>{await rpc('operation_finish',[j.id,j.claim_token,state,error||null,missing,provider||null])},
 save:async(path:string,bytes:Uint8Array)=>{storage.set(path,bytes);await sql(`insert into storage.objects(bucket_id,name) values('secure-docs',${literal(path)}) on conflict do nothing;`)},download:async(path:string)=>{const bytes=storage.get(path);if(!bytes)throw new Error('missing local PDF');return bytes},
 pdf:(input:any)=>createContractPdf(resolveContractInput(input,profile)),issue:async()=>{throw new Error('No fiscal calls permitted in this fixture')},
 fetch:((target:any,init?:RequestInit)=>{assert(String(target)==='https://api.resend.com/emails','unexpected external request');return fetch(`http://127.0.0.1:${address.port}/emails`,init)}) as typeof fetch,
 config:{apiKey:'LOCAL-FAKE-NO-CREDENTIAL',from:'TEST ONLY <e2e-company@example.invalid>',...profile},
}
try{
 const contractResult=await runOperation(deps,accepted.job_id);assert(contractResult.state==='sent','real contract PDF must be accepted by local fake provider')
 const row=JSON.parse(await sql(`select row_to_json(j) from operation_jobs j where id=${literal(accepted.job_id)};`))
 assert(row.state==='sent'&&row.provider_id==='local-fake-provider-1','DB must persist provider acceptance')
 assert(row.prepared.document_metadata.version.startsWith('lawyer-')&&row.prepared.document_metadata.documentIds.length===7,'prepared snapshot retains lawyer template and annex metadata')
 assert(row.prepared.to==='e2e-customer@example.invalid','recipient must come from accepted DB customer')
 assert(received.length===1&&received[0].body.attachments.length===1,'one real PDF attachment expected')
 const bytes=Uint8Array.from(atob(received[0].body.attachments[0].content),(c)=>c.charCodeAt(0)),pdf=await PDFDocument.load(bytes)
 assert(pdf.getPageCount()>=10,'real multi-page lawyer package expected')
 assert(pdf.getForm().getTextField('virtual-office.signer.1').getText()==='TEST Özgür Işık','DB snake-case customer contact must reach PDF signer field')
 assert(received[0].key===`ganu-operation/${accepted.job_id}/1/${row.payload_sha256}`,'provider idempotency key must match persisted job')
 assert((await runOperation(deps,accepted.job_id)).state==='idle'&&received.length===1,'already-sent package must never repeat')
 const mail=await rpc('receive_mail',[intake,accepted.customer_id,'tebligat',{sender:'TEST ONLY Kurum',tracking_no:'TEST-TRACK'}],'authenticated',staff)
 assert(await sql(`select status from mail_items where id=${literal(mail.mail_id)};`)==='geldi','cargo starts unnotified')
 assert((await runOperation(deps,mail.job_id)).state==='sent','cargo notification accepted by local fake')
 const cargo=JSON.parse(await sql(`select row_to_json(m) from mail_items m where id=${literal(mail.mail_id)};`))
 assert(cargo.status==='bildirildi'&&cargo.notified_at&&cargo.notify_channel==='e-posta'&&!cargo.delivered_at,'provider acceptance changes real DB notice, not physical delivery')
 assert(received.length===2&&received[1].body.subject.includes('ACİL'),'tebligat must stay urgent')
 const replay=await rpc('receive_mail',[intake,accepted.customer_id,'tebligat',{}],'authenticated',staff);assert(replay.mail_id===mail.mail_id,'cargo duplicate is same DB record')
 assert((await runOperation(deps,mail.job_id)).state==='idle'&&received.length===2,'cargo retry must not send twice')
 console.log(`PASS E2E: actual local DB acceptance -> real production PDF adapter (${pdf.getPageCount()} pages) -> local fake HTTP email -> persisted sent; duplicate suppressed`)
 console.log('PASS E2E: actual local cargo RPC -> geldi -> local fake HTTP acceptance -> bildirildi/notified_at; physical delivery untouched; duplicate suppressed')
 console.log('SCOPE: TEST-only customer/legal fixture; local auth/storage fixture, no real Resend/Paraşüt/PayTR or recipient')
}finally{stop.abort();await server.finished}
