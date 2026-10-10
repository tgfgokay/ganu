import { useEffect,useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { stampTaxes,contracts,customers,documents } from '../lib/operations-store.js'
import { DV_FILING_DAYS,DV_RATE_PER_MILLE,DV_PAYERS,customerShare,filingDeadline,monthKey,stampTaxAmount,stampTaxBase,termMonths } from '../lib/stamp-tax.js'
import { localISO } from '../lib/dates.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'

// Damga vergisi defteri (0015): kabulde "taslak" açılır; imzalı sözleşme yüklenip "İmzalandı" ile belge tarihi girilince
// kesinleşir. GANU sürekli damga vergisi mükellefi değil: vergi imza tarihinden itibaren 15 gün içinde Damga Vergisi
// Beyannamesi ile beyan edilip ödenir. Müşteriden tahsil, beyan ve vergi ödemesi ayrı tarihlerle izlenir; beyan edilmiş
// kaydın matrahı ve tarihi değişmez. Tutar veritabanında hesaplanır (matrah × binde oran, tek nüsha).
const today=()=>localISO()
const monthLabel=(m)=>new Date(`${m}-01T00:00:00`).toLocaleDateString('tr-TR',{month:'long',year:'numeric'})
const num=(n)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
const share=(r)=>customerShare(r.amount,r.payer)
const PAPER={taslak:['imza bekliyor','b-mektup'],'imzalı':['beyan bekliyor','b-warn'],beyan_edildi:['beyan edildi','b-bild'],'ödendi':['vergi ödendi','b-aktif']}
const late=(r)=>r.paper_status==='imzalı'&&filingDeadline(r.doc_date)<today()

function csv(rows,month){
  const head=['Belge (imza) tarihi','Son beyan günü','Taraf','VKN/TCKN','Tür','Dönem başı','Dönem sonu','Matrah','Oran (binde)','Damga vergisi','Ödeyen','Müşteriden tahsil','Tahsil tarihi','Durum','Beyan tarihi','Vergi ödeme tarihi','Not']
  const cell=(v)=>{const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  const lines=rows.map((r)=>[r.doc_date,filingDeadline(r.doc_date),r.party_title,r.party_tax_id,r.kind,r.period_start,r.period_end,num(r.base),num(r.rate_per_mille),num(r.amount),r.payer,num(share(r)),r.collected_at,PAPER[r.paper_status]?.[0]||r.paper_status,r.filed_at,r.tax_paid_at,r.notes].map(cell).join(';'))
  const blob=new Blob(['﻿'+[head.join(';'),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`damga-vergisi-${month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

// Sözleşmeden öneri: dönem, matrah (KDV hariç toplam), tür (sözleşmenin ilk kaydı mı yenileme mi). İmza tarihi personelce girilir.
export function draftFromContract(c,cust,hasEarlier){
  const months=termMonths(c.start_date,c.end_date)
  return {contract_id:c.id,customer_id:c.customer_id,party_title:cust?.title||'',party_tax_id:cust?.tax_no||cust?.tc||'',kind:hasEarlier||c.previous_contract_id?'yenileme':'sözleşme',
    doc_date:'',period_start:c.start_date,period_end:c.end_date,base:stampTaxBase(c.price,c.billing_period,months),rate_per_mille:DV_RATE_PER_MILLE,payer:'müşteri',collected_at:'',notes:''}
}

function StampForm({initial,onClose,onSave}){
  const [f,setF]=useState(()=>Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v??'']))),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v})),dv=stampTaxAmount(f.base,f.rate_per_mille),frozen=['beyan_edildi','ödendi'].includes(initial.paper_status)
  const submit=async(e)=>{e.preventDefault();if(!String(f.party_title).trim())return setError('Taraf ünvanı zorunlu.');if(!(Number(f.base)>0))return setError('Matrah sıfırdan büyük olmalı.');setBusy(true);setError('')
    const {id,amount,created_at,paper_status,filed_at,tax_paid_at,declared_period,signed_document_id,...rest}=f
    // Durum yalnız "İmzalandı / Beyan edildi / Vergi ödendi" işlemleriyle ilerler; form durumu değiştirmez. Yeni kayıt taslak açılır.
    try{await onSave({...rest,party_title:String(rest.party_title).trim(),customer_id:rest.customer_id||null,contract_id:rest.contract_id||null,...(initial.paper_status&&initial.paper_status!=='taslak'?{doc_date:rest.doc_date||null}:{doc_date:null}),period_start:rest.period_start||null,period_end:rest.period_end||null,base:Number(rest.base),rate_per_mille:Number(rest.rate_per_mille),collected_at:rest.collected_at||null})}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={initial.id?'Damga vergisi kaydı':'Yeni damga vergisi kaydı'} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="dv-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="dv-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      {frozen&&<div className="pl-alert"><span className="msg">Beyan edilmiş kayıt: taraf, matrah, oran ve imza tarihi değiştirilemez.</span></div>}
      <div className="two"><div className="pl-field"><label>Taraf (müşteri) *</label><input value={f.party_title} disabled={frozen} onChange={(e)=>set('party_title',e.target.value)} required/></div><div className="pl-field"><label>VKN / TCKN</label><input value={f.party_tax_id} onChange={(e)=>set('party_tax_id',e.target.value)} inputMode="numeric"/></div></div>
      <div className="two"><div className="pl-field"><label>Tür</label><select value={f.kind} onChange={(e)=>set('kind',e.target.value)}><option value="sözleşme">sözleşme</option><option value="yenileme">yenileme</option></select></div>{initial.paper_status&&initial.paper_status!=='taslak'?<div className="pl-field"><label>İmza tarihi</label><input type="date" max={today()} value={f.doc_date} disabled={frozen} onChange={(e)=>set('doc_date',e.target.value)}/></div>:<div className="pl-field"><label>İmza</label><input value="İmzalandı ile işlenir" disabled/></div>}</div>
      <div className="two"><div className="pl-field"><label>Dönem başı</label><input type="date" value={f.period_start} onChange={(e)=>set('period_start',e.target.value)}/></div><div className="pl-field"><label>Dönem sonu</label><input type="date" value={f.period_end} onChange={(e)=>set('period_end',e.target.value)}/></div></div>
      <div className="two"><div className="pl-field"><label>Matrah (₺, KDV hariç toplam bedel) *</label><input type="number" min="0" step="0.01" value={f.base} disabled={frozen} onChange={(e)=>set('base',e.target.value)} required/></div><div className="pl-field"><label>Oran (binde)</label><input type="number" min="0.01" max="20" step="0.01" value={f.rate_per_mille} disabled={frozen} onChange={(e)=>set('rate_per_mille',e.target.value)}/></div></div>
      <div className="pl-field"><label>Ödeyen</label><select value={f.payer} onChange={(e)=>set('payer',e.target.value)}>{DV_PAYERS.map((p)=><option key={p} value={p}>{p}</option>)}</select></div>
      <div className="pl-alert"><span className="msg">Damga vergisi <b>{fmtTL(dv)}</b> · müşteriden tahsil <b>{fmtTL(customerShare(dv,f.payer))}</b>{f.doc_date?` · son beyan günü ${fmtDate(filingDeadline(f.doc_date))}`:''}. KDV sözleşmede ayrıca gösterilmiyorsa matraha KDV dahil tutarı yazın.</span></div>
      <div className="pl-field"><label>Müşteriden tahsil tarihi</label><input type="date" value={f.collected_at} onChange={(e)=>set('collected_at',e.target.value)}/></div>
      <div className="pl-field"><label>Not</label><textarea value={f.notes} onChange={(e)=>set('notes',e.target.value)}/></div>
    </form>
  </Modal>
}

// Taslağı kesinleştirir: imza tarihi + (önerilir) müşterinin yüklenmiş imzalı sözleşme belgesi.
function SignForm({row,docs,onClose,onDone}){
  const own=docs.filter((d)=>d.customer_id===row.customer_id&&d.type==='sozlesme')
  const [date,setDate]=useState(today()),[doc,setDoc]=useState(own[0]?.id||''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const submit=async()=>{if(!date)return setError('İmza tarihi zorunlu.');if(!doc)return setError('İmzalı sözleşme belgesini seçin (müşteri sayfası › Belgeler\'e "Sözleşme" türüyle yükleyin).');setBusy(true);setError('');try{await stampTaxes.update(row.id,{paper_status:'imzalı',doc_date:date,signed_document_id:doc||null});onDone()}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={`İmzalandı · ${row.party_title}`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" disabled={busy} onClick={submit}>{busy?'Kaydediliyor…':'Kesinleştir'}</button></>}>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    <div className="pl-form">
      <div className="pl-field"><label>İmza tarihi *</label><input type="date" max={today()} value={date} onChange={(e)=>setDate(e.target.value)}/></div>
      <div className="pl-field"><label>İmzalı sözleşme belgesi *</label><select value={doc} onChange={(e)=>setDoc(e.target.value)}><option value="">{own.length?'Seç…':'— Henüz yüklenmedi —'}</option>{own.map((d)=><option key={d.id} value={d.id}>{d.name} · {fmtDate(d.created_at?.slice(0,10))}</option>)}</select></div>
      <p className="sub" style={{margin:0}}>Son beyan ve ödeme günü: <b>{fmtDate(filingDeadline(date))}</b> (imzadan itibaren {DV_FILING_DAYS} gün). {own.length===0&&'İmzalı sözleşmeyi müşteri sayfası › Belgeler\'e "Sözleşme" türüyle yükleyin.'}</p>
    </div>
  </Modal>
}

export default function OperationsStampTax(){
  const [rows,setRows]=useState([]),[cts,setCts]=useState([]),[custs,setCusts]=useState([]),[docs,setDocs]=useState([]),[month,setMonth]=useState(today().slice(0,7)),[modal,setModal]=useState(null),[error,setError]=useState('')
  const load=async()=>{try{const [st,ct,cs,ds]=await Promise.all([stampTaxes.list(),contracts.list(),customers.list(),documents.list()]);setRows(st);setCts(ct);setCusts(cs);setDocs(ds)}catch{setError('Damga vergisi kayıtları yüklenemedi.')}}
  useEffect(()=>{load()},[])
  const byCust=useMemo(()=>Object.fromEntries(custs.map((c)=>[c.id,c])),[custs])
  const drafts=useMemo(()=>rows.filter((r)=>r.paper_status==='taslak'),[rows])
  const signed=useMemo(()=>rows.filter((r)=>r.paper_status!=='taslak'&&r.doc_date),[rows])
  const inMonth=useMemo(()=>signed.filter((r)=>monthKey(r.doc_date)===month).sort((a,b)=>a.doc_date.localeCompare(b.doc_date)),[signed,month])
  const months=useMemo(()=>[...new Set([today().slice(0,7),...signed.map((r)=>monthKey(r.doc_date))])].sort().reverse(),[signed])
  // Kaydı olmayan sözleşme dönemleri: kendiliğinden yenilemede (otomatik_madde) yeni damga vergisi kâğıdı doğmaz, listelenmez.
  const missing=useMemo(()=>cts.filter((c)=>c.status!=='sona erdi'&&c.renewal_basis!=='otomatik_madde'&&!rows.some((r)=>r.contract_id===c.id)),[cts,rows])
  const waiting=signed.filter((r)=>r.paper_status==='imzalı'),overdue=waiting.filter(late),nextDue=[...waiting].sort((a,b)=>a.doc_date.localeCompare(b.doc_date))[0]
  const uncollected=rows.filter((r)=>r.paper_status!=='taslak'&&!r.collected_at&&share(r)>0)
  const save=async(payload)=>{if(modal.data.id)await stampTaxes.update(modal.data.id,payload);else await stampTaxes.create(payload);setModal(null);load()}
  const act=async(r,patch)=>{try{await stampTaxes.update(r.id,patch);load()}catch(err){alert(err?.message||'Kaydedilemedi.')}}
  const del=async(r)=>{if(!confirm(`${r.party_title} · ${fmtTL(r.amount)} damga vergisi kaydı silinsin mi?`))return;await stampTaxes.remove(r.id);load()}
  const fromContract=(c)=>setModal({kind:'form',data:draftFromContract(c,byCust[c.customer_id],rows.some((r)=>r.contract_id===c.id))})
  const PaperBadge=({r})=>{const [l,c]=PAPER[r.paper_status]||[r.paper_status,'b-mektup'];return <span className={`pl-badge ${late(r)?'b-danger':c}`}>{late(r)?'süresi geçti':l}</span>}
  return <div>
    <div className="pl-head"><div><h1>Damga Vergisi</h1><p>Sözleşme damga vergisi binde {String(DV_RATE_PER_MILLE).replace('.',',')}, müşteri öder. GANU sürekli mükellef olmadığından vergi imza tarihinden itibaren {DV_FILING_DAYS} gün içinde Damga Vergisi Beyannamesi ile beyan edilip ödenir.</p></div><button className="pl-btn pl-btn-teal" onClick={()=>setModal({kind:'form',data:{party_title:'',party_tax_id:'',kind:'sözleşme',doc_date:'',period_start:'',period_end:'',base:'',rate_per_mille:DV_RATE_PER_MILLE,payer:'müşteri',collected_at:'',notes:'',customer_id:'',contract_id:''}})}>+ Kayıt</button></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    {overdue.length>0&&<div className="pl-alert" role="alert"><span className="msg"><b>{overdue.length} kaydın</b> beyan süresi geçti; gecikme faizi ve ceza doğabilir. Hemen beyan edin.</span></div>}
    {uncollected.length>0&&<div className="pl-alert"><span className="msg"><b>{uncollected.length} kayıtta</b> müşteriden tahsil edilmemiş damga vergisi var: {fmtTL(uncollected.reduce((n,r)=>n+share(r),0))}.</span></div>}
    {drafts.length>0&&<div className="pl-card" style={{marginBottom:16}}><div className="pl-card-h"><h2>İmza bekleyenler ({drafts.length})</h2><span className="count">taslak · beyana girmez</span></div><div className="pl-card-b">
      {drafts.map((r)=><div className="pl-row" key={r.id}><div className="grow"><div className="t1">{r.customer_id?<Link to={`/panel/musteriler/${r.customer_id}`}>{r.party_title}</Link>:r.party_title} · {r.kind}</div><div className="t2">matrah {fmtTL(r.base)} · damga vergisi ≈ {fmtTL(r.amount)} · {r.period_start?`${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`:'dönem yok'}</div></div>
        <div className="pl-actions"><button className="pl-btn pl-btn-teal pl-btn-sm" onClick={()=>setModal({kind:'sign',data:r})}>İmzalandı</button><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({kind:'form',data:r})}>Düzenle</button><button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(r)}>Sil</button></div></div>)}
    </div></div>}
    <div className="pl-toolbar"><select value={month} onChange={(e)=>setMonth(e.target.value)}>{months.map((m)=><option key={m} value={m}>{monthLabel(m)} (imza ayı)</option>)}</select><span className="spacer"/>
      <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!inMonth.length} onClick={()=>csv(inMonth,month)}>Excel (CSV) indir</button></div>
    <div className="pl-stats"><div className="pl-stat"><div className="lab">{monthLabel(month)} · damga vergisi</div><div className="val">{fmtTL(inMonth.reduce((n,r)=>n+Number(r.amount||0),0))}</div></div><div className="pl-stat"><div className="lab">Beyan bekleyen</div><div className={`val${overdue.length?' warn':''}`}>{waiting.length}</div>{nextDue&&<div className="sub">en yakın son gün {fmtDate(filingDeadline(nextDue.doc_date))}</div>}</div><div className="pl-stat"><div className="lab">Müşteriden tahsil bekleyen</div><div className="val">{fmtTL(uncollected.reduce((n,r)=>n+share(r),0))}</div></div></div>
    <div className="pl-tablewrap"><table className="pl-table"><thead><tr><th>İmza · son gün</th><th>Taraf</th><th>Tür · dönem</th><th>Matrah</th><th>DV</th><th>Durum</th><th>Tahsil</th><th>İşlem</th></tr></thead><tbody>
      {inMonth.length===0&&<tr><td colSpan={8}><div className="pl-empty">Bu ay imzalanmış kayıt yok.</div></td></tr>}
      {inMonth.map((r)=><tr key={r.id}><td className="pl-num">{fmtDate(r.doc_date)}<div className="sub">son gün {fmtDate(filingDeadline(r.doc_date))}</div></td>
        <td>{r.customer_id?<Link to={`/panel/musteriler/${r.customer_id}`} className="strong">{r.party_title}</Link>:<span className="strong">{r.party_title}</span>}<div className="sub">{r.party_tax_id||'—'}{r.signed_document_id?' · imzalı belge ✓':' · imzalı belge yok'}</div></td>
        <td>{r.kind}<div className="sub">{r.period_start?`${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`:'—'}</div></td>
        <td className="pl-num">{fmtTL(r.base)}<div className="sub">binde {num(r.rate_per_mille)}</div></td>
        <td className="pl-num"><b>{fmtTL(r.amount)}</b><div className="sub">{r.payer}</div></td>
        <td><PaperBadge r={r}/>{r.filed_at&&<div className="sub">beyan {fmtDate(r.filed_at)}</div>}{r.tax_paid_at&&<div className="sub">ödeme {fmtDate(r.tax_paid_at)}</div>}</td>
        <td>{share(r)===0?<span className="sub">—</span>:r.collected_at?<span className="sub">✓ {fmtDate(r.collected_at)}</span>:<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>act(r,{collected_at:today()})}>Tahsil edildi ({fmtTL(share(r))})</button>}</td>
        <td><div className="pl-actions">
          {r.paper_status==='imzalı'&&<button className="pl-btn pl-btn-teal pl-btn-sm" onClick={()=>{if(confirm(`${r.party_title} damga vergisi Damga Vergisi Beyannamesi ile beyan edildi mi?`))act(r,{paper_status:'beyan_edildi',filed_at:today(),declared_period:monthKey(r.doc_date)})}}>Beyan edildi</button>}
          {r.paper_status==='beyan_edildi'&&<button className="pl-btn pl-btn-teal pl-btn-sm" onClick={()=>{if(confirm(`${fmtTL(r.amount)} damga vergisi vergi dairesine ödendi mi?`))act(r,{paper_status:'ödendi',tax_paid_at:today()})}}>Vergi ödendi</button>}
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({kind:'form',data:r})}>Düzenle</button>
          {r.paper_status==='imzalı'&&<button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(r)}>Sil</button>}</div></td></tr>)}
    </tbody></table></div>
    {missing.length>0&&<details className="pl-card" style={{marginTop:20}}><summary className="pl-card-h" style={{cursor:'pointer'}}><h2>Damga vergisi kaydı olmayan sözleşmeler ({missing.length})</h2></summary><div className="pl-card-b">
      {missing.map((c)=><div className="pl-row" key={c.id}><div className="grow"><div className="t1">{byCust[c.customer_id]?.title||'—'}</div><div className="t2">{c.package} · {c.billing_period} · {fmtTL(c.price)} · {fmtDate(c.start_date)} – {fmtDate(c.end_date)}</div></div><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>fromContract(c)}>Kayıt aç</button></div>)}
    </div></details>}
    {modal?.kind==='form'&&<StampForm initial={modal.data} onClose={()=>setModal(null)} onSave={save}/>}
    {modal?.kind==='sign'&&<SignForm row={modal.data} docs={docs} onClose={()=>setModal(null)} onDone={()=>{setModal(null);load()}}/>}
  </div>
}
