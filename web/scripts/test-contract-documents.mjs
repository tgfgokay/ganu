import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { PDFDocument,rgb,StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { buildContractPackage,packagePlainText,contractAmounts,validDate } from '../supabase/functions/_shared/contract-documents.js'
import { createContractPdfWithLibraries,sha256 } from '../supabase/functions/_shared/contract-pdf-core.js'
import { contractDocumentHandler } from '../supabase/functions/_shared/contract-document-handler.ts'
import { contractProfiles,resolveContractInput } from '../supabase/functions/_shared/contract-runtime-config.ts'
import { ARTICLE_COUNT } from '../src/panel/lib/contract-clauses.js'

// Tamamen sahte veriler. KVKK satırı yalnız test fixture'ıdır, işletmede kullanılacak metin değildir.
export const fixture=()=>({
  contract:{id:'00000000-0000-4000-8000-000000000001',package:'Pro',start_date:'2026-11-09',end_date:'2027-11-08',price:1200,billing_period:'aylık'},
  customer:{id:'00000000-0000-4000-8000-000000000002',title:'SAHTE VERİ - Çığ Şen Örnek Teknoloji Limited Şirketi',contact:'Özgür Işık',tax_no:'TEST-VKN',tax_office:'Örnek',address:'Örnek Mahallesi Şehit Öğretmen Sokak No:7 İç Kapı:8',district:'Örnek İlçe',city:'İstanbul',phone:'TEST-TELEFON',email:'ornek@example.invalid'},
  company:{name:'SAHTE VERİ - Örnek Hizmet Şirketi',taxNumber:'TEST-VERGİ',taxOffice:'Örnek',mersis:'TEST-MERSİS',address:'Örnek Hizmet Adresi İstanbul',phone:'TEST-HİZMET',email:'hizmet@example.invalid'},
  quote:{number:42,list_price:1500,discount_pct:20},
  documentSettings:{signature_date:'2026-11-09',daily_address_penalty:50,penalty_terms:'SAHTE TEST KARARI: belirtilen ihlaller için 500 TL.',deposit:0,service_scope:['Yasal iş adresi','Posta ve tebligat bildirimi'],extra_service_tariff:[],extra_services:'',business_hours:'Hafta içi 09:00 - 18:00 (test)',rules_effective_date:'2026-11-09'},
  privacyNotice:{scope:'customer-contract',version:'TEST-ONLY.v1',source:'SAHTE TEST KAYNAĞI - HUKUKİ METİN DEĞİLDİR',verified_at:'2026-11-08',paragraphs:['YALNIZ YAZILIM TESTİ İÇİN SAHTE KVKK YER TUTUCUSU. Müşteriye gönderilmez.']},
})
const libs={PDFDocument,rgb,fontkit},pdf=(input,options)=>createContractPdfWithLibraries(input,options,libs)
let passed=0
const test=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`)}
await test('avukat 32 madde, 5 ek ve kaynak sürümü',()=>{
  const pkg=buildContractPackage(fixture()),text=packagePlainText(pkg)
  assert.equal(ARTICLE_COUNT,32);assert.equal(pkg.ready,true);assert.equal(pkg.copies,2)
  assert.match(pkg.fingerprint,/^sha256:[a-f0-9]{64}$/);assert.match(pkg.version,/^lawyer-/)
  for(const textPart of ['Hizmet bedeli peşin','en geç 7 (yedi) gün','iki nüsha','EK-2 KVKK','EK-5 Genel','imha edilebilir'])assert.ok(text.includes(textPart),textPart)
  assert.ok(!text.includes('Fatura tarihinden itibaren 7 gün'));assert.ok(!text.includes('tek nüsha'))
})
await test('varsayılan paket doğru ekleri içerir, park edilmiş hizmetleri eklemez',()=>{
  assert.deepEqual(buildContractPackage(fixture()).documents.map(x=>x.id),['virtual-office','notifications-consent','privacy-notice','service-information','customer-information','usage-rules','address-undertaking'])
  const input=fixture();input.additionalDocuments=['ready-office'];const result=buildContractPackage(input)
  assert.equal(result.ready,false);assert.ok(!result.documents.some(x=>x.id==='ready-office'))
})
await test('eksik kimlik/şirket/ceza/ek kaynağı yanlış bilgiyle tamamlanmaz',()=>{
  const input=fixture();input.customer.title='';delete input.company.mersis;delete input.documentSettings.daily_address_penalty;input.privacyNotice=null
  const out=buildContractPackage(input)
  for(const code of ['customer.title','company.mersis','settings.daily_address_penalty','privacy.source'])assert.ok(out.missing.some(x=>x.code===code))
  assert.equal(out.ready,false);assert.match(packagePlainText(out),/\[Veri eksik\]/)
})
await test('sıfır depozito ve sıfır cezai şart açık karar olarak korunur',()=>{
  const input=fixture();input.documentSettings.daily_address_penalty=0
  assert.equal(buildContractPackage(input).ready,true)
  assert.match(packagePlainText(buildContractPackage(input)),/günlük 0,00 TL/)
})
await test('aylık/yıllık tutar ve KDV; teklif indirimi ikinci kez uygulanmaz',()=>{
  const input=fixture(),monthly=contractAmounts(input.contract)
  assert.deepEqual([monthly.months,monthly.net,monthly.vat,monthly.total],[12,1000,200,14400])
  input.contract.billing_period='yıllık';input.contract.price=12000
  const annual=buildContractPackage(input);assert.equal(annual.figures.total,12000);assert.equal(annual.figures.net,10000)
  assert.ok(packagePlainText(annual).includes('12.000,00 TL'))
})
await test('geçersiz tarih ve ters dönem gönderimi engeller',()=>{
  assert.equal(validDate('2026-02-31'),false)
  const input=fixture();input.contract.end_date='2026-01-01'
  assert.ok(buildContractPackage(input).missing.some(x=>x.code==='contract.end_date'))
})
await test('kabul edilen teklifin bedel/paket/periyot/süre farkı gönderimi engeller',()=>{
  const input=fixture();Object.assign(input.quote,{price:999,package:'Başlangıç',billing_period:'yıllık',term_months:24})
  const out=buildContractPackage(input)
  for(const code of ['quote.price_mismatch','quote.package_mismatch','quote.billing_mismatch','quote.term_mismatch'])assert.ok(out.missing.some(x=>x.code===code))
})
await test('web ziyaretçi KVKK kaynağı / sahte onay bayrağı müşteri eki sayılmaz',()=>{
  const input=fixture();input.privacyNotice.scope='website'
  assert.ok(buildContractPackage(input).missing.some(x=>x.code==='privacy.source'))
  input.privacyNotice={scope:'customer-contract',approved:true,version:'x'}
  assert.ok(buildContractPackage(input).missing.some(x=>x.code==='privacy.source'))
})
await test('bozuk tarife ve demirbaş alanları anlamlı eksik döndürür',()=>{
  const input=fixture();input.documentSettings.extra_service_tariff='bozuk'
  assert.ok(buildContractPackage(input).missing.some(x=>x.code==='settings.extra_service_tariff'))
  input.additionalDocuments=['inventory'];input.documentSettings.inventory=[{name:'Kart',quantity:0,condition:''}]
  const out=buildContractPackage(input);assert.ok(out.missing.some(x=>x.code==='settings.inventory_item'))
})
await test('isteğe bağlı belgeler yalnız açık seçimde ve tam alanlarla eklenir',()=>{
  const input=fixture();input.additionalDocuments=['meeting-room','inventory'];Object.assign(input.documentSettings,{meeting:{duration:'Saatlik',start:'2026-11-10T10:00',end:'2026-11-10T11:00'},inventory:[{name:'Giriş Kartı',quantity:1,condition:'Yeni',serial:'TEST'}],handover_date:'2026-11-09'})
  const out=buildContractPackage(input);assert.equal(out.ready,true);assert.ok(out.documents.some(x=>x.id==='meeting-room'));assert.match(packagePlainText(out),/Giriş Kartı \| 1 adet/)
})
await test('tek seferlik profil kullanılır, sözleşmeye özel değer üstün gelir',()=>{
  const input=fixture(),env={GANU_CONTRACT_COMPANY_JSON:JSON.stringify(input.company),GANU_CONTRACT_DOCUMENT_SETTINGS_JSON:JSON.stringify(input.documentSettings),GANU_CUSTOMER_PRIVACY_NOTICE_JSON:JSON.stringify(input.privacyNotice)}
  const resolved=resolveContractInput({contract:{...input.contract,document_settings:{deposit:100}},customer:input.customer,quote:input.quote},contractProfiles(key=>env[key]))
  assert.equal(resolved.documentSettings.deposit,100);assert.equal(resolved.documentSettings.daily_address_penalty,50);assert.equal(buildContractPackage(resolved).ready,true)
  const mapped=resolveContractInput({contract:input.contract,customer:input.customer}, {...contractProfiles(key=>env[key]),documentSettings:{...input.documentSettings,package_scopes:{Pro:['Pakete özel kaynak kapsamı']}}})
  assert.deepEqual(mapped.documentSettings.service_scope,['Pakete özel kaynak kapsamı'])
})
await test('eksik paket son PDF üretimini engeller; inceleme üretimi açıkça etiketlenir',async()=>{
  const input=fixture();input.privacyNotice=null
  await assert.rejects(()=>pdf(input),e=>e.code==='contract_package_incomplete'&&e.missing.some(x=>x.code==='privacy.source'))
  const review=await pdf(input,{allowIncomplete:true});assert.equal(review.metadata.ready,false);assert.match(review.attachment.filename,/inceleme/)
})
await test('imzalı veya eski kayıt yeni metinle asıl belge gibi yeniden üretilemez',async()=>{
  for(const patch of [{signed_document_id:'00000000-0000-4000-8000-000000000099'},{signed_verified_at:'2026-11-09T00:00:00Z'},{status:'aktif'},{created_at:'2026-10-15T00:00:00Z'},{start_date:'2026-10-15'}]){
    const input=fixture();Object.assign(input.contract,patch)
    assert.ok(buildContractPackage(input).missing.some(x=>x.code==='contract.original_required'))
    await assert.rejects(()=>pdf(input),e=>e.code==='contract_package_incomplete')
  }
  const input=fixture();input.contract.signed_verified_at='2026-11-09T00:00:00Z'
  const review=await pdf(input,{allowIncomplete:true});assert.equal(review.metadata.historical,true);assert.equal(review.metadata.ready,false)
  assert.match(review.attachment.filename,/yeni-metin-inceleme/);assert.match(review.package.reviewLabel,/ESKİ İMZALI BELGENİN KOPYASI DEĞİLDİR/)
})
await test('müşteri formuna iç arşiv ve uygulama açıklaması yazılmaz',()=>{
  const text=packagePlainText(buildContractPackage(fixture()))
  for(const internal of ['Avukat arşivinde','operasyonel alan eşlemesi','kayıt verisinden oluşturulur'])assert.ok(!text.includes(internal))
})
let sample
await test('gerçek PDF baytları, SHA256 ve doldurulabilir mantıksal alan ağacı',async()=>{
  sample=await pdf(fixture());assert.equal(new TextDecoder().decode(sample.bytes.slice(0,5)),'%PDF-')
  assert.equal(sample.metadata.contentSha256,await sha256(sample.bytes));assert.ok(sample.metadata.pages>=10)
  const reopened=await PDFDocument.load(sample.bytes),fields=reopened.getForm().getFields()
  assert.equal(new Set(fields.map(f=>f.getName())).size,fields.length)
  assert.equal(reopened.getForm().getTextField('virtual-office.signer.1').getText(),'Özgür Işık')
  assert.equal(reopened.getForm().getTextField('virtual-office.date.1').getText(),undefined)
  assert.ok(fields.length>=24);assert.equal(sample.metadata.documentRanges.length,7)
})
await test('uzun Türkçe unvan/adres sayfaya bölünür; müşteri bilgisi ve sayı korunur',async()=>{
  const input=fixture();input.customer.title+=' Uluslararası Araştırma Geliştirme Çözümleri '.repeat(10);input.customer.address+=' Çok Uzun Adres Öğesi '.repeat(30)
  const out=await pdf(input);assert.ok(out.metadata.pages>sample.metadata.pages);assert.ok(packagePlainText(out.package).includes(input.customer.title.trim()))
})
await test('desteklenmeyen karakter sessizce kaybolmaz',async()=>{
  const input=fixture();input.customer.title+=' 🦄'
  await assert.rejects(()=>pdf(input),e=>e.code==='contract_unsupported_character')
})
await test('statik KVKK PDF kaynak karması doğrulanır ve kaynak sayfaları eklenir',async()=>{
  const source=await PDFDocument.create(),page=source.addPage([595,842]),font=await source.embedFont(StandardFonts.Helvetica);page.drawText('TEST ONLY PRIVACY SOURCE',{x:50,y:750,font,size:12})
  const bytes=await source.save(),input=fixture();input.privacyNotice={scope:'customer-contract',version:'TEST-PDF.v1',source:'Sahte test kaynağı',verified_at:'2026-11-08',storage_path:'legal/customer-privacy/test.pdf',sha256:await sha256(bytes),pdfBytes:bytes}
  const out=await pdf(input);assert.equal(out.package.ready,true);assert.ok(out.metadata.documentRanges.some(x=>x.id==='privacy-notice'))
  input.privacyNotice.sha256='0'.repeat(64);await assert.rejects(()=>pdf(input),e=>e.code==='privacy_pdf_hash_mismatch')
  const bad=new TextEncoder().encode('PDF olmayan sahte veri');input.privacyNotice.sha256=await sha256(bad);input.privacyNotice.pdfBytes=bad
  await assert.rejects(()=>pdf(input),e=>e.code==='privacy_pdf_invalid_document'&&e.missing?.length>0)
})
await test('personel endpoint yetki/origin/kayıt kimliği ve istemci override koruması',async()=>{
  let reads=0,pdfs=0;const handler=contractDocumentHandler({origin:'https://example.invalid',authorized:async req=>req.headers.get('authorization')==='Bearer test',load:async()=>{reads++;return fixture()},pdf:async input=>{pdfs++;assert.equal(input.customer.title,fixture().customer.title);return sample}})
  const req=(body,headers={authorization:'Bearer test'})=>new Request('https://api.example.invalid',{method:'POST',headers,body:JSON.stringify(body)})
  assert.equal((await handler(req({},{authorization:'bad'}))).status,403);assert.equal(reads,0)
  assert.equal((await handler(req({},{authorization:'Bearer test',origin:'https://evil.invalid'}))).status,403)
  assert.equal((await handler(req({contract_id:'../foreign',mode:'pdf'}))).status,400)
  const result=await handler(req({contract_id:fixture().contract.id,mode:'pdf',customer:{title:'İstemci override'}}))
  assert.equal(result.status,200);assert.equal(pdfs,1);assert.equal(reads,1);assert.equal(result.headers.get('cache-control'),'no-store')
})
const output=process.argv.indexOf('--render')
if(output!==-1){if(!process.argv[output+1])throw new Error('--render tam çıktı yolu gerekli');writeFileSync(process.argv[output+1],sample.bytes);console.log(`Sahte veri PDF örneği yazıldı (${sample.metadata.pages} sayfa).`)}
const fixtureOutput=process.argv.indexOf('--fixture-json')
if(fixtureOutput!==-1)writeFileSync(process.argv[fixtureOutput+1],JSON.stringify(fixture()))
console.log(`contract documents: ${passed} PASS`)
