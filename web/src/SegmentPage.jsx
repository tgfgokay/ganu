import { useState } from 'react'
import { withBase } from './base'
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'
import LanguageSwitch from './site/LanguageSwitch.jsx'
import LegalLinks from './legal/LegalLinks.jsx'
import { tr } from './site/locales/tr.js'
import RichTitle from './site/RichTitle.jsx'

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

function Nav({ segLabel, locale, chrome }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href={withBase(locale==='tr'?'/':'/en')} className="wordmark" onClick={close} aria-label="GANU"><GanuMark /></a>
        <span className="mast-meta">{segLabel} · İstanbul</span>
        <button className="nav-toggle" aria-label={open ? (locale==='tr'?'Menüyü kapat':'Close menu') : (locale==='tr'?'Menüyü aç':'Open menu')}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href={`#${locale==='tr'?'neden':'why'}`} onClick={close}>{chrome.why}</a>
          <a href={`#${locale==='tr'?'nasil':'process'}`} onClick={close}>{chrome.process}</a>
          <a href={withBase(locale==='tr'?'/#paketler':'/en#plans')} onClick={close}>{chrome.plans}</a>
          <a href={`#${locale==='tr'?'iletisim':'contact'}`} className="mast-cta" onClick={close}>{chrome.contact} →</a>
          <LanguageSwitch locale={locale}/>
        </div>
      </div>
    </motion.nav>
  )
}

function Hero({ hero, locale, chrome }) {
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
              <a href={`#${locale==='tr'?'iletisim':'contact'}`} className="btn btn-solid">{hero.cta} →</a>
              <a href={withBase(locale==='tr'?'/#paketler':'/en#plans')} className="btn btn-line">{chrome.plans}</a>
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

function Value({ kicker, title, items, locale }) {
  return (
    <section className="section" id={locale==='tr'?'neden':'why'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{kicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={title} /></motion.h2>
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

function Steps({ title, steps, locale, chrome }) {
  return (
    <section className="section dark" id={locale==='tr'?'nasil':'process'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{chrome.processKicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={title} /></motion.h2>
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
        <motion.a className="seg-switch-band" href={withBase(cross.href)} {...reveal} variants={stagger}>
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

function CtaBand({ cta, locale }) {
  return (
    <section className="section cta-sec" id={locale==='tr'?'iletisim':'contact'}>
      <div className="wrap">
        <motion.div className="cta-band" {...reveal} variants={stagger}>
          <motion.h2 variants={rise}><RichTitle value={cta.title} /></motion.h2>
          <motion.p variants={rise}>{cta.text}</motion.p>
          <motion.a variants={rise} href="mailto:merhaba@ganu.com.tr" className="btn btn-solid big">merhaba@ganu.com.tr →</motion.a>
        </motion.div>
      </div>
    </section>
  )
}

function Footer({ locale, chrome }) {
  return (
    <footer className="colophon">
      <div className="wrap">
        <div className="colo-mark"><GanuMark /></div>
        <div className="colo-grid">
          <div className="colo-lead">
            <p>{chrome.lead}</p>
          </div>
          <div>
            <h4>{chrome.partnership}</h4>
            <ul>
              <li><a href={withBase(locale==='tr'?'/is-ortakligi':'/en/partnership')}>{chrome.join}</a></li>
              {locale==='tr'&&<li><a href={withBase('/ortak')}>{chrome.partnerLogin}</a></li>}
              <li><a href={withBase(locale==='tr'?'/avukat':'/en/lawyers')}>{chrome.lawyers}</a></li>
              <li><a href={withBase(locale==='tr'?'/mali-musavir':'/en/accountants')}>{chrome.accountants}</a></li>
              <li><a href={withBase(locale==='tr'?'/blog':'/en/blog')}>Blog</a></li>
              <li><a href={withBase(locale==='tr'?'/':'/en')}>{locale==='tr'?'Ana sayfa':'Home'}</a></li>
            </ul>
          </div>
          <div>
            <h4>{chrome.corporate}</h4>
            <ul>
              <li><a href={withBase(locale==='tr'?'/#nasil':'/en#process')}>{chrome.process}</a></li>
              <li><a href={withBase(locale==='tr'?'/#paketler':'/en#plans')}>{chrome.plans}</a></li>
              <li><a href={`#${locale==='tr'?'iletisim':'contact'}`}>{chrome.contact}</a></li>
            </ul>
          </div>
          <div>
            <h4>{chrome.contact}</h4>
            <ul>
              <li>Kavacık Mah. Okul Cad.</li>
              <li>No:29 · Beykoz / İstanbul</li>
              <li><a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a></li>
              <li><a href="https://ganu.com.tr">ganu.com.tr</a></li>
            </ul>
          </div>
        </div>
        <p className="colo-legal">
          {chrome.legal}
        </p>
        <LegalLinks locale={locale}/>
        <div className="colo-bottom">
          <span>© {new Date().getFullYear()} GANU · Sanal Ofis · İstanbul</span>
          <LanguageSwitch locale={locale}/><span>{locale==='tr'?'Tüm hakları saklıdır.':'All rights reserved.'}</span>
        </div>
      </div>
    </footer>
  )
}

export default function SegmentPage({ data, locale='tr', content=tr }) {
  const chrome=content.segmentChrome
  return (
    <MotionConfig reducedMotion="user">
      <a href={`#${locale==='tr'?'neden':'why'}`} className="skip">{content.chrome.skip}</a>
      <ScrollBar />
      <Nav segLabel={data.segLabel} locale={locale} chrome={chrome}/>
      <main>
        <Hero hero={data.hero} locale={locale} chrome={chrome}/>
        <Marquee items={data.marquee} />
        <Value kicker={data.value.kicker} title={data.value.title} items={data.value.items} locale={locale}/>
        <Steps title={data.steps.title} steps={data.steps.items} locale={locale} chrome={chrome}/>
        <SegSwitch cross={data.cross} />
        <CtaBand cta={data.cta} locale={locale}/>
      </main>
      <Footer locale={locale} chrome={chrome}/>
    </MotionConfig>
  )
}
