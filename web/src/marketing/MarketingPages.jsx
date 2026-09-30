import { withBase } from '../base.js'
import GanuMark from '../GanuMark.jsx'
import LegalLinks from '../legal/LegalLinks.jsx'
import { COMPANY, mailtoHref, whatsappHref } from '../site/company.js'

const shell={minHeight:'100vh',background:'#f5f7f8',color:'#0a2540',padding:'32px 20px'}
const card={maxWidth:760,margin:'8vh auto',background:'#fff',border:'1px solid #dce5e8',borderRadius:20,padding:'clamp(28px,6vw,64px)',boxShadow:'0 18px 60px rgba(10,37,64,.08)'}
const button={display:'inline-block',marginTop:18,marginRight:10,padding:'13px 20px',borderRadius:999,background:'#0a2540',color:'#fff',textDecoration:'none',fontWeight:700}
const ghost={...button,background:'#fff',color:'#0a2540',border:'1px solid #0a2540'}
const quoteBody='Şirket ünvanı / ad soyad:\nİhtiyaç (yasal adres, posta, e-imza, toplantı odası…):\nAylık mı yıllık mı:\nTelefon:\n'

// Sitede sepet ve form yoktur: teklif telefon, WhatsApp veya e-posta ile istenir; ödeme sözleşme sonrası alınır.
export function MarketingSales(){
  return <main style={shell} data-marketing-only="sales-closed">
    <section style={card}>
      <a href={withBase('/')} aria-label="GANU ana sayfa"><GanuMark/></a>
      <p style={{marginTop:36,fontWeight:700,color:'#007f70',letterSpacing:'.08em'}}>TEKLİF AL</p>
      <h1>İhtiyacınıza göre yazılı teklif</h1>
      <p>Paket içeriğini ve bedeli ihtiyacınıza göre netleştirip size yazılı teklif gönderiyoruz. Bize telefon, WhatsApp veya e-postayla ulaşın.</p>
      <div>
        <a style={button} href={whatsappHref('Merhaba, GANU sanal ofis hizmeti için teklif almak istiyorum.')} rel="noreferrer">WhatsApp ile yazın</a>
        <a style={ghost} href={COMPANY.phoneHref}>Arayın: {COMPANY.phone}</a>
        <a style={ghost} href={mailtoHref('GANU hizmet teklifi', quoteBody)}>E-posta: {COMPANY.email}</a>
      </div>
      <h2 style={{marginTop:40,fontSize:22}}>Nasıl ilerliyoruz?</h2>
      <ol style={{lineHeight:1.8}}>
        <li><b>İhtiyacınızı paylaşın:</b> şirket bilgisi ve almak istediğiniz hizmetler.</li>
        <li><b>Yazılı teklif ve hizmet sözleşmesi:</b> kapsam, süre ve bedel açıkça yazılır.</li>
        <li><b>Ödeme:</b> sözleşmenin ardından faturayla; havale/EFT ile.</li>
        <li><b>Adresiniz aktif:</b> kimlik ve şirket belgelerinin kontrolü tamamlanınca adres kullanımı başlar.</li>
      </ol>
      <p style={{fontSize:14,opacity:.75}}>Bu sayfada çevrim içi başvuru, belge yükleme, ödeme ve kişisel veri toplama yapılmaz; teklif ve sözleşme süreci sizinle doğrudan iletişimle yürütülür.</p>
      <p style={{fontSize:14,opacity:.75}}>{COMPANY.tradeName} · {COMPANY.address}</p>
      <p><a href={withBase('/')}>Ana sayfaya dön</a></p>
      <LegalLinks locale="tr"/>
    </section>
  </main>
}

export function PrivateClosed({name}){
  return <main style={shell} data-marketing-only="private-closed"><section style={card}>
    <a href={withBase('/')} aria-label="GANU ana sayfa"><GanuMark/></a>
    <h1>{name} yakında açılıyor.</h1>
    <p>Hizmet kayıtlarınız, posta bildirimleriniz ve belgelerinizle ilgili her konuda şimdilik bize doğrudan ulaşabilirsiniz.</p>
    <a style={button} href={COMPANY.phoneHref}>{COMPANY.phone}</a>
    <a style={ghost} href={mailtoHref(`GANU ${name}`)}>{COMPANY.email}</a>
    <p><a href={withBase('/')}>Ana sayfaya dön</a></p>
  </section></main>
}
