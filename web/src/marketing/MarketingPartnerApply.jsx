import { mailtoHref, whatsappHref } from '../site/company.js'

// Sitede kişisel veri toplayan form yoktur; başvuru e-posta veya WhatsApp ile alınır.
export default function MarketingPartnerApply({formRef,locale}){
  const tr=locale==='tr'
  return <section className="section pa-apply-sec" id={tr?'basvuru':'apply'} ref={formRef} data-marketing-only="partner-enquiry-closed"><div className="wrap">
    <div className="shead"><span className="kicker">{tr?'Başvuru':'Apply'}</span><h2>{tr?'İş ortaklığı başvurusu':'Partnership enquiry'}</h2></div>
    <p>{tr?'Mesleğinizi, çalıştığınız müşteri profilini ve iletişim bilgilerinizi e-posta ya da WhatsApp ile iletin; uygunluğu değerlendirip yazılı ortaklık koşullarını size gönderelim.':'Send us your profession, client profile and contact details by email or WhatsApp; we will review the fit and send you written partnership terms.'}</p>
    <a className="btn btn-solid big" href={mailtoHref(tr?'GANU iş ortaklığı başvurusu':'GANU partnership enquiry')}>{tr?'E-posta gönder':'Email GANU'} →</a>{' '}
    <a className="btn btn-line big" href={whatsappHref(tr?'Merhaba, GANU iş ortaklığı hakkında bilgi almak istiyorum.':'Hello, I would like to learn about the GANU partnership programme.')} rel="noreferrer">WhatsApp →</a>
  </div></section>
}
