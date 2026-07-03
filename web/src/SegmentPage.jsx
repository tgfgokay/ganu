import { useState } from 'react'
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'

/* ---------- motion presets (App.jsx ile aynı dil) ---------- */
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

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="tick"><path d="m4 12 5 5L20 6" /></svg>
)

function ScrollBar() {
  const { scrollYProgress } = useScroll()
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return <motion.div className="progress" style={{ scaleX: x, transformOrigin: '0%' }} aria-hidden="true" />
}

function Nav({ segLabel }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href="/" className="wordmark" onClick={close} aria-label="GANU — ana sayfa"><GanuMark /></a>
        <span className="mast-meta">{segLabel} · İstanbul</span>
        <button className="nav-toggle" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href="#neden" onClick={close}>Neden GANU</a>
          <a href="#nasil" onClick={close}>Süreç</a>
          <a href="/#paketler" onClick={close}>Paketler</a>
          <a href="#iletisim" className="mast-cta" onClick={close}>İletişim →</a>
        </div>
      </div>
    </motion.nav>
  )
}

function Hero({ hero }) {
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <motion.div className="hero-rule top" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
        <div className="hero-topline">
          <motion.span variants={rise} initial="hidden" animate="show">{hero.eyebrow}</motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={1}>{hero.eyebrow2}</motion.span>
        </div>

        <motion.h1 className="hero-title" variants={stagger} initial="hidden" animate="show">
          <motion.span className="line" variants={rise}>{hero.l1}</motion.span>
          <motion.span className="line ital" variants={rise}>{hero.l2}</motion.span>
          <motion.span className="line" variants={rise}>{hero.l3}<span className="dot">.</span></motion.span>
        </motion.h1>

        <div className="hero-foot">
          <motion.p className="lead" variants={rise} initial="hidden" animate="show" custom={2}>
            {hero.lead}
          </motion.p>
          <motion.div className="hero-side" variants={rise} initial="hidden" animate="show" custom={3}>
            <div className="hero-cta">
              <a href="#iletisim" className="btn btn-solid">{hero.cta} →</a>
              <a href="/#paketler" className="btn btn-line">Paketleri gör</a>
            </div>
            <dl className="stats">
              {hero.stats.map((s) => (
                <div key={s.k}><dt>{s.k}</dt><dd>{s.v}</dd></div>
              ))}
            </dl>
          </motion.div>
        </div>
        <motion.div className="hero-rule" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
      </div>
    </header>
  )
}

function Marquee({ items }) {
  const row = [...items, ...items]
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

function Value({ kicker, title, items }) {
  return (
    <section className="section" id="neden">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{kicker}</motion.span>
          <motion.h2 variants={rise} dangerouslySetInnerHTML={{ __html: title }} />
        </motion.div>
        <motion.ol className="index" {...reveal} variants={stagger}>
          {items.map((s) => (
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

function Steps({ title, steps }) {
  return (
    <section className="section dark" id="nasil">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Süreç</motion.span>
          <motion.h2 variants={rise} dangerouslySetInnerHTML={{ __html: title }} />
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

function SegSwitch({ cross }) {
  if (!cross) return null
  return (
    <section className="section seg-switch">
      <div className="wrap">
        <motion.a className="seg-switch-band" href={cross.href} {...reveal} variants={stagger}>
          <motion.span className="seg-switch-eyebrow" variants={rise}>{cross.eyebrow}</motion.span>
          <motion.span className="seg-switch-title" variants={rise}>
            {cross.title}<span className="dot">.</span>
          </motion.span>
          <motion.span className="seg-switch-text" variants={rise}>{cross.text}</motion.span>
          <motion.span className="seg-switch-cta" variants={rise}>{cross.cta} →</motion.span>
        </motion.a>
      </div>
    </section>
  )
}

function CtaBand({ cta }) {
  return (
    <section className="section cta-sec" id="iletisim">
      <div className="wrap">
        <motion.div className="cta-band" {...reveal} variants={stagger}>
          <motion.h2 variants={rise} dangerouslySetInnerHTML={{ __html: cta.title }} />
          <motion.p variants={rise}>{cta.text}</motion.p>
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
            <h4>İş Ortaklığı</h4>
            <ul>
              <li><a href="/is-ortakligi">Ortak ol · komisyon</a></li>
              <li><a href="/ortak">Ortak girişi</a></li>
              <li><a href="/avukat">Avukatlar için</a></li>
              <li><a href="/mali-musavir">Mali müşavirler için</a></li>
              <li><a href="/">Ana sayfa</a></li>
            </ul>
          </div>
          <div>
            <h4>Kurumsal</h4>
            <ul>
              <li><a href="/#nasil">Süreç</a></li>
              <li><a href="/#paketler">Paketler</a></li>
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

export default function SegmentPage({ data }) {
  return (
    <MotionConfig reducedMotion="user">
      <a href="#neden" className="skip">İçeriğe geç</a>
      <ScrollBar />
      <Nav segLabel={data.segLabel} />
      <main>
        <Hero hero={data.hero} />
        <Marquee items={data.marquee} />
        <Value kicker={data.value.kicker} title={data.value.title} items={data.value.items} />
        <Steps title={data.steps.title} steps={data.steps.items} />
        <SegSwitch cross={data.cross} />
        <CtaBand cta={data.cta} />
      </main>
      <Footer />
    </MotionConfig>
  )
}
