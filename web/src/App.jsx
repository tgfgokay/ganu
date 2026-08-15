import { useState, useEffect, useReducer } from 'react'
import { withBase } from './base'
import { motion, useScroll, useSpring, useTransform, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'
import { PACKAGE_MONTHLY, PACKAGE_PRICES, PACKAGE_CUSTOM, loadCatalog, onCatalog, usingSupabase } from './catalog.js'
import LanguageSwitch from './site/LanguageSwitch.jsx'
import { tr } from './site/locales/tr.js'
import RichTitle from './site/RichTitle.jsx'
import LegalLinks from './legal/LegalLinks.jsx'
import { salesEnabled } from './legal/config.js'

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

const stepIcons = {
  pick: <><path d="M9 12l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="2.5" /></>,
  docs: <><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13h6M9 17h4" /></>,
  address: <><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" /><circle cx="12" cy="11" r="2.3" /></>,
  focus: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></>,
}

/* Fiyat tek kaynak: store.js PACKAGE_MONTHLY / PACKAGE_PRICES (Supabase 'packages'
   tablosundan yüklenir). Yıllık gösterim = yıllık peşin tutarın aylık karşılığı.
   Katalog runtime yüklendiği için tiers RENDER anında hesaplanır (buildTiers). */
const trTL = (n) => Math.round(n).toLocaleString('tr-TR')
function buildTiers(t) {
  return [
    { name: 'Başlangıç', feat: false },
    { name: 'Pro', feat: true },
    { name: 'Kurumsal', feat: false },
  ].map(({ name, feat }) => {
    if (usingSupabase && PACKAGE_PRICES[name] == null && !PACKAGE_CUSTOM.has(name)) {
      return { name, m: t.pricing.loadError, y: t.pricing.loadError, per: '', unavailable: true, items: t.pricing.items[name] || [] }
    }
    const custom = PACKAGE_CUSTOM.has(name) || PACKAGE_PRICES[name] == null
    return custom
      ? { name, m: t.pricing.quoteWord, y: t.pricing.quoteWord, per: '', custom: true, items: t.pricing.items[name] || [] }
      : { name, m: trTL(PACKAGE_MONTHLY[name]), y: trTL(PACKAGE_PRICES[name] / 12), per: t.pricing.perMonth, feat, items: t.pricing.items[name] || [] }
  })
}

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

function Nav({ t, locale }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href="#top" className="wordmark" onClick={close} aria-label="GANU — ana sayfa"><GanuMark /></a>
        <span className="mast-meta">{t.meta}</span>
        <button className="nav-toggle" aria-label={open ? t.chrome.closeMenu : t.chrome.openMenu}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href={`#${locale==='tr'?'hizmetler':'services'}`} onClick={close}>{t.chrome.services}</a>
          <a href={`#${locale==='tr'?'nasil':'process'}`} onClick={close}>{t.chrome.process}</a>
          <a href={`#${locale==='tr'?'paketler':'plans'}`} onClick={close}>{t.chrome.plans}</a>
          <a href={withBase(locale==='tr'?'/blog':'/en/blog')} onClick={close}>{t.chrome.blog}</a>
          <a href={withBase(locale==='tr'?'/is-ortakligi':'/en/partnership')} onClick={close}>{t.chrome.partnership}</a>
          {locale==='tr'&&<a href={withBase("/musteri")} className="mast-login" onClick={close} aria-label="Müşteri girişi">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }}>
              <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>{t.chrome.customerLogin}
          </a>}
          {locale==='tr'?<a href={withBase(salesEnabled?'/satin-al':'/mesafeli-satis#satis-kapali')} className="mast-cta" onClick={close}>{salesEnabled?t.chrome.buy:'Satış hazırlıkta'} →</a>:<a href="mailto:info@ganu.com.tr?subject=Istanbul%20virtual%20office%20quote" className="mast-cta" onClick={close}>{t.chrome.buy} →</a>}
          <LanguageSwitch locale={locale}/>
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

function Hero({ t, locale }) {
  return (
    <header className="hero hero--photo" id="top">
      <div className="hero-photo" aria-hidden="true" />
      <HeroPlate />
      <div className="wrap">
        <motion.div className="hero-rule top" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
        <div className="hero-topline">
          <motion.span variants={rise} initial="hidden" animate="show">{t.hero.eyebrow}</motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={1}>{t.hero.eyebrow2}</motion.span>
        </div>

        <motion.h1 className="hero-title" variants={stagger} initial="hidden" animate="show">
          <motion.span className="line" variants={rise}>{t.hero.lines[0]}</motion.span>
          <motion.span className="line ital" variants={rise}>{t.hero.lines[1]}</motion.span>
          <motion.span className="line" variants={rise}>{t.hero.lines[2]}<span className="dot">.</span></motion.span>
        </motion.h1>

        <div className="hero-foot">
          <motion.p className="lead" variants={rise} initial="hidden" animate="show" custom={2}>
            {t.hero.lead}
          </motion.p>
          <motion.div className="hero-side" variants={rise} initial="hidden" animate="show" custom={3}>
            <div className="hero-cta">
              <a href={`#${locale==='tr'?'paketler':'plans'}`} className="btn btn-solid">{t.hero.primary} →</a>
              <a href={`#${locale==='tr'?'iletisim':'contact'}`} className="btn btn-line">{t.hero.secondary}</a>
            </div>
            <dl className="stats">
              {t.hero.stats.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </motion.div>
        </div>
        <motion.div className="hero-rule" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
      </div>
    </header>
  )
}

function Marquee({ t }) {
  const row = [...t.marquee, ...t.marquee]
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

function Services({ t, locale }) {
  return (
    <section className="section" id={locale==='tr'?'hizmetler':'services'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{t.servicesKicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={t.servicesTitle} dot /></motion.h2>
        </motion.div>
        <motion.ol className="index" {...reveal} variants={stagger}>
          {t.services.map(([title,desc],i) => (
            <motion.li className="index-row" key={title} variants={rise}>
              <span className="idx-num">{String(i+1).padStart(2,'0')}</span>
              <h3 className="idx-title">{title}</h3>
              <p className="idx-desc">{desc}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}

function Steps({ t, locale }) {
  return (
    <section className="section dark" id={locale==='tr'?'nasil':'process'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{t.processKicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={t.processTitle} dot /></motion.h2>
        </motion.div>
        <motion.div className="flow" {...reveal} variants={stagger}>
          <motion.span className="flow-rail" variants={wipe} aria-hidden="true" />
          {t.steps.map(([ic,title,desc],i) => (
            <motion.div className="flow-step" key={title} variants={rise}>
              <div className="flow-node">
                <svg className="flow-ic" viewBox="0 0 24 24" aria-hidden="true">{stepIcons[ic]}</svg>
                <span className="flow-n">{i+1}</span>
              </div>
              <div className="flow-body">
                <h3>{title}</h3><p>{desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Trust({ t }) {
  return (
    <section className="section" id="guven">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{t.trustKicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={t.trustTitle} dot /></motion.h2>
        </motion.div>
        <motion.div className="trust" {...reveal} variants={stagger}>
          {t.trust.map(([icon,title,desc]) => (
            <motion.div className="trust-item" key={title} variants={rise}>
              <svg className="trust-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none">{trustIcons[icon]}</svg>
              <h3>{title}</h3><p>{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Pricing({ t, locale }) {
  const [yearly, setYearly] = useState(false)
  const [, bumpCatalog] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const unsubscribe=onCatalog(bumpCatalog); void loadCatalog()
    return unsubscribe
  }, [])
  const tiers = buildTiers(t)
  return (
    <section className="section pricing-sec" id={locale==='tr'?'paketler':'plans'}>
      <div className="wrap">
        {/* Başlık ve faturalama düğmesi aynı satırda: dikey yığınca kartlar
            ilk ekranda ortadan kesiliyordu. */}
        <div className="pricing-head">
          <motion.div className="shead" {...reveal} variants={stagger}>
            <motion.span className="kicker" variants={rise}>{t.pricing.kicker}</motion.span>
            <motion.h2 variants={rise}><RichTitle value={t.pricing.title} dot /></motion.h2>
          </motion.div>

          <motion.div className="billing" {...reveal} variants={rise}>
            <button type="button" role="switch" aria-checked={yearly}
              aria-label={t.pricing.toggle}
              className={`billing-toggle${yearly ? ' on' : ''}`} onClick={() => setYearly((v) => !v)}>
              <span className={`opt${yearly ? '' : ' active'}`}>{t.pricing.monthly}</span>
              <span className="knob" aria-hidden="true" />
              <span className={`opt${yearly ? ' active' : ''}`}>{t.pricing.yearly}</span>
            </button>
            <span className="billing-note">{locale==='tr'?<>Yıllık öde, <b>2 ay bedava</b></>:t.pricing.note}</span>
          </motion.div>
        </div>

        <motion.div className="tiers" {...reveal} variants={stagger}>
          {tiers.map((tier) => (
            <motion.div className={`tier${tier.feat ? ' feat' : ''}`} key={tier.name} variants={rise}>
              <div className="tier-head">
                <h3>{t.pricing.names[tier.name]}</h3>
                {tier.feat && <span className="tag">{t.pricing.popular}</span>}
              </div>
              <div className="price">
                {tier.custom || tier.unavailable
                  ? <span className="price-word">{tier.m}</span>
                  : <><span className="price-num">{yearly ? tier.y : tier.m}</span><span className="price-per">{tier.per}</span></>}
              </div>
              <div className="price-sub">
                {tier.unavailable ? t.pricing.catalog : tier.custom ? t.pricing.custom : yearly ? t.pricing.annual : t.pricing.monthlyBill}
              </div>
              <ul>
                {tier.items.map((i) => (
                  <li key={i}><Check /><span>{i}</span></li>
                ))}
              </ul>
              {tier.unavailable
                ? <span className="btn btn-line" aria-disabled="true">{t.pricing.unavailable}</span>
                : locale==='tr'?<a href={withBase(salesEnabled?`/satin-al?paket=${encodeURIComponent(tier.name)}`:'/mesafeli-satis#satis-kapali')} className={`btn ${tier.feat ? 'btn-solid' : 'btn-line'}`}>{salesEnabled?(tier.custom?t.pricing.quote:t.pricing.purchase):'Satış hazırlıkta'} →</a>
                :<a href={`mailto:info@ganu.com.tr?subject=${encodeURIComponent(`Quote: ${t.pricing.names[tier.name]}`)}`} className={`btn ${tier.feat?'btn-solid':'btn-line'}`}>{t.pricing.quote} →</a>}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Faq({ t, locale }) {
  const [open, setOpen] = useState(0)
  return (
    <section className="section" id={locale==='tr'?'sss':'faq'}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>{t.faqKicker}</motion.span>
          <motion.h2 variants={rise}><RichTitle value={t.faqTitle} dot /></motion.h2>
        </motion.div>
        <motion.div className="faq" {...reveal} variants={stagger}>
          {t.faqs.map(([q,a], i) => {
            const isOpen = open === i
            return (
              <motion.div className={`faq-item${isOpen ? ' open' : ''}`} key={q} variants={rise}>
                <h3>
                  <button type="button" className="faq-q" aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                    <span className="faq-qt">{q}</span>
                    <span className="faq-ico" aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-a" id={`faq-a-${i}`} role="region">
                  <p>{a}</p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

function CtaBand({ t, locale }) {
  return (
    <section className="section cta-sec" id={locale==='tr'?'iletisim':'contact'}>
      <div className="wrap">
        <motion.div className="cta-band" {...reveal} variants={stagger}>
          <motion.h2 variants={rise}><RichTitle value={t.cta.title} dot /></motion.h2>
          <motion.p variants={rise}>{t.cta.text}</motion.p>
          <motion.a variants={rise} href={locale==='tr'?withBase(salesEnabled?'/satin-al':'/mesafeli-satis#satis-kapali'):'mailto:info@ganu.com.tr?subject=Istanbul%20virtual%20office%20quote'} className="btn btn-solid big">{locale==='tr'&&!salesEnabled?'Satış hazırlıkta':t.cta.button} →</motion.a>
          <motion.p variants={rise} style={{ marginTop: 12, fontSize: 14, opacity: 0.75 }}>
            {t.cta.question} <a href="mailto:info@ganu.com.tr">info@ganu.com.tr</a>
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}

function Footer({ t, locale }) {
  return (
    <footer className="colophon">
      <div className="wrap">
        <div className="colo-mark"><GanuMark /></div>
        <div className="colo-grid">
          <div className="colo-lead">
            <p>{t.footer.lead}</p>
          </div>
          <div>
            <h4>{t.chrome.services}</h4>
            <ul>
              {t.services.map(([x])=><li key={x}><a href={`#${locale==='tr'?'hizmetler':'services'}`}>{x}</a></li>)}
            </ul>
          </div>
          <div>
            <h4>{t.chrome.partnership}</h4>
            <ul>
              <li><a href={withBase(locale==='tr'?'/is-ortakligi':'/en/partnership')}>{locale==='tr'?'Ortak ol · komisyon':'Referral programme'}</a></li>
              <li><a href={withBase(locale==='tr'?'/avukat':'/en/lawyers')}>{locale==='tr'?'Avukatlar için':'For law firms'}</a></li>
              <li><a href={withBase(locale==='tr'?'/mali-musavir':'/en/accountants')}>{locale==='tr'?'Mali müşavirler için':'For accountants & advisers'}</a></li>
              <li><a href={withBase(locale==='tr'?'/blog':'/en/blog')}>{t.chrome.blog}</a></li>
            </ul>
          </div>
          <div>
            <h4>{locale==='tr'?'Kurumsal':'Company'}</h4>
            <ul>
              {locale==='tr'&&<li><a href={withBase('/musteri')}><b>{t.chrome.customerLogin}</b></a></li>}
              <li><a href={`#${locale==='tr'?'paketler':'plans'}`}>{t.chrome.plans}</a></li>
              <li><a href={`#${locale==='tr'?'sss':'faq'}`}>{locale==='tr'?'SSS':'FAQ'}</a></li>
            </ul>
          </div>
          <div>
            <h4>{t.chrome.contact}</h4>
            <ul>
              <li>Kavacık Mah. Okul Cad.</li>
              <li>No:29 · Beykoz / İstanbul</li>
              <li><a href="mailto:info@ganu.com.tr">info@ganu.com.tr</a></li>
              <li><a href="https://ganu.com.tr">ganu.com.tr</a></li>
            </ul>
          </div>
        </div>
        <p className="colo-legal">
          {t.footer.legal}
        </p>
        <LegalLinks locale={locale}/>
        <div className="colo-bottom">
          <span>© {new Date().getFullYear()} GANU · {t.meta}</span><LanguageSwitch locale={locale}/>
          <span>{t.chrome.rights}</span>
        </div>
      </div>
    </footer>
  )
}

export default function App({ content=tr, locale='tr' }) {
  const t={...content.home,chrome:content.chrome}
  return (
    <MotionConfig reducedMotion="user">
      <a href={`#${locale==='tr'?'hizmetler':'services'}`} className="skip">{content.chrome.skip}</a>
      <ScrollBar />
      <Nav t={t} locale={locale}/>
      <main>
        <Hero t={t} locale={locale}/><Marquee t={t}/><Services t={t} locale={locale}/><Steps t={t} locale={locale}/><Trust t={t}/><Pricing t={t} locale={locale}/><Faq t={t} locale={locale}/><CtaBand t={t} locale={locale}/>
      </main>
      <Footer t={t} locale={locale}/>
    </MotionConfig>
  )
}
