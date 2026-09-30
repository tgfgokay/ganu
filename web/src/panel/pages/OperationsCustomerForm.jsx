import { useState } from 'react'
import { CUSTOMER_STATUS } from '../lib/operations-store.js'
import { GANU_INVOICE_ADDRESS as GANU } from '../lib/company.js'
import { Modal } from './_ui.jsx'

// Yeni kayıt GANU adresi ve Beykoz vergi dairesiyle başlar (sanal ofis müşterilerinin çoğu); formda değiştirilebilir.
export const emptyCustomer=()=>({title:'',contact:'',email:'',phone:'',tax_no:'',tc:'',tax_office:GANU.taxOffice,address:GANU.address,city:GANU.city,district:GANU.district,status:'aday',partner_id:'',bni:false,notes:''})
const FIELDS=Object.keys(emptyCustomer())
const digits=(v)=>String(v||'').replace(/\D/g,'')

// Paraşüt/e-Arşiv için VKN 10, TCKN 11 hane; adres il/ilçe ile birlikte zorunlu değil ama fatura öncesi uyarılır.
export function validateCustomer(f,rows=[],selfId=null){
  if(!f.title.trim())return 'Ünvan / ad soyad zorunlu.'
  if(f.tax_no&&digits(f.tax_no).length!==10)return 'Vergi no 10 hane olmalı.'
  if(f.tc&&digits(f.tc).length!==11)return 'TC kimlik no 11 hane olmalı.'
  const phone=digits(f.phone);if(phone&&!/^5\d{9}$/.test(phone)&&!/^0\d{10}$/.test(phone)&&!/^90\d{10}$/.test(phone))return 'Telefon 05xx xxx xx xx biçiminde olmalı.'
  const email=f.email.trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return 'E-posta adresi hatalı görünüyor.'
  if(email&&rows.some((r)=>r.id!==selfId&&(r.email||'').trim().toLocaleLowerCase('tr')===email.toLocaleLowerCase('tr')))return 'Bu e-posta başka bir müşteride kayıtlı; müşteri portalı için e-posta benzersiz olmalı.'
  const vkn=digits(f.tax_no);if(vkn&&rows.some((r)=>r.id!==selfId&&digits(r.tax_no)===vkn))return 'Bu vergi numarası başka bir müşteride kayıtlı.'
  return ''
}
export function customerPayload(f){const out={};for(const k of FIELDS)out[k]=typeof f[k]==='string'?f[k].trim():f[k];out.tax_no=digits(out.tax_no);out.tc=digits(out.tc);out.partner_id=out.partner_id||null;out.bni=!!out.bni;return out}
export const missingForInvoice=(c)=>[['vergi no / TC',c?.tax_no||c?.tc],['vergi dairesi',c?.tax_office||c?.tc],['adres',c?.address],['il',c?.city],['ilçe',c?.district],['e-posta',c?.email]].filter(([,v])=>!v).map(([k])=>k)

const isGanuAddress=(f)=>String(f.address||'').trim()===GANU.address&&String(f.city||'').trim()===GANU.city&&String(f.district||'').trim()===GANU.district

// Sade form: görünür alanlar ünvan, tür (şirket/şahıs), vergi bilgisi, iletişim; adres varsayılan GANU adresi,
// durum/iş ortağı/BNI/not "Diğer bilgiler" altında.
export default function CustomerForm({title,initial,partners=[],onClose,onSave}){
  const [f,setF]=useState(()=>({...emptyCustomer(),...Object.fromEntries(Object.entries(initial||{}).map(([k,v])=>[k,v??(k==='bni'?false:'')]))})),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [kind,setKind]=useState(()=>f.tc&&!f.tax_no?'sahis':'sirket'),[ganuAddr,setGanuAddr]=useState(()=>isGanuAddress(f)),[moreOpen]=useState(()=>Boolean(f.partner_id||f.bni||f.notes))
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  const toggleGanu=(on)=>{setGanuAddr(on);if(on)setF((s)=>({...s,address:GANU.address,city:GANU.city,district:GANU.district}))}
  const submit=async(e)=>{e.preventDefault();setBusy(true);setError('')
    const out={...f,...(kind==='sirket'?{tc:''}:{tax_no:''}),...(ganuAddr?{address:GANU.address,city:GANU.city,district:GANU.district}:{})}
    try{const msg=await onSave(out);if(msg)setError(msg)}catch(err){setError(err?.message||'Kaydedilemedi.')}finally{setBusy(false)}}
  const seg=(k,label)=><button type="button" className={`pl-btn pl-btn-sm ${kind===k?'pl-btn-solid':'pl-btn-ghost'}`} aria-pressed={kind===k} onClick={()=>setKind(k)}>{label}</button>
  return <Modal title={title} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="cust-form" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button></>}>
    <form id="cust-form" className="pl-form" onSubmit={submit}>
      {error&&<div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
      <div className="pl-field"><label>{kind==='sirket'?'Şirket ünvanı *':'Ad soyad *'}</label><input value={f.title} onChange={(e)=>set('title',e.target.value)} placeholder={kind==='sirket'?'ör. Aydın Yazılım Ltd. Şti.':'ör. Ayşe Yılmaz'} required autoFocus/></div>
      <div style={{display:'flex',gap:8}} role="group" aria-label="Müşteri türü">{seg('sirket','Şirket')}{seg('sahis','Şahıs')}</div>
      <div className="two">{kind==='sirket'
        ?<div className="pl-field"><label>Vergi no</label><input value={f.tax_no} onChange={(e)=>set('tax_no',e.target.value)} placeholder="10 hane" inputMode="numeric"/></div>
        :<div className="pl-field"><label>TC kimlik no</label><input value={f.tc} onChange={(e)=>set('tc',e.target.value)} placeholder="11 hane" inputMode="numeric"/></div>}
        <div className="pl-field"><label>Vergi dairesi</label><input value={f.tax_office} onChange={(e)=>set('tax_office',e.target.value)}/></div></div>
      <div className="two"><div className="pl-field"><label>E-posta (fatura buraya gider)</label><input type="email" value={f.email} onChange={(e)=>set('email',e.target.value)}/></div><div className="pl-field"><label>Telefon</label><input value={f.phone} onChange={(e)=>set('phone',e.target.value)} placeholder="05.."/></div></div>
      {kind==='sirket'&&<div className="pl-field"><label>Yetkili kişi</label><input value={f.contact} onChange={(e)=>set('contact',e.target.value)}/></div>}
      <div className="pl-field"><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={ganuAddr} onChange={(e)=>toggleGanu(e.target.checked)}/>Fatura adresi GANU ofisi: {GANU.address}, {GANU.district} / {GANU.city}</label></div>
      {!ganuAddr&&<><div className="pl-field"><label>Fatura adresi</label><textarea value={f.address} onChange={(e)=>set('address',e.target.value)} placeholder="Mahalle, cadde/sokak, no"/></div>
        <div className="two"><div className="pl-field"><label>İl</label><input value={f.city} onChange={(e)=>set('city',e.target.value)}/></div><div className="pl-field"><label>İlçe</label><input value={f.district} onChange={(e)=>set('district',e.target.value)}/></div></div></>}
      <details open={moreOpen} style={{marginTop:4}}><summary style={{cursor:'pointer',fontSize:14,color:'#475569'}}>Diğer bilgiler · durum: {f.status}</summary>
        <div className="two" style={{marginTop:10}}><div className="pl-field"><label>Durum</label><select value={f.status} onChange={(e)=>set('status',e.target.value)}>{CUSTOMER_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}</select></div><div className="pl-field"><label>İş ortağı (yönlendiren)</label><select value={f.partner_id} onChange={(e)=>set('partner_id',e.target.value)}><option value="">— Yok / doğrudan —</option>{partners.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
        {kind==='sahis'&&<div className="pl-field"><label>Yetkili / irtibat kişisi</label><input value={f.contact} onChange={(e)=>set('contact',e.target.value)}/></div>}
        <div className="pl-field"><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={!!f.bni} onChange={(e)=>set('bni',e.target.checked)}/>BNI Nişantaşı kaynaklı müşteri</label></div>
        <div className="pl-field"><label>Not</label><textarea value={f.notes} onChange={(e)=>set('notes',e.target.value)}/></div>
      </details>
    </form>
  </Modal>
}
