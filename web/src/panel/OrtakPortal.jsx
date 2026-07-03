import { useState, useEffect } from 'react'
import GanuMark from '../GanuMark'
import { partnerLogin } from './lib/store.js'
import { StatusBadge, fmtTL } from './pages/_ui.jsx'
import './panel.css'

const SKEY = 'ganu.ortak.session'

export default function OrtakPortal() {
  const [p, setP] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    document.title = 'GANU · İş Ortağı Portalı'
    const saved = localStorage.getItem(SKEY)
    if (saved) partnerLogin(saved).then((x) => { setP(x); setChecking(false) })
    else setChecking(false)
  }, [])

  if (checking) return <div className="pl-login"><div className="pl-empty">Yükleniyor…</div></div>
  if (!p) return <PortalLogin onOk={(x) => { localStorage.setItem(SKEY, x.access_code); setP(x) }} />
  return <PortalHome p={p} onLogout={() => { localStorage.removeItem(SKEY); setP(null) }} />
}

function PortalLogin({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const x = await partnerLogin(code)
    if (x) onOk(x); else setErr(true)
  }
  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <div className="pl-login-mark"><GanuMark /></div>
        <h1>İş Ortağı Portalı</h1>
        <p>Onay sonrası verilen erişim kodu ile giriş yapın</p>
        <label htmlFor="code">Erişim kodu</label>
        <input id="code" value={code} autoFocus
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(false) }}
          className={err ? 'err' : ''} placeholder="ör. ORTAK01" />
        {err && <span className="pl-login-err">Kod bulunamadı ya da hesap henüz aktif değil</span>}
        <button type="submit" className="pl-btn pl-btn-solid">Giriş yap →</button>
        <span className="pl-login-hint">
          Henüz ortak değil misiniz? <a href="/is-ortakligi">İş ortağı olun →</a>
        </span>
      </form>
    </div>
  )
}

function PortalHome({ p, onLogout }) {
  const refs = p.customers || []
  const maskIban = (v) => {
    const s = (v || '').replace(/\s+/g, '')
    if (s.length < 8) return v || '—'
    return `${s.slice(0, 4)} •••• •••• ${s.slice(-4)}`
  }

  return (
    <div className="pl-portal">
      <header className="pl-portal-top">
        <a href="/" className="pl-brand"><GanuMark /><span>iş ortağı</span></a>
        <div className="pl-portal-user">
          <span>{p.name}</span>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={onLogout}>Çıkış</button>
        </div>
      </header>

      <div className="pl-portal-body">
        <div className="pl-head">
          <div>
            <h1>Merhaba, {p.contact || p.name}</h1>
            <p>Getirdiğin müşteriler ve biriken hakedişin tek ekranda.</p>
          </div>
          {p.profession && <span className="pl-badge b-ok" style={{ alignSelf: 'center' }}>{p.profession}</span>}
        </div>

        {/* hakediş özeti */}
        <div className="pl-stats">
          <div className="pl-stat"><div className="lab">Getirdiğin müşteri</div><div className="val">{p.customerCount}</div></div>
          <div className="pl-stat"><div className="lab">Komisyon oranı</div><div className="val">%{p.commissionRate}</div></div>
          <div className="pl-stat"><div className="lab">Biriken hakediş</div><div className="val teal">{fmtTL(p.commissionEarned)}</div></div>
        </div>

        {/* getirilen müşteriler */}
        <div className="pl-card" style={{ marginTop: 20 }}>
          <div className="pl-card-h"><h2>Getirdiğin müşteriler</h2></div>
          <div className="pl-card-b">
            {refs.length === 0 && (
              <div className="pl-empty">
                Henüz sana bağlı müşteri görünmüyor. Müşterini yönlendirdiğinde burada listelenir.
              </div>
            )}
            {refs.map((c) => (
              <div className="pl-row" key={c.id}>
                <div className="grow">
                  <div className="t1">{c.title}</div>
                  <div className="t2">{c.contact || '—'}{c.phone ? ` · ${c.phone}` : ''}</div>
                </div>
                <StatusBadge s={c.status} />
              </div>
            ))}
          </div>
        </div>

        {/* hakediş & ödeme */}
        <div className="pl-card" style={{ marginTop: 20 }}>
          <div className="pl-card-h"><h2>Hakediş &amp; ödeme</h2></div>
          <div className="pl-card-b">
            <div className="pl-row">
              <div className="grow"><div className="t1">Ödeme yapılacak IBAN</div><div className="t2">Değiştirmek için bize yazın</div></div>
              <span className="strong">{maskIban(p.iban)}</span>
            </div>
            <div className="pl-alert" style={{ marginTop: 14 }}>
              <span className="ic" aria-hidden="true">💸</span>
              <span className="msg">
                Ay sonunda ya da üç ayda bir, biriken hakedişin için <b>serbest meslek makbuzunu / faturanı</b> kes ve{' '}
                <a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a> adresine gönder. Tutarı kayıtlı IBAN’ına öderiz.
                Rakamlar ödenmiş faturalar üzerinden, panelde şeffaf hesaplanır.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
