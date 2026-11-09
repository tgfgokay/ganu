// Tek seferlik yetkili profil; sözleşmeye özel alanlar genel profilden önce gelir.
export function contractProfiles(get:(key:string)=>string|undefined){
  const read=(key:string)=>{try{const value=JSON.parse(get(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{return null}}
  return {company:read('GANU_CONTRACT_COMPANY_JSON')||{},documentSettings:read('GANU_CONTRACT_DOCUMENT_SETTINGS_JSON')||{},privacyNotice:read('GANU_CUSTOMER_PRIVACY_NOTICE_JSON')}
}
export function resolveContractInput({contract,customer,quote=null}:any,profile:ReturnType<typeof contractProfiles>){
  const scope=Array.isArray(quote?.service_scope)?quote.service_scope:profile.documentSettings.package_scopes?.[contract.package]
  return {contract,customer,quote,company:profile.company,documentSettings:{...profile.documentSettings,...(scope?{service_scope:scope}:{}),...contract.document_settings},privacyNotice:contract.privacy_notice||profile.privacyNotice}
}
