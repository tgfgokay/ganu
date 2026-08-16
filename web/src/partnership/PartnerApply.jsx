import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import RichTitle from '../site/RichTitle.jsx'
import { PARTNER_PROFESSIONS, partnershipPayload, showPartnerCommercialFields } from '../site/partnership.js'

const rise={hidden:{opacity:0,y:34},show:{opacity:1,y:0,transition:{duration:.75,ease:[.19,1,.22,1]}}}
const stagger={hidden:{},show:{transition:{staggerChildren:.08}}}
const reveal={initial:'hidden',whileInView:'show',viewport:{once:true,amount:.2}}
const emptyForm=()=>({name:'',profession:PARTNER_PROFESSIONS[0],contact:'',email:'',phone:'',iban:'',tax_no:'',notes:''})

export default function PartnerApply({formRef,profession,p,locale}){
  const [f,setF]=useState(emptyForm())
  const [busy,setBusy]=useState(false)
  const [sent,setSent]=useState(false)
  const [err,setErr]=useState('')
  const set=(k,v)=>setF((s)=>({...s,[k]:v}))
  useEffect(()=>{if(profession)setF((s)=>({...s,profession}))},[profession])
  const submit=async(e)=>{
    e.preventDefault()
    if(!f.name.trim()||!f.email.trim()){setErr(p.required);return}
    setErr('');setBusy(true)
    try{const {partnerApply}=await import('../panel/lib/store.js');await partnerApply(partnershipPayload(f,locale));setSent(true)}
    catch{setErr(p.sendError)}finally{setBusy(false)}
  }
  return <section className="section pa-apply-sec" id={locale==='tr'?'basvuru':'apply'} ref={formRef}>
    <div className="wrap">
      <motion.div className="shead" {...reveal} variants={stagger}><motion.span className="kicker" variants={rise}>{p.applyKicker}</motion.span><motion.h2 variants={rise}><RichTitle value={p.applyTitle} dot /></motion.h2></motion.div>
      {sent?<motion.div className="pa-success" {...reveal} variants={rise}><div className="pa-success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg></div><h3>{p.successTitle}</h3><p>{p.successText}</p></motion.div>:
      <motion.form className="pa-form" {...reveal} variants={rise} onSubmit={submit}>
        <div className="pa-grid">
          <div className="pa-field"><label htmlFor="pa-name">{p.fields.name}</label><input id="pa-name" value={f.name} onChange={(e)=>set('name',e.target.value)} placeholder={p.placeholders.name} required /></div>
          <div className="pa-field"><label htmlFor="pa-prof">{p.fields.profession}</label><select id="pa-prof" value={f.profession} onChange={(e)=>set('profession',e.target.value)}>{PARTNER_PROFESSIONS.map((x)=><option key={x} value={x}>{locale==='tr'?x:({'Mali müşavir':'Accountant / tax adviser','Avukat':'Lawyer','Marka & patent vekili':'IP adviser','Şirket kuruluşu danışmanı':'Company formation adviser','Diğer':'Other'}[x]||x)}</option>)}</select></div>
          <div className="pa-field"><label htmlFor="pa-contact">{p.fields.contact}</label><input id="pa-contact" value={f.contact} onChange={(e)=>set('contact',e.target.value)} placeholder={p.placeholders.contact} /></div>
          <div className="pa-field"><label htmlFor="pa-phone">{p.fields.phone}</label><input id="pa-phone" value={f.phone} onChange={(e)=>set('phone',e.target.value)} placeholder={p.placeholders.phone} inputMode="tel" /></div>
          <div className="pa-field"><label htmlFor="pa-email">{p.fields.email}</label><input id="pa-email" type="email" value={f.email} onChange={(e)=>set('email',e.target.value)} placeholder={p.placeholders.email} required /></div>
          {showPartnerCommercialFields(locale)&&<div className="pa-field"><label htmlFor="pa-tax">{p.fields.tax}</label><input id="pa-tax" value={f.tax_no} onChange={(e)=>set('tax_no',e.target.value)} placeholder={p.placeholders.tax} /></div>}
          {showPartnerCommercialFields(locale)&&<div className="pa-field pa-wide"><label htmlFor="pa-iban">{p.fields.iban} <span className="pa-hint">— {p.fields.ibanHint}</span></label><input id="pa-iban" value={f.iban} onChange={(e)=>set('iban',e.target.value)} placeholder={p.placeholders.iban} /></div>}
          <div className="pa-field pa-wide"><label htmlFor="pa-note">{p.fields.note}</label><textarea id="pa-note" rows={2} value={f.notes} onChange={(e)=>set('notes',e.target.value)} placeholder={p.placeholders.note} /></div>
        </div>
        {err&&<p className="pa-err" role="alert">{err}</p>}
        <div className="pa-foot"><button type="submit" className="btn btn-solid big" disabled={busy}>{busy?p.sending:`${p.send} →`}</button><p className="pa-kvkk">{p.privacy}</p></div>
      </motion.form>}
    </div>
  </section>
}
