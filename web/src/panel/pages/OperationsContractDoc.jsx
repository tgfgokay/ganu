import { useEffect,useState } from 'react'
import { contracts,customers,quotes,documents,resolveStoredUrl } from '../lib/operations-store.js'
import { buildContractPackage,contractHtml,contractNo,contractPackageInput,requiresOriginalContract } from '../lib/contract-document.js'
import { createContractPdf,loadContractPackageInfo } from '../lib/contract-pdf.js'
import { Modal } from './_ui.jsx'

const lines=(text)=>String(text||'').split('\n').map(x=>x.trim()).filter(Boolean)
function settingsDraft(settings={},privacy={}){
  const list=(x)=>Array.isArray(x)?x:[]
  return {...settings,signature_date:settings.signature_date||'',deposit:settings.deposit??'',daily_address_penalty:settings.daily_address_penalty??'',penalty_terms:settings.penalty_terms||'',business_hours:settings.business_hours||'',rules_effective_date:settings.rules_effective_date||'',extra_services:settings.extra_services??'',scope:list(settings.service_scope).join('\n'),tariff_rows:list(settings.extra_service_tariff).map(x=>({...x})),privacy_source:privacy?.source||'',privacy_version:privacy?.version||'',privacy_verified:String(privacy?.verified_at||'').slice(0,10),privacy_text:list(privacy?.paragraphs).join('\n\n'),additional_documents:list(settings.additional_documents),meeting_duration:settings.meeting?.duration||'',meeting_start:settings.meeting?.start||'',meeting_end:settings.meeting?.end||'',inventory_rows:list(settings.inventory).map(x=>({...x})),handover_date:settings.handover_date||''}
}

// Kabul sonrası ortak kaynak ve eksik listesi; gerçek PDF sunucudan indirilir, gönderim outbox'tadır.
export function ContractPreview({doc,note,onClose}){
  const [current,setCurrent]=useState(doc),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const [draft,setDraft]=useState(()=>settingsDraft(doc.documentSettings||doc.contract.document_settings,doc.privacyNotice||doc.contract.privacy_notice))
  const pkg=buildContractPackage(contractPackageInput(current))
  const [showDraft,setShowDraft]=useState(()=>!requiresOriginalContract(doc.contract)),[originalUrl,setOriginalUrl]=useState('')
  useEffect(()=>{let active=true;if(doc.originalDocument?.file_url)resolveStoredUrl(doc.originalDocument.file_url).then(url=>{if(active)setOriginalUrl(url||'')}).catch(()=>{});return()=>{active=false}},[doc.originalDocument?.file_url])
  useEffect(()=>{let active=true;loadContractPackageInfo(doc.contract.id).then(info=>{if(!active)return;setCurrent(d=>({...d,company:info.company,documentSettings:info.documentSettings,privacyNotice:info.privacyNotice}));setDraft(settingsDraft(info.documentSettings,info.privacyNotice))}).catch(()=>{if(active)setError('Sunucu belge profili okunamadı. Yerel kayıt önizlemesi gösteriliyor; PDF indirmek için belge servisi kurulmalı.')});return()=>{active=false}},[doc.contract.id])
  const change=(key,value)=>setDraft(d=>({...d,[key]:value}))
  const field=(label,key,type='text')=><div className="pl-field"><label htmlFor={`document-${key}`}>{label}</label><input id={`document-${key}`} type={type} value={draft[key]??''} onChange={e=>change(key,e.target.value)} {...(type==='number'?{min:0,step:'0.01'}:{})}/></div>
  const textField=(label,key,rows=3)=><div className="pl-field"><label htmlFor={`document-${key}`}>{label}</label><textarea id={`document-${key}`} rows={rows} value={draft[key]||''} onChange={e=>change(key,e.target.value)}/></div>
  const tableEditor=(label,key,columns)=><div className="pl-field"><label>{label}</label><div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr>{columns.map(c=><th key={c.key} style={{textAlign:'left'}}>{c.label}</th>)}<th>İşlem</th></tr></thead><tbody>{(draft[key]||[]).map((row,index)=><tr key={index}>{columns.map(c=><td key={c.key}><input aria-label={`${label} ${index+1} ${c.label}`} type={c.type||'text'} min={c.type==='number'?0:undefined} step={c.type==='number'?'0.01':undefined} value={row[c.key]??''} onChange={e=>change(key,draft[key].map((x,i)=>i===index?{...x,[c.key]:e.target.value}:x))}/></td>)}<td><button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" aria-label={`${label} ${index+1} satırını kaldır`} onClick={()=>change(key,draft[key].filter((_,i)=>i!==index))}>Kaldır</button></td></tr>)}</tbody></table></div><button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={()=>change(key,[...(draft[key]||[]),{}])}>+ Satır ekle</button></div>
  const save=async(e)=>{
    e.preventDefault();setBusy(true);setError('');setSaved('')
    try{
      if(pkg.historical)throw new Error('İmzalı / önceki sözleşme kaydı bu ekrandan yeni metinle değiştirilmez.')
      const settings={...(current.documentSettings||current.contract.document_settings||{}),signature_date:draft.signature_date,deposit:draft.deposit,daily_address_penalty:draft.daily_address_penalty,penalty_terms:draft.penalty_terms,business_hours:draft.business_hours,rules_effective_date:draft.rules_effective_date,extra_services:draft.extra_services,service_scope:lines(draft.scope),extra_service_tariff:draft.tariff_rows||[],additional_documents:draft.additional_documents||[],meeting:{duration:draft.meeting_duration,start:draft.meeting_start,end:draft.meeting_end},inventory:draft.inventory_rows||[],handover_date:draft.handover_date}
      const oldPrivacy=current.privacyNotice||current.contract.privacy_notice||{}
      const privacy=(draft.privacy_text.trim()||oldPrivacy.storage_path)?{...oldPrivacy,scope:'customer-contract',source:draft.privacy_source,version:draft.privacy_version,verified_at:draft.privacy_verified,...(draft.privacy_text.trim()?{paragraphs:draft.privacy_text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean)}:{})}:null
      const updated=await contracts.update(current.contract.id,{document_settings:settings,privacy_notice:privacy})
      setCurrent(d=>({...d,contract:updated,documentSettings:settings,privacyNotice:privacy}));setSaved('Belge alanları kaydedildi. Gönderim kuyruğundaki eksik işi yeniden çalıştırabilirsiniz.')
    }catch(err){setError(err?.message||'Belge alanları kaydedilemedi.')}finally{setBusy(false)}
  }
  const download=async()=>{
    setBusy(true);setError('')
    try{const out=await createContractPdf(contractPackageInput(current),{allowIncomplete:!pkg.ready}),url=URL.createObjectURL(new Blob([out.bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=out.attachment.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(err){setError(err?.message||'PDF hazırlanamadı.')}finally{setBusy(false)}
  }
  return <Modal wide title={`${contractNo(current.contract,current.quote)} · ${current.customer.title} · ${pkg.historical?'sözleşme arşivi':'belge paketi'}`} onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button>{originalUrl&&<a className="pl-btn pl-btn-solid" href={originalUrl} target="_blank" rel="noopener noreferrer">İmzalı asıl belgeyi aç</a>}{showDraft&&<button className="pl-btn pl-btn-solid" disabled={busy} onClick={download}>{busy?'Hazırlanıyor…':pkg.historical?'Yeni metinden inceleme PDF indir':pkg.ready?'PDF paketini indir':'İnceleme PDF indir'}</button>}</>}>
    {note&&<div className="pl-alert" style={{marginTop:0}}><span className="ic">✓</span><span className="msg">{note}</span></div>}
    {pkg.historical?<div className="pl-card" style={{padding:12,marginBottom:12}}><b>İmzalı / önceki sözleşmenin asıl kaydı korunur.</b><p>{originalUrl?'Doğrulama kaydına bağlı asıl belge aşağıda gösteriliyor.':'Bu kayda bağlı imzalı asıl dosya okunamadı; müşteri Belgeler bölümünü kontrol edin.'}</p><button type="button" className="pl-btn pl-btn-ghost" onClick={()=>setShowDraft(x=>!x)}>{showDraft?'Yeni metin incelemesini kapat':'Yeni metinden ayrı inceleme taslağı aç'}</button><p className="sub">Yeni 32 maddelik metinden oluşturulan taslak, önceki tarihte imzalanmış belgenin kopyası değildir; müşteriye sözleşme aslı olarak gönderilmez.</p>{originalUrl&&<iframe title="İmzalı asıl sözleşme" src={originalUrl} style={{width:'100%',height:'65vh',border:'1px solid #e2e8f0'}}/>}</div>:<p className="sub" style={{margin:'0 0 8px'}}>Avukatın 32 maddelik metni ve ilgili ekler kayıtlardan hazırlanır. İki nüsha ve hizmet dönemi başlamadan peşin ödeme esas alınır. PDF imza alanları doldurulabilir; teklif kabulü imza yerine geçmez. İmzalı taramayı müşteri sayfası › Belgeler'e yükleyip doğrulayın.</p>}
    {error&&<p role="alert" style={{color:'#a23d22'}}>{error}</p>}{saved&&<p role="status">{saved}</p>}
    {showDraft&&<div className="pl-card" style={{padding:12,marginBottom:12}}><b>{pkg.historical?'Yeni metinden ayrı inceleme taslağı':pkg.ready?'Belge paketi gönderime hazır':'Gönderim için tamamlanacaklar'}</b>{pkg.missing.length>0&&<ul>{pkg.missing.map((x,i)=><li key={`${x.code}-${i}`}>{x.label}</li>)}</ul>}<p className="sub">Sürüm: {pkg.version}. Son avukat onayı / sürüm tarihine ilişkin ayrıca kanıt bulunmuyor. EK-3 ve EK-4, kayıt verisinden oluşturulan operasyonel formlardır; arşivde ayrı form şablonları bulunmuyor.</p>
      <ul>{pkg.checklist.map(x=><li key={x.id}>{x.label}: {x.status.replaceAll('-',' ')}</li>)}</ul>
    </div>}
    {!pkg.historical&&<details style={{marginBottom:12}}><summary>Belge alanlarını ve kaynaklarını tamamla</summary><form onSubmit={save} style={{paddingTop:12}}>
      <div className="pl-form-grid">{field('İmzaya sunulacak belge tarihi','signature_date','date')}{field('Depozito (alınmayacaksa 0 TL)','deposit','number')}{field('Adres değişikliği günlük cezai şartı (TL)','daily_address_penalty','number')}{field('Kullanım kuralları yürürlük tarihi','rules_effective_date','date')}{field('Çalışma saatleri','business_hours')}</div>
      {textField('İhlallere göre cezai şart tutarları (Madde 18.2)','penalty_terms')}{textField('Kabul edilen paket kapsamı (her satıra bir hizmet)','scope')}{textField('Kararlaştırılmış ek hizmetler (yoksa boş)','extra_services')}{tableEditor('Ek hizmet tarifesi','tariff_rows',[{key:'service',label:'Hizmet'},{key:'unit',label:'Birim'},{key:'price',label:'KDV hariç bedel (TL)',type:'number'}])}
      <details><summary>KVKK müşteri eki kaynağı</summary><p className="sub">Kuruluşun müşteri ilişkisine uygun, doğrulanmış ortak kaynağı varsa tekrar yükleme gerekmez. Burada sözleşmeye özel metin/sürüm kaydedilebilir. Web ziyaretçi aydınlatmasını müşteri eki yerine kullanmayın.</p>{current.privacyNotice?.storage_path&&<p>Ortak PDF kaynak sürümü: {current.privacyNotice.version}</p>}<div className="pl-form-grid">{field('Kaynak belge / referans','privacy_source')}{field('Metin sürümü','privacy_version')}{field('Müşteri kapsamının kaynakla doğrulandığı tarih','privacy_verified','date')}</div>{textField('Yetkili müşteri aydınlatma metni (paragrafları boş satırla ayırın)','privacy_text',7)}</details>
      <details><summary>İsteğe bağlı toplantı / demirbaş belgeleri</summary><p className="sub">Hazır ofis hizmeti bu akışta etkin değildir. Bu belgeler seçilmedikçe sanal ofis paketine eklenmez.</p>{[['meeting-room','Toplantı salonu sözleşmesi'],['inventory','Demirbaş teslim tutanağı']].map(([id,label])=><label key={id} style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={(draft.additional_documents||[]).includes(id)} onChange={e=>change('additional_documents',e.target.checked?[...(draft.additional_documents||[]),id]:(draft.additional_documents||[]).filter(x=>x!==id))}/> {label}</label>)}<div className="pl-form-grid">{field('Toplantı kullanım türü (saatlik / yarım gün vb.)','meeting_duration')}{field('Toplantı başlangıcı','meeting_start','datetime-local')}{field('Toplantı bitişi','meeting_end','datetime-local')}{field('Demirbaş teslim tarihi','handover_date','date')}</div>{tableEditor('Demirbaşlar','inventory_rows',[{key:'name',label:'Demirbaş'},{key:'quantity',label:'Adet',type:'number'},{key:'condition',label:'Teslim durumu'},{key:'serial',label:'Seri no'},{key:'note',label:'Açıklama'}])}</details>
      <button className="pl-btn pl-btn-solid" type="submit" disabled={busy}>{busy?'Kaydediliyor…':'Belge alanlarını kaydet'}</button>
    </form></details>}
    {showDraft&&<iframe sandbox="" title={pkg.historical?'Yeni metinden ayrı inceleme taslağı':'Sözleşme ve ekleri'} srcDoc={contractHtml(current)} style={{width:'100%',height:'65vh',border:'1px solid var(--paper-2, #EDE6DA)',borderRadius:8,background:'var(--paper, #F4EFE7)'}}/>}
  </Modal>
}

// Belge verisini toplar: sözleşme, müşterinin tam kaydı ve sözleşmeyi açan teklif (indirim bilgisi için).
export async function loadContractDoc({contract=null,contractId=null,customer=null,quote=null}){
  const k=contract||await contracts.get(contractId)
  if(!k)throw new Error('Sözleşme kaydı okunamadı.')
  const [cu,q]=await Promise.all([customer?.title?customer:customers.get(k.customer_id),quote?Promise.resolve(quote):quotes.list().then((qs)=>qs.find((x)=>x.contract_id===k.id)||null).catch(()=>null)])
  if(!cu)throw new Error('Müşteri kaydı okunamadı.')
  const original=k.signed_document_id?await documents.get(k.signed_document_id):null
  const originalDocument=original?.customer_id===k.customer_id&&original.type==='sozlesme'&&String(original.file_url||'').startsWith('secure:')?original:null
  return {contract:k,customer:cu,quote:q,originalDocument}
}

export function ContractDocButton({contract,contractId,customer,quote,className='pl-btn pl-btn-ghost pl-btn-sm',label='Sözleşme belgesi'}){
  const [doc,setDoc]=useState(null),[busy,setBusy]=useState(false)
  const open=async()=>{setBusy(true);try{setDoc(await loadContractDoc({contract,contractId,customer,quote}))}catch(err){alert(err?.message||'Belge hazırlanamadı.')}finally{setBusy(false)}}
  return <><button type="button" className={className} disabled={busy} onClick={open}>{busy?'Hazırlanıyor…':label}</button>{doc&&<ContractPreview doc={doc} onClose={()=>setDoc(null)}/>}</>
}
