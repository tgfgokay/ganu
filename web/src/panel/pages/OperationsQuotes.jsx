import { useEffect,useMemo,useRef,useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { quotes,customers,convertQuote,bniDiscountPct,loadCatalog,PACKAGES,PACKAGE_PRICES,PACKAGE_MONTHLY,QUOTE_STATUS } from '../lib/operations-store.js'
import { customerPayload,validateCustomer } from './OperationsCustomerForm.jsx'
import { CopyButton } from './OperationsInvoices.jsx'
import { GANU_INVOICE_ADDRESS as GANU } from '../lib/company.js'
import { gmailComposeUrl,quoteHtml } from '../lib/quote-document.js'
import { legalIdentity } from '../../legal/config.js'
import { DV_RATE_PER_MILLE,DV_PAYERS,contractTotal,customerShare,discounted,quoteNo,stampTaxAmount,stampTaxBase } from '../lib/stamp-tax.js'
import { addDaysISO,localISO,termEndISO } from '../lib/dates.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'

// Teklif fiyatı dönem başına (yıl/ay) KDV dahildir. Kabul edilen teklif tek işlemde müşteri + sözleşme + ilk fatura +
// damga vergisi kaydına dönüşür (0014 convert_quote).
const today=()=>localISO()
const per=(b)=>b==='aylık'?'ay':'yıl'
const catalog=(pkg,b)=>(b==='aylık'?PACKAGE_MONTHLY:PACKAGE_PRICES)[pkg]??''
const expired=(q)=>['taslak','gönderildi'].includes(q.status)&&q.valid_until&&q.valid_until<today()
const Q_CLS={taslak:'b-mektup','gönderildi':'b-warn',kabul:'b-aktif',red:'b-danger'}
const QuoteBadge=({q})=>expired(q)?<span className="pl-badge b-danger">süresi doldu</span>:<span className={`pl-badge ${Q_CLS[q.status]||'b-mektup'}`}>{q.status}</span>
const tl=(n)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
const dvOf=(q)=>stampTaxAmount(stampTaxBase(q.price,q.billing_period,q.term_months))
const emptyQuote=(pct)=>({title:'',contact:'',phone:'',email:'',tax_no:'',tc:'',tax_office:'',package:'Başlangıç',billing_period:'yıllık',term_months:12,list_price:catalog('Başlangıç','yıllık'),discount_pct:0,price:catalog('Başlangıç','yıllık'),bni:false,valid_until:addDaysISO(today(),15),notes:'',_bniPct:pct})

// WhatsApp/e-posta ile gönderilecek teklif metni.
export function quoteMessage(q){
  const disc=Number(q.discount_pct)>0&&Number(q.list_price)>0?` (liste fiyatı ${tl(q.list_price)} TL, %${Number(q.discount_pct)} indirimli)`:''
  return [
    `Merhaba${q.contact?` ${q.contact}`:''},`,
    `GANU sanal ofis teklifimiz (${quoteNo(q)}):`,
    `• Paket: ${q.package} · ${q.billing_period} faturalama · ${q.term_months} ay sözleşme`,
    `• Ücret: ${tl(q.price)} TL / ${per(q.billing_period)} (KDV dahil)${disc}`,
    `• Sözleşme damga vergisi (binde ${String(DV_RATE_PER_MILLE).replace('.',',')}): yaklaşık ${tl(dvOf(q))} TL, sözleşme imzalanırken ödenir.`,
    ...(q.valid_until?[`• Teklif geçerliliği: ${fmtDate(q.valid_until)}`]:[]),
    'Onaylarsanız hizmet sözleşmesini hazırlayıp gönderiyoruz.',
    `GANU Ofis Hizmetleri · ${legalIdentity.phone||'0537 974 62 90'} · ${legalIdentity.email||'info@ganu.com.tr'}`,
  ].join('\n')
}

// Açılır pencere engelinden etkilenmez: belge panel içinde iframe'de gösterilir, yazdırma iframe'den açılır.
// info@ganu.com.tr Gmail'inde alıcı, konu ve metni hazır yeni ileti açar (bağlantı olduğu için açılır pencere engeline
// takılmaz); PDF'i personel ekleyip gönderir.
function MailLink({q,onSent,className}){
  const click=(e)=>{if(!q.email&&!confirm('Teklifte e-posta adresi yok. Alıcısız ileti açılsın mı?')){e.preventDefault();return}onSent?.(q)}
  return <a className={className} href={gmailComposeUrl(q)} target="_blank" rel="noopener noreferrer" onClick={click}>E-postayla gönder</a>
}

function QuotePreview({q,onClose,onMail}){
  const ref=useRef(null)
  return <Modal wide title={`${quoteNo(q)} · ${q.title}`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button><MailLink q={q} onSent={onMail} className="pl-btn pl-btn-ghost"/><button className="pl-btn pl-btn-solid" onClick={()=>ref.current?.contentWindow?.print()}>Yazdır / PDF</button></>}>
    <p className="sub" style={{margin:'0 0 8px'}}>PDF için "Yazdır / PDF" → hedef "PDF olarak kaydet". E-postada PDF'i ekleyip gönderin.</p>
    <iframe ref={ref} title="Teklif belgesi" srcDoc={quoteHtml(q)} style={{width:'100%',height:'70vh',border:'1px solid #e2e8f0',borderRadius:8,background:'#eef1f5'}}/>
  </Modal>
}

function QuoteForm({initial,onClose,onSave}){
  const [f,setF]=useState(()=>({...initial,...Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v??'']))})),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const reprice=(patch)=>setF((s)=>{const n={...s,...patch};const list=catalog(n.package,n.billing_period);if('package' in patch||'billing_period' in patch)n.list_price=list;n.price=n.list_price===''?n.price:discounted(n.list_price,n.discount_pct);return n})
  const toggleBni=(on)=>reprice({bni:on,discount_pct:on?f._bniPct:0})
  const total=contractTotal(f.price,f.billing_period,f.term_months),dv=stampTaxAmount(stampTaxBase(f.price,f.billing_period,f.term_months))
  const submit=async(e)=>{e.preventDefault();if(!f.title.trim())return setError('Firma / kişi adı zorunlu.');if(!(Number(f.price)>0))return setError('Teklif fiyatı sıfırdan büyük olmalı.');setBusy(true);setError('')
    const {_bniPct,id,number,created_at,customer_id,contract_id,sent_at,decided_at,status,...rest}=f
    try{await onSave({...rest,title:rest.title.trim(),term_months:Number(rest.term_months)||12,list_price:Number(rest.list_price)||0,discount_pct:Number(rest.discount_pct)||0,price:Number(rest.price),bni:!!rest.bni,valid_until:rest.valid_until||null,tax_no:String(rest.tax_no).replace(/\D/g,''),tc:String(rest.tc).replace(/\D/g,'')})}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={initial.id?`Teklif ${quoteNo(initial)}`:'Yeni teklif'} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="quote-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="quote-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      <div className="pl-field"><label>Firma ünvanı / ad soyad *</label><input value={f.title} onChange={(e)=>set('title',e.target.value)} required autoFocus/></div>
      <div className="two"><div className="pl-field"><label>Yetkili kişi</label><input value={f.contact} onChange={(e)=>set('contact',e.target.value)}/></div><div className="pl-field"><label>Telefon</label><input value={f.phone} onChange={(e)=>set('phone',e.target.value)} placeholder="05.."/></div></div>
      <div className="pl-field"><label>E-posta</label><input type="email" value={f.email} onChange={(e)=>set('email',e.target.value)}/></div>
      <div className="two"><div className="pl-field"><label>Paket</label><select value={f.package} onChange={(e)=>reprice({package:e.target.value})}>{PACKAGES.map((p)=><option key={p} value={p}>{p}</option>)}</select></div>
        <div className="pl-field"><label>Faturalama</label><select value={f.billing_period} onChange={(e)=>reprice({billing_period:e.target.value})}><option value="yıllık">Yıllık</option><option value="aylık">Aylık</option></select></div></div>
      <div className="two"><div className="pl-field"><label>Liste fiyatı (₺/{per(f.billing_period)}, KDV dahil)</label><input type="number" min="0" step="0.01" value={f.list_price} onChange={(e)=>reprice({list_price:e.target.value})}/></div>
        <div className="pl-field"><label>İndirim (%)</label><input type="number" min="0" max="100" step="0.5" value={f.discount_pct} onChange={(e)=>reprice({discount_pct:e.target.value})}/></div></div>
      <div className="pl-field"><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={!!f.bni} onChange={(e)=>toggleBni(e.target.checked)}/>BNI Nişantaşı (%{f._bniPct} indirim)</label></div>
      <div className="two"><div className="pl-field"><label>Teklif fiyatı (₺/{per(f.billing_period)}, KDV dahil) *</label><input type="number" min="0" step="0.01" value={f.price} onChange={(e)=>set('price',e.target.value)} required/></div>
        <div className="pl-field"><label>Sözleşme süresi (ay)</label><input type="number" min="1" max="60" value={f.term_months} onChange={(e)=>set('term_months',e.target.value)}/></div></div>
      <div className="pl-alert"><span className="msg">Sözleşme toplamı <b>{fmtTL(total)}</b> (KDV dahil) · damga vergisi yaklaşık <b>{fmtTL(dv)}</b> (müşteri öder)</span></div>
      <div className="pl-field"><label>Geçerlilik tarihi</label><input type="date" value={f.valid_until} onChange={(e)=>set('valid_until',e.target.value)}/></div>
      <details style={{marginTop:4}}><summary style={{cursor:'pointer',fontSize:14,color:'#475569'}}>Fatura bilgileri (biliniyorsa)</summary>
        <div className="two" style={{marginTop:10}}><div className="pl-field"><label>Vergi no</label><input value={f.tax_no} onChange={(e)=>set('tax_no',e.target.value)} inputMode="numeric" placeholder="10 hane"/></div><div className="pl-field"><label>TC kimlik no (şahıs)</label><input value={f.tc} onChange={(e)=>set('tc',e.target.value)} inputMode="numeric" placeholder="11 hane"/></div></div>
        <div className="pl-field"><label>Vergi dairesi</label><input value={f.tax_office} onChange={(e)=>set('tax_office',e.target.value)}/></div></details>
      <div className="pl-field"><label>Not (teklifte görünür)</label><textarea value={f.notes} onChange={(e)=>set('notes',e.target.value)}/></div>
    </form>
  </Modal>
}

// Kabul: müşteri (yeni ya da mevcut), sözleşme, ilk fatura ve damga vergisi kaydı tek seferde açılır.
function ConvertForm({q,custs,onClose,onDone}){
  const start0=today(),base0=stampTaxBase(q.price,q.billing_period,q.term_months)
  const [f,setF]=useState({existing:'',title:q.title||'',contact:q.contact||'',email:q.email||'',phone:q.phone||'',tax_no:q.tax_no||'',tc:q.tc||'',tax_office:q.tax_office||GANU.taxOffice,
    start_date:start0,end_date:termEndISO(start0,q.term_months),price:q.price,withInvoice:true,amount:q.price,due_date:addDaysISO(start0,5),
    withStamp:true,doc_date:start0,base:base0,rate:DV_RATE_PER_MILLE,payer:'müşteri'}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const dv=stampTaxAmount(f.base,f.rate)
  const setPrice=(v)=>setF((s)=>({...s,price:v,amount:v,base:stampTaxBase(v,q.billing_period,q.term_months)}))
  const submit=async(e)=>{e.preventDefault();setError('')
    let customer
    if(f.existing)customer={id:f.existing}
    else{const form={title:f.title,contact:f.contact,email:f.email,phone:f.phone,tax_no:f.tax_no,tc:f.tc,tax_office:f.tax_office,address:GANU.address,city:GANU.city,district:GANU.district,status:'aktif',partner_id:'',bni:!!q.bni,notes:`Teklif ${quoteNo(q)}`};const msg=validateCustomer(form,custs);if(msg)return setError(msg);customer=customerPayload(form)}
    if(!f.start_date||!f.end_date||f.end_date<f.start_date)return setError('Sözleşme başlangıç/bitiş tarihlerini kontrol edin.')
    if(f.withInvoice&&!(Number(f.amount)>0))return setError('İlk fatura tutarı sıfırdan büyük olmalı.')
    if(f.withStamp&&!(Number(f.base)>0))return setError('Damga vergisi matrahı sıfırdan büyük olmalı.')
    setBusy(true)
    try{const r=await convertQuote(q.id,{customer,
      contract:{package:q.package,billing_period:q.billing_period,start_date:f.start_date,end_date:f.end_date,price:Number(f.price)},
      invoice:f.withInvoice?{amount:Number(f.amount),issue_date:f.start_date,due_date:f.due_date||null,note:`${q.package} · ${f.start_date.slice(0,7)} dönemi · ${quoteNo(q)}`}:null,
      stamp:f.withStamp?{doc_date:f.doc_date,base:Number(f.base),rate_per_mille:Number(f.rate),payer:f.payer,notes:quoteNo(q)}:null})
      onDone(r)}catch(err){setError(err?.message||'Dönüştürülemedi.')}finally{setBusy(false)}}
  return <Modal title={`${quoteNo(q)} kabul edildi · müşteriye dönüştür`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="conv-form" type="submit" disabled={busy}>{busy?'Açılıyor…':'Müşteri + sözleşme aç'}</button></>}>
    <form id="conv-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      <div className="pl-field"><label>Müşteri</label><select value={f.existing} onChange={(e)=>set('existing',e.target.value)}><option value="">Yeni müşteri aç</option>{custs.map((c)=><option key={c.id} value={c.id}>Mevcut: {c.title}</option>)}</select></div>
      {!f.existing&&<><div className="pl-field"><label>Ünvan / ad soyad *</label><input value={f.title} onChange={(e)=>set('title',e.target.value)} required/></div>
        <div className="two"><div className="pl-field"><label>Vergi no</label><input value={f.tax_no} onChange={(e)=>set('tax_no',e.target.value)} inputMode="numeric" placeholder="10 hane"/></div><div className="pl-field"><label>ya da TC (şahıs)</label><input value={f.tc} onChange={(e)=>set('tc',e.target.value)} inputMode="numeric" placeholder="11 hane"/></div></div>
        <div className="two"><div className="pl-field"><label>Vergi dairesi</label><input value={f.tax_office} onChange={(e)=>set('tax_office',e.target.value)}/></div><div className="pl-field"><label>E-posta (fatura)</label><input type="email" value={f.email} onChange={(e)=>set('email',e.target.value)}/></div></div>
        <p className="sub" style={{margin:0}}>Fatura adresi GANU ofisi ({GANU.address}, {GANU.district}/{GANU.city}); müşteri sayfasından değiştirilebilir.</p></>}
      <h3 style={{fontSize:15,margin:'14px 0 4px'}}>Sözleşme · {q.package} · {q.billing_period}</h3>
      <div className="two"><div className="pl-field"><label>Başlangıç</label><input type="date" value={f.start_date} onChange={(e)=>setF((s)=>({...s,start_date:e.target.value,end_date:termEndISO(e.target.value,q.term_months),doc_date:e.target.value}))}/></div><div className="pl-field"><label>Bitiş ({q.term_months} ay)</label><input type="date" value={f.end_date} onChange={(e)=>set('end_date',e.target.value)}/></div></div>
      <div className="pl-field"><label>Ücret (₺/{per(q.billing_period)}, KDV dahil)</label><input type="number" min="0" step="0.01" value={f.price} onChange={(e)=>setPrice(e.target.value)}/></div>
      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginTop:10}}><input type="checkbox" checked={f.withInvoice} onChange={(e)=>set('withInvoice',e.target.checked)}/><b>İlk fatura kaydını aç</b></label>
      {f.withInvoice&&<div className="two"><div className="pl-field"><label>Tutar (₺, KDV dahil)</label><input type="number" min="0" step="0.01" value={f.amount} onChange={(e)=>set('amount',e.target.value)}/></div><div className="pl-field"><label>Son ödeme</label><input type="date" value={f.due_date} onChange={(e)=>set('due_date',e.target.value)}/></div></div>}
      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginTop:10}}><input type="checkbox" checked={f.withStamp} onChange={(e)=>set('withStamp',e.target.checked)}/><b>Damga vergisi kaydını aç</b></label>
      {f.withStamp&&<><div className="two"><div className="pl-field"><label>İmza tarihi</label><input type="date" value={f.doc_date} onChange={(e)=>set('doc_date',e.target.value)}/></div><div className="pl-field"><label>Matrah (₺, KDV hariç toplam)</label><input type="number" min="0" step="0.01" value={f.base} onChange={(e)=>set('base',e.target.value)}/></div></div>
        <div className="two"><div className="pl-field"><label>Oran (binde)</label><input type="number" min="0.01" max="20" step="0.01" value={f.rate} onChange={(e)=>set('rate',e.target.value)}/></div><div className="pl-field"><label>Ödeyen</label><select value={f.payer} onChange={(e)=>set('payer',e.target.value)}>{DV_PAYERS.map((p)=><option key={p} value={p}>{p}</option>)}</select></div></div>
        <div className="pl-alert"><span className="msg">Damga vergisi <b>{fmtTL(dv)}</b> · müşteriden tahsil: <b>{fmtTL(customerShare(dv,f.payer))}</b></span></div></>}
    </form>
  </Modal>
}

export default function OperationsQuotes(){
  const [rows,setRows]=useState([]),[custs,setCusts]=useState([]),[bniPct,setBniPct]=useState(10),[modal,setModal]=useState(null),[filter,setFilter]=useState('açık'),[error,setError]=useState(''),navigate=useNavigate()
  const load=async()=>{try{const [qs,cs,,pct]=await Promise.all([quotes.list(),customers.list(),loadCatalog(),bniDiscountPct()]);setRows(qs);setCusts(cs);setBniPct(pct)}catch{setError('Teklifler yüklenemedi.')}}
  useEffect(()=>{load()},[])
  const shown=useMemo(()=>rows.filter((q)=>filter==='tümü'||(filter==='açık'?['taslak','gönderildi'].includes(q.status):q.status===filter)),[rows,filter])
  const save=async(payload)=>{if(modal.data.id)await quotes.update(modal.data.id,payload);else await quotes.create(payload);setModal(null);load()}
  const markSent=async(q)=>{if(q.status==='taslak'){await quotes.update(q.id,{status:'gönderildi',sent_at:new Date().toISOString()});load()}}
  const reject=async(q)=>{if(!confirm(`${quoteNo(q)} reddedildi olarak işaretlensin mi?`))return;await quotes.update(q.id,{status:'red',decided_at:new Date().toISOString()});load()}
  const del=async(q)=>{if(!confirm(`${quoteNo(q)} silinsin mi?${q.status==='kabul'?'\nTeklifle açılan müşteri, sözleşme, fatura ve damga vergisi kayıtları silinmez.':''}`))return;await quotes.remove(q.id);load()}
  const done=(r)=>{setModal(null);navigate(`/panel/musteriler/${r.customer_id}`)}
  const open=rows.filter((q)=>['taslak','gönderildi'].includes(q.status)&&!expired(q))
  return <div>
    <div className="pl-head"><div><h1>Teklifler</h1><p>Teklif → kabul → müşteri, sözleşme, ilk fatura ve damga vergisi kaydı tek adımda. Fiyatlar KDV dahil.</p></div><button className="pl-btn pl-btn-teal" onClick={()=>setModal({kind:'form',data:emptyQuote(bniPct)})}>+ Yeni teklif</button></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <div className="pl-stats"><div className="pl-stat"><div className="lab">Yanıt bekleyen</div><div className="val">{open.length}</div></div><div className="pl-stat"><div className="lab">Bekleyen tutar (yıllık eşdeğer)</div><div className="val">{fmtTL(open.reduce((n,q)=>n+contractTotal(q.price,q.billing_period,12),0))}</div></div><div className="pl-stat"><div className="lab">Kabul edilen</div><div className="val teal">{rows.filter((q)=>q.status==='kabul').length}</div></div></div>
    <div className="pl-toolbar"><select value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="açık">Açık (taslak + gönderildi)</option>{QUOTE_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}<option value="tümü">tümü</option></select></div>
    <div className="pl-card"><div className="pl-card-b">{shown.length===0&&<div className="pl-empty">Kayıt yok.</div>}
      {shown.map((q)=><div className="pl-row" key={q.id}><div className="grow"><div className="t1">{quoteNo(q)} · {q.title} <QuoteBadge q={q}/>{q.bni&&<span className="pl-badge b-mektup" style={{marginLeft:6}}>BNI</span>}</div>
        <div className="t2">{q.package} · {q.billing_period} · {q.term_months} ay · <b>{fmtTL(q.price)}</b>/{per(q.billing_period)}{Number(q.discount_pct)>0?` (%${Number(q.discount_pct)} ind.)`:''} · DV ≈ {fmtTL(dvOf(q))}{q.valid_until?` · geçerlilik ${fmtDate(q.valid_until)}`:''}{q.contact?` · ${q.contact}`:''}{q.phone?` · ${q.phone}`:''}</div></div>
        <div className="pl-actions">
          {q.status==='kabul'?<>{q.customer_id&&<Link className="pl-btn pl-btn-ghost pl-btn-sm" to={`/panel/musteriler/${q.customer_id}`}>Müşteriye git</Link>}<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>del(q)}>Sil</button></>
          :q.status==='red'?<button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(q)}>Sil</button>
          :<><span onClickCapture={()=>markSent(q)}><CopyButton text={quoteMessage(q)} label="Mesajı kopyala"/></span>
            <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>{setModal({kind:'print',data:q});markSent(q)}}>Teklif belgesi</button>
            <MailLink q={q} onSent={markSent} className="pl-btn pl-btn-ghost pl-btn-sm"/>
            <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({kind:'form',data:{...q,_bniPct:bniPct}})}>Düzenle</button>
            <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={()=>setModal({kind:'convert',data:q})}>Kabul → müşteri</button>
            <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>reject(q)}>Red</button></>}
        </div></div>)}
    </div></div>
    {modal?.kind==='form'&&<QuoteForm initial={modal.data} onClose={()=>setModal(null)} onSave={save}/>}
    {modal?.kind==='print'&&<QuotePreview q={modal.data} onClose={()=>setModal(null)} onMail={markSent}/>}
    {modal?.kind==='convert'&&<ConvertForm q={modal.data} custs={custs} onClose={()=>setModal(null)} onDone={done}/>}
  </div>
}
