import { useEffect,useState } from 'react'
import { expenses,partners,commissionPayments,notifications,requests,documents } from '../lib/operations-store.js'

const sources={
  masraflar:{title:'Masraflar',note:'Şirket içi gider kayıtları.',source:expenses},
  ortaklar:{title:'İş Ortakları & Komisyon',note:'İş ortağı ve komisyon kayıtları.',source:partners,extra:commissionPayments},
  bildirimler:{title:'Bildirimler',note:'Kayıt geçmişi görüntülenir. E-posta, SMS ve WhatsApp gönderimi kurulum bekliyor.',source:notifications},
  talepler:{title:'Talepler',note:'Müşteri ve operasyon talepleri.',source:requests},
  belgeler:{title:'Belgeler',note:'Özel depodaki belge kayıtları. Dosya erişimi ayrıca yetkilendirilir.',source:documents},
}
const money=(n)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0)
export default function OperationsRecords({kind}){const cfg=sources[kind], [rows,setRows]=useState([]),[extra,setExtra]=useState([]),[error,setError]=useState('');useEffect(()=>{let live=true;Promise.all([cfg.source.list(),cfg.extra?cfg.extra.list():Promise.resolve([])]).then(([a,b])=>{if(live){setRows(a);setExtra(b)}}).catch(()=>live&&setError('Kayıtlar yüklenemedi.')).finally(()=>{});return()=>{live=false}},[cfg]);return <div><div className="pl-head"><div><h1>{cfg.title}</h1><p>{cfg.note}</p></div></div>{error&&<div className="pl-alert" role="alert">{error}</div>}<div className="pl-card"><div className="pl-card-b">{rows.length===0?<p className="t2">Henüz kayıt yok.</p>:<div className="pl-tablewrap"><table><thead><tr><th>Kayıt</th><th>Durum</th><th>Tarih</th><th>Tutar</th></tr></thead><tbody>{rows.map((r)=><tr key={r.id}><td>{r.title||r.name||r.event||r.type||r.note||r.id}</td><td>{r.status||'—'}</td><td>{r.created_at?new Date(r.created_at).toLocaleDateString('tr-TR'):'—'}</td><td>{r.amount!=null?money(r.amount):'—'}</td></tr>)}</tbody></table></div>}{cfg.extra&&<p className="t2">Komisyon ödeme kaydı: {extra.length}</p>}</div></div></div>}
