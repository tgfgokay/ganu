import { useEffect,useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { invoices,customers,contracts,invStatus,issueEInvoice,createPaymentLink,checkParasut,syncParasut,markInvoicePaidManual,registerManualEinvoice,prepareMonthlyInvoices,fileToStoredUrl,MANUAL_PAY_METHODS } from '../lib/operations-store.js'
import { SecureLink } from '../components/SecureAsset.jsx'
import { PAYMENT_ACCOUNT,paymentMessage } from '../lib/company.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'
import { missingForInvoice } from './OperationsCustomerForm.jsx'
import { addDaysISO,localISO } from '../lib/dates.js'

const today=()=>localISO()
const INV_CLS={bekliyor:'b-warn','ödendi':'b-aktif',gecikti:'b-danger'}
export const InvoiceBadge=({row})=>{const s=invStatus(row);return <span className={`pl-badge ${INV_CLS[s]||'b-mektup'}`}>{s}</span>}
export const emptyInvoice=(customerId='')=>{const issue=today();return {customer_id:customerId,contract_id:'',amount:'',issue_date:issue,due_date:addDaysISO(issue,7),payment_link:'',service_period_start:'',service_period_end:'',note:''}}

// Tutarlar KDV dahildir. Ödeme (elle: banka referansıyla; kartla: PayTR bildirimiyle) ve e-belge (Paraşüt'ten ya da
// Paraşüt arayüzünde kesilmiş belgenin kaydı) ayrı işlemlerdir; formdan değiştirilmez (0015). e-Belgesi kesilmiş faturanın
// tutarı ve tarihi de değişmez.
export function invoicePayload(f){const base={contract_id:f.contract_id||null,due_date:f.due_date||null,payment_link:f.payment_link.trim()||null,note:f.note.trim(),service_period_start:f.service_period_start||null,service_period_end:f.service_period_end||null};if(f.parasut_invoice_id||f.einvoice_status==='kesildi')return base;return {...base,customer_id:f.customer_id,amount:Number(f.amount)||0,issue_date:f.issue_date,...(f.id?{}:{status:'bekliyor'})}}
// Elle tahsilat: banka hesabında görülen ödeme referansıyla, tam tutar (kısmi ödeme yok). Sunucu (mark_invoice_paid_manual)
// faturayı kilitler, daha önce ödenmiş mi / PayTR incelemesi var mı bakar ve doğrulayan personeli kaydeder.
// Ödeme gelince e-Belge Paraşüt arayüzüne girmeden kesilir: bilgiler tamsa "hemen kes" varsayılan işaretlidir.
// İşaretlenmezse (ya da kesim o an başarısız olursa) günlük otomatik iş (auto-einvoice, 0016) açıksa ertesi sabah dener.
export function PaidButton({row,customer,onDone}){
  const cust=customer||row.customer||null,missing=cust?missingForInvoice(cust):['müşteri kaydı']
  const canIssue=!row.parasut_invoice_id&&row.einvoice_status!=='kesildi'&&missing.length===0
  const [open,setOpen]=useState(false),[f,setF]=useState({paidDate:today(),method:'havale',amount:String(row.amount??''),reference:'',issue:canIssue}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const submit=async(e)=>{e.preventDefault();setBusy(true);setError('')
    try{await markInvoicePaidManual(row.id,{...f,amount:Number(f.amount),reference:f.reference.trim()})}catch(err){setError(err?.message||'Kaydedilemedi.');setBusy(false);return}
    let note=''
    if(f.issue&&canIssue){const r=await issueEInvoice(row.id);note=r?.state==='kesildi'?`Ödeme kaydedildi, e-Belge kesildi${r.einvoice_no?`: ${r.einvoice_no}`:''}.`:`Ödeme kaydedildi; e-Belge kesilemedi (${r?.message||'bilinmeyen hata'}). Faturalar'da "Tekrar dene" ile yeniden deneyin.`}
    setBusy(false);setOpen(false);if(note)alert(note);onDone?.()}
  return <><button type="button" className="pl-btn pl-btn-teal pl-btn-sm" title="Bankada görülen havale/nakit tahsilatını kaydet" onClick={()=>setOpen(true)}>Ödendi (elle)</button>
    {open&&<Modal title={`Tahsilat · ${fmtTL(row.amount)}`} onClose={()=>setOpen(false)} footer={<><button className="pl-btn pl-btn-ghost" onClick={()=>setOpen(false)}>Vazgeç</button><button className="pl-btn pl-btn-solid" form={`pay-${row.id}`} type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Ödendi olarak kaydet'}</button></>}>
      <form id={`pay-${row.id}`} className="pl-form" onSubmit={submit}>
        {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
        <p className="sub" style={{marginTop:0}}>Müşterinin gönderdiği dekont tek başına yetmez: ödemeyi banka hesabında görüp işlem referansını yazın. Kartla ödemeler PayTR bildirimiyle kendiliğinden kapanır.</p>
        <div className="two"><div className="pl-field"><label>Ödeme tarihi *</label><input type="date" max={today()} value={f.paidDate} onChange={(e)=>set('paidDate',e.target.value)} required/></div><div className="pl-field"><label>Yöntem *</label><select value={f.method} onChange={(e)=>set('method',e.target.value)}>{MANUAL_PAY_METHODS.map((m)=><option key={m} value={m}>{m}</option>)}</select></div></div>
        <div className="two"><div className="pl-field"><label>Bankada görülen tutar (₺) *</label><input type="number" min="0" step="0.01" value={f.amount} onChange={(e)=>set('amount',e.target.value)} required/></div><div className="pl-field"><label>Banka işlem referansı / makbuz no *</label><input value={f.reference} onChange={(e)=>set('reference',e.target.value)} required/></div></div>
        {row.einvoice_status==='kesildi'||row.parasut_invoice_id?<p className="sub">Bu faturanın e-Belgesi zaten kesilmiş.</p>
          :canIssue?<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginTop:6}}><input type="checkbox" checked={f.issue} onChange={(e)=>set('issue',e.target.checked)}/><b>Ödeme kaydedilince e-Belgeyi hemen kes</b> <span className="sub">(Paraşüt'e girmeden; e-Fatura/e-Arşiv otomatik seçilir)</span></label>
          :<div className="pl-alert" style={{marginTop:6}}><span className="msg">e-Belge için müşteri bilgileri eksik: <b>{missing.join(', ')}</b>. Ödeme kaydedilir; bilgiler tamamlanınca "e-Belge kes" ile kesin.</span></div>}
      </form>
    </Modal>}</>
}
// Paraşüt arayüzünde kesilmiş belgeyi faturaya bağlar: tür, numara, tarih, ETTN ve PDF zorunlu (yeni belge kesmez).
function ManualEDoc({row,onDone}){
  const [open,setOpen]=useState(false),[f,setF]=useState({kind:'e-arşiv',no:'',issueDate:row.issue_date||today(),ettn:''}),[file,setFile]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const submit=async(e)=>{e.preventDefault();if(!file)return setError('Paraşüt\'ten indirdiğiniz PDF\'i seçin.');setBusy(true);setError('');try{const pdf=await fileToStoredUrl(file,{prefix:'customers',customerId:row.customer_id});await registerManualEinvoice(row.id,{...f,no:f.no.trim(),ettn:f.ettn.trim(),pdf});setOpen(false);onDone?.()}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <><button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" title="Paraşüt arayüzünde kesilmiş belgeyi kaydet" onClick={()=>setOpen(true)}>Elle kesildi</button>
    {open&&<Modal title="Paraşüt'te kesilmiş belgeyi kaydet" onClose={()=>setOpen(false)} footer={<><button className="pl-btn pl-btn-ghost" onClick={()=>setOpen(false)}>Vazgeç</button><button className="pl-btn pl-btn-solid" form={`edoc-${row.id}`} type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
      <form id={`edoc-${row.id}`} className="pl-form" onSubmit={submit}>
        {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
        <p className="sub" style={{marginTop:0}}>Tutar {fmtTL(row.amount)} · belge Paraşüt'teki ile aynı olmalı. Kaydedilen fatura panelden ikinci kez kesilmez.</p>
        <div className="two"><div className="pl-field"><label>Belge türü *</label><select value={f.kind} onChange={(e)=>set('kind',e.target.value)}><option value="e-arşiv">e-Arşiv</option><option value="e-fatura">e-Fatura</option></select></div><div className="pl-field"><label>Belge tarihi *</label><input type="date" max={today()} value={f.issueDate} onChange={(e)=>set('issueDate',e.target.value)} required/></div></div>
        <div className="pl-field"><label>Belge numarası *</label><input value={f.no} onChange={(e)=>set('no',e.target.value)} placeholder="ör. GAN2026000000001" required/></div>
        <div className="pl-field"><label>ETTN (36 karakter) *</label><input value={f.ettn} onChange={(e)=>set('ettn',e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required/></div>
        <div className="pl-field"><label>Belge PDF'i *</label><input type="file" accept="application/pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)} required/></div>
      </form>
    </Modal>}</>
}
// Ödenmiş faturada ödemenin kaynağı: PayTR bildirimi (otomatik) mi, personelin elle işaretlemesi mi.
export const paidSource=(row)=>invStatus(row)!=='ödendi'?'':row.paytr_merchant_oid?'PayTR kartla · otomatik':String(row.payment_reference||'').startsWith('Paraşüt tahsilat')?`Paraşüt'ten · ${row.payment_method==='kart'?'iyzico kartla':row.payment_method||'tahsilat'}`:`elle işaretlendi${row.payment_method?` · ${row.payment_method}`:''}`

export function CopyButton({text,label}){const [done,setDone]=useState(false);const copy=async()=>{try{await navigator.clipboard.writeText(text);setDone(true);setTimeout(()=>setDone(false),1800)}catch{prompt('Kopyalayın:',text)}};return <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={copy}>{done?'✓ Kopyalandı':label}</button>}
export const PaymentMessageButton=({row,customer})=><CopyButton text={paymentMessage(row,customer)} label="Ödeme mesajı"/>
// PayTR'de faturaya özel kart linki üretir; ödeme bildirimi faturayı kendiliğinden "ödendi" yapar.
export function PaymentLinkButton({row,onDone}){const [busy,setBusy]=useState(false);if(row.payment_link)return null;const run=async()=>{setBusy(true);try{const r=await createPaymentLink(row.id);alert(r?.link?`Kart linki hazır:\n${r.link}\n\n"Ödeme mesajı" artık linki içerir.`:(r?.message||'Link oluşturulamadı.'))}finally{setBusy(false);onDone?.()}};return <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={busy} onClick={run}>{busy?'Oluşturuluyor…':'Kart linki'}</button>}
export const ReviewNote=({row})=>row.payment_review?<div className="sub" style={{color:'#b45309'}} title={row.payment_review}>⚠ ödeme incelemesi: {row.payment_review}</div>:null

// Paraşüt'te resmî e-Belge keser (geri alınamaz). Kesilmiş ama PDF'i gelmemiş faturada yalnız PDF'i alır.
export function EDocCell({row,onDone}){
  const [busy,setBusy]=useState(false),s=row.einvoice_status,pdfOnly=s==='kesildi'&&row.parasut_invoice_id&&!row.einvoice_pdf
  const run=async()=>{if(!pdfOnly&&!confirm(`${fmtTL(row.amount)} tutarlı fatura Paraşüt'te resmî e-Belge olarak kesilecek. Bu işlem geri alınamaz. Devam edilsin mi?`))return;setBusy(true);try{const r=await issueEInvoice(row.id);if(r?.message)alert(r.message)}finally{setBusy(false);onDone?.()}}
  const btn=(label)=><button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={busy} onClick={run}>{busy?'İşleniyor…':label}</button>
  if(s==='kesildi')return <span>{row.einvoice_no||'kesildi'}{row.einvoice_kind?<span className="sub"> {row.einvoice_kind}</span>:null}{row.einvoice_pdf?<> · <SecureLink stored={row.einvoice_pdf} target="_blank" rel="noreferrer">PDF ↗</SecureLink></>:pdfOnly?<> {btn('PDF al')}</>:null}</span>
  if(s==='işleniyor')return <span className="sub">işleniyor… {btn('Durumu yenile')}</span>
  if(s==='iptal')return <span className="sub">iptal</span>
  return <span>{s==='başarısız'&&<span className="pl-badge b-danger" title={row.einvoice_error||''}>başarısız</span>} {btn(s==='başarısız'?'Tekrar dene':'e-Belge kes')} <ManualEDoc row={row} onDone={onDone}/></span>
}

export function InvoiceForm({title,initial,custs,cts,lockCustomer=false,onClose,onSave}){
  const [f,setF]=useState({...emptyInvoice(),...Object.fromEntries(Object.entries(initial||{}).map(([k,v])=>[k,v??'']))}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v})),locked=!!f.parasut_invoice_id||f.einvoice_status==='kesildi'
  const own=cts.filter((c)=>c.customer_id===f.customer_id)
  const pickContract=(id)=>{const c=cts.find((x)=>x.id===id);setF((s)=>({...s,contract_id:id,amount:s.amount===''&&c?String(c.price):s.amount}))}
  const submit=async(e)=>{e.preventDefault();if(!f.customer_id)return setError('Müşteri seçin.');if(!(Number(f.amount)>0))return setError('Tutar sıfırdan büyük olmalı.');if(Boolean(f.service_period_start)!==Boolean(f.service_period_end)||(f.service_period_end&&f.service_period_end<f.service_period_start))return setError('Hizmet dönemini başlangıç ve bitişiyle girin (ya da ikisini boş bırakın).');if(f.payment_link.trim()&&!/^https:\/\/\S+$/.test(f.payment_link.trim()))return setError('Ödeme linki https:// ile başlayan tam adres olmalı.');setBusy(true);setError('');try{await onSave(invoicePayload(f))}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={title} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="inv-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="inv-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      {locked&&<div className="pl-alert"><span className="msg">e-Belgesi kesilmiş fatura: tutar ve fatura tarihi değiştirilemez.</span></div>}
      <div className="pl-field"><label>Müşteri *</label><select value={f.customer_id} disabled={lockCustomer||locked} onChange={(e)=>setF((s)=>({...s,customer_id:e.target.value,contract_id:''}))} required><option value="">Seç…</option>{custs.map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div className="pl-field"><label>Sözleşme</label><select value={f.contract_id} onChange={(e)=>pickContract(e.target.value)}><option value="">— Bağlama —</option>{own.map((c)=><option key={c.id} value={c.id}>{c.package} · {fmtDate(c.start_date)}–{fmtDate(c.end_date)} · {fmtTL(c.price)}</option>)}</select></div>
      <div className="pl-field"><label>Tutar (₺, KDV dahil) *</label><input type="number" min="0" step="0.01" value={f.amount} disabled={locked} onChange={(e)=>set('amount',e.target.value)} required/></div>
      <div className="pl-field"><label>Kartla ödeme linki (PayTR panelinden)</label><input type="url" value={f.payment_link} onChange={(e)=>set('payment_link',e.target.value)} placeholder="https://…"/></div>
      <div className="two"><div className="pl-field"><label>Fatura tarihi</label><input type="date" value={f.issue_date} disabled={locked} onChange={(e)=>set('issue_date',e.target.value)}/></div><div className="pl-field"><label>Son ödeme</label><input type="date" value={f.due_date} onChange={(e)=>set('due_date',e.target.value)}/></div></div>
      <div className="two"><div className="pl-field"><label>Hizmet dönemi başı</label><input type="date" value={f.service_period_start} onChange={(e)=>set('service_period_start',e.target.value)}/></div><div className="pl-field"><label>Hizmet dönemi sonu</label><input type="date" value={f.service_period_end} onChange={(e)=>set('service_period_end',e.target.value)}/></div></div>
      <div className="pl-field"><label>Not</label><textarea value={f.note} onChange={(e)=>set('note',e.target.value)} placeholder="ör. Ekim 2026 dönemi · havale"/></div>
    </form>
  </Modal>
}

// Eşitleme özeti: sayılar + işlem gerektiren (atlanan/hatalı) satırlar.
export function syncSummary(r){
  if(!r||r.error||r.state==='kapalı')return {ok:false,line:`✗ ${r?.error||r?.message||'Eşitleme yapılamadı.'}`,notes:[]}
  const parts=[r.imported&&`${r.imported} fatura bağlandı`,r.paid&&`${r.paid} fatura ödendi`,r.pushed&&`${r.pushed} tahsilat Paraşüt'e girildi`].filter(Boolean)
  const notes=(r.items||[]).filter((i)=>i.action==='atlandı'||i.action==='hata').map((i)=>`${i.invoice_no||`Paraşüt #${i.parasut_id}`}: ${i.reason||i.action}`)
  return {ok:!r.errors,line:`${r.errors?'✗':'✓'} ${parts.length?parts.join(' · '):'Değişiklik yok'} · ${r.scanned} Paraşüt faturası tarandı${r.errors?` · ${r.errors} hata`:''}`,notes}
}

function ParasutCheck({onSynced}){
  const [busy,setBusy]=useState(''),[r,setR]=useState(null),[sync,setSync]=useState(null),ok=r?.state==='bağlı'
  const run=async()=>{setBusy('test');try{setR(await checkParasut())}finally{setBusy('')}}
  const runSync=async()=>{setBusy('sync');try{setSync(syncSummary(await syncParasut()));onSynced?.()}finally{setBusy('')}}
  const line=!r?'Fatura kesmeden yalnız okur: oturum, şirket, ürün ve tahsilat hesabı.':ok?`✓ Bağlı · ${[r.company,r.product,r.account].filter(Boolean).join(' · ')}`:`✗ ${r.step?`${r.step}: `:''}${r.message||'Test başarısız.'}`
  return <div className="pl-card" style={{marginBottom:20}}><div className="pl-card-b"><div className="pl-row"><div className="grow"><div className="t1">Paraşüt bağlantısı</div><div className="t2" style={r?{color:ok?'#0f766e':'#b45309'}:undefined}>{line}</div></div><button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!!busy} onClick={run}>{busy==='test'?'Deneniyor…':'Bağlantıyı test et'}</button></div>
    <div className="pl-row" style={{marginTop:12}}><div className="grow"><div className="t1">Paraşüt'ten eşitle</div><div className="t2" style={sync?{color:sync.ok?'#0f766e':'#b45309'}:undefined}>{sync?sync.line:"Paraşüt'te kesilen belgeleri vergi numarasıyla müşteriye bağlar; Paraşüt'te kapanan faturayı (iyzico kart ya da havale) ödendi yapar. Her sabah kendiliğinden de çalışır."}</div>
      {sync?.notes?.length>0&&<ul className="sub" style={{margin:'6px 0 0',paddingLeft:18}}>{sync.notes.map((n)=><li key={n}>{n}</li>)}</ul>}</div>
      <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!!busy} onClick={runSync}>{busy==='sync'?'Eşitleniyor…':"Paraşüt'ten eşitle"}</button></div></div></div>
}

export default function OperationsInvoices(){
  const [rows,setRows]=useState([]),[custs,setCusts]=useState([]),[cts,setCts]=useState([]),[filter,setFilter]=useState('tümü'),[q,setQ]=useState(''),[modal,setModal]=useState(null),[error,setError]=useState('')
  const load=async()=>{try{const [inv,cs,ct]=await Promise.all([invoices.list(),customers.list(),contracts.list()]);setRows(inv);setCusts(cs);setCts(ct)}catch{setError('Kayıtlar yüklenemedi.')}}
  useEffect(()=>{load()},[])
  const byId=useMemo(()=>Object.fromEntries(custs.map((c)=>[c.id,c])),[custs])
  const sum=(list)=>list.reduce((n,r)=>n+(Number(r.amount)||0),0)
  const paid=rows.filter((r)=>invStatus(r)==='ödendi'),open=rows.filter((r)=>invStatus(r)!=='ödendi'),late=rows.filter((r)=>invStatus(r)==='gecikti')
  const shown=rows.filter((r)=>(filter==='tümü'||invStatus(r)===filter)&&(!q||(byId[r.customer_id]?.title||'').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))))
  const save=async(payload)=>{if(modal.mode==='new')await invoices.create(payload);else await invoices.update(modal.data.id,payload);setModal(null);load()}
  const del=async(r)=>{if(confirm('Fatura kaydı silinsin mi? (Paraşüt\'teki fatura etkilenmez.)')){await invoices.remove(r.id);load()}}
  // Aylık sözleşmelerde bu ay başlayan hizmet dönemleri için bekleyen fatura kaydı açar; tekrar basmak çift kayıt üretmez.
  const prepare=async()=>{try{const n=await prepareMonthlyInvoices(today());alert(n?`${n} aylık fatura kaydı hazırlandı.`:'Bu ay için hazırlanacak yeni aylık fatura yok.');load()}catch(err){alert(err?.message||'Hazırlanamadı.')}}
  return <div>
    <div className="pl-head"><div><h1>Faturalar & Gelir</h1><p>Tutarlar KDV dahil. "e-Belge kes" Paraşüt'te resmî fatura keser; Paraşüt arayüzünde kesilen belge "Paraşüt'ten eşitle" ile kendiliğinden bağlanır (gerekirse "Elle kesildi"). Ödeme banka referansıyla ya da Paraşüt tahsilatıyla kapanır.</p></div><div className="pl-actions"><button className="pl-btn pl-btn-ghost" onClick={prepare}>Bu ayın aylık faturalarını hazırla</button><button className="pl-btn pl-btn-teal" disabled={!custs.length} onClick={()=>setModal({mode:'new',data:emptyInvoice()})}>+ Fatura kaydı</button></div></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <div className="pl-stats"><div className="pl-stat"><div className="lab">Tahsil edilen</div><div className="val teal">{fmtTL(sum(paid))}</div></div><div className="pl-stat"><div className="lab">Bekleyen</div><div className="val">{fmtTL(sum(open))}</div></div><div className="pl-stat"><div className="lab">Geciken</div><div className={`val${late.length?' warn':''}`}>{late.length}</div></div></div>
    <div className="pl-card" style={{marginBottom:20}}><div className="pl-card-b"><div className="pl-row"><div className="grow"><div className="t1">Ödeme hesabı · {PAYMENT_ACCOUNT.bank}</div><div className="t2">{PAYMENT_ACCOUNT.holder} · <code>{PAYMENT_ACCOUNT.iban}</code></div></div><CopyButton text={PAYMENT_ACCOUNT.iban.replace(/\s/g,'')} label="IBAN kopyala"/></div></div></div>
    <ParasutCheck onSynced={load}/>
    <div className="pl-tablewrap"><div className="pl-toolbar"><input type="search" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Müşteri ara…"/><select value={filter} onChange={(e)=>setFilter(e.target.value)}>{['tümü','bekliyor','gecikti','ödendi'].map((s)=><option key={s}>{s}</option>)}</select><span className="spacer"/><span style={{fontSize:13,color:'#64748b'}}>{shown.length} kayıt</span></div>
      <table className="pl-table"><thead><tr><th>Müşteri</th><th>Tutar</th><th>Fatura tarihi</th><th>Son ödeme</th><th>Durum</th><th>e-Belge</th><th>İşlem</th></tr></thead><tbody>
        {shown.length===0&&<tr><td colSpan={7}><div className="pl-empty">Kayıt yok.</div></td></tr>}
        {shown.map((r)=><tr key={r.id}><td>{byId[r.customer_id]?<Link to={`/panel/musteriler/${r.customer_id}`} className="strong">{byId[r.customer_id].title}</Link>:'—'}{r.note&&<div className="sub">{r.note}</div>}{r.source==='paraşüt'&&!r.note&&<div className="sub">Paraşüt'te kesildi</div>}{r.payment_link&&invStatus(r)!=='ödendi'&&<div className="sub">kart linki eklendi</div>}<ReviewNote row={r}/></td><td className="pl-num">{fmtTL(r.amount)}</td><td className="pl-num">{fmtDate(r.issue_date)}</td><td className="pl-num">{fmtDate(r.due_date)}</td><td><InvoiceBadge row={r}/>{r.paid_date&&<div className="sub">{fmtDate(r.paid_date)}</div>}{paidSource(r)&&<div className="sub">{paidSource(r)}</div>}</td><td><EDocCell row={r} onDone={load}/></td><td><div className="pl-actions">{invStatus(r)!=='ödendi'&&<><PaymentLinkButton row={r} onDone={load}/><PaymentMessageButton row={r} customer={byId[r.customer_id]}/><PaidButton row={r} customer={byId[r.customer_id]} onDone={load}/></>}<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({mode:'edit',data:{...r}})}>Düzenle</button>{!r.parasut_invoice_id&&<button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(r)}>Sil</button>}</div></td></tr>)}
      </tbody></table></div>
    {modal&&<InvoiceForm title={modal.mode==='new'?'Yeni fatura kaydı':'Fatura kaydını düzenle'} initial={modal.data} custs={custs} cts={cts} onClose={()=>setModal(null)} onSave={save}/>}
  </div>
}
