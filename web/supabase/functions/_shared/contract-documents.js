// Ortak, saf belge modeli: tarayıcı, Node testleri ve Edge Function aynı kaynağı kullanır.
// Gerçek müşteri/kimlik/banka bilgileri yalnız çağrı sırasında geçirilir; burada saklanmaz.
import { CONTRACT_VERSION, TEMPLATE_FINGERPRINT, LAWYER_TEMPLATES } from './contract-template-source.js'
export { CONTRACT_VERSION, TEMPLATE_FINGERPRINT, LAWYER_TEMPLATES }

const clean = (v) => String(v ?? '').trim()
const amount = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0
const round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100
export const money = (v) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))
export const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(clean(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v
export const formatDate = (v) => validDate(v) ? `${v.slice(8,10)}.${v.slice(5,7)}.${v.slice(0,4)}` : '[Veri eksik]'
const validLocalDateTime=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&validDate(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60
export const contractNumber = (contract={}, quote=null) => quote?.number ? `S-${String(quote.number).padStart(4,'0')}` : `S-${String(contract.start_date || '').slice(0,4)}-${String(contract.id || '').slice(0,6).toUpperCase()}`
export const requiresOriginalContract=(contract={})=>Boolean(contract.signed_document_id||contract.signed_verified_at||contract.status==='aktif'||(validDate(contract.start_date)&&contract.start_date<'2026-11-08')||(validDate(String(contract.created_at||'').slice(0,10))&&String(contract.created_at).slice(0,10)<'2026-11-08'))
export function contractAmounts(contract={}) {
  const a = new Date(`${contract.start_date}T00:00:00Z`), b = new Date(`${contract.end_date}T00:00:00Z`)
  b.setUTCDate(b.getUTCDate()+1)
  const months = validDate(contract.start_date) && validDate(contract.end_date) ? Math.max(1,Math.round((b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()+(b.getUTCDate()-a.getUTCDate())/30)) : null
  const price = amount(contract.price) ? Number(contract.price) : null
  const vatRate = amount(contract.vat_rate) ? Number(contract.vat_rate) : 20
  const net = price === null ? null : round(price/(1+vatRate/100))
  const total = months && price !== null ? round(price*(contract.billing_period==='aylık'?months:months/12)) : null
  return {months,price,net,vat:price===null?null:round(price-net),vatRate,total,totalNet:total===null?null:round(total/(1+vatRate/100))}
}

const missingValue = '[Veri eksik]'
const value = (v) => clean(v) || missingValue
const row = (label, data) => ({type:'row',label,text:value(data)})
const p = (text) => ({type:'paragraph',text})
const heading = (text) => ({type:'heading',text})
const address = (c) => [c.address,c.district,c.city].filter(Boolean).join(', ')
const nonApplicable = (v) => clean(v) || 'Beyan edilmedi'
function partyBlocks(company,customer) {
  return [heading('1. TARAFLAR'),heading('1.1. HİZMET SAĞLAYICI'),
    row('Ticaret Unvanı',company.name),row('Mersis No',company.mersis || company.mersisNumber),
    row('Vergi Dairesi',company.taxOffice),row('Vergi No',company.taxNumber),row('Adres',company.address),
    row('Telefon',company.phone),row('E-posta',company.email),row('Kep Adresi',nonApplicable(company.kep)),
    p('Buradan itibaren “Hizmet Sağlayıcı” olarak anılacaktır.'),heading('1.2. ÜYE'),
    row('Adı Soyadı / Ticaret Unvanı',customer.title),row('TC Kimlik No',nonApplicable(customer.tc)),
    row('Mersis No',nonApplicable(customer.mersis || customer.mersis_no)),row('Vergi Dairesi',nonApplicable(customer.tax_office)),
    row('Vergi No',nonApplicable(customer.tax_no)),row('Adres',address(customer)),row('Telefon',customer.phone),
    row('E-posta',customer.email),row('Kep Adresi',nonApplicable(customer.kep)),
    p('Buradan itibaren “ÜYE” olarak anılacaktır.'),
    p('Hizmet Sağlayıcı ve Üye buradan itibaren ayrı ayrı “Taraf”, birlikte “Taraflar” olarak anılacaktır.')]
}

export const DOCUMENT_CATALOG = Object.freeze([
  {id:'virtual-office',label:'Sanal Ofis Hizmet Sözleşmesi',default:true,source:'avukat',status:'kaynak-mevcut'},
  {id:'notifications-consent',label:'EK-1 · Tebligat Yetkilendirme ve Muvafakatnamesi',default:true,source:'avukat',status:'kaynak-mevcut'},
  {id:'privacy-notice',label:'EK-2 · KVKK Aydınlatma Metni',default:true,source:'ayrı müşteri eki gerekli',status:'kaynak-eksik'},
  {id:'service-information',label:'EK-3 · Hizmet Bilgi Formu ve Ücret Tarifesi',default:true,source:'kayıt verisinden operasyonel form',status:'incelemeye-hazır'},
  {id:'customer-information',label:'EK-4 · Kimlik Tespit ve Müşteri Bilgi Formu',default:true,source:'kayıt verisinden operasyonel form',status:'incelemeye-hazır'},
  {id:'usage-rules',label:'EK-5 · Genel Kullanım Kuralları',default:true,source:'avukat',status:'kaynak-mevcut'},
  {id:'address-undertaking',label:'Adres Kullanımı ve Ticaret Sicili Taahhütnamesi',default:true,source:'avukat',status:'kaynak-mevcut'},
  {id:'ready-office',label:'Hazır Ofis Hizmet Sözleşmesi',default:false,source:'avukat',status:'park-edildi'},
  {id:'meeting-room',label:'Toplantı Salonu Kullanım Sözleşmesi',default:false,source:'avukat',status:'isteğe-bağlı'},
  {id:'inventory',label:'Demirbaş Teslim ve İade Tutanağı',default:false,source:'avukat',status:'isteğe-bağlı'},
])

// privacyNotice yalnız müşteriye yönelik kapsamı ve sürümü doğrulanmış bir kaynakla verilebilir.
// Web ziyaretçi metnini veya yalnız bir onay checkbox'ını müşteri eki yerine kabul etmez.
export const validPrivacyPdfPath = (path) => /^legal\/customer-privacy\/[a-zA-Z0-9_-]+\.pdf$/.test(clean(path))
export function buildContractPackage({contract={},customer={},quote=null,company={},privacyNotice=null,documentSettings=null,additionalDocuments=null}={}) {
  const settings = documentSettings || contract.document_settings || {}
  additionalDocuments=Array.isArray(additionalDocuments)?additionalDocuments:Array.isArray(settings.additional_documents)?settings.additional_documents:[]
  const tariff=Array.isArray(settings.extra_service_tariff)?settings.extra_service_tariff:[]
  const f = contractAmounts(contract), no = contractNumber(contract,quote), missing=[]
  const require = (ok,code,label,scope='alan') => {if(!ok)missing.push({code,label,scope})}
  const historical=requiresOriginalContract(contract)
  require(!historical,'contract.original_required','İmzalı / önceki sözleşmenin asıl belgesini kullanın; yeni metin yalnız inceleme taslağı olarak üretilebilir.','belge')
  require(clean(customer.title),'customer.title','Müşteri unvanı / ad soyadı')
  require(clean(customer.tax_no)||clean(customer.tc),'customer.identity','Müşteri vergi / kimlik numarası')
  require(!clean(customer.tax_no)||clean(customer.tax_office),'customer.tax_office','Müşteri vergi dairesi')
  require(clean(customer.contact),'customer.contact','Müşteri yetkilisi')
  require(clean(customer.address),'customer.address','Müşteri adresi')
  require(clean(customer.phone),'customer.phone','Müşteri telefonu')
  require(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(customer.email)),'customer.email','Geçerli müşteri e-posta adresi')
  for(const [key,label] of [['name','Hizmet sağlayıcı unvanı'],['address','Hizmet adresi'],['taxNumber','Hizmet sağlayıcı vergi numarası'],['taxOffice','Hizmet sağlayıcı vergi dairesi'],['email','Hizmet sağlayıcı e-posta adresi'],['phone','Hizmet sağlayıcı telefonu']])require(clean(company[key]),`company.${key}`,label)
  require(clean(company.mersis||company.mersisNumber),'company.mersis','Hizmet sağlayıcı MERSİS numarası')
  require(clean(contract.id),'contract.id','Sözleşme kayıt numarası')
  require(['Başlangıç','Pro','Kurumsal'].includes(contract.package),'contract.package','Sanal ofis paketi')
  require(validDate(contract.start_date),'contract.start_date','Geçerli hizmet başlangıç tarihi')
  require(validDate(contract.end_date)&&contract.end_date>=contract.start_date,'contract.end_date','Başlangıçtan önce olmayan bitiş tarihi')
  require(amount(contract.price)&&Number(contract.price)>0,'contract.price','Sıfırdan büyük dönem bedeli (KDV dahil)')
  require(contract.vat_rate===undefined||contract.vat_rate===null||amount(contract.vat_rate),'contract.vat_rate','Geçerli KDV oranı')
  require(['aylık','yıllık'].includes(contract.billing_period),'contract.billing_period','Aylık / yıllık ödeme periyodu')
  require(!quote||quote.price===undefined||Number(quote.price)===Number(contract.price),'quote.price_mismatch','Kabul edilen teklif ve sözleşme dönem bedeli eşleşmeli')
  require(!quote||!quote.package||quote.package===contract.package,'quote.package_mismatch','Kabul edilen teklif ve sözleşme paketi eşleşmeli')
  require(!quote||!quote.billing_period||quote.billing_period===contract.billing_period,'quote.billing_mismatch','Kabul edilen teklif ve sözleşme ödeme periyodu eşleşmeli')
  require(!quote||!quote.term_months||Number(quote.term_months)===f.months,'quote.term_mismatch','Kabul edilen teklif ve sözleşme süresi eşleşmeli')
  require(!quote||!(Number(quote.discount_pct)>0)||amount(quote.list_price),'quote.discount_basis','Teklif indiriminin liste bedeli')
  require(validDate(settings.signature_date),'settings.signature_date','İmzaya sunulacak belge tarihi')
  require(amount(settings.daily_address_penalty),'settings.daily_address_penalty','Madde 7.3 günlük adres değişikliği cezai şart tutarı')
  require(clean(settings.penalty_terms),'settings.penalty_terms','Madde 18.2 ihlallere göre cezai şart tutarları')
  require(amount(settings.deposit),'settings.deposit','Depozito kararı (alınmayacaksa 0)')
  require(Array.isArray(settings.service_scope)&&settings.service_scope.length>0&&settings.service_scope.every(x=>typeof x==='string'&&clean(x)),'settings.service_scope','Kabul edilen paket hizmet kapsamı')
  require(Array.isArray(settings.extra_service_tariff),'settings.extra_service_tariff','Ek hizmet tarifesi (ek hizmet yoksa boş liste)')
  require(clean(settings.business_hours),'settings.business_hours','Çalışma saatleri')
  require(validDate(settings.rules_effective_date),'settings.rules_effective_date','Kullanım kuralları yürürlük tarihi')
  const privacyText=Array.isArray(privacyNotice?.paragraphs)&&privacyNotice.paragraphs.length>0&&privacyNotice.paragraphs.every(x=>typeof x==='string'&&clean(x))
  const privacyPdf=validPrivacyPdfPath(privacyNotice?.storage_path)&&/^[a-f0-9]{64}$/i.test(clean(privacyNotice?.sha256))
  const privacyReady = privacyNotice?.scope==='customer-contract' && clean(privacyNotice.version) && clean(privacyNotice.source) && validDate(clean(privacyNotice.verified_at).slice(0,10)) && (privacyText||privacyPdf)
  require(privacyReady,'privacy.source','Müşteri ilişkisine uygun, kaynağı ve sürümü doğrulanmış KVKK aydınlatma eki','belge')
  const tokens={serviceAddress:value(company.address),package:value(contract.package),extraServices:settings.extra_services === ''?'Kararlaştırılmadı':value(settings.extra_services),startDate:formatDate(contract.start_date),endDate:formatDate(contract.end_date),netPrice:f.net===null?missingValue:money(f.net),dailyPenalty:amount(settings.daily_address_penalty)?money(settings.daily_address_penalty):missingValue,signatureDate:formatDate(settings.signature_date),deposit:amount(settings.deposit)?money(settings.deposit):missingValue}
  require(settings.extra_services!==undefined&&settings.extra_services!==null,'settings.extra_services','Ek hizmet kararı (yoksa boş bırakılan açık karar)')
  const fill = (text) => text.replace(/\{([A-Za-z]+)\}/g,(_,key)=>tokens[key]??missingValue)
  const documents=[]
  const sourceDoc=(id,label) => {
    const source=LAWYER_TEMPLATES[id]
    return {id,title:label||source.title,source:'avukat',sourceSha256:source.sourceSha256,blocks:[...(id==='usage-rules'?[]:partyBlocks(company,customer)),...source.blocks.map(b=>({...b,text:fill(b.text)})),...(id==='usage-rules'?[row('Çalışma saatleri',settings.business_hours),row('Yürürlük tarihi',formatDate(settings.rules_effective_date))]:[]),{type:'signatures',company:value(company.name),customer:value(customer.title),representative:value(customer.contact)}]}
  }
  documents.push(sourceDoc('virtual-office'),sourceDoc('notifications-consent','EK-1 · '+LAWYER_TEMPLATES['notifications-consent'].title))
  if(privacyReady)documents.push({id:'privacy-notice',title:'EK-2 · KVKK AYDINLATMA METNİ',source:privacyNotice.source,sourceVersion:privacyNotice.version,...(!privacyText?{externalPdf:true,sourceSha256:privacyNotice.sha256}:{}),blocks:privacyText?privacyNotice.paragraphs.map(p):[p(`Müşteri KVKK aydınlatması ayrı PDF kaynağından eklenir. Sürüm: ${privacyNotice.version}. Kaynak: ${privacyNotice.source}.`)]})
  const period=contract.billing_period==='aylık'?'ay':'yıl'
  documents.push({id:'service-information',title:'EK-3 · HİZMET BİLGİ FORMU VE ÜCRET TARİFESİ',source:'kayıt verisi - operasyonel form',blocks:[
    row('Sözleşme / teklif',`${no}${quote?.number?` / T-${String(quote.number).padStart(4,'0')}`:''}`),row('Üye',customer.title),row('Hizmet paketi',contract.package),row('Hizmet adresi',company.address),row('Başlangıç / bitiş',`${tokens.startDate} - ${tokens.endDate} (${f.months||'?'} ay)`),
    row('Paket kapsamı',(Array.isArray(settings.service_scope)?settings.service_scope:[]).join(' · ')),row('Ek hizmetler',tokens.extraServices),
    row('Dönem bedeli',f.price===null?missingValue:`${money(f.net)} TL + %${f.vatRate} KDV ${money(f.vat)} TL = ${money(f.price)} TL / ${period} (KDV dahil)`),
    row('Sözleşme toplamı',f.total===null?missingValue:`${money(f.totalNet)} TL + KDV = ${money(f.total)} TL (KDV dahil)`),
    ...(quote&&Number(quote.discount_pct)>0?[row('Kabul edilen teklif indirimi',`%${quote.discount_pct}; dönem bedeline uygulanmıştır. Liste bedeli: ${amount(quote.list_price)?money(quote.list_price)+' TL (KDV dahil)':missingValue}`)]:[]),
    row('Ödeme',`${contract.billing_period==='aylık'?'Aylık':'Yıllık'} peşin; aksi yazılı kararlaştırılmadıkça hizmet dönemi başlamadan önce (Madde 12.2).`),
    row('Depozito',amount(settings.deposit)?Number(settings.deposit)===0?'Alınmayacak':`${money(settings.deposit)} TL`:missingValue),
    row('Adres değişikliği günlük cezai şartı',amount(settings.daily_address_penalty)?`${money(settings.daily_address_penalty)} TL (Madde 7.3)`:missingValue),row('İhlallere göre cezai şart',settings.penalty_terms),
    heading('Ek hizmet ücret tarifesi'),...(tariff.length?tariff.map(x=>row(x?.service,`${amount(x?.price)?money(x.price):missingValue} TL + KDV / ${value(x?.unit)}`)):[p('Ayrıca kararlaştırılmış ek hizmet tarifesi yoktur; ek hizmet siparişi ayrıca fiyatlandırılır.')]),
    {type:'signatures',company:value(company.name),customer:value(customer.title),representative:value(customer.contact)}]})
  for(const x of tariff)require(x&&clean(x.service)&&amount(x.price)&&clean(x.unit),'settings.tariff_item','Ek hizmet adı, birimi ve bedeli')
  const customerRows=partyBlocks(company,customer).slice(partyBlocks(company,customer).findIndex(x=>x.text==='1.2. ÜYE')+1,-2)
  documents.push({id:'customer-information',title:'EK-4 · KİMLİK TESPİT VE MÜŞTERİ BİLGİ FORMU',source:'kayıt verisi - operasyonel form',blocks:[p('Kimlik ve yetki belgeleri ayrıca doğrulanır; bu form tek başına kimlik doğrulama belgesi değildir.'),row('Sözleşme',no),row('Hizmet sağlayıcı',company.name),...customerRows,row('Yetkili kişi',customer.contact),row('Faaliyet konusu',nonApplicable(customer.activity||customer.notes_activity)),row('Kimlik / yetki belgeleri','Ayrıca doğrulanır.'),{type:'signatures',company:value(company.name),customer:value(customer.title),representative:value(customer.contact)}]})
  documents.push(sourceDoc('usage-rules','EK-5 · '+LAWYER_TEMPLATES['usage-rules'].title),sourceDoc('address-undertaking'))
  // Hazır ofis kapsamı Ocak 2027'ye park edilmiştir. Şablon varlığı hizmet aktivasyonu sayılmaz.
  for(const id of [...new Set(additionalDocuments)]) {
    if(!['meeting-room','inventory'].includes(id)){require(false,`optional.${id}`,'Seçilen hizmet bu sanal ofis akışında etkin değil','hizmet');continue}
    if(id==='meeting-room'){
      const m=settings.meeting||{}
      require(clean(m.duration)&&validLocalDateTime(m.start)&&validLocalDateTime(m.end)&&m.end>m.start,'settings.meeting','Toplantı kullanım türü ve sıralı, geçerli başlangıç / bitiş saatleri')
      tokens.meetingDetails=`Kullanım: ${value(m.duration)} | Başlangıç: ${validLocalDateTime(m.start)?formatDate(m.start.slice(0,10))+' '+m.start.slice(11):missingValue} | Bitiş: ${validLocalDateTime(m.end)?formatDate(m.end.slice(0,10))+' '+m.end.slice(11):missingValue}`
    }
    if(id==='inventory'){
      require(Array.isArray(settings.inventory)&&settings.inventory.length>0,'settings.inventory','Teslim edilecek demirbaş listesi')
      const items=Array.isArray(settings.inventory)?settings.inventory:[]
      for(const item of items)require(item&&clean(item.name)&&Number(item.quantity)>0&&clean(item.condition),'settings.inventory_item','Demirbaş adı, sıfırdan büyük adedi ve teslim durumu')
      tokens.inventoryItems=items.map((x,i)=>`${i+1}. ${value(x?.name)} | ${value(x?.quantity)} adet | Durum: ${value(x?.condition)} | Seri no: ${nonApplicable(x?.serial)} | ${nonApplicable(x?.note)}`).join('\n')
      tokens.handoverDate=formatDate(settings.handover_date);tokens.returnDate=settings.return_date?formatDate(settings.return_date):'İadede doldurulacak'
      require(validDate(settings.handover_date),'settings.handover_date','Demirbaş teslim tarihi')
    }
    documents.push(sourceDoc(id))
  }
  const checklist=DOCUMENT_CATALOG.filter(x=>x.default||additionalDocuments.includes(x.id)).map(item=>({...item,status:item.id==='privacy-notice'?(privacyReady?'kaynak-doğrulandı':'engelleyici-kaynak-eksik'):item.status,included:documents.some(d=>d.id===item.id)}))
  return {number:no,version:CONTRACT_VERSION,fingerprint:TEMPLATE_FINGERPRINT,documents,checklist,missing,ready:missing.length===0,figures:f,historical,reviewLabel:historical?'YENİ METİNDEN İNCELEME - ESKİ İMZALI BELGENİN KOPYASI DEĞİLDİR':'İNCELEME - EKSİK BELGELERLE GÖNDERİLMEZ',sourceApproval:'Son avukat onayı / sürüm tarihi için ayrıca kanıt bulunmuyor.',copies:2}
}

export function packagePlainText(pkg) {
  return pkg.documents.map(doc=>[doc.title,...doc.blocks.map(b=>b.type==='row'?`${b.label}: ${b.text}`:b.type==='signatures'?`${b.company}\n${b.customer}\nYetkili: ${b.representative}\nTarih / İmza / Kaşe:`:b.text)].join('\n')).join('\n\n')
}
