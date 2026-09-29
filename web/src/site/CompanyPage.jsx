import GanuMark from '../GanuMark.jsx'
import { withBase } from '../base.js'
import LegalLinks from '../legal/LegalLinks.jsx'
import { COMPANY } from './company.js'

export function CompanyIdentity() {
  const rows = [
    ['Ticaret unvanı', COMPANY.tradeName],
    ['Adres', COMPANY.address],
    ['Vergi dairesi / VKN', `${COMPANY.taxOffice} · ${COMPANY.taxNumber}`],
    ['MERSİS no', COMPANY.mersis],
    ['Ticaret sicili', `${COMPANY.registryOffice} · ${COMPANY.registryNumber}`],
    ['Kuruluş (tescil)', COMPANY.founded],
  ]
  return <dl className="legal-identity">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    <div><dt>Telefon</dt><dd><a href={COMPANY.phoneHref}>{COMPANY.phone}</a> · {COMPANY.contactPerson}</dd></div>
    <div><dt>E-posta</dt><dd><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></dd></div>
  </dl>
}

const about = <>
  <p>GANU, İstanbul Beykoz Kavacık'taki ofisinde şirketlere ve serbest meslek erbabına sanal ofis hizmeti veren bir limited şirkettir. Şirketimiz {COMPANY.founded} tarihinde İstanbul Ticaret Sicili Müdürlüğü'nde tescil edilmiştir.</p>
  <h2>Ne yapıyoruz</h2>
  <ul>
    <li><b>Yasal iş adresi:</b> ticaret sicili ve vergi dairesi kaydında kullanılabilen, fiziken var olan ve yoklamaya hazır bir iş adresi.</li>
    <li><b>Posta ve kargo yönetimi:</b> gelen evrak, tebligat ve kargoların teslim alınması, kayda geçirilmesi, bildirilmesi ve istenirse yönlendirilmesi.</li>
    <li><b>e-İmza temini ve şirket kuruluşu danışmanlığı:</b> başvuru ve kuruluş süreçlerinde anlaşmalı mali müşavirlerle birlikte destek.</li>
    <li><b>Toplantı odası:</b> paketlere göre saatlik görüşme alanı kullanımı.</li>
  </ul>
  <h2>Nasıl çalışıyoruz</h2>
  <p>Her müşteriyle hizmet kapsamını, süresini ve bedelini gösteren yazılı bir hizmet sözleşmesi imzalanır. Fiyatlar ihtiyaca göre teklif edilir; hizmet bedeli, sözleşmenin ardından faturayla birlikte tahsil edilir. Adres kullanımı, kimlik ve şirket belgelerinin kontrolü tamamlanmadan başlamaz.</p>
  <h2>Şirket künyesi</h2>
</>
const contact = <>
  <p>Teklif, sözleşme ve hizmetlerimizle ilgili tüm sorularınız için bize telefon veya e-posta ile ulaşabilirsiniz.</p>
  <h2>Şirket künyesi ve iletişim</h2>
</>

export default function CompanyPage({ type }) {
  const title = type === 'about' ? 'Hakkımızda' : 'İletişim'
  return <div className="legal-shell"><header className="legal-mast"><a href={withBase('/')} aria-label="GANU"><GanuMark/></a><LegalLinks locale="tr" compact/></header>
    <main><article className="legal-page"><p className="legal-kicker">{type === 'about' ? 'KURUMSAL' : 'İLETİŞİM'}</p><h1>{title}</h1>
      {type === 'about' ? about : contact}
      <CompanyIdentity/>
      {type === 'contact' && <p><a href={withBase('/#iletisim')}>Teklif formu için ana sayfadaki iletişim bölümüne gidin →</a></p>}
    </article></main>
    <footer className="legal-footer"><span>© {new Date().getFullYear()} GANU</span><LegalLinks locale="tr" compact/></footer></div>
}
