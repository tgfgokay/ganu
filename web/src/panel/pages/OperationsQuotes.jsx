import { useEffect,useMemo,useRef,useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { quotes,customers,convertQuote,acceptQuote,processOperation,markQuoteSent,bniDiscountPct,loadCatalog,PACKAGES,PACKAGE_PRICES,PACKAGE_MONTHLY,QUOTE_STATUS,QUOTE_CHANNELS } from '../lib/operations-store.js'
import { customerPayload,validateCustomer } from './OperationsCustomerForm.jsx'
import { CopyButton } from './OperationsInvoices.jsx'
import { ContractDocButton,ContractPreview,loadContractDoc } from './OperationsContractDoc.jsx'
import { GANU_INVOICE_ADDRESS as GANU } from '../lib/company.js'
import { gmailComposeUrl,quoteHtml } from '../lib/quote-document.js'
import { legalIdentity } from '../../legal/config.js'
import { DV_RATE_PER_MILLE,contractTotal,discounted,quoteNo,stampTaxAmount,stampTaxBase } from '../lib/stamp-tax.js'
import { addDaysISO,localISO,termEndISO } from '../lib/dates.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'

// Teklif fiyatı dönem başına (yıl/ay) KDV dahildir. Akış (0015): taslak → personel gerçekten gönderince "Gönderildi" (kanal)
// → kabul (müşteri + sözleşme + ilk fatura + taslak damga kaydı, tek işlem) | red. Gönderilmiş teklif değişmez; değişiklik
// "Revize et" ile yeni numaralı teklif olur ve gönderilince eskisini geçersiz kılar. Süresi geçmiş teklif kabul edilmez.
const today=()=>localISO()
const per=(b)=>b==='aylık'?'ay':'yıl'
const catalog=(pkg,b)=>(b==='aylık'?PACKAGE_MONTHLY:PACKAGE_PRICES)[pkg]??''
const expired=(q)=>['taslak','gönderildi'].includes(q.status)&&q.valid_until&&q.valid_until<today()
const Q_CLS={taslak:'b-mektup','gönderildi':'b-warn',kabul:'b-aktif',red:'b-danger'}
const QuoteBadge=({q})=>q.superseded_at?<span className="pl-badge b-mektup">revize edildi</span>:expired(q)?<span className="pl-badge b-danger">süresi doldu</span>:<span className={`pl-badge ${Q_CLS[q.status]||'b-mektup'}`}>{q.status}{q.status==='gönderildi'&&q.sent_channel?` · ${q.sent_channel}`:''}</span>
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
function MailLink({q,className}){
  const click=(e)=>{if(!q.email&&!confirm('Teklifte e-posta adresi yok. Alıcısız ileti açılsın mı?'))e.preventDefault()}
  return <a className={className} href={gmailComposeUrl(q)} target="_blank" rel="noopener noreferrer" onClick={click}>E-postayla gönder</a>
}

function QuotePreview({q,onClose}){
  const ref=useRef(null)
  return <Modal wide title={`${quoteNo(q)} · ${q.title}`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button><MailLink q={q} className="pl-btn pl-btn-ghost"/><button className="pl-btn pl-btn-solid" onClick={()=>ref.current?.contentWindow?.print()}>Yazdır / PDF</button></>}>
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
    const {_bniPct,id,number,created_at,customer_id,contract_id,sent_at,decided_at,status,superseded_at,sent_channel,...rest}=f
    try{await onSave({...rest,title:rest.title.trim(),term_months:Number(rest.term_months)||12,list_price:Number(rest.list_price)||0,discount_pct:Number(rest.discount_pct)||0,price:Number(rest.price),bni:!!rest.bni,valid_until:rest.valid_until||null,tax_no:String(rest.tax_no).replace(/\D/g,''),tc:String(rest.tc).replace(/\D/g,'')})}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={initial.id?`Teklif ${quoteNo(initial)}`:initial.replaces_quote_id?'Revizyon (yeni teklif numarası)':'Yeni teklif'} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="quote-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
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

// Teklif gerçekten iletildiğinde işaretlenir (kopyalamak/e-posta penceresi açmak gönderim sayılmaz).
function SentForm({q,onClose,onDone}){
  const [ch,setCh]=useState('whatsapp'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const submit=async()=>{setBusy(true);setError('');try{await markQuoteSent(q.id,ch);onDone()}catch(err){setError(err?.message||'İşaretlenemedi.')}finally{setBusy(false)}}
  return <Modal title={`${quoteNo(q)} müşteriye gönderildi`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" disabled={busy} onClick={submit}>{busy?'Kaydediliyor…':'Gönderildi'}</button></>}>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <p className="sub" style={{marginTop:0}}>Teklifi müşteriye ilettiyseniz kanalı seçin. Gönderildikten sonra teklif değiştirilemez; değişiklik "Revize et" ile yeni numarayla yapılır.{q.replaces_quote_id?' Bu bir revizyon: önceki teklif geçersiz olacak.':''}</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}} role="radiogroup" aria-label="Gönderim kanalı">{QUOTE_CHANNELS.map(([v,l])=><button key={v} type="button" role="radio" aria-checked={ch===v} className={`pl-btn pl-btn-sm ${ch===v?'pl-btn-solid':'pl-btn-ghost'}`} onClick={()=>setCh(v)}>{l}</button>)}</div>
  </Modal>
}

// Kabul: müşteri (yeni ya da mevcut), sözleşme, ilk fatura ve damga vergisi kaydı tek seferde açılır.
function ConvertForm({q,custs,onClose,onDone}){
  const [customerId,setCustomerId]=useState(''),[startDate,setStartDate]=useState(today()),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(e)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{onDone(await acceptQuote(q.id,{customer:customerId?{id:customerId}:{address:GANU.address,city:GANU.city,district:GANU.district},startDate}))}catch(e){setError(e?.message||'Kabul kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={`${quoteNo(q)} · müşteri / başlangıç seç`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" type="submit" form="accept-options" disabled={busy}>{busy?'Kaydediliyor…':'Kabul et ve hazırla'}</button></>}>
    <form id="accept-options" className="pl-form" onSubmit={submit}>{error&&<div className="pl-alert" role="alert">{error}</div>}<p className="sub">Ünvan, iletişim, paket ve ücret mevcut kayıtlardan alınır. Teklif kabulü imza değildir; belgeler ve peşin ödeme ayrıca doğrulanır.</p><div className="pl-field"><label>Müşteri kaydı</label><select value={customerId} onChange={(e)=>setCustomerId(e.target.value)}><option value="">Kimlik bilgisine göre eşleştir / yeni aday aç</option>{custs.map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div><div className="pl-field"><label>Hizmet başlangıcı</label><input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} required/></div></form>
  </Modal>
}

export default function OperationsQuotes(){
  const [rows,setRows]=useState([]),[custs,setCusts]=useState([]),[bniPct,setBniPct]=useState(10),[modal,setModal]=useState(null),[contractDoc,setContractDoc]=useState(null),[accepting,setAccepting]=useState(''),[filter,setFilter]=useState('açık'),[error,setError]=useState(''),navigate=useNavigate()
  const load=async()=>{try{const [qs,cs,,pct]=await Promise.all([quotes.list(),customers.list(),loadCatalog(),bniDiscountPct()]);setRows(qs);setCusts(cs);setBniPct(pct)}catch{setError('Teklifler yüklenemedi.')}}
  useEffect(()=>{load()},[])
  const shown=useMemo(()=>rows.filter((q)=>filter==='tümü'||(filter==='açık'?['taslak','gönderildi'].includes(q.status)&&!q.superseded_at:q.status===filter)),[rows,filter])
  const save=async(payload)=>{if(modal.data.id)await quotes.update(modal.data.id,payload);else await quotes.create(payload);setModal(null);load()}
  const revise=(q)=>{const {id,number,created_at,customer_id,contract_id,sent_at,decided_at,status,superseded_at,sent_channel,...rest}=q;setModal({kind:'form',data:{...rest,replaces_quote_id:id,valid_until:addDaysISO(today(),15),_bniPct:bniPct}})}
  const reject=async(q)=>{if(!confirm(`${quoteNo(q)} reddedildi olarak işaretlensin mi?`))return;await quotes.update(q.id,{status:'red',decided_at:new Date().toISOString()});load()}
  const del=async(q)=>{if(!confirm(`${quoteNo(q)} silinsin mi?${q.status==='kabul'?'\nTeklifle açılan müşteri, sözleşme, fatura ve damga vergisi kayıtları silinmez.':''}`))return;await quotes.remove(q.id);load()}
  // Kabul edilince hizmet sözleşmesi hemen hazırlanır (müşteri + sözleşme + teklif bilgisiyle dolu); kapatınca müşteri sayfası açılır.
  const done=async(r)=>{setModal(null);load();if(r.job_id)processOperation(r.job_id).catch(()=>{});navigate(`/panel/musteriler/${r.customer_id}`)}
  const accept=async(q)=>{if(accepting)return;setAccepting(q.id);setError('');try{const result=await acceptQuote(q.id,{customer:{address:GANU.address,city:GANU.city,district:GANU.district}});if(result.job_id)processOperation(result.job_id).catch(()=>{});navigate(`/panel/musteriler/${result.customer_id}`)}catch(err){setError(err?.message||'Kabul kaydedilemedi.')}finally{setAccepting('')}}
  const open=rows.filter((q)=>['taslak','gönderildi'].includes(q.status)&&!expired(q)&&!q.superseded_at)
  return <div>
    <div className="pl-head"><div><h1>Teklifler</h1><p>Müşteri kabulünü kaydedin; kayıtlar ve sözleşme gönderimi hazırlanır. Kabul, imza yerine geçmez. Fiyatlar KDV dahil.</p></div><button className="pl-btn pl-btn-teal" onClick={()=>setModal({kind:'form',data:emptyQuote(bniPct)})}>+ Yeni teklif</button></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <div className="pl-stats"><div className="pl-stat"><div className="lab">Yanıt bekleyen</div><div className="val">{open.length}</div></div><div className="pl-stat"><div className="lab">Bekleyen tutar (yıllık eşdeğer)</div><div className="val">{fmtTL(open.reduce((n,q)=>n+contractTotal(q.price,q.billing_period,12),0))}</div></div><div className="pl-stat"><div className="lab">Kabul edilen</div><div className="val teal">{rows.filter((q)=>q.status==='kabul').length}</div></div></div>
    <div className="pl-toolbar"><select value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="açık">Açık (taslak + gönderildi)</option>{QUOTE_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}<option value="tümü">tümü</option></select></div>
    <div className="pl-card"><div className="pl-card-b">{shown.length===0&&<div className="pl-empty">Kayıt yok.</div>}
      {shown.map((q)=><div className="pl-row" key={q.id}><div className="grow"><div className="t1">{quoteNo(q)} · {q.title} <QuoteBadge q={q}/>{q.bni&&<span className="pl-badge b-mektup" style={{marginLeft:6}}>BNI</span>}</div>
        <div className="t2">{q.package} · {q.billing_period} · {q.term_months} ay · <b>{fmtTL(q.price)}</b>/{per(q.billing_period)}{Number(q.discount_pct)>0?` (%${Number(q.discount_pct)} ind.)`:''} · DV ≈ {fmtTL(dvOf(q))}{q.valid_until?` · geçerlilik ${fmtDate(q.valid_until)}`:''}{q.contact?` · ${q.contact}`:''}{q.phone?` · ${q.phone}`:''}</div></div>
        <div className="pl-actions">
          {q.status==='kabul'?<>{q.contract_id&&<ContractDocButton contractId={q.contract_id} quote={q} label="Sözleşme"/>}{q.customer_id&&<Link className="pl-btn pl-btn-ghost pl-btn-sm" to={`/panel/musteriler/${q.customer_id}`}>Müşteriye git</Link>}<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>del(q)}>Sil</button></>
          :q.status==='red'?<button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(q)}>Sil</button>
          :<><CopyButton text={quoteMessage(q)} label="Mesajı kopyala"/>
            <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({kind:'print',data:q})}>Teklif belgesi</button>
            <MailLink q={q} className="pl-btn pl-btn-ghost pl-btn-sm"/>
            {q.status==='taslak'&&<><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({kind:'form',data:{...q,_bniPct:bniPct}})}>Düzenle</button>
              <button className="pl-btn pl-btn-teal pl-btn-sm" disabled={expired(q)} title={expired(q)?'Geçerlilik tarihi geçti; düzenleyip uzatın':''} onClick={()=>setModal({kind:'sent',data:q})}>Gönderildi</button></>}
            {q.status==='gönderildi'&&!q.superseded_at&&<>{!expired(q)&&<button className="pl-btn pl-btn-teal pl-btn-sm" disabled={!!accepting} onClick={()=>accept(q)}>{accepting===q.id?'Kaydediliyor…':'Kabul et ve hazırla'}</button>}<button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!!accepting} onClick={()=>setModal({kind:'convert',data:q})}>Müşteri / tarih seç</button>
              <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>revise(q)}>Revize et</button></>}
            <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>reject(q)}>Red</button></>}
        </div></div>)}
    </div></div>
    {modal?.kind==='form'&&<QuoteForm initial={modal.data} onClose={()=>setModal(null)} onSave={save}/>}
    {modal?.kind==='print'&&<QuotePreview q={modal.data} onClose={()=>setModal(null)}/>}
    {modal?.kind==='sent'&&<SentForm q={modal.data} onClose={()=>setModal(null)} onDone={()=>{setModal(null);load()}}/>}
    {modal?.kind==='convert'&&<ConvertForm q={modal.data} custs={custs} onClose={()=>setModal(null)} onDone={done}/>}
    {contractDoc&&<ContractPreview doc={contractDoc} note={`${quoteNo(contractDoc.quote)} kabul edildi: müşteri (aday), sözleşme (imza bekliyor), ilk fatura ve damga vergisi taslağı açıldı. Hizmet sözleşmesi hazır.`} onClose={()=>{const id=contractDoc.customer.id;setContractDoc(null);navigate(`/panel/musteriler/${id}`)}}/>}
  </div>
}
