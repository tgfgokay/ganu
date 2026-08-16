import { useState, useRef } from 'react'
import { withBase } from './base'
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'
import LanguageSwitch from './site/LanguageSwitch.jsx'
import LegalLinks from './legal/LegalLinks.jsx'
import { tr } from './site/locales/tr.js'
import RichTitle from './site/RichTitle.jsx'
import { PARTNER_PROFESSIONS } from './site/partnership.js'
import PartnerApply from './partnership/PartnerApply.jsx'

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

/* “Sen kimsin?” — meslek seçenekleri (form select ile aynı liste) */
const roles = PARTNER_PROFESSIONS

function ScrollBar() {
  const { scrollYProgress } = useScroll()
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return <motion.div className="progress" style={{ scaleX: x, transformOrigin: '0%' }} aria-hidden="true" />
}

function Nav({ p, locale }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href={withBase(locale==='tr'?'/':'/en')} className="wordmark" onClick={close} aria-label="GANU"><GanuMark /></a>
        <span className="mast-meta">{p.meta}</span>
        <button className="nav-toggle" aria-label={open ? (locale==='tr'?'Menüyü kapat':'Close menu') : (locale==='tr'?'Menüyü aç':'Open menu')}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href={`#${locale==='tr'?'neden':'why'}`} onClick={close}>{p.nav[0]}</a>
          <a href={`#${locale==='tr'?'nasil':'process'}`} onClick={close}>{p.nav[1]}</a>
          {locale==='tr'&&<a href={withBase('/ortak')} onClick={close}>{p.nav[2]}</a>}
          <a href={`#${locale==='tr'?'basvuru':'apply'}`} className="mast-cta" onClick={close}>{p.nav[3]} →</a><LanguageSwitch locale={locale}/>
        </div>
      </div>
    </motion.nav>
  )
}

function Hero({ p, locale }) {
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <motion.div className="hero-rule top" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
        <div className="hero-topline">
          <motion.span variants={rise} initial="hidden" animate="show">{p.hero.eyebrow}</motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={1}>{p.hero.eyebrow2}</motion.span>
        </div>

        <motion.h1 className="hero-title" variants={stagger} initial="hidden" animate="show">
          <motion.span className="line" variants={rise}>{p.hero.lines[0]}</motion.span><motion.span className="line ital" variants={rise}>{p.hero.lines[1]}</motion.span><motion.span className="line" variants={rise}>{p.hero.lines[2]}<span className="dot">.</span></motion.span>
        </motion.h1>

        <div className="hero-foot">
          <motion.p className="lead" variants={rise} initial="hidden" animate="show" custom={2}>
            {p.hero.lead}
          </motion.p>
          <motion.div className="hero-side" variants={rise} initial="hidden" animate="show" custom={3}>
            <div className="hero-cta">
              <a href={`#${locale==='tr'?'basvuru':'apply'}`} className="btn btn-solid">{p.hero.primary} →</a>{locale==='tr'&&<a href={withBase('/ortak')} className="btn btn-line">{p.hero.secondary}</a>}
            </div>
            <dl className="stats">
              {p.hero.stats.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </motion.div>
        </div>
        <motion.div className="hero-rule" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
      </div>
    </header>
  )
}

function Marquee({ p }) {
  const row = [...p.marquee, ...p.marquee]
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

function Value({ p, locale }) {
  return (
    <section className="section" id={locale==='tr'?'neden':'why'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{p.valueKicker}</motion.span><motion.h2 variants={rise}><RichTitle value={p.valueTitle} dot /></motion.h2>
        </motion.div>
        <motion.ol className="index" {...reveal} variants={stagger}>
          {p.values.map(([title,desc],i) => (
            <motion.li className="index-row" key={title} variants={rise}><span className="idx-num">{String(i+1).padStart(2,'0')}</span><h3 className="idx-title">{title}</h3><p className="idx-desc">{desc}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}

function Steps({ p, locale }) {
  return (
    <section className="section dark" id={locale==='tr'?'nasil':'process'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{locale==='tr'?'Süreç':'Process'}</motion.span><motion.h2 variants={rise}><RichTitle value={p.processTitle} dot /></motion.h2>
        </motion.div>
        <motion.div className="steps" {...reveal} variants={stagger}>
          {p.steps.map(([title,desc],i) => (
            <motion.div className="step" key={title} variants={rise}><div className="step-num">{i+1}</div><h3>{title}</h3><p>{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* “Sen kimsin?” — meslek seçince formu doldurur ve başvuruya kaydırır */
function Roles({ onPick, p, locale }) {
  return (
    <section className="section pa-roles-sec">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{p.rolesKicker}</motion.span><motion.h2 variants={rise}><RichTitle value={p.rolesTitle} dot /></motion.h2>
        </motion.div>
        <motion.div className="pa-roles" {...reveal} variants={stagger}>
          {roles.map((r) => (
            <motion.button type="button" className="pa-role" key={r} variants={rise} onClick={() => onPick(r)}>
              <span className="pa-role-t">{locale==='tr'?r:({'Mali müşavir':'Accountant / tax adviser','Avukat':'Lawyer','Marka & patent vekili':'IP adviser','Şirket kuruluşu danışmanı':'Company formation adviser','Diğer':'Other'}[r]||r)}</span><span className="pa-role-cta">{p.roleCta} →</span>
            </motion.button>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Footer({ p, locale }) {
  return (
    <footer className="colophon">
      <div className="wrap">
        <div className="colo-mark"><GanuMark /></div>
        <div className="colo-grid">
          <div className="colo-lead">
            <p>{locale==='tr'?'Anahtar teslim sanal ofis & idari sekreterya. Sen yönlendir, gerisi bizde.':'International referrals backed by a real Istanbul office-service team.'}</p>
          </div>
          <div>
            <h4>{locale==='tr'?'İş Ortaklığı':'Partnership'}</h4>
            <ul>
              <li><a href={`#${locale==='tr'?'neden':'why'}`}>{p.nav[0]}</a></li><li><a href={`#${locale==='tr'?'nasil':'process'}`}>{p.nav[1]}</a></li><li><a href={`#${locale==='tr'?'basvuru':'apply'}`}>{p.nav[3]}</a></li>{locale==='tr'&&<li><a href={withBase('/ortak')}>{p.nav[2]}</a></li>}
            </ul>
          </div>
          <div>
            <h4>{locale==='tr'?'Kurumsal':'Company'}</h4>
            <ul>
              <li><a href={withBase(locale==='tr'?'/#nasil':'/en#process')}>{locale==='tr'?'Süreç':'Process'}</a></li><li><a href={withBase(locale==='tr'?'/#paketler':'/en#plans')}>{locale==='tr'?'Paketler':'Services'}</a></li><li><a href={withBase(locale==='tr'?'/blog':'/en/blog')}>Blog</a></li><li><a href={withBase(locale==='tr'?'/':'/en')}>{locale==='tr'?'Ana sayfa':'Home'}</a></li>
            </ul>
          </div>
          <div>
            <h4>{locale==='tr'?'İletişim':'Contact'}</h4>
            <ul>
              <li>Kavacık Mah. Okul Cad.</li>
              <li>No:29 · Beykoz / İstanbul</li>
              <li><a href="mailto:info@ganu.com.tr">info@ganu.com.tr</a></li>
              <li><a href="https://ganu.com.tr">ganu.com.tr</a></li>
            </ul>
          </div>
        </div>
        <p className="colo-legal">
          {p.legal}
        </p>
        <LegalLinks locale={locale}/>
        <div className="colo-bottom">
          <span>© {new Date().getFullYear()} GANU · {p.meta}</span>
          <LanguageSwitch locale={locale}/><span>{locale==='tr'?'Tüm hakları saklıdır.':'All rights reserved.'}</span>
        </div>
      </div>
    </footer>
  )
}

export default function IsOrtakligi({ content=tr, locale='tr' }) {
  const p=content.partnership
  const [pickedRole, setPickedRole] = useState('')
  const formRef = useRef(null)

  const pick = (r) => {
    setPickedRole(r)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <MotionConfig reducedMotion="user">
      <a href={`#${locale==='tr'?'neden':'why'}`} className="skip">{content.chrome.skip}</a>
      <ScrollBar />
      <Nav p={p} locale={locale}/>
      <main>
        <Hero p={p} locale={locale}/><Marquee p={p}/><Value p={p} locale={locale}/><Steps p={p} locale={locale}/><Roles onPick={pick} p={p} locale={locale}/><PartnerApply formRef={formRef} profession={pickedRole} p={p} locale={locale}/>
      </main>
      <Footer p={p} locale={locale}/>
    </MotionConfig>
  )
}
