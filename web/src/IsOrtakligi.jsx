import { useEffect, useState, useRef } from 'react'
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion'
import GanuMark from './GanuMark'
import { partnerApply, PARTNER_PROFESSIONS } from './panel/lib/store.js'

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

/* ---------- içerik ---------- */
const marquee = ['Komisyonlu Ortaklık', 'Avukatlar', 'Mali Müşavirler', 'Marka & Patent', 'Şirket Kuruluşu', 'Şeffaf Panel', 'Düzenli Ödeme']

const values = [
  { n: '01', t: 'Her müşteride komisyon', d: 'Yönlendirdiğin her müşteri için belirlenen oranda komisyon kazanırsın; ödemeler IBAN’ına düzenli yapılır.' },
  { n: '02', t: 'Şeffaf ortak paneli', d: 'Kaç müşteri getirdiğini, komisyon oranını ve biriken hakedişini kendi panelinden anlık, net görürsün.' },
  { n: '03', t: 'Tek muhatap, tek elden', d: 'Adres, posta, tebligat ve yoklama sürecini biz yürütürüz. Sen mesleğine odaklan, idari yükü bize bırak.' },
  { n: '04', t: 'Mesleğine göre esnek', d: 'Avukat, mali müşavir, marka-patent vekili, şirket kuruluşu danışmanı… Kim olursan ol, aynı program.' },
  { n: '05', t: 'Müşterine değer', d: 'Müşterine prestijli İstanbul iş adresi ve düzenli idari destek sunar, ilişkini güçlendirirsin.' },
  { n: '06', t: 'Düzenli hakediş', d: 'Ay sonunda ya da üç ayda bir serbest meslek makbuzunu kes, gönder; hakedişini IBAN’ına ödeyelim.' },
]

const steps = [
  { n: '1', t: 'Başvur', d: 'Formu doldur; mesleğini ve ödeme için IBAN’ını bırak.' },
  { n: '2', t: 'Onaylanır', d: 'Başvurunu değerlendirir, komisyon oranını belirler, giriş kodunu veririz.' },
  { n: '3', t: 'Müşterini yönlendir', d: 'Adres ihtiyacı olan müşterilerini bize yönlendir.' },
  { n: '4', t: 'Komisyonunu al', d: 'Hakedişini panelden izle; makbuzunu kes, IBAN’ına ödeyelim.' },
]

/* “Sen kimsin?” — meslek seçenekleri (form select ile aynı liste) */
const roles = PARTNER_PROFESSIONS

function ScrollBar() {
  const { scrollYProgress } = useScroll()
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return <motion.div className="progress" style={{ scaleX: x, transformOrigin: '0%' }} aria-hidden="true" />
}

function Nav() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <motion.nav className="masthead"
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
      <div className="wrap mast-inner">
        <a href="/" className="wordmark" onClick={close} aria-label="GANU — ana sayfa"><GanuMark /></a>
        <span className="mast-meta">İş Ortaklığı · İstanbul</span>
        <button className="nav-toggle" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
        </button>
        <div className={`links${open ? ' open' : ''}`} id="nav-links">
          <a href="#neden" onClick={close}>Neden ortak ol</a>
          <a href="#nasil" onClick={close}>Süreç</a>
          <a href="/ortak" onClick={close}>Ortak girişi</a>
          <a href="#basvuru" className="mast-cta" onClick={close}>Ortak ol →</a>
        </div>
      </div>
    </motion.nav>
  )
}

function Hero() {
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <motion.div className="hero-rule top" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
        <div className="hero-topline">
          <motion.span variants={rise} initial="hidden" animate="show">İş Ortaklığı — İstanbul</motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={1}>Komisyonlu yönlendirme programı</motion.span>
        </div>

        <motion.h1 className="hero-title" variants={stagger} initial="hidden" animate="show">
          <motion.span className="line" variants={rise}>Sen yönlendir,</motion.span>
          <motion.span className="line ital" variants={rise}>gerisi</motion.span>
          <motion.span className="line" variants={rise}>bizde<span className="dot">.</span></motion.span>
        </motion.h1>

        <div className="hero-foot">
          <motion.p className="lead" variants={rise} initial="hidden" animate="show" custom={2}>
            Avukat, mali müşavir, marka-patent vekili ya da şirket kuruluşu danışmanı ol — müşterini GANU’ya
            yönlendir; adres ve posta sürecini tek elden biz yürütelim, sen her müşteri için komisyonunu al.
          </motion.p>
          <motion.div className="hero-side" variants={rise} initial="hidden" animate="show" custom={3}>
            <div className="hero-cta">
              <a href="#basvuru" className="btn btn-solid">Ortak ol →</a>
              <a href="/ortak" className="btn btn-line">Ortak girişi</a>
            </div>
            <dl className="stats">
              <div><dt>Komisyon</dt><dd>her müşteride</dd></div>
              <div><dt>Panelden</dt><dd>şeffaf takip</dd></div>
              <div><dt>Düzenli</dt><dd>IBAN’a ödeme</dd></div>
            </dl>
          </motion.div>
        </div>
        <motion.div className="hero-rule" variants={wipe} initial="hidden" animate="show" aria-hidden="true" />
      </div>
    </header>
  )
}

function Marquee() {
  const row = [...marquee, ...marquee]
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

function Value() {
  return (
    <section className="section" id="neden">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Neden GANU — İş ortaklığı</motion.span>
          <motion.h2 variants={rise}>Müşterini yönlendir,<br />kalan iş <em>bizde</em><span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.ol className="index" {...reveal} variants={stagger}>
          {values.map((s) => (
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
          <motion.h2 variants={rise}>Dört adımda<br />ortaklık başlasın<span className="dot">.</span></motion.h2>
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

/* “Sen kimsin?” — meslek seçince formu doldurur ve başvuruya kaydırır */
function Roles({ onPick }) {
  return (
    <section className="section pa-roles-sec">
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Kimler ortak olabilir</motion.span>
          <motion.h2 variants={rise}>Sen <em>kimsin</em>?<span className="dot">.</span></motion.h2>
        </motion.div>
        <motion.div className="pa-roles" {...reveal} variants={stagger}>
          {roles.map((r) => (
            <motion.button type="button" className="pa-role" key={r} variants={rise} onClick={() => onPick(r)}>
              <span className="pa-role-t">{r}</span>
              <span className="pa-role-cta">Bu benim →</span>
            </motion.button>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

const emptyForm = () => ({ name: '', profession: PARTNER_PROFESSIONS[0], contact: '', email: '', phone: '', iban: '', tax_no: '', notes: '' })

function Apply({ formRef, profession }) {
  const [f, setF] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  // “Sen kimsin?” seçimini forma yansıt
  useEffect(() => { if (profession) setF((s) => ({ ...s, profession })) }, [profession])

  const submit = async (e) => {
    e.preventDefault()
    if (!f.name.trim() || !f.email.trim()) { setErr('Lütfen firma adı ve e-posta alanlarını doldurun.'); return }
    setErr(''); setBusy(true)
    try {
      await partnerApply(f)
      setSent(true)
    } catch {
      setErr('Başvuru şu an gönderilemedi. Lütfen merhaba@ganu.com.tr adresine yazın.')
    } finally { setBusy(false) }
  }

  return (
    <section className="section pa-apply-sec" id="basvuru" ref={formRef}>
      <div className="wrap">
        <motion.div className="shead" {...reveal} variants={stagger}>
          <motion.span className="kicker" variants={rise}>Başvuru</motion.span>
          <motion.h2 variants={rise}>İş ortağı <em>ol</em><span className="dot">.</span></motion.h2>
        </motion.div>

        {sent ? (
          <motion.div className="pa-success" {...reveal} variants={rise}>
            <div className="pa-success-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg>
            </div>
            <h3>Başvurunu aldık.</h3>
            <p>
              En kısa sürede döneriz. Onaydan sonra komisyon oranın belirlenir ve sana bir <b>giriş kodu</b> iletiriz;
              bununla <a href="/ortak">ortak paneline</a> girip getirdiğin müşterileri ve biriken hakedişini izlersin.
            </p>
          </motion.div>
        ) : (
          <motion.form className="pa-form" {...reveal} variants={rise} onSubmit={submit}>
            <div className="pa-grid">
              <div className="pa-field">
                <label htmlFor="pa-name">Ad / firma adı *</label>
                <input id="pa-name" value={f.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="ör. Yılmaz Mali Müşavirlik" required />
              </div>
              <div className="pa-field">
                <label htmlFor="pa-prof">Mesleğin *</label>
                <select id="pa-prof" value={f.profession} onChange={(e) => set('profession', e.target.value)}>
                  {PARTNER_PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="pa-field">
                <label htmlFor="pa-contact">Yetkili kişi</label>
                <input id="pa-contact" value={f.contact} onChange={(e) => set('contact', e.target.value)}
                  placeholder="Ad Soyad" />
              </div>
              <div className="pa-field">
                <label htmlFor="pa-phone">Telefon</label>
                <input id="pa-phone" value={f.phone} onChange={(e) => set('phone', e.target.value)}
                  placeholder="05.." inputMode="tel" />
              </div>
              <div className="pa-field">
                <label htmlFor="pa-email">E-posta *</label>
                <input id="pa-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)}
                  placeholder="ornek@firma.com" required />
              </div>
              <div className="pa-field">
                <label htmlFor="pa-tax">Vergi / T.C. no</label>
                <input id="pa-tax" value={f.tax_no} onChange={(e) => set('tax_no', e.target.value)}
                  placeholder="Makbuz için" inputMode="numeric" />
              </div>
              <div className="pa-field pa-wide">
                <label htmlFor="pa-iban">IBAN <span className="pa-hint">— komisyon ödemesi bu hesaba yapılır</span></label>
                <input id="pa-iban" value={f.iban} onChange={(e) => set('iban', e.target.value)}
                  placeholder="TR.. .... .... .... .... .... .." />
              </div>
              <div className="pa-field pa-wide">
                <label htmlFor="pa-note">Not</label>
                <textarea id="pa-note" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)}
                  placeholder="Eklemek istediğin bir şey var mı?" />
              </div>
            </div>

            {err && <p className="pa-err" role="alert">{err}</p>}

            <div className="pa-foot">
              <button type="submit" className="btn btn-solid big" disabled={busy}>
                {busy ? 'Gönderiliyor…' : 'Başvuruyu gönder →'}
              </button>
              <p className="pa-kvkk">
                Bilgilerin yalnızca ortaklık başvurunu değerlendirmek için kullanılır, KVKK’ya uygun saklanır.
                Zaten ortak mısın? <a href="/ortak">Ortak girişi →</a>
              </p>
            </div>
          </motion.form>
        )}
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
            <p>Anahtar teslim sanal ofis &amp; idari sekreterya. Sen yönlendir, gerisi bizde.</p>
          </div>
          <div>
            <h4>İş Ortaklığı</h4>
            <ul>
              <li><a href="#neden">Neden ortak ol</a></li>
              <li><a href="#nasil">Süreç</a></li>
              <li><a href="#basvuru">Ortak ol</a></li>
              <li><a href="/ortak">Ortak girişi</a></li>
            </ul>
          </div>
          <div>
            <h4>Kurumsal</h4>
            <ul>
              <li><a href="/#nasil">Süreç</a></li>
              <li><a href="/#paketler">Paketler</a></li>
              <li><a href="/">Ana sayfa</a></li>
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
          İş ortaklığı; müşteri yönlendirmesine dayalı komisyonlu bir tanıtım iş birliğidir. Adres, posta, tebligat ve
          yoklama süreçlerine ilişkin hizmetlerimiz idari destek ve fiziki iş adresi sağlama niteliğindedir; hukuki
          veya mali danışmanlık hizmeti ya da kesin sonuç garantisi içermez.
        </p>
        <div className="colo-bottom">
          <span>© {new Date().getFullYear()} GANU · Sanal Ofis · İstanbul</span>
          <span>Tüm hakları saklıdır.</span>
        </div>
      </div>
    </footer>
  )
}

export default function IsOrtakligi() {
  const [pickedRole, setPickedRole] = useState('')
  const formRef = useRef(null)
  useEffect(() => { document.title = 'GANU · İş Ortaklığı — Komisyonlu Yönlendirme' }, [])

  const pick = (r) => {
    setPickedRole(r)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <MotionConfig reducedMotion="user">
      <a href="#neden" className="skip">İçeriğe geç</a>
      <ScrollBar />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Value />
        <Steps />
        <Roles onPick={pick} />
        <Apply formRef={formRef} profession={pickedRole} />
      </main>
      <Footer />
    </MotionConfig>
  )
}
