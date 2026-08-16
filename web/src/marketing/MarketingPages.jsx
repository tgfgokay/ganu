import { withBase } from '../base.js'
import GanuMark from '../GanuMark.jsx'
import LegalLinks from '../legal/LegalLinks.jsx'

const shell={minHeight:'100vh',background:'#f5f7f8',color:'#0a2540',padding:'32px 20px'}
const card={maxWidth:760,margin:'8vh auto',background:'#fff',border:'1px solid #dce5e8',borderRadius:20,padding:'clamp(28px,6vw,64px)',boxShadow:'0 18px 60px rgba(10,37,64,.08)'}
const button={display:'inline-block',marginTop:18,padding:'13px 20px',borderRadius:999,background:'#0a2540',color:'#fff',textDecoration:'none',fontWeight:700}

export function MarketingSales(){
  return <main style={shell} data-marketing-only="sales-closed">
    <section style={card}>
      <a href={withBase('/')} aria-label="GANU ana sayfa"><GanuMark/></a>
      <p style={{marginTop:36,fontWeight:700,color:'#007f70'}}>YAYIN ÖNCESİ GÜVENLİ TEST</p>
      <h1>Çevrim içi satış ve ödeme hazırlanıyor.</h1>
      <p>Bu sayfa GANU sitesinin gezinme ve tasarım testleri için yayındadır. Şu anda çevrim içi başvuru, belge yükleme, ödeme ve kişisel veri toplama yapılmaz.</p>
      <p>Hizmet ve kurumsal teklif soruları için yalnızca kurumsal e-posta kanalını kullanabilirsiniz.</p>
      <a style={button} href="mailto:info@ganu.com.tr?subject=GANU%20hizmet%20teklifi">E-posta ile teklif isteyin</a>
      <p><a href={withBase('/')}>Ana sayfaya dön</a></p>
      <LegalLinks locale="tr"/>
    </section>
  </main>
}

export function PrivateClosed({name}){
  return <main style={shell} data-marketing-only="private-closed"><section style={card}>
    <a href={withBase('/')} aria-label="GANU ana sayfa"><GanuMark/></a>
    <h1>{name} bu tanıtım yayınında kapalıdır.</h1>
    <p>Hesap, oturum ve özel müşteri verisi işleyen alanlar güvenli canlı geçiş tamamlanana kadar kullanıma açılmaz.</p>
    <a style={button} href={withBase('/')}>Public siteye dön</a>
  </section></main>
}
