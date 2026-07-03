import { useState, useEffect } from 'react'
import GanuMark from '../GanuMark'
import {
  customerLogin, contracts, mail, invoices, documents, requests,
  REQUEST_KINDS,
} from './lib/store.js'
import { Modal, StatusBadge, TypeBadge, DaysBadge, fmtDate, fmtTL } from './pages/_ui.jsx'
import './panel.css'

const SKEY = 'ganu.musteri.session'

export default function MusteriPortal() {
  const [cust, setCust] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    document.title = 'GANU · Müşteri Portalı'
    const saved = localStorage.getItem(SKEY)
    if (saved) customerLogin(saved).then((c) => { setCust(c); setChecking(false) })
    else setChecking(false)
  }, [])

  if (checking) return <div className="pl-login"><div className="pl-empty">Yükleniyor…</div></div>
  if (!cust) return <PortalLogin onOk={(c) => { localStorage.setItem(SKEY, c.access_code); setCust(c) }} />
  return <PortalHome cust={cust} onLogout={() => { localStorage.removeItem(SKEY); setCust(null) }} />
}

function PortalLogin({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const c = await customerLogin(code)
    if (c) onOk(c); else { setErr(true) }
  }
  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <div className="pl-login-mark"><GanuMark /></div>
        <h1>Müşteri Portalı</h1>
        <p>Size verilen erişim kodu ile giriş yapın</p>
        <label htmlFor="code">Erişim kodu</label>
        <input id="code" value={code} autoFocus
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(false) }}
          className={err ? 'err' : ''} placeholder="ör. AYDIN01" />
        {err && <span className="pl-login-err">Kod bulunamadı</span>}
        <button type="submit" className="pl-btn pl-btn-solid">Giriş yap →</button>
        <span className="pl-login-hint">Kodunuz yoksa sanal ofis firmanızla iletişime geçin.</span>
      </form>
    </div>
  )
}

function PortalHome({ cust, onLogout }) {
  const [ct, setCt] = useState([])
  const [ml, setMl] = useState([])
  const [inv, setInv] = useState([])
  const [docs, setDocs] = useState([])
  const [reqs, setReqs] = useState([])
  const [reqModal, setReqModal] = useState(null) // {mail_id}

  const load = async () => {
    const [a, b, d, e, r] = await Promise.all([contracts.list(), mail.list(), invoices.list(), documents.list(), requests.list()])
    setCt(a.filter((x) => x.customer_id === cust.id))
    setMl(b.filter((x) => x.customer_id === cust.id))
    setInv(d.filter((x) => x.customer_id === cust.id))
    setDocs(e.filter((x) => x.customer_id === cust.id))
    setReqs(r.filter((x) => x.customer_id === cust.id))
  }
  useEffect(() => { load() }, [cust.id])

  const sendReq = async ({ kind, note, mail_id }) => {
    await requests.create({ customer_id: cust.id, mail_id: mail_id || '', kind, note, status: 'yeni' })
    setReqModal(null); load()
  }

  const outstanding = inv.filter((i) => i.status !== 'ödendi')

  return (
    <div className="pl-portal">
      <header className="pl-portal-top">
        <a href="/" className="pl-brand"><GanuMark /><span>müşteri</span></a>
        <div className="pl-portal-user">
          <span>{cust.title}</span>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={onLogout}>Çıkış</button>
        </div>
      </header>

      <div className="pl-portal-body">
        <div className="pl-head">
          <div><h1>Merhaba, {cust.contact || cust.title}</h1><p>Kargolarınız, sözleşmeniz ve belgeleriniz tek ekranda.</p></div>
          <button className="pl-btn pl-btn-teal" onClick={() => setReqModal({ mail_id: '' })}>+ Talep oluştur</button>
        </div>

        {outstanding.length > 0 && (
          <div className="pl-alert"><span className="ic">💳</span><span className="msg">
            <b>{outstanding.length} ödenmemiş faturanız</b> var — toplam {fmtTL(outstanding.reduce((s, i) => s + (Number(i.amount) || 0), 0))}.
          </span></div>
        )}

        {/* kargolar */}
        <div className="pl-card" style={{ marginBottom: 20 }}>
          <div className="pl-card-h"><h2>Kargo & Postalarım</h2></div>
          <div className="pl-card-b">
            {ml.length === 0 && <div className="pl-empty">Henüz gönderi yok.</div>}
            {ml.map((m) => (
              <div className="pl-row" key={m.id}>
                {m.photo_url ? <img src={m.photo_url} alt="" className="pl-thumb" /> : <TypeBadge t={m.type} />}
                <div className="grow">
                  <div className="t1">{m.type === 'tebligat' ? '⚠️ Resmi Tebligat' : m.sender || m.type}</div>
                  <div className="t2">{fmtDate(m.received_date)} · {m.sender || '—'}</div>
                </div>
                <StatusBadge s={m.status} />
                {(m.status === 'geldi' || m.status === 'bildirildi') && (
                  <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setReqModal({ mail_id: m.id })}>Talep</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="pl-grid2">
          {/* sözleşme */}
          <div className="pl-card">
            <div className="pl-card-h"><h2>Sözleşmem</h2></div>
            <div className="pl-card-b">
              {ct.length === 0 && <div className="pl-empty">Sözleşme yok.</div>}
              {ct.map((c) => (
                <div className="pl-row" key={c.id}>
                  <div className="grow">
                    <div className="t1">{c.package}</div>
                    <div className="t2">Biter: {fmtDate(c.end_date)}</div>
                  </div>
                  <DaysBadge endDate={c.end_date} />
                </div>
              ))}
            </div>
          </div>

          {/* belgeler */}
          <div className="pl-card">
            <div className="pl-card-h"><h2>Belgelerim</h2></div>
            <div className="pl-card-b">
              {docs.length === 0 && <div className="pl-empty">Belge yok.</div>}
              {docs.map((d) => (
                <div className="pl-row" key={d.id}>
                  <div className="grow"><div className="t1">{d.name}</div>{d.note && <div className="t2">{d.note}</div>}</div>
                  {d.file_url && <a className="pl-btn pl-btn-ghost pl-btn-sm" href={d.file_url} download={d.name}>İndir</a>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* taleplerim */}
        <div className="pl-card" style={{ marginTop: 20 }}>
          <div className="pl-card-h"><h2>Taleplerim</h2></div>
          <div className="pl-card-b">
            {reqs.length === 0 && <div className="pl-empty">Henüz talep yok.</div>}
            {reqs.map((r) => (
              <div className="pl-row" key={r.id}>
                <span className="pl-badge b-kargo">{r.kind}</span>
                <div className="grow"><div className="t1">{r.note || '—'}</div><div className="t2">{fmtDate(r.created_at)}</div></div>
                <span className={`pl-badge ${r.status === 'tamamlandı' ? 'b-ok' : r.status === 'reddedildi' ? 'b-danger' : 'b-warn'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reqModal && <TalepForm mailId={reqModal.mail_id} onClose={() => setReqModal(null)} onSave={sendReq} />}
    </div>
  )
}

function TalepForm({ mailId, onClose, onSave }) {
  const [f, setF] = useState({ kind: 'yönlendirme', note: '', mail_id: mailId })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); onSave(f) }
  return (
    <Modal title="Talep oluştur" onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="talep-form" type="submit">Gönder</button>
      </>}>
      <form id="talep-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Talep türü</label>
          <select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            {REQUEST_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="pl-field">
          <label>Açıklama</label>
          <textarea value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="ör. Kadıköy şubeme yönlendirin, adres: …" />
        </div>
      </form>
    </Modal>
  )
}
