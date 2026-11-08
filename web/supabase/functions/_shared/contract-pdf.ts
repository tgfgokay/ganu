// Edge Function adapter. PDF/fontkit sürümleri browser bağımlılıklarıyla sabitlenir.
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { createContractPdfWithLibraries,documentSourceError } from './contract-pdf-core.js'
import { validPrivacyPdfPath } from './contract-documents.js'
export { ContractPackageIncompleteError } from './contract-pdf-core.js'

// JS çekirdeğin default-null alanları Deno tarafından daraltılmasın; kayıt şekli ortak validator'da denetlenir.
export async function createContractPdf(input: Record<string,any>, options: {allowIncomplete?:boolean} = {}) {
  const privacy=input.privacyNotice
  if(privacy?.storage_path&&(!privacy.paragraphs?.length)&&!privacy.pdfBytes){
    if(!validPrivacyPdfPath(privacy.storage_path))throw documentSourceError('privacy_pdf_path_invalid','Müşteri KVKK PDF konumu geçersiz.')
    const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
    if(!url||!key)throw documentSourceError('privacy_pdf_source_unavailable','Müşteri KVKK PDF kaynağı okunamıyor.')
    const response=await fetch(`${url}/storage/v1/object/secure-docs/${privacy.storage_path}`,{headers:{Authorization:`Bearer ${key}`,apikey:key}})
    if(!response.ok||Number(response.headers.get('content-length')||0)>8*1024*1024)throw documentSourceError('privacy_pdf_source_unavailable','Müşteri KVKK PDF kaynağı okunamıyor.')
    const bytes=new Uint8Array(await response.arrayBuffer())
    if(bytes.length>8*1024*1024)throw documentSourceError('privacy_pdf_too_large','Müşteri KVKK PDF kaynağı 8 MB sınırını aşıyor.')
    input={...input,privacyNotice:{...privacy,pdfBytes:bytes}}
  }
  return createContractPdfWithLibraries(input,options,{PDFDocument,rgb,fontkit})
}
