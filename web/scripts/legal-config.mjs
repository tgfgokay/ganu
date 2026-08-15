import { CROSS_BORDER_STATUSES,LEGAL_CONSENT_FLOW_VERSION,LEGAL_RETENTION_VERSION,LEGAL_TEXT_VERSION } from '../src/legal/policy.js'
const FIELDS={
  tradeName:'GANU_LEGAL_TRADE_NAME',address:'GANU_LEGAL_ADDRESS',taxOffice:'GANU_LEGAL_TAX_OFFICE',
  taxNumber:'GANU_LEGAL_TAX_NUMBER',mersisNumber:'GANU_LEGAL_MERSIS_NUMBER',registryOffice:'GANU_LEGAL_REGISTRY_OFFICE',registryNumber:'GANU_LEGAL_REGISTRY_NUMBER',
  email:'GANU_LEGAL_EMAIL',phone:'GANU_LEGAL_PHONE',approvedAt:'GANU_LEGAL_APPROVED_AT',textVersion:'GANU_LEGAL_TEXT_VERSION',
  retentionVersion:'GANU_LEGAL_RETENTION_VERSION',crossBorderStatus:'GANU_LEGAL_CROSS_BORDER_STATUS',consentFlowVersion:'GANU_LEGAL_CONSENT_FLOW_VERSION'
}
export function readLegalIdentity(env=process.env){
  const value=Object.fromEntries(Object.entries(FIELDS).map(([key,name])=>[key,String(env[name]||'').trim()]))
  const missing=Object.entries(value).filter(([,v])=>!v).map(([key])=>key)
  const invalid=[]
  if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))invalid.push('email')
  if(value.taxNumber&&!/^\d{10}$/.test(value.taxNumber))invalid.push('taxNumber')
  if(value.mersisNumber&&!/^\d{16}$/.test(value.mersisNumber))invalid.push('mersisNumber')
  if(value.phone&&value.phone.replace(/\D/g,'').length<10)invalid.push('phone')
  if(value.textVersion&&value.textVersion!==LEGAL_TEXT_VERSION)invalid.push('textVersion')
  if(value.retentionVersion&&value.retentionVersion!==LEGAL_RETENTION_VERSION)invalid.push('retentionVersion')
  if(value.consentFlowVersion&&value.consentFlowVersion!==LEGAL_CONSENT_FLOW_VERSION)invalid.push('consentFlowVersion')
  if(value.crossBorderStatus&&!CROSS_BORDER_STATUSES.includes(value.crossBorderStatus))invalid.push('crossBorderStatus')
  if(value.approvedAt){
    const parsed=new Date(`${value.approvedAt}T00:00:00Z`)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value.approvedAt)||Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value.approvedAt||parsed>Date.now())invalid.push('approvedAt')
  }
  const placeholder=/\b(?:test|tbd|todo|placeholder|örnek|example)\b/i
  for(const [key,current] of Object.entries(value))if(current&&placeholder.test(current)&&!invalid.includes(key))invalid.push(key)
  return Object.freeze({...value,complete:missing.length===0&&invalid.length===0,missing:Object.freeze(missing),invalid:Object.freeze(invalid)})
}
export const LEGAL_ENV_FIELDS=Object.freeze({...FIELDS})
