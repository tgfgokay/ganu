import { useState } from 'react'
import { motion, useScroll, useSpring, useTransform, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'

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
  { n: '1', t: 'Paketini seç', d: 'İhtiyacına uygun planı dakikalar içinde belirle.' },
  { n: '2', t: 'Evrakları ilet', d: 'Gerekli belgeleri topla; gerisini biz takip ederiz.' },
  { n: '3', t: 'Adresin hazır', d: 'Yasal iş adresin ve hizmetlerin aktif olur.' },
  { n: '4', t: 'İşine odaklan', d: 'Sen işini büyüt, idari yükü bize bırak.' },
]

const tiers = [
  { name: 'Başlangıç', m: '499', y: '416', per: '₺ / ay', feat: false, items: ['Yasal iş adresi', 'Posta bildirimi', 'Aylık 2 saat toplantı odası'] },
  { name: 'Pro', m: '899', y: '749', per: '₺ / ay', feat: true, items: ['Başlangıç’taki her şey', 'Telefon karşılama', 'Kargo yönlendirme', 'Aylık 8 saat toplantı odası', 'Öncelikli destek'] },
  { name: 'Kurumsal', m: 'Teklif', y: 'Teklif', per: '', custom: true, items: ['Pro’daki her şey', 'Mali müşavir paketi', 'Sınırsız toplantı odası', 'Özel hesap yöneticisi'] },
]

const marqueeItems = ['Yasal İş Adresi', 'Posta & Kargo', 'Telefon Karşılama', 'Toplantı Odası', 'Mali Müşavir']

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
          <a href="/is-ortakligi" onClick={close}>İş Ortaklığı</a>
          <a href="#iletisim" className="mast-cta" onClick={close}>Adresini al →</a>
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
        <motion.div className="steps" {...reveal} variants={stagger}>
          {steps.map((s) => (
            <motion.div className="step" key={s.n} variants={rise}>
              <div className="step-num">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
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
              <a href="#iletisim" className={`btn ${t.feat ? 'btn-solid' : 'btn-line'}`}>
                {t.custom ? 'Teklif al' : 'Seç'}
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
          <motion.p variants={rise}>Bugün başla; yasal adresin yarın hazır. Evrakları biz takip ederiz, sen işine bak.</motion.p>
          <motion.a variants={rise} href="mailto:merhaba@ganu.com.tr" className="btn btn-solid big">merhaba@ganu.com.tr →</motion.a>
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
              <li><a href="/is-ortakligi">Ortak ol · komisyon</a></li>
              <li><a href="/ortak">Ortak girişi</a></li>
              <li><a href="/avukat">Avukatlar için</a></li>
              <li><a href="/mali-musavir">Mali müşavirler için</a></li>
            </ul>
          </div>
          <div>
            <h4>Kurumsal</h4>
            <ul>
              <li><a href="#nasil">Süreç</a></li>
              <li><a href="#paketler">Paketler</a></li>
              <li><a href="#sss">SSS</a></li>
              <li><a href="#iletisim">İletişim</a></li>
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
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </MotionConfig>
  )
}
