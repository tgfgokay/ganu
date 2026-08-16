export default function MarketingPartnerApply({formRef,locale}){
  const tr=locale==='tr'
  return <section className="section pa-apply-sec" id={tr?'basvuru':'apply'} ref={formRef} data-marketing-only="partner-enquiry-closed"><div className="wrap">
    <div className="shead"><span className="kicker">{tr?'İletişim':'Contact'}</span><h2>{tr?'Çevrim içi ortaklık başvurusu hazırlanıyor.':'Online partnership applications are being prepared.'}</h2></div>
    <p>{tr?'Bu tanıtım yayınında form üzerinden kişisel veri alınmaz. İş ortaklığı hakkında bilgi ve yazılı koşullar için kurumsal e-posta adresimize ulaşın.':'This marketing release does not collect personal data through an online form. Contact our corporate email address for partnership information and written terms.'}</p>
    <a className="btn btn-solid big" href={`mailto:info@ganu.com.tr?subject=${encodeURIComponent(tr?'GANU iş ortaklığı':'GANU partnership enquiry')}`}>{tr?'E-posta gönder':'Email GANU'} →</a>
  </div></section>
}
