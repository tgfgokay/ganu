import { useEffect,useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { invoices,customers,contracts,invStatus } from '../lib/operations-store.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'

const today=()=>new Date().toISOString().slice(0,10)
const plusDays=(iso,n)=>{const d=new Date(`${iso}T00:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
const INV_CLS={bekliyor:'b-warn','ödendi':'b-aktif',gecikti:'b-danger'}
export const InvoiceBadge=({row})=>{const s=invStatus(row);return <span className={`pl-badge ${INV_CLS[s]||'b-mektup'}`}>{s}</span>}
export const emptyInvoice=(customerId='')=>{const issue=today();return {customer_id:customerId,contract_id:'',amount:'',issue_date:issue,due_date:plusDays(issue,5),status:'bekliyor',paid_date:'',einvoice_no:'',note:''}}

// Tutarlar KDV dahildir. e-Belge otomatik kesimi kurulana kadar Paraşüt'te kesilen fatura numarası elle girilir.
export function invoicePayload(f){const paid=f.status==='ödendi';const no=f.einvoice_no.trim();return {customer_id:f.customer_id,contract_id:f.contract_id||null,amount:Number(f.amount)||0,issue_date:f.issue_date,due_date:f.due_date||null,status:paid?'ödendi':'bekliyor',paid_date:paid?(f.paid_date||today()):null,einvoice_no:no||null,einvoice_status:no?(f.einvoice_status||'kesildi'):null,note:f.note.trim()}}
export const markPaid=(row)=>invoices.update(row.id,{status:'ödendi',paid_date:today()})

export function InvoiceForm({title,initial,custs,cts,lockCustomer=false,onClose,onSave}){
  const [f,setF]=useState({...emptyInvoice(),...Object.fromEntries(Object.entries(initial||{}).map(([k,v])=>[k,v??'']))}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const own=cts.filter((c)=>c.customer_id===f.customer_id)
  const pickContract=(id)=>{const c=cts.find((x)=>x.id===id);setF((s)=>({...s,contract_id:id,amount:s.amount===''&&c?String(c.price):s.amount}))}
  const submit=async(e)=>{e.preventDefault();if(!f.customer_id)return setError('Müşteri seçin.');if(!(Number(f.amount)>0))return setError('Tutar sıfırdan büyük olmalı.');setBusy(true);setError('');try{await onSave(invoicePayload(f))}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={title} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="inv-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="inv-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      <div className="pl-field"><label>Müşteri *</label><select value={f.customer_id} disabled={lockCustomer} onChange={(e)=>setF((s)=>({...s,customer_id:e.target.value,contract_id:''}))} required><option value="">Seç…</option>{custs.map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div className="pl-field"><label>Sözleşme</label><select value={f.contract_id} onChange={(e)=>pickContract(e.target.value)}><option value="">— Bağlama —</option>{own.map((c)=><option key={c.id} value={c.id}>{c.package} · {fmtDate(c.start_date)}–{fmtDate(c.end_date)} · {fmtTL(c.price)}</option>)}</select></div>
      <div className="two"><div className="pl-field"><label>Tutar (₺, KDV dahil) *</label><input type="number" min="0" step="0.01" value={f.amount} onChange={(e)=>set('amount',e.target.value)} required/></div><div className="pl-field"><label>Durum</label><select value={f.status} onChange={(e)=>set('status',e.target.value)}><option value="bekliyor">bekliyor</option><option value="ödendi">ödendi</option></select></div></div>
      <div className="two"><div className="pl-field"><label>Fatura tarihi</label><input type="date" value={f.issue_date} onChange={(e)=>set('issue_date',e.target.value)}/></div><div className="pl-field"><label>Son ödeme</label><input type="date" value={f.due_date} onChange={(e)=>set('due_date',e.target.value)}/></div></div>
      {f.status==='ödendi'&&<div className="pl-field"><label>Ödeme tarihi</label><input type="date" value={f.paid_date||today()} onChange={(e)=>set('paid_date',e.target.value)}/></div>}
      <div className="pl-field"><label>Fatura no (Paraşüt'te kesildiyse)</label><input value={f.einvoice_no} onChange={(e)=>set('einvoice_no',e.target.value)} placeholder="ör. GAN2026000000001"/></div>
      <div className="pl-field"><label>Not</label><textarea value={f.note} onChange={(e)=>set('note',e.target.value)} placeholder="ör. Ekim 2026 dönemi · havale"/></div>
    </form>
  </Modal>
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
  return <div>
    <div className="pl-head"><div><h1>Faturalar & Gelir</h1><p>Tutarlar KDV dahil. Otomatik e-Belge kurulum bekliyor; Paraşüt'te kestiğin faturanın numarasını kayda girebilirsin.</p></div><button className="pl-btn pl-btn-teal" disabled={!custs.length} onClick={()=>setModal({mode:'new',data:emptyInvoice()})}>+ Fatura kaydı</button></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <div className="pl-stats"><div className="pl-stat"><div className="lab">Tahsil edilen</div><div className="val teal">{fmtTL(sum(paid))}</div></div><div className="pl-stat"><div className="lab">Bekleyen</div><div className="val">{fmtTL(sum(open))}</div></div><div className="pl-stat"><div className="lab">Geciken</div><div className={`val${late.length?' warn':''}`}>{late.length}</div></div></div>
    <div className="pl-tablewrap"><div className="pl-toolbar"><input type="search" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Müşteri ara…"/><select value={filter} onChange={(e)=>setFilter(e.target.value)}>{['tümü','bekliyor','gecikti','ödendi'].map((s)=><option key={s}>{s}</option>)}</select><span className="spacer"/><span style={{fontSize:13,color:'#64748b'}}>{shown.length} kayıt</span></div>
      <table className="pl-table"><thead><tr><th>Müşteri</th><th>Tutar</th><th>Fatura tarihi</th><th>Son ödeme</th><th>Durum</th><th>Fatura no</th><th>İşlem</th></tr></thead><tbody>
        {shown.length===0&&<tr><td colSpan={7}><div className="pl-empty">Kayıt yok.</div></td></tr>}
        {shown.map((r)=><tr key={r.id}><td>{byId[r.customer_id]?<Link to={`/panel/musteriler/${r.customer_id}`} className="strong">{byId[r.customer_id].title}</Link>:'—'}{r.note&&<div className="sub">{r.note}</div>}</td><td className="pl-num">{fmtTL(r.amount)}</td><td className="pl-num">{fmtDate(r.issue_date)}</td><td className="pl-num">{fmtDate(r.due_date)}</td><td><InvoiceBadge row={r}/>{r.paid_date&&<div className="sub">{fmtDate(r.paid_date)}</div>}</td><td>{r.einvoice_no||'—'}</td><td><div className="pl-actions">{invStatus(r)!=='ödendi'&&<button className="pl-btn pl-btn-teal pl-btn-sm" onClick={async()=>{await markPaid(r);load()}}>Ödendi</button>}<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({mode:'edit',data:{...r}})}>Düzenle</button><button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(r)}>Sil</button></div></td></tr>)}
      </tbody></table></div>
    {modal&&<InvoiceForm title={modal.mode==='new'?'Yeni fatura kaydı':'Fatura kaydını düzenle'} initial={modal.data} custs={custs} cts={cts} onClose={()=>setModal(null)} onSave={save}/>}
  </div>
}
