import { useEffect,useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { stampTaxes,contracts,customers } from '../lib/operations-store.js'
import { DV_RATE_PER_MILLE,DV_PAYERS,customerShare,declarationDeadline,monthKey,stampTaxAmount,stampTaxBase,termMonths } from '../lib/stamp-tax.js'
import { localISO } from '../lib/dates.js'
import { Modal,fmtDate,fmtTL } from './_ui.jsx'

// Damga vergisi defteri: her imza/yenileme bir satır. Belge tarihinin ayındaki kayıtlar izleyen ayın 26'sına kadar
// beyan edilir. Tutar veritabanında hesaplanır (matrah × binde oran × nüsha).
const today=()=>localISO()
const prevMonth=()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return localISO(d).slice(0,7)}
const monthLabel=(m)=>new Date(`${m}-01T00:00:00`).toLocaleDateString('tr-TR',{month:'long',year:'numeric'})
const num=(n)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
const share=(r)=>customerShare(r.amount,r.payer)

function csv(rows,month){
  const head=['Belge tarihi','Taraf','VKN/TCKN','Tür','Dönem başı','Dönem sonu','Matrah','Oran (binde)','Nüsha','Damga vergisi','Ödeyen','Müşteriden tahsil','Tahsil tarihi','Beyan dönemi','Not']
  const cell=(v)=>{const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  const lines=rows.map((r)=>[r.doc_date,r.party_title,r.party_tax_id,r.kind,r.period_start,r.period_end,num(r.base),num(r.rate_per_mille),r.copies,num(r.amount),r.payer,num(share(r)),r.collected_at,r.declared_period,r.notes].map(cell).join(';'))
  const blob=new Blob(['﻿'+[head.join(';'),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`damga-vergisi-${month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

// Sözleşmeden öneri: dönem, matrah (KDV hariç toplam), tür (sözleşmenin ilk kaydı mı yenileme mi).
export function draftFromContract(c,cust,hasEarlier){
  const months=termMonths(c.start_date,c.end_date)
  return {contract_id:c.id,customer_id:c.customer_id,party_title:cust?.title||'',party_tax_id:cust?.tax_no||cust?.tc||'',kind:hasEarlier?'yenileme':'sözleşme',
    doc_date:c.start_date,period_start:c.start_date,period_end:c.end_date,base:stampTaxBase(c.price,c.billing_period,months),rate_per_mille:DV_RATE_PER_MILLE,copies:1,payer:'müşteri',collected_at:'',declared_period:'',notes:''}
}

function StampForm({initial,onClose,onSave}){
  const [f,setF]=useState(()=>Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v??'']))),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const set=(k,v)=>setF((s)=>({...s,[k]:v})),dv=stampTaxAmount(f.base,f.rate_per_mille,f.copies)
  const submit=async(e)=>{e.preventDefault();if(!String(f.party_title).trim())return setError('Taraf ünvanı zorunlu.');if(!(Number(f.base)>0))return setError('Matrah sıfırdan büyük olmalı.');if(f.declared_period&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.declared_period))return setError('Beyan dönemi YYYY-AA biçiminde olmalı.');setBusy(true);setError('')
    const {id,amount,created_at,...rest}=f
    try{await onSave({...rest,party_title:String(rest.party_title).trim(),customer_id:rest.customer_id||null,contract_id:rest.contract_id||null,period_start:rest.period_start||null,period_end:rest.period_end||null,base:Number(rest.base),rate_per_mille:Number(rest.rate_per_mille),copies:Number(rest.copies)||1,collected_at:rest.collected_at||null,declared_period:rest.declared_period||null})}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  return <Modal title={initial.id?'Damga vergisi kaydı':'Yeni damga vergisi kaydı'} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="dv-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="dv-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      <div className="two"><div className="pl-field"><label>Taraf (müşteri) *</label><input value={f.party_title} onChange={(e)=>set('party_title',e.target.value)} required/></div><div className="pl-field"><label>VKN / TCKN</label><input value={f.party_tax_id} onChange={(e)=>set('party_tax_id',e.target.value)} inputMode="numeric"/></div></div>
      <div className="two"><div className="pl-field"><label>Tür</label><select value={f.kind} onChange={(e)=>set('kind',e.target.value)}><option value="sözleşme">sözleşme</option><option value="yenileme">yenileme</option></select></div><div className="pl-field"><label>Belge (imza) tarihi *</label><input type="date" value={f.doc_date} onChange={(e)=>set('doc_date',e.target.value)} required/></div></div>
      <div className="two"><div className="pl-field"><label>Dönem başı</label><input type="date" value={f.period_start} onChange={(e)=>set('period_start',e.target.value)}/></div><div className="pl-field"><label>Dönem sonu</label><input type="date" value={f.period_end} onChange={(e)=>set('period_end',e.target.value)}/></div></div>
      <div className="two"><div className="pl-field"><label>Matrah (₺, KDV hariç toplam bedel) *</label><input type="number" min="0" step="0.01" value={f.base} onChange={(e)=>set('base',e.target.value)} required/></div><div className="pl-field"><label>Oran (binde)</label><input type="number" min="0.01" max="20" step="0.01" value={f.rate_per_mille} onChange={(e)=>set('rate_per_mille',e.target.value)}/></div></div>
      <div className="two"><div className="pl-field"><label>İmzalı asıl nüsha</label><input type="number" min="1" max="10" value={f.copies} onChange={(e)=>set('copies',e.target.value)}/></div><div className="pl-field"><label>Ödeyen</label><select value={f.payer} onChange={(e)=>set('payer',e.target.value)}>{DV_PAYERS.map((p)=><option key={p} value={p}>{p}</option>)}</select></div></div>
      <div className="pl-alert"><span className="msg">Damga vergisi <b>{fmtTL(dv)}</b> · müşteriden tahsil <b>{fmtTL(customerShare(dv,f.payer))}</b>. KDV sözleşmede ayrıca gösterilmiyorsa matraha KDV dahil tutarı yazın.</span></div>
      <div className="two"><div className="pl-field"><label>Müşteriden tahsil tarihi</label><input type="date" value={f.collected_at} onChange={(e)=>set('collected_at',e.target.value)}/></div><div className="pl-field"><label>Beyan dönemi (YYYY-AA)</label><input value={f.declared_period} onChange={(e)=>set('declared_period',e.target.value)} placeholder={monthKey(f.doc_date)}/></div></div>
      <div className="pl-field"><label>Not</label><textarea value={f.notes} onChange={(e)=>set('notes',e.target.value)}/></div>
    </form>
  </Modal>
}

export default function OperationsStampTax(){
  const [rows,setRows]=useState([]),[cts,setCts]=useState([]),[custs,setCusts]=useState([]),[month,setMonth]=useState(prevMonth()),[modal,setModal]=useState(null),[error,setError]=useState('')
  const load=async()=>{try{const [st,ct,cs]=await Promise.all([stampTaxes.list(),contracts.list(),customers.list()]);setRows(st);setCts(ct);setCusts(cs)}catch{setError('Damga vergisi kayıtları yüklenemedi.')}}
  useEffect(()=>{load()},[])
  const byCust=useMemo(()=>Object.fromEntries(custs.map((c)=>[c.id,c])),[custs])
  const inMonth=useMemo(()=>rows.filter((r)=>monthKey(r.doc_date)===month).sort((a,b)=>a.doc_date.localeCompare(b.doc_date)),[rows,month])
  const months=useMemo(()=>[...new Set([prevMonth(),today().slice(0,7),...rows.map((r)=>monthKey(r.doc_date))])].sort().reverse(),[rows])
  // Kaydı olmayan aktif sözleşme dönemleri (teklif dışında açılan sözleşmeler ve yenilemeler buraya düşer).
  const missing=useMemo(()=>cts.filter((c)=>c.status!=='sona erdi'&&!rows.some((r)=>r.contract_id===c.id&&r.period_start===c.start_date)),[cts,rows])
  const total=inMonth.reduce((n,r)=>n+Number(r.amount||0),0),toCollect=inMonth.filter((r)=>!r.collected_at).reduce((n,r)=>n+share(r),0),undeclared=inMonth.filter((r)=>!r.declared_period)
  const uncollectedAll=rows.filter((r)=>!r.collected_at&&share(r)>0)
  const save=async(payload)=>{if(modal.data.id)await stampTaxes.update(modal.data.id,payload);else await stampTaxes.create(payload);setModal(null);load()}
  const collect=async(r)=>{await stampTaxes.update(r.id,{collected_at:today()});load()}
  const declare=async()=>{if(!undeclared.length)return;if(!confirm(`${monthLabel(month)} dönemindeki ${undeclared.length} kayıt "${month} beyannamesinde beyan edildi" olarak işaretlensin mi?`))return;await Promise.all(undeclared.map((r)=>stampTaxes.update(r.id,{declared_period:month})));load()}
  const del=async(r)=>{if(!confirm(`${r.party_title} · ${fmtTL(r.amount)} damga vergisi kaydı silinsin mi?`))return;await stampTaxes.remove(r.id);load()}
  const fromContract=(c)=>setModal({data:draftFromContract(c,byCust[c.customer_id],rows.some((r)=>r.contract_id===c.id))})
  return <div>
    <div className="pl-head"><div><h1>Damga Vergisi</h1><p>Sözleşme ve yenilemelerin damga vergisi (binde {String(DV_RATE_PER_MILLE).replace('.',',')}, müşteri öder). Belge ayının vergisi izleyen ayın 26'sına kadar beyan edilir.</p></div><button className="pl-btn pl-btn-teal" onClick={()=>setModal({data:{party_title:'',party_tax_id:'',kind:'sözleşme',doc_date:today(),period_start:'',period_end:'',base:'',rate_per_mille:DV_RATE_PER_MILLE,copies:1,payer:'müşteri',collected_at:'',declared_period:'',notes:'',customer_id:'',contract_id:''}})}>+ Kayıt</button></div>
    {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
    {uncollectedAll.length>0&&<div className="pl-alert"><span className="msg"><b>{uncollectedAll.length} kayıtta</b> müşteriden tahsil edilmemiş damga vergisi var: {fmtTL(uncollectedAll.reduce((n,r)=>n+share(r),0))}.</span></div>}
    <div className="pl-toolbar"><select value={month} onChange={(e)=>setMonth(e.target.value)}>{months.map((m)=><option key={m} value={m}>{monthLabel(m)}</option>)}</select><span className="spacer"/>
      <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!inMonth.length} onClick={()=>csv(inMonth,month)}>Excel (CSV) indir</button>
      <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!undeclared.length} onClick={declare}>Ayı beyan edildi işaretle</button></div>
    <div className="pl-stats"><div className="pl-stat"><div className="lab">{monthLabel(month)} · beyan edilecek</div><div className="val">{fmtTL(total)}</div><div className="sub">son gün {fmtDate(declarationDeadline(month))}</div></div><div className="pl-stat"><div className="lab">Müşteriden tahsil bekleyen</div><div className={`val${toCollect>0?' warn':''}`}>{fmtTL(toCollect)}</div></div><div className="pl-stat"><div className="lab">Beyan işaretlenmemiş</div><div className="val">{undeclared.length}</div></div></div>
    <div className="pl-tablewrap"><table className="pl-table"><thead><tr><th>Belge tarihi</th><th>Taraf</th><th>Tür · dönem</th><th>Matrah</th><th>DV</th><th>Tahsil</th><th>Beyan</th><th>İşlem</th></tr></thead><tbody>
      {inMonth.length===0&&<tr><td colSpan={8}><div className="pl-empty">Bu ay kayıt yok.</div></td></tr>}
      {inMonth.map((r)=><tr key={r.id}><td className="pl-num">{fmtDate(r.doc_date)}</td>
        <td>{r.customer_id?<Link to={`/panel/musteriler/${r.customer_id}`} className="strong">{r.party_title}</Link>:<span className="strong">{r.party_title}</span>}<div className="sub">{r.party_tax_id||'—'}</div></td>
        <td>{r.kind}<div className="sub">{r.period_start?`${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`:'—'}</div></td>
        <td className="pl-num">{fmtTL(r.base)}<div className="sub">binde {num(r.rate_per_mille)} × {r.copies}</div></td>
        <td className="pl-num"><b>{fmtTL(r.amount)}</b><div className="sub">{r.payer}</div></td>
        <td>{share(r)===0?<span className="sub">—</span>:r.collected_at?<span className="sub">✓ {fmtDate(r.collected_at)}</span>:<button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>collect(r)}>Tahsil edildi ({fmtTL(share(r))})</button>}</td>
        <td>{r.declared_period||<span className="sub">—</span>}</td>
        <td><div className="pl-actions"><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>setModal({data:r})}>Düzenle</button><button className="pl-btn pl-btn-danger pl-btn-sm" onClick={()=>del(r)}>Sil</button></div></td></tr>)}
    </tbody></table></div>
    {missing.length>0&&<details className="pl-card" style={{marginTop:20}}><summary className="pl-card-h" style={{cursor:'pointer'}}><h2>Damga vergisi kaydı olmayan sözleşme dönemleri ({missing.length})</h2></summary><div className="pl-card-b">
      {missing.map((c)=><div className="pl-row" key={c.id}><div className="grow"><div className="t1">{byCust[c.customer_id]?.title||'—'}</div><div className="t2">{c.package} · {c.billing_period} · {fmtTL(c.price)} · {fmtDate(c.start_date)} – {fmtDate(c.end_date)}</div></div><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>fromContract(c)}>Kayıt aç</button></div>)}
    </div></details>}
    {modal&&<StampForm initial={modal.data} onClose={()=>setModal(null)} onSave={save}/>}
  </div>
}
