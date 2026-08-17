import { withBase } from '../base.js'
export default function LegalLinks({locale='tr',compact=false}){
  const links=locale==='tr'
    ? [['/mesafeli-satis','Mesafeli satış'],['/iptal-iade','İptal ve iade'],['/kvkk','KVKK'],['/cerezler','Çerezler']]
    : [['/en/privacy','Privacy'],['/en/cookies','Cookies']]
  return <nav className={compact?'legal-links compact':'legal-links'} aria-label={locale==='tr'?'Yasal metinler ve girişler':'Legal notices and sign in'}>{links.map(([href,label])=><a key={href} href={withBase(href)}>{label}</a>)}<a href={withBase('/panel')}>{locale==='tr'?'Personel Girişi':'Staff login'}</a></nav>
}
