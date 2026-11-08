// Run after test:staff-panel-build. Chromium uses a fully intercepted fake Supabase backend.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createServer} from 'node:http'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist')
const c='00000000-0000-4000-8000-000000000001',ct='00000000-0000-4000-8000-000000000002',invoice='00000000-0000-4000-8000-000000000003',q='00000000-0000-4000-8000-000000000004',user='00000000-0000-4000-8000-000000000005'
const customer={id:c,title:'TEST Operasyon Müşterisi',email:'fixture@example.invalid',status:'aday',contact:'Test Yetkili',address:'Test adres',city:'Test il',district:'Test ilçe',tax_office:'Test VD',tax_no:'0000000000'}
const contract={id:ct,customer_id:c,package:'Pro',status:'hazırlık',price:1200,billing_period:'yıllık',start_date:'2026-11-08',end_date:'2027-11-07'}
const quote={id:q,number:20,title:customer.title,email:customer.email,package:'Pro',price:1200,term_months:12,billing_period:'yıllık',valid_until:'2099-01-01',status:'gönderildi',created_at:'2026-11-08'}
let accepted=0,cargo=0;const jobs=[],mail=[]
const records={quotes:[quote],customers:[],contracts:[],invoices:[],operation_jobs:jobs,mail_items:mail,documents:[],partners:[],requests:[],inspections:[],audit_log:[]}
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.join(dist,url.pathname==='/'?'index.html':url.pathname);let data;try{data=await fs.readFile(file)}catch{data=await fs.readFile(path.join(dist,'panel/index.html'))}res.setHeader('Content-Type',/\.js$/.test(file)?'text/javascript':/\.css$/.test(file)?'text/css':'text/html');res.end(data)}catch{res.writeHead(500);res.end('fixture error')}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`
const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null)
const browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const respond=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
await page.route('**/*',async(route)=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();if(url.hostname!=='example.supabase.co')return route.abort();const name=url.pathname.split('/').at(-1)
 if(url.pathname.includes('/auth/v1/token')){const claims={sub:user,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;return respond(route,{access_token:token,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,user:{id:user,email:'staff@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}})}
 if(name==='is_staff')return respond(route,true)
 if(name==='accept_quote'){accepted++;quote.status='kabul';quote.customer_id=c;quote.contract_id=ct;records.customers=[customer];records.contracts=[contract];records.invoices=[{id:invoice,customer_id:c,contract_id:ct,amount:1200,status:'bekliyor',issue_date:'2026-11-08',due_date:'2026-11-08'}];jobs.push({id:'package-job',kind:'contract_package',customer_id:c,contract_id:ct,state:'blocked',error_code:'contract_information_required',missing:[{code:'privacy',label:'Müşteri KVKK aydınlatma eki gerekli'}]});return respond(route,{customer_id:c,contract_id:ct,invoice_id:invoice,job_id:'package-job'})}
 if(name==='receive_mail'){cargo++;const body=request.postDataJSON();const row={id:'mail-fixture',customer_id:c,type:body.p_type,status:'geldi',received_date:'2026-11-08',...body.p_details};mail.push(row);jobs.push({id:'mail-job',kind:'mail_arrived',customer_id:c,mail_id:row.id,state:'blocked',error_code:'email_setup_required',missing:[]});return respond(route,{mail_id:row.id,job_id:'mail-job'})}
 if(url.pathname.includes('/functions/v1/'))return respond(route,{state:'blocked'})
 if(name==='customer_history')return respond(route,[])
 if(url.pathname.includes('/rest/v1/')){let rows=records[name]||[];for(const [key,value]of url.searchParams)if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));return respond(route,request.headers()['accept']?.includes('vnd.pgrst.object')?rows[0]||null:rows)}
 return respond(route,{})
})
try{
 await page.goto(origin+'/panel');await page.locator('#staff-email').fill('staff@example.invalid');await page.locator('#staff-password').fill('fixture-only');await page.getByRole('button',{name:'Parola ile giriş →'}).click();await page.getByRole('heading',{name:'Operasyon',exact:true}).waitFor()
 await page.goto(origin+'/panel/teklifler');await page.getByRole('button',{name:'Kabul et ve hazırla'}).click({clickCount:2});await page.getByRole('heading',{name:/TEST Operasyon Müşterisi/}).waitFor();assert.equal(accepted,1);assert.equal(await page.getByRole('button',{name:'Başlangıç belgeleri / ödeme bekleniyor'}).isDisabled(),true);await page.getByText('Müşteri KVKK aydınlatma eki gerekli',{exact:true}).waitFor()
 const out=process.env.UI_ARTIFACT_DIR;if(out)await page.screenshot({path:path.join(out,'ui-acceptance.png'),fullPage:true})
 console.log('PASS UI: one acceptance click copies quote data, navigates to candidate checklist, displays missing legal annex; double-click = one RPC')
 await page.goto(origin+'/panel/kargo');await page.getByRole('button',{name:'+ Yeni giriş'}).click();await page.locator('#kargo-form select').first().selectOption(c);await page.getByRole('button',{name:'Kaydet',exact:true}).click({clickCount:2});await page.locator('#kargo-form').waitFor({state:'hidden'});assert.equal(cargo,1);await page.getByText('Ürün e-posta ayarları tamamlanmalı.',{exact:true}).waitFor();assert.equal(mail[0].status,'geldi');assert.ok(mail[0].intake_key);assert.equal(await page.getByText('Müşteri KVKK aydınlatma eki gerekli',{exact:true}).count(),0);await page.getByRole('button',{name:'Düzenle',exact:true}).first().click();assert.equal(await page.locator('#kargo-form select').nth(2).locator('option[value=bildirildi]').isDisabled(),true);await page.getByRole('button',{name:'Vazgeç',exact:true}).click();mail.push({id:'notified-fixture',customer_id:c,type:'kargo',status:'bildirildi',received_date:'2026-11-08',sender:'TEST Bildirilmiş gönderi',notified_at:'2026-11-08T10:00:00Z',notify_channel:'e-posta'});await page.reload();await page.getByRole('heading',{name:'Kargo & Posta'}).waitFor();const statusFilter=page.locator('.pl-toolbar select').nth(1);assert.equal(await statusFilter.locator('option[value=bildirildi]').isDisabled(),false);await statusFilter.selectOption('bildirildi');await page.getByText('TEST Bildirilmiş gönderi',{exact:true}).waitFor();assert.equal(await page.locator('table tbody tr').count(),1);await statusFilter.selectOption('')
 if(out)await page.screenshot({path:path.join(out,'ui-cargo.png'),fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS UI: customer-only cargo intake uses defaults and one stable key; double-click = one intake; provider setup failure stays visible; notified records remain filterable while mutation is disabled')
}catch(e){console.error('UI test failed:',e.message);if(process.env.UI_ARTIFACT_DIR)await page.screenshot({path:path.join(process.env.UI_ARTIFACT_DIR,'ui-failure.png'),fullPage:true});throw e}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
