import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { customers,mail,invoices,inspections,requests,contracts,invStatus } from '../lib/operations-store.js'
import { daysUntil } from '../lib/dates.js'
import { fmtDate,fmtTL } from './_ui.jsx'

// Operasyon = tüm müşterilerde iş bekleyenler. Her satır ilgili müşterinin ilgili sekmesini açar (orada durum,
// sonuç ve yenileme işlemleri var); tüm-müşteri listeleri alttaki bağlantılarda.
const OPEN_MAIL=['geldi','bildirildi'],DONE_REQ=['tamamlandı','reddedildi']
const all=[['Tüm posta & kargo','/panel/kargo'],['Tüm faturalar & gelir','/panel/faturalar'],['Tüm sözleşmeler','/panel/sozlesmeler'],['Tüm yoklamalar','/panel/yoklama'],['Tüm talepler','/panel/talepler'],['Tüm belgeler','/panel/belgeler']]
const waited=(iso)=>{const n=iso?-daysUntil(iso):0;return n<=0?'bugün geldi':`${n} gündür bekliyor`}
const byOldest=(k)=>(a,b)=>String(a[k]||'').localeCompare(String(b[k]||''))

export default function OperationsOverview(){
  const [d,setD]=useState(null),[error,setError]=useState('')
  useEffect(()=>{Promise.all([customers.list(),mail.list(),invoices.list(),inspections.list(),requests.list(),contracts.list()]).then(([cs,ml,inv,ins,req,ct])=>setD({cs,ml,inv,ins,req,ct})).catch(()=>setError('Kayıtlar yüklenemedi.'))},[])
  if(error)return <div className="pl-alert" role="alert"><span className="msg">{error}</span></div>
  if(!d)return <div className="pl-empty">Yükleniyor…</div>
  const name=Object.fromEntries(d.cs.map((c)=>[c.id,c.title]))
  // Tebligat: bildirilmemiş olan önce, sonra en eski (yasal süre alındığı gün başlar).
  const teb=d.ml.filter((x)=>x.type==='tebligat'&&OPEN_MAIL.includes(x.status)).sort((a,b)=>Number(b.status==='geldi')-Number(a.status==='geldi')||byOldest('received_date')(a,b))
  const post=d.ml.filter((x)=>x.type!=='tebligat'&&x.status==='geldi').sort(byOldest('received_date'))
  const late=d.inv.filter((x)=>invStatus(x)==='gecikti'&&x.einvoice_status!=='iptal').sort(byOldest('due_date'))
  const ending=d.ct.filter((x)=>x.status==='aktif'&&x.end_date&&daysUntil(x.end_date)<=30&&daysUntil(x.end_date)>=-60).sort(byOldest('end_date'))
  const pendIns=d.ins.filter((x)=>x.result==='bekleniyor').sort(byOldest('date')),openReq=d.req.filter((x)=>!DONE_REQ.includes(x.status)).sort(byOldest('created_at'))
  const lists=[
    ['Bekleyen tebligat','Hukuki süreler tebligatla başlar; önce müşteriye bildirin, sonra teslim edin.',teb,'posta',(x)=><>{x.sender||'—'} · {fmtDate(x.received_date)} · {waited(x.received_date)} · <b>{x.status==='geldi'?'müşteriye bildirilmedi':'bildirildi, teslim bekliyor'}</b></>,(x)=>x.status==='geldi'],
    ['Bildirilmemiş posta/kargo','Gelen ama müşteriye haber verilmemiş gönderiler.',post,'posta',(x)=><>{x.type} · {x.sender||'—'} · {fmtDate(x.received_date)} · {waited(x.received_date)}{x.shelf?` · raf ${x.shelf}`:''}</>,()=>false],
    ['Gecikmiş fatura','Son ödeme tarihi geçmiş, ödenmemiş.',late,'faturalar',(x)=><>{fmtTL(x.amount)} · son ödeme {fmtDate(x.due_date)}{x.note?` · ${x.note}`:''}</>,()=>true],
    ['Bitişi yaklaşan sözleşme','30 gün içinde bitiyor ya da son 60 günde bitmiş; müşteri sayfasından yenileyin.',ending,'sozlesmeler',(x)=>{const n=daysUntil(x.end_date);return <>{x.package} · {n>=0?`${n} gün kaldı`:`${-n} gün önce bitti`} · {fmtDate(x.end_date)}</>},(x)=>daysUntil(x.end_date)<0],
    ['Sonucu beklenen yoklama','Memur ziyareti kaydı açık; sonucu müşteri sayfasından girin.',pendIns,'yoklama',(x)=><>{fmtDate(x.date)}{x.note?` · ${x.note}`:''}</>,()=>false],
    ['Açık talep','Müşteriden gelen, tamamlanmamış.',openReq,'talepler',(x)=><>{x.kind} · {fmtDate(x.created_at)} · {x.status}</>,()=>false],
  ]
  const busy=lists.filter(([,,rows])=>rows.length),idle=lists.filter(([,,rows])=>!rows.length).map(([t])=>t.toLocaleLowerCase('tr'))
  return <div>
    <div className="pl-head"><div><h1>Operasyon</h1><p>Tüm müşterilerde iş bekleyenler, en acil olan üstte. Satıra tıklayınca müşterinin ilgili sekmesi açılır.</p></div><Link className="pl-btn pl-btn-teal" to="/panel/kargo?yeni=1">+ Gelen posta/kargo</Link></div>
    {busy.map(([title,hint,rows,tab,render,urgent])=><div className="pl-card" style={{marginBottom:16}} key={title}><div className="pl-card-h"><div><h2>{title}</h2><p style={{marginTop:3,fontSize:13,color:'var(--muted)'}}>{hint}</p></div><span className="count">{rows.length}</span></div><div className="pl-card-b">
      {rows.map((x)=>{const body=<><div className="grow"><div className="t1">{name[x.customer_id]||'Müşteri bulunamadı'}</div><div className="t2">{render(x)}</div></div>{x.customer_id&&<span className="t2" aria-hidden="true">Aç →</span>}</>,cls=`pl-row${urgent(x)?' pl-row-urgent':''}`
        return x.customer_id?<Link key={x.id} to={`/panel/musteriler/${x.customer_id}?sekme=${tab}`} className={cls} style={{textDecoration:'none',color:'inherit'}}>{body}</Link>:<div key={x.id} className={cls}>{body}</div>})}
    </div></div>)}
    {idle.length>0&&<div className="pl-card" style={{marginBottom:16}}><div className="pl-card-b"><p style={{padding:'8px 12px',fontSize:13.5,color:'var(--muted)'}}>✓ Bekleyen yok: {idle.join(', ')}.</p></div></div>}
    <div className="pl-card"><div className="pl-card-h"><h2>Tüm kayıtlar</h2></div><div className="pl-card-b" style={{display:'flex',flexWrap:'wrap',gap:8,padding:14}}>{all.map(([l,href])=><Link key={href} className="pl-btn pl-btn-ghost pl-btn-sm" to={href}>{l}</Link>)}</div></div>
  </div>
}
