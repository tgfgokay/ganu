import { LEGAL_ENV_FIELDS,readLegalIdentity } from './legal-config.mjs'
const identity=readLegalIdentity()
if(!identity.complete){
  const names=[...identity.missing,...identity.invalid].map((key)=>LEGAL_ENV_FIELDS[key]).join(', ')
  console.error(`PROD GATE FAIL: doğrulanmış yasal kimlik/metin onayı eksik veya geçersiz: ${names}`)
  process.exit(2)
}
console.log('LEGAL READINESS PASS (satıcı/veri sorumlusu kimliği + metin onay tarihi tamam)')
