import { useEffect,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { customers,contracts,mail,documents,requests,inspections,DOC_TYPES,REQUEST_STATUS,fileToStoredUrl } from '../lib/operations-store.js'
import { SecureLink } from '../components/SecureAsset.jsx'
import { fmtDate } from './_ui.jsx'
export default function OperationsCustomerDetail(){
  const {id}=useParams(),[customer,setCustomer]=useState(null),[data,setData]=useState(null),[busy,setBusy]=useState(false)
  const load=async()=>{const c=await customers.get(id);setCustomer(c);if(!c){setData({contracts:[],mail:[],documents:[],requests:[],inspections:[]});return}const [ct,ml,docs,req,ins]=await Promise.all([contracts.list(),mail.list(),documents.list(),requests.list(),inspections.list()]);setData({contracts:ct.filter((x)=>x.customer_id===id),mail:ml.filter((x)=>x.customer_id===id),documents:docs.filter((x)=>x.customer_id===id),requests:req.filter((x)=>x.customer_id===id),inspections:ins.filter((x)=>x.customer_id===id)})}
  useEffect(()=>{load()},[id])
  const upload=async(e)=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const stored=await fileToStoredUrl(file,{prefix:'customers',customerId:id});await documents.create({customer_id:id,name:file.name,type:'diger',file_url:stored,note:'Personel panelinden yüklendi'});await load()}finally{setBusy(false);e.target.value=''}}
  if(!data)return <div className="pl-empty">Yükleniyor…</div>
  if(!customer)return <div className="pl-empty">Müşteri bulunamadı. <Link to="/panel/musteriler">Listeye dön</Link></div>
  return <div><div className="pl-head"><div><div className="pl-crumb"><Link to="/panel/musteriler">← Müşteriler</Link></div><h1>{customer.title}</h1><p>{customer.contact||'—'} · {customer.status||'—'}</p></div></div>
    <div className="pl-card"><div className="pl-card-b"><div className="pl-kv"><div><span className="k">E-posta</span><span className="v">{customer.email||'—'}</span></div><div><span className="k">Telefon</span><span className="v">{customer.phone||'—'}</span></div><div><span className="k">Vergi dairesi/no</span><span className="v">{customer.tax_office||'—'} · {customer.tax_no||'—'}</span></div></div></div></div>
    <Section title="Sözleşmeler" rows={data.contracts} render={(x)=><><b>{x.package}</b> · {fmtDate(x.start_date)}–{fmtDate(x.end_date)} · {x.status}</>}/>
    <Section title="Kargo & Posta" rows={data.mail} render={(x)=><>{x.type} · {x.sender||'—'} · {fmtDate(x.received_date)} · {x.status}</>}/>
    <div className="pl-card" style={{marginTop:20}}><div className="pl-card-h"><h2>Evraklar</h2><label className="pl-btn pl-btn-ghost pl-btn-sm">{busy?'Yükleniyor…':'Evrak yükle'}<input hidden type="file" accept="image/*,application/pdf" disabled={busy} onChange={upload}/></label></div><div className="pl-card-b">{data.documents.length===0&&<div className="pl-empty">Evrak yok.</div>}{data.documents.map((x)=><div className="pl-row" key={x.id}><div className="grow"><div className="t1">{x.name}</div><div className="t2">{DOC_TYPES.find((d)=>d.v===x.type)?.l||x.type} · {fmtDate(x.created_at)}</div></div><SecureLink stored={x.file_url} target="_blank" rel="noreferrer">Aç ↗</SecureLink></div>)}</div></div>
    <div className="pl-card" style={{marginTop:20}}><div className="pl-card-h"><h2>Talepler</h2></div><div className="pl-card-b">{data.requests.length===0&&<div className="pl-empty">Talep yok.</div>}{data.requests.map((x)=><div className="pl-row" key={x.id}><div className="grow"><div className="t1">{x.kind}</div><div className="t2">{x.note||'—'} · {fmtDate(x.created_at)}</div></div><select value={x.status} onChange={async(e)=>{await requests.update(x.id,{status:e.target.value});load()}}>{REQUEST_STATUS.map((s)=><option key={s}>{s}</option>)}</select></div>)}</div></div>
    <Section title="Yoklama" rows={data.inspections} render={(x)=><>{fmtDate(x.date)} · {x.result} · {x.note||'—'}</>}/>
  </div>
}
function Section({title,rows,render}){return <div className="pl-card" style={{marginTop:20}}><div className="pl-card-h"><h2>{title}</h2></div><div className="pl-card-b">{rows.length===0&&<div className="pl-empty">Kayıt yok.</div>}{rows.map((x)=><div className="pl-row" key={x.id}><div className="grow">{render(x)}</div></div>)}</div></div>}
