import { useState } from 'react'
import { withBase } from './base'
import { motion, useScroll, useSpring, useTransform, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'
import { PACKAGE_MONTHLY, PACKAGE_PRICES } from './panel/lib/store.js'

/* ---------- motion presets ---------- */
const rise = {
  hidden: { opacity: 0, y: 34 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay: i * 0.06, ease: [0.19, 1, 0.22, 1] },
  }),
}
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const reveal = { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.2 } }
const wipe = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.9, ease: [0.19, 1, 0.22, 1] } },
}

/* ---------- content ---------- */
const services = [
  { n: '01', t: 'Yasal İş Adresi', d: 'Şirketiniz için prestijli İstanbul iş adresi — resmi kayda uygun, vergi dairesi yoklamasına hazır.' },
  { n: '02', t: 'Posta & Kargo', d: 'Gelen evrak ve kargolarınızı teslim alır, bildirir, dilerseniz yönlendiririz.' },
  { n: '03', t: 'Telefon Karşılama', d: 'Kurumsal numara, çağrı karşılama ve yönlendirme ile her zaman ulaşılabilir olun.' },
  { n: '04', t: 'Toplantı Odası', d: 'Saatlik veya günlük kullanabileceğiniz, donanımlı görüşme alanı.' },
]

const steps = [
  { n: '1', ic: 'pick', t: 'Paketini seç', d: 'İhtiyacına uygun planı dakikalar içinde belirle, online öde.' },
  { n: '2', ic: 'docs', t: 'Evrakları ilet', d: 'Gerekli belgeleri yükle; gerisini biz takip ederiz.' },
  { n: '3', ic: 'address', t: 'Adresin hazır', d: 'Yasal iş adresin ve hizmetlerin aktif olur, kodun panele düşer.' },
  { n: '4', ic: 'focus', t: 'İşine odaklan', d: 'Sen işini büyüt, posta-tebligat-idari yükü bize bırak.' },
]
const stepIcons = {
  pick: <><path d="M9 12l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="2.5" /></>,
  docs: <><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13h6M9 17h4" /></>,
  address: <><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" /><circle cx="12" cy="11" r="2.3" /></>,
  focus: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></>,
}

/* Fiyat tek kaynak: store.js PACKAGE_MONTHLY / PACKAGE_PRICES.
   Yıllık gösterim = yıllık peşin tutarın aylık karşılığı (₺/12, yuvarlanır). */
const trTL = (n) => Math.round(n).toLocaleString('tr-TR')
const tiers = [
  { name: 'Başlangıç', m: trTL(PACKAGE_MONTHLY['Başlangıç']), y: trTL(PACKAGE_PRICES['Başlangıç'] / 12), per: '₺ / ay', feat: false, items: ['Yasal iş adresi', 'Posta & tebligat bildirimi', 'Müşteri paneli + belge kasası', 'Aylık 2 saat toplantı odası'] },
  { name: 'Pro', m: trTL(PACKAGE_MONTHLY['Pro']), y: trTL(PACKAGE_PRICES['Pro'] / 12), per: '₺ / ay', feat: true, items: ['Başlangıç’taki her şey', 'Telefon karşılama', 'Kargo yönlendirme (aylık 2 gönderi)', 'Aylık 8 saat toplantı odası', 'Öncelikli destek'] },
  { name: 'Kurumsal', m: 'Teklif', y: 'Teklif', per: '', custom: true, items: ['Pro’daki her şey', 'Mali müşavir paketi', 'Sınırsız toplantı odası', 'Özel hesap yöneticisi'] },
]

const marqueeItems = ['Yasal İş Adresi', 'Posta & Kargo', 'Telefon Karşılama', 'Toplantı Odası', 'Mali Müşavir']

/* Müşteri yorumları — Google değerlendirmesi görünümü.
   ⚠️ YER TUTUCU: Yayına almadan önce GERÇEK Google/işletme yorumlarıyla
   değiştirin (ya da Google Places API'den çekin). Uydurma yorum yayınlamak
   yanıltıcıdır. `googleUrl`'ü kendi işletme profilinizin linkiyle güncelleyin. */
const googleReviewUrl = 'https://www.google.com/maps' // TODO: GANU işletme profili linki
const reviews = [
  { name: 'Merve A.', initials: 'MA', color: '#0A7C6B', stars: 5, when: '2 hafta önce', local: true,
    text: 'Şirketi kurarken adres derdine hiç girmedim. Kargolarım aynı gün panele düşüyor, tebligat gelince anında haber veriyorlar. Kavacık adresi de müşterilere güven veriyor.' },
  { name: 'Kaan D.', initials: 'KD', color: '#B4530A', stars: 5, when: '1 ay önce', local: false,
    text: 'E-ticaret için aldım. Posta yönetimi ve yönlendirme kusursuz. Panelden faturamı görüp kartla ödedim, muhasebe tarafı çok rahatladı.' },
  { name: 'Selin I.', initials: 'SI', color: '#5B3AA6', stars: 5, when: '1 ay önce', local: true,
    text: 'Yıllarca farklı firmalarla uğraştım, ilk kez her şey tek panelde. Yoklama gününde bile aradılar, hazırladılar. Fiyatı da bölgeye göre çok makul.' },
  { name: 'Emre T.', initials: 'ET', color: '#0A5AA6', stars: 5, when: '2 ay önce', local: false,
    text: 'Serbest çalışıyorum, prestijli adres lazımdı. Başvuru + ödeme 5 dakika sürdü, ertesi gün adresim hazırdı. Destek ekibi gerçekten hızlı.' },
  { name: 'Zeynep K.', initials: 'ZK', color: '#A60A4E', stars: 5, when: '3 ay önce', local: true,
    text: 'Belgelerim belge kasasında, sözleşmem panelde, her şey düzenli. Telefon karşılama hizmeti sayesinde tek çağrı kaçırmadım. Tavsiye ederim.' },
  { name: 'Burak Ş.', initials: 'BŞ', color: '#0A7C6B', stars: 4, when: '3 ay önce', local: false,
    text: 'Fiyat/performans çok iyi. Toplantı odasını da ara sıra kullanıyorum. Tek dileğim mobil uygulama olması, gerisi harika.' },
]

const faqs = [
  {
    q: 'Sanal ofis yasal mı? Şirketimi bu adrese kurabilir miyim?',
    a: 'Evet. Verdiğimiz adres; ticaret sicili ve vergi dairesi kaydında iş yeri adresi olarak ' +
      'kullanılabilen gerçek bir İstanbul iş adresidir. Kuruluş ve tescil işlemlerini mali müşavirinle ' +
      'yürütürsün; biz adresi, yoklamaya hazır fiziki ortamı ve gerekli adres kullanım belgelerini sağlarız.',
  },
  {
    q: 'Vergi dairesi yoklaması gelirse ne oluyor?',
    a: 'Adres fiziki olarak mevcuttur ve yoklamaya hazırdır (VUK 127). Yoklama anında adreste karşılama ' +
      'yapılır, kaydı panele işlenir. Bu, adres kaynaklı re’sen terk riskini azaltmaya yönelik idari bir ' +
      'destektir; hukuki veya mali danışmanlık ya da kesin sonuç garantisi değildir.',
  },
  {
    q: 'Postam ve kargolarım bana nasıl ulaşıyor?',
    a: 'Gelen evrak ve kargo teslim alınır, aynı gün panele işlenir ve sana bildirilir. Dilersen gel-al, ' +
      'dilersen belirttiğin adrese yönlendirme yaparız; yönlendirmede kargo takip numarası da panele düşer.',
  },
  {
    q: 'Adres ne kadar sürede aktif olur?',
    a: 'Gerekli belgeler tamamlandığında adresin çoğu durumda 1 iş günü içinde kullanıma hazır olur. ' +
      'Paket seçimi, evrak iletimi ve aktivasyon adımlarını “Süreç” bölümünde adım adım görebilirsin.',
  },
  {
    q: 'Hangi belgeler gerekiyor? Şahıs şirketi de kullanabilir mi?',
    a: 'Genellikle kimlik, (varsa) şirket bilgileri ve adres kullanımına dair imzalı belgeler yeterlidir. ' +
      'Net ihtiyaç listesini ilk görüşmede iletiriz. Limited/anonim şirketlerin yanı sıra şahıs şirketleri ' +
      've serbest meslek erbabı da yararlanabilir.',
  },
  {
    q: 'Sözleşme süresi ve iptal nasıl işliyor?',
    a: 'Paketler aylık veya yıllık seçilebilir; yıllık ödemede iki ay avantajlıdır. Yenileme tarihleri ' +
      'panelde takip edilir ve öncesinde hatırlatılır. Koşulların ayrıntısını sözleşmede şeffaf biçimde paylaşırız.',
  },
  {
    q: 'Kira stopajı ödeyecek miyim?',
    a: 'Hayır. Hizmeti şirketimizden KDV’li fatura karşılığı aldığınız için, gerçek kişiden ofis ' +
      'kiralamadaki gibi aylık kira stopajı beyan etme yükümlülüğünüz doğmaz. Faturayı doğrudan gider ' +
      'yazarsınız — muhasebeniz sadeleşir. (Kendi durumunuz için mali müşavirinize danışmanızı öneririz.)',
  },
]

const trust = [
  { icon: 'pin', t: 'Gerçek fiziki adres', d: 'Kavacık’ta tabelası, katı ve kapı numarasıyla var olan bir ofis — yoklamaya hazır. Sanal, ama hayali değil.' },
  { icon: 'log', t: 'Her şey kayıt altında', d: 'Gelen posta, tebligat, kargo ve yoklama; tarih-saatiyle tek panele işlenir. Dilediğinde geçmişe bakarsın.' },
  { icon: 'shield', t: 'Belgelerin güvende', d: 'Erişim kodlu müşteri paneli ve belge kasası; kayıtların yalnızca sana görünür, KVKK’ya uygun saklanır.' },
  { icon: 'user', t: 'Tek muhatap', d: 'Farklı firmalarla değil, tek ekiple çalışırsın; adres, posta ve idari işler tek elden yürür.' },
]

const trustIcons = {
  pin: <><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" /><circle cx="12" cy="11" r="2.3" /></>,
  log: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3.4h6v3H9z" /><path d="M9 11h6M9 14.5h6M9 18h3.5" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6l-7-3Z" /><path d="m9 12 2.2 2.2L15 10" /></>,
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
}

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="tick"><path d="m4 12 5 5L20 6" /></svg>
)

function ScrollBar() {
  const { scrollYProgress } = useScroll()
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return (
    <motion.div className="progress" style={{ scaleX: x, transformOrigin: '0%' }} aria-hidden="true" />
  )
}

function Nav() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href="#top" className="wordmark" onClick={close} aria-label="GANU — ana sayfa"><GanuMark /></a>
        <span className="mast-meta">Sanal Ofis · İstanbul</span>
        <button className="nav-toggle" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href="#hizmetler" onClick={close}>Hizmetler</a>
          <a href="#nasil" onClick={close}>Süreç</a>
          <a href="#paketler" onClick={close}>Paketler</a>
          <a href={withBase("/is-ortakligi")} onClick={close}>İş Ortaklığı</a>
          <a href={withBase("/musteri")} className="mast-login" onClick={close} aria-label="Müşteri girişi">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }}>
              <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>Giriş
          </a>
          <a href={withBase("/satin-al")} className="mast-cta" onClick={close}>Satın al →</a>
        </div>
      </div>
    </motion.nav>
  )
}

/* Hero koordinat/hedef plakası — "adres kendini konumluyor" animasyonu.
   CSS translateY(-50%) korunsun diye tüm hareket iç <g> gruplarında;
   <svg> üzerinde transform yok. reducedMotion=user (kökte) otomatik saygılı. */
function HeroPlate() {
  const grid = [60, 140, 220, 300, 380, 460, 540]
  const ease = [0.19, 1, 0.22, 1]
  const { scrollYProgress } = useScroll()
  const py = useTransform(scrollYProgress, [0, 0.25], [0, -46])
  const rings = [
    { r: 58,  o: 0.5,  w: 1.5, c: '#0A2540' },
    { r: 112, o: 0.28, w: 1,   c: '#0A2540' },
    { r: 168, o: 0.85, w: 2.5, c: '#00D4B2' }, // teal vurgu halkası
    { r: 228, o: 0.2,  w: 1,   c: '#0A2540' },
  ]
  const center = { transformBox: 'fill-box', transformOrigin: 'center' }

  return (
    <motion.svg className="hero-plate" viewBox="0 0 600 600" aria-hidden="true" fill="none">
      {/* dış katman: scroll parallax */}
      <motion.g style={{ y: py }}>
        {/* iç katman: giriş (fade+scale) sonra sonsuz hafif salınım */}
        <motion.g
          style={center}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1, y: [0, -9, 0] }}
          transition={{
            opacity: { duration: 1.0, ease },
            scale: { duration: 1.2, ease },
            y: { duration: 11, ease: 'easeInOut', repeat: Infinity, delay: 1 },
          }}
        >
          {/* koordinat ızgarası — belirir */}
          <motion.g stroke="#0A2540" strokeOpacity="0.10" strokeWidth="1"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.3, ease }}>
            {grid.map((v) => <line key={`v${v}`} x1={v} y1="30" x2={v} y2="570" />)}
            {grid.map((v) => <line key={`h${v}`} x1="30" y1={v} x2="570" y2={v} />)}
          </motion.g>

          {/* eksenler — çizilerek gelir */}
          <g stroke="#0A2540" strokeOpacity="0.22" strokeWidth="1">
            <motion.line x1="30" y1="300" x2="570" y2="300"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, delay: 0.25, ease }} />
            <motion.line x1="300" y1="30" x2="300" y2="570"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, delay: 0.4, ease }} />
          </g>

          {/* eşmerkezli halkalar — içten dışa çizilir */}
          {rings.map((rg, i) => (
            <motion.circle key={rg.r} cx="300" cy="300" r={rg.r}
              stroke={rg.c} strokeOpacity={rg.o} strokeWidth={rg.w}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: rg.o }}
              transition={{
                pathLength: { duration: 1.4, delay: 0.55 + i * 0.16, ease },
                opacity: { duration: 0.6, delay: 0.55 + i * 0.16 },
              }} />
          ))}

          {/* dış kesikli halka — çizilir, sonra yavaşça döner (pusula kadranı) */}
          <motion.g style={center} animate={{ rotate: 360 }}
            transition={{ duration: 140, ease: 'linear', repeat: Infinity }}>
            <motion.circle cx="300" cy="300" r="284"
              stroke="#0A2540" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="6 7"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.35 }}
              transition={{ pathLength: { duration: 1.7, delay: 1.15, ease }, opacity: { duration: 0.7, delay: 1.15 } }} />
          </motion.g>

          {/* konum sinyali — genişleyip sönen teal halkalar (adres noktası) */}
          {[0, 1].map((i) => (
            <motion.circle key={`ping${i}`} cx="300" cy="300" r="10"
              fill="none" stroke="#00D4B2" strokeWidth="2" style={center}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 6.6], opacity: [0.5, 0] }}
              transition={{ duration: 3.4, delay: 2.2 + i * 1.7, ease: 'easeOut', repeat: Infinity, repeatDelay: 1.2 }} />
          ))}

          {/* merkez teal nokta — yaylı giriş */}
          <motion.circle cx="300" cy="300" r="10" fill="#00D4B2" style={center}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 1.7 }} />
        </motion.g>
      </motion.g>
    </motion.svg>
  )
}

function Hero() {
  return (
    <header className="hero hero--photo" id="top">
      <div className="hero-photo" aria-hidden="true" />
      <HeroPlate />
      <div className="wrap">
        <motion.div className="hero-rule top" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
        <div className="hero-topline">
          <motion.span variants={rise} initial="hidden" animate="show">Sayı 01 — İstanbul</motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={1}>Anahtar teslim idari sekreterya</motion.span>
        </div>

        <motion.h1 className="hero-title" variants={stagger} initial="hidden" animate="show">
          <motion.span className="line" variants={rise}>Adresin</motion.span>
          <motion.span className="line ital" variants={rise}>hazır,</motion.span>
          <motion.span className="line" variants={rise}>gerisi bizde<span className="dot">.</span></motion.span>
        </motion.h1>

        <div className="hero-foot">
          <motion.p className="lead" variants={rise} initial="hidden" animate="show" custom={2}>
            Şirketine prestijli bir İstanbul iş adresi; posta yönetiminden telefon karşılamaya,
            toplantı odasından tüm idari sürece kadar her şey tek elden yürütülür.
          </motion.p>
          <motion.div className="hero-side" variants={rise} initial="hidden" animate="show" custom={3}>
            <div className="hero-cta">
              <a href="#paketler" className="btn btn-solid">Paketleri gör →</a>
              <a href="#iletisim" className="btn btn-line">Bizimle görüş</a>
            </div>
            <dl className="stats">
              <div><dt>1 gün</dt><dd>adres aktivasyonu</dd></div>
              <div><dt>Tek elden</dt><dd>posta & takip</dd></div>
              <div><dt>Beykoz</dt><dd>Kavacık / İstanbul</dd></div>
            </dl>
          </motion.div>
        </div>
        <motion.div className="hero-rule" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
      </div>
    </header>
  )
}

function Marquee() {
  const row = [...marqueeItems, ...marqueeItems]
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row.map((t, i) => (
          <span className="marquee-item" key={i}>{t}<span className="star">✦</span></span>
        ))}
      </div>
    </div>
  )
}

function Services() {
  return (
    <section className="section" id="hizmetler">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>İçindekiler — Hizmetler</motion.span>
          <motion.h2 variants={rise}>Bir işletmenin ihtiyacı olan<br /><em>her şey</em>, tek çatı altında<span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.ol className="index" {...reveal} variants={stagger}>
          {services.map((s) => (
            <motion.li className="index-row" key={s.n} variants={rise}>
              <span className="idx-num">{s.n}</span>
              <h3 className="idx-title">{s.t}</h3>
              <p className="idx-desc">{s.d}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}

function Steps() {
  return (
    <section className="section dark" id="nasil">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Süreç</motion.span>
          <motion.h2 variants={rise}>Dört adımda<br />iş adresin hazır<span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.div className="flow" {...reveal} variants={stagger}>
          <motion.span className="flow-rail" variants={wipe} aria-hidden="true" />
          {steps.map((s) => (
            <motion.div className="flow-step" key={s.n} variants={rise}>
              <div className="flow-node">
                <svg className="flow-ic" viewBox="0 0 24 24" aria-hidden="true">{stepIcons[s.ic]}</svg>
                <span className="flow-n">{s.n}</span>
              </div>
              <div className="flow-body">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Trust() {
  return (
    <section className="section" id="guven">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Güvence — Neden GANU</motion.span>
          <motion.h2 variants={rise}>Görünürde adres değil,<br /><em>gerçek</em> bir ofis<span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.div className="trust" {...reveal} variants={stagger}>
          {trust.map((p) => (
            <motion.div className="trust-item" key={p.t} variants={rise}>
              <svg className="trust-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none">{trustIcons[p.icon]}</svg>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Pricing() {
  const [yearly, setYearly] = useState(false)
  return (
    <section className="section" id="paketler">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Fiyat Cetveli — Paketler</motion.span>
          <motion.h2 variants={rise}>Şeffaf, sade<br /><em>fiyatlandırma</em><span className="dot">.</span></motion.h2>
        </motion.div>

        <motion.div className="billing" {...reveal} variants={rise}>
          <button type="button" role="switch" aria-checked={yearly}
            aria-label="Yıllık faturalandırmaya geç"
            className={`billing-toggle${yearly ? ' on' : ''}`} onClick={() => setYearly((v) => !v)}>
            <span className={`opt${yearly ? '' : ' active'}`}>Aylık</span>
            <span className="knob" aria-hidden="true" />
            <span className={`opt${yearly ? ' active' : ''}`}>Yıllık</span>
          </button>
          <span className="billing-note">Yıllık öde, <b>2 ay bedava</b></span>
        </motion.div>

        <motion.div className="tiers" {...reveal} variants={stagger}>
          {tiers.map((t) => (
            <motion.div className={`tier${t.feat ? ' feat' : ''}`} key={t.name} variants={rise}>
              <div className="tier-head">
                <h3>{t.name}</h3>
                {t.feat && <span className="tag">En popüler</span>}
              </div>
              <div className="price">
                {t.custom
                  ? <span className="price-word">{t.m}</span>
                  : <><span className="price-num">{yearly ? t.y : t.m}</span><span className="price-per">{t.per}</span></>}
              </div>
              <div className="price-sub">
                {t.custom ? 'ihtiyaca göre fiyat' : yearly ? 'yıllık faturalandırılır' : 'aylık faturalandırılır'}
              </div>
              <ul>
                {t.items.map((i) => (
                  <li key={i}><Check /><span>{i}</span></li>
                ))}
              </ul>
              <a href={withBase(`/satin-al?paket=${encodeURIComponent(t.name)}`)} className={`btn ${t.feat ? 'btn-solid' : 'btn-line'}`}>
                {t.custom ? 'Teklif al →' : 'Satın al →'}
              </a>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section className="section" id="sss">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Sık Sorulanlar — SSS</motion.span>
          <motion.h2 variants={rise}>Aklındaki sorular,<br /><em>net</em> yanıtlar<span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.div className="faq" {...reveal} variants={stagger}>
          {faqs.map((f, i) => {
            const isOpen = open === i
            return (
              <motion.div className={`faq-item${isOpen ? ' open' : ''}`} key={f.q} variants={rise}>
                <h3>
                  <button type="button" className="faq-q" aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                    <span className="faq-qt">{f.q}</span>
                    <span className="faq-ico" aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-a" id={`faq-a-${i}`} role="region">
                  <p>{f.a}</p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

function CtaBand() {
  return (
    <section className="section cta-sec" id="iletisim">
      <div className="wrap">
        <motion.div className="cta-band" {...reveal} variants={stagger}>
          <motion.h2 variants={rise}>Şirketine<br /><em>prestijli</em> bir adres<span className="dot">.</span></motion.h2>
          <motion.p variants={rise}>Bugün başla; yasal adresin yarın hazır. 30 saniyede satın al, evrakları biz takip edelim.</motion.p>
          <motion.a variants={rise} href={withBase("/satin-al")} className="btn btn-solid big">Satın almaya başla →</motion.a>
          <motion.p variants={rise} style={{ marginTop: 12, fontSize: 14, opacity: 0.75 }}>
            Sorunuz mu var? <a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a>
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="colophon">
      <div className="wrap">
        <div className="colo-mark"><GanuMark /></div>
        <div className="colo-grid">
          <div className="colo-lead">
            <p>Anahtar teslim sanal ofis &amp; idari sekreterya. Adresin hazır, gerisi bizde.</p>
          </div>
          <div>
            <h4>Hizmetler</h4>
            <ul>
              <li><a href="#hizmetler">Yasal adres</a></li>
              <li><a href="#hizmetler">Posta yönetimi</a></li>
              <li><a href="#hizmetler">Telefon karşılama</a></li>
              <li><a href="#hizmetler">Toplantı odası</a></li>
            </ul>
          </div>
          <div>
            <h4>İş Ortaklığı</h4>
            <ul>
              <li><a href={withBase("/is-ortakligi")}>Ortak ol · komisyon</a></li>
              <li><a href={withBase("/ortak")}>Ortak girişi</a></li>
              <li><a href={withBase("/avukat")}>Avukatlar için</a></li>
              <li><a href={withBase("/mali-musavir")}>Mali müşavirler için</a></li>
            </ul>
          </div>
          <div>
            <h4>Kurumsal</h4>
            <ul>
              <li><a href={withBase("/musteri")}><b>Müşteri girişi</b></a></li>
              <li><a href={withBase("/satin-al")}>Satın al</a></li>
              <li><a href="#paketler">Paketler</a></li>
              <li><a href="#sss">SSS</a></li>
            </ul>
          </div>
          <div>
            <h4>İletişim</h4>
            <ul>
              <li>Kavacık Mah. Okul Cad.</li>
              <li>No:29 · Beykoz / İstanbul</li>
              <li><a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a></li>
              <li><a href="https://ganu.com.tr">ganu.com.tr</a></li>
            </ul>
          </div>
        </div>
        <p className="colo-legal">
          Yoklama, tebligat ve re’sen terk süreçlerine ilişkin hizmetlerimiz idari destek ve fiziki iş adresi
          sağlama niteliğindedir; hukuki veya mali danışmanlık hizmeti ya da kesin sonuç garantisi içermez.
        </p>
        <div className="colo-bottom">
          <span>© {new Date().getFullYear()} GANU · Sanal Ofis · İstanbul</span>
          <span>Tüm hakları saklıdır.</span>
        </div>
      </div>
    </footer>
  )
}

/* Google "G" logo — inline, çok renkli */
const GoogleG = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
  </svg>
)
const Stars = ({ n = 5, size = 15 }) => (
  <span aria-label={`${n} / 5 yıldız`} style={{ display: 'inline-flex', gap: 1 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
        fill={i <= n ? '#FBBC05' : '#dbe2ea'}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ))}
  </span>
)

function ReviewCard({ r }) {
  return (
    <figure className="rv-card">
      <div className="rv-top">
        <span className="rv-av" style={{ background: r.color }}>{r.initials}</span>
        <div className="rv-who">
          <figcaption className="rv-name">{r.name}</figcaption>
          <span className="rv-meta">{r.local ? 'Yerel Rehber · ' : ''}{r.when}</span>
        </div>
        <span className="rv-g" title="Google değerlendirmesi"><GoogleG /></span>
      </div>
      <Stars n={r.stars} />
      <blockquote className="rv-text">{r.text}</blockquote>
    </figure>
  )
}

function Reviews() {
  const loop = [...reviews, ...reviews] // kesintisiz kayış için iki kopya
  const avg = (reviews.reduce((s, r) => s + r.stars, 0) / reviews.length).toFixed(1)
  return (
    <section className="section reviews-sec" id="yorumlar" aria-label="Müşteri yorumları">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Müşteri Deneyimi</motion.span>
          <motion.h2 variants={rise}>Kullananlar ne diyor<span className="dot">?</span></motion.h2>
        </motion.div>
        <motion.a className="rv-rating" href={googleReviewUrl} target="_blank" rel="noreferrer" {...reveal} variants={rise}>
          <GoogleG size={22} />
          <b>{avg}</b>
          <Stars n={Math.round(avg)} size={17} />
          <span className="rv-rating-meta">Google değerlendirmeleri · <span className="rv-link">Yorum yaz →</span></span>
        </motion.a>
      </div>
      <div className="rv-marquee" aria-hidden="false">
        <div className="rv-track">
          {loop.map((r, i) => <ReviewCard key={i} r={r} />)}
        </div>
      </div>
    </section>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <a href="#hizmetler" className="skip">İçeriğe geç</a>
      <ScrollBar />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Services />
        <Steps />
        <Trust />
        <Reviews />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </MotionConfig>
  )
}
