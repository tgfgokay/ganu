import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import GanuMark from '../GanuMark'
import { getUser, login, logout, resetPassword, authMode } from './lib/auth.js'
import Dashboard from './pages/Dashboard.jsx'
import Kargo from './pages/Kargo.jsx'
import Faturalar from './pages/Faturalar.jsx'
import Sozlesmeler from './pages/Sozlesmeler.jsx'
import Musteriler from './pages/Musteriler.jsx'
import MusteriDetay from './pages/MusteriDetay.jsx'
import Bildirimler from './pages/Bildirimler.jsx'
import Yoklama from './pages/Yoklama.jsx'
import Ortaklar from './pages/Ortaklar.jsx'
import Ayarlar from './pages/Ayarlar.jsx'
import './panel.css'

const ICONS = {
  grid: <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  box: <svg viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>,
  doc: <svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>,
  users: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.2 3.2 0 0 1 0 6.4M21 20c0-2.6-1.6-4.8-3.9-5.7"/></svg>,
  gear: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3m0 14v3m10-10h-3M5 12H2m15.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2"/></svg>,
  bill: <svg viewBox="0 0 24 24"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>,
  bell: <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>,
  clip: <svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11l2 2 4-4"/></svg>,
  handshake: <svg viewBox="0 0 24 24"><path d="M11 17l2 2 4-4M3 10l4-4 5 4 5-4 4 4M7 6v6l4 4M17 6v6"/></svg>,
}

function LoginGate({ onOk }) {
  const cloud = authMode === 'supabase'
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(''); setNote('')
    const r = await login({ email, password: pass })
    setBusy(false)
    if (r.ok) onOk()
    else { setErr(r.error || 'Giriş başarısız'); setPass('') }
  }

  const forgot = async () => {
    if (!email.trim()) { setErr('Önce e-posta adresinizi yazın'); return }
    setErr(''); setNote('')
    const r = await resetPassword(email)
    if (r.ok) setNote('Sıfırlama bağlantısı e-postanıza gönderildi.')
    else setErr(r.error)
  }

  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <div className="pl-login-mark"><GanuMark /></div>
        <h1>Yönetim Paneli</h1>
        <p>Devam etmek için giriş yap</p>

        {cloud && (
          <>
            <label htmlFor="em">E-posta</label>
            <input id="em" type="email" value={email} autoFocus autoComplete="username"
              onChange={(e) => { setEmail(e.target.value); setErr('') }}
              className={err ? 'err' : ''} placeholder="ad@ganu.com.tr" />
          </>
        )}

        <label htmlFor="pw">Parola</label>
        <input id="pw" type="password" value={pass} autoComplete="current-password"
          autoFocus={!cloud}
          onChange={(e) => { setPass(e.target.value); setErr('') }}
          className={err ? 'err' : ''} placeholder="••••••••" />

        {err && <span className="pl-login-err">{err}</span>}
        {note && <span className="pl-login-ok">{note}</span>}

        <button type="submit" className="pl-btn pl-btn-solid" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap →'}
        </button>

        {cloud ? (
          <span className="pl-login-hint">
            Ekip hesabınızla girin ·{' '}
            <button type="button" className="pl-linkbtn" onClick={forgot}>parolamı unuttum</button>
          </span>
        ) : (
          <span className="pl-login-hint">İlk giriş parolası: <code>ganu2026</code> · Ayarlar'dan değiştir</span>
        )}
      </form>
    </div>
  )
}

function Shell({ children }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const doLogout = async () => { await logout(); nav('/panel', { replace: true }); window.location.reload() }
  const link = (to, icon, label, end = false) => (
    <NavLink to={to} end={end} className="pl-nav-link" onClick={() => setOpen(false)}>
      <span className="pl-nav-ic" aria-hidden="true">{icon}</span>{label}
    </NavLink>
  )
  return (
    <div className="pl-shell">
      <aside className={`pl-side${open ? ' open' : ''}`}>
        <a href="/" className="pl-brand"><GanuMark /><span>panel</span></a>
        <nav className="pl-nav">
          {link('/panel', ICONS.grid, 'Kontrol Paneli', true)}
          {link('/panel/kargo', ICONS.box, 'Kargo & Posta')}
          {link('/panel/sozlesmeler', ICONS.doc, 'Sözleşmeler')}
          {link('/panel/faturalar', ICONS.bill, 'Fatura & Gelir')}
          {link('/panel/musteriler', ICONS.users, 'Müşteriler')}
          {link('/panel/ortaklar', ICONS.handshake, 'İş Ortakları')}
          {link('/panel/yoklama', ICONS.clip, 'Yoklama')}
          {link('/panel/bildirimler', ICONS.bell, 'Bildirimler')}
          {link('/panel/ayarlar', ICONS.gear, 'Ayarlar')}
        </nav>
        <button className="pl-logout" onClick={doLogout}>Çıkış yap</button>
      </aside>
      {open && <div className="pl-overlay" onClick={() => setOpen(false)} />}
      <div className="pl-main">
        <header className="pl-topbar">
          <button className="pl-burger" aria-label="Menü" onClick={() => setOpen((v) => !v)}>
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
          <a href="/" className="pl-back">← Siteye dön</a>
        </header>
        <div className="pl-content">{children}</div>
      </div>
    </div>
  )
}

export default function PanelApp() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    document.title = 'GANU · Yönetim Paneli'
    getUser().then((u) => { setAuthed(!!u); setChecking(false) })
  }, [])
  if (checking) return <div className="pl-login"><div className="pl-empty">Yükleniyor…</div></div>
  if (!authed) return <LoginGate onOk={() => setAuthed(true)} />
  return (
    <Shell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="kargo" element={<Kargo />} />
        <Route path="sozlesmeler" element={<Sozlesmeler />} />
        <Route path="faturalar" element={<Faturalar />} />
        <Route path="musteriler" element={<Musteriler />} />
        <Route path="musteriler/:id" element={<MusteriDetay />} />
        <Route path="ortaklar" element={<Ortaklar />} />
        <Route path="yoklama" element={<Yoklama />} />
        <Route path="bildirimler" element={<Bildirimler />} />
        <Route path="ayarlar" element={<Ayarlar />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </Shell>
  )
}
