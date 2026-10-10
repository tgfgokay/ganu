import { useRef,useState } from 'react'
import { contracts,customers,quotes } from '../lib/operations-store.js'
import { contractGmailUrl,contractHtml,contractNo } from '../lib/contract-document.js'
import { Modal } from './_ui.jsx'

// Hizmet sözleşmesi önizlemesi: teklif kabul edilince hemen, sonra müşteri sayfası ve Sözleşmeler'den açılır.
// Açılır pencere engeline takılmamak için belge iframe'de gösterilir; yazdırma iframe'den yapılır.
export function ContractPreview({doc,note,onClose}){
  const ref=useRef(null)
  const mail=(e)=>{if(!doc.customer.email&&!confirm('Müşteride e-posta adresi yok. Alıcısız ileti açılsın mı?'))e.preventDefault()}
  return <Modal wide title={`${contractNo(doc.contract,doc.quote)} · ${doc.customer.title} · hizmet sözleşmesi`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button><a className="pl-btn pl-btn-ghost" href={contractGmailUrl(doc)} target="_blank" rel="noopener noreferrer" onClick={mail}>E-postayla gönder</a><button className="pl-btn pl-btn-solid" onClick={()=>ref.current?.contentWindow?.print()}>Yazdır / PDF</button></>}>
    {note&&<div className="pl-alert" style={{marginTop:0}}><span className="ic">✓</span><span className="msg">{note}</span></div>}
    <p className="sub" style={{margin:'0 0 8px'}}>Sözleşme ve EK-1 müşteri ve sözleşme kaydından dolduruldu. "Yazdır / PDF" → "PDF olarak kaydet", e-postaya ekleyin. İmzalı taramayı müşteri sayfası › Belgeler'e "Sözleşme" türüyle yükleyip "İmzalı sözleşmeyi doğrula" ile bağlayın. EK-2 adres tahsis, EK-3 KVKK aydınlatma ve EK-4 gerçek faydalanıcı belgeleri ayrıca verilir.</p>
    <iframe ref={ref} title="Hizmet sözleşmesi" srcDoc={contractHtml(doc)} style={{width:'100%',height:'70vh',border:'1px solid #e2e8f0',borderRadius:8,background:'#eef1f5'}}/>
  </Modal>
}

// Belge verisini toplar: sözleşme, müşterinin tam kaydı ve sözleşmeyi açan teklif (indirim bilgisi için).
export async function loadContractDoc({contract=null,contractId=null,customer=null,quote=null}){
  const k=contract||await contracts.get(contractId)
  if(!k)throw new Error('Sözleşme kaydı okunamadı.')
  const [cu,q]=await Promise.all([customer?.title?customer:customers.get(k.customer_id),quote?Promise.resolve(quote):quotes.list().then((qs)=>qs.find((x)=>x.contract_id===k.id)||null).catch(()=>null)])
  if(!cu)throw new Error('Müşteri kaydı okunamadı.')
  return {contract:k,customer:cu,quote:q}
}

export function ContractDocButton({contract,contractId,customer,quote,className='pl-btn pl-btn-ghost pl-btn-sm',label='Sözleşme belgesi'}){
  const [doc,setDoc]=useState(null),[busy,setBusy]=useState(false)
  const open=async()=>{setBusy(true);try{setDoc(await loadContractDoc({contract,contractId,customer,quote}))}catch(err){alert(err?.message||'Belge hazırlanamadı.')}finally{setBusy(false)}}
  return <><button type="button" className={className} disabled={busy} onClick={open}>{busy?'Hazırlanıyor…':label}</button>{doc&&<ContractPreview doc={doc} onClose={()=>setDoc(null)}/>}</>
}
