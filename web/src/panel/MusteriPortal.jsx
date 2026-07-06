import { useState, useEffect } from 'react'
import GanuMark from '../GanuMark'
import {
  customerLogin, customerLoginEmail, customerChangePassword, customers, contracts, mail, invoices, documents, requests,
  requestThread, sendRequestMessage, invStatus, getConfig,
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
  if (!cust.kvkk_consent_at) return <KvkkGate cust={cust} onAccept={setCust}
    onLogout={() => { localStorage.removeItem(SKEY); setCust(null) }} />
  return <PortalHome cust={cust} onLogout={() => { localStorage.removeItem(SKEY); setCust(null) }} />
}

/* KVKK aydınlatma + açık rıza — onaylanmadan portal açılmaz (6698 s. KVKK) */
function KvkkGate({ cust, onAccept, onLogout }) {
  const [busy, setBusy] = useState(false)
  const accept = async () => {
    setBusy(true)
    const updated = await customers.update(cust.id, { kvkk_consent_at: new Date().toISOString() })
    onAccept(updated || { ...cust, kvkk_consent_at: new Date().toISOString() })
  }
  return (
    <div className="pl-login">
      <div className="pl-login-card" style={{ maxWidth: 560 }}>
        <div className="pl-login-mark"><GanuMark /></div>
        <h1>KVKK Aydınlatma ve Açık Rıza</h1>
        <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #4c637b)', maxHeight: 260, overflowY: 'auto', textAlign: 'left', margin: '10px 0 16px' }}>
          <p><b>Veri sorumlusu:</b> GANU Sanal Ofis. Sanal ofis hizmet sözleşmesi kapsamında
          kimlik, iletişim, vergi ve gönderi (posta/kargo/tebligat) verileriniz; hizmetin ifası,
          yasal yükümlülükler (VUK, TTK, Tebligat Kanunu, MASAK) ve iletişim amaçlarıyla işlenir.</p>
          <p style={{ marginTop: 8 }}><b>Açık rıza:</b> Adınıza gelen posta ve kargoların teslim alınması,
          kaydedilmesi, size bildirilmesi ve talebiniz hâlinde taranıp iletilmesi için gönderi
          bilgilerinizin işlenmesine rıza vermiş olursunuz. Rızanızı dilediğiniz an geri alabilirsiniz.</p>
          <p style={{ marginTop: 8 }}>Ayrıntılı metin: sözleşme ekinde yer alan <b>KVKK Aydınlatma Metni</b>
          {' '}ve <b>Tebligat/Posta Tarama Açık Rıza Formu</b>. Sorularınız için: merhaba@ganu.com.tr</p>
        </div>
        <button className="pl-btn pl-btn-solid" onClick={accept} disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Kaydediliyor…' : 'Okudum, onaylıyorum →'}
        </button>
        <button className="pl-btn pl-btn-ghost" onClick={onLogout} style={{ width: '100%', marginTop: 8 }}>Vazgeç / Çıkış</button>
      </div>
    </div>
  )
}

function PortalLogin({ onOk }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const r = await customerLoginEmail({ email, password: pass })
    setBusy(false)
    if (r.ok) onOk(r.customer); else { setErr(r.error); setPass('') }
  }
  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <div className="pl-login-mark"><GanuMark /></div>
        <h1>Müşteri Girişi</h1>
        <p>E-posta ve şifrenizle giriş yapın</p>
        <label htmlFor="em">E-posta</label>
        <input id="em" type="email" value={email} autoFocus autoComplete="username"
          onChange={(e) => { setEmail(e.target.value); setErr('') }}
          className={err ? 'err' : ''} placeholder="ad@firma.com" />
        <label htmlFor="pw">Şifre</label>
        <input id="pw" type="password" value={pass} autoComplete="current-password"
          onChange={(e) => { setPass(e.target.value); setErr('') }}
          className={err ? 'err' : ''} placeholder="••••••••" />
        {err && <span className="pl-login-err">{err}</span>}
        <button type="submit" className="pl-btn pl-btn-solid" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap →'}</button>
        <span className="pl-login-hint">
          İlk şifreniz, satın alma sonrası verilen <b>erişim kodunuzdur</b> — girince değiştirebilirsiniz.
          Sorun için: <a href="mailto:merhaba@ganu.com.tr" className="pl-link">merhaba@ganu.com.tr</a>
        </span>
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
  const [chatReq, setChatReq] = useState(null)   // konuşması açık talep
  const [payInv, setPayInv] = useState(null)     // ödeme ekranı açık fatura
  const [pwModal, setPwModal] = useState(false)  // şifre değiştir

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

  const outstanding = inv.filter((i) => invStatus(i) !== 'ödendi')

  return (
    <div className="pl-portal">
      <header className="pl-portal-top">
        <a href="/" className="pl-brand"><GanuMark /><span>müşteri</span></a>
        <div className="pl-portal-user">
          <span>{cust.title}</span>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setPwModal(true)}>Şifre</button>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={onLogout}>Çıkış</button>
        </div>
      </header>

      <div className="pl-portal-body">
        <div className="pl-head">
          <div><h1>Merhaba, {cust.contact || cust.title}</h1><p>Kargolarınız, sözleşmeniz ve belgeleriniz tek ekranda.</p></div>
          <button className="pl-btn pl-btn-teal" onClick={() => setReqModal({ mail_id: '' })}>+ Talep oluştur</button>
        </div>

        {ct.length === 0 && (
          <div className="pl-alert"><span className="ic">👋</span><span className="msg">
            <b>Hoş geldiniz!</b> Sözleşmeniz hazırlanıyor — ekibimiz belgeleriniz ve sözleşme imzası için
            sizinle iletişime geçecek. Sorularınız için <a href="mailto:merhaba@ganu.com.tr" className="pl-link">merhaba@ganu.com.tr</a>.
          </span></div>
        )}

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

        {/* faturalarım */}
        <div className="pl-card" style={{ marginBottom: 20 }}>
          <div className="pl-card-h"><h2>Faturalarım</h2></div>
          <div className="pl-card-b">
            {inv.length === 0 && <div className="pl-empty">Henüz fatura yok.</div>}
            {inv.map((i) => (
              <div className="pl-row" key={i.id}>
                <div className="grow">
                  <div className="t1">{fmtTL(i.amount)}{i.note ? ` · ${i.note}` : ''}</div>
                  <div className="t2">
                    Kesim: {fmtDate(i.issue_date)}{i.due_date ? ` · Vade: ${fmtDate(i.due_date)}` : ''}
                    {i.einvoice_no ? ` · e-Belge: ${i.einvoice_no}` : ''}
                  </div>
                </div>
                <span className={`pl-badge ${invStatus(i) === 'ödendi' ? 'b-ok' : invStatus(i) === 'gecikti' ? 'b-danger' : 'b-warn'}`}>{invStatus(i)}</span>
                {invStatus(i) !== 'ödendi' && <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => setPayInv(i)}>Öde</button>}
                {i.einvoice_pdf && <a className="pl-btn pl-btn-ghost pl-btn-sm" href={i.einvoice_pdf} target="_blank" rel="noreferrer">PDF</a>}
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
                <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setChatReq(r)}>Mesajlar</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reqModal && <TalepForm mailId={reqModal.mail_id} onClose={() => setReqModal(null)} onSave={sendReq} />}
      {chatReq && <TalepSohbet req={chatReq} from="musteri" onClose={() => setChatReq(null)} />}
      {payInv && <OdemeModal inv={payInv} cust={cust} onClose={() => setPayInv(null)} />}
      {pwModal && <SifreModal cust={cust} onClose={() => setPwModal(false)} />}
    </div>
  )
}

/* Portal şifresi değiştirme */
function SifreModal({ cust, onClose }) {
  const [f, setF] = useState({ old: '', n1: '', n2: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => { setMsg(null); setF((s) => ({ ...s, [k]: e.target.value })) }
  const submit = async (e) => {
    e.preventDefault()
    if (f.n1 !== f.n2) return setMsg({ ok: false, t: 'Yeni şifreler eşleşmiyor.' })
    setBusy(true)
    const r = await customerChangePassword(cust.id, f.old, f.n1)
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, t: 'Şifreniz güncellendi.' }); setF({ old: '', n1: '', n2: '' }) }
    else setMsg({ ok: false, t: r.error })
  }
  return (
    <Modal title="Şifre değiştir" onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button>
        <button className="pl-btn pl-btn-solid" form="sifre-form" type="submit" disabled={busy}>{busy ? '…' : 'Güncelle'}</button>
      </>}>
      <form id="sifre-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field"><label>Mevcut şifre (ilk giriş: erişim kodunuz)</label>
          <input type="password" value={f.old} onChange={set('old')} autoComplete="current-password" /></div>
        <div className="pl-field"><label>Yeni şifre</label>
          <input type="password" value={f.n1} onChange={set('n1')} autoComplete="new-password" /></div>
        <div className="pl-field"><label>Yeni şifre (tekrar)</label>
          <input type="password" value={f.n2} onChange={set('n2')} autoComplete="new-password" /></div>
        {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? 'var(--ok, #059669)' : '#dc2626' }}>{msg.t}</span>}
      </form>
    </Modal>
  )
}

/* Ödeme ekranı: kart linki varsa onu, yoksa havale/EFT bilgilerini gösterir */
function OdemeModal({ inv, cust, onClose }) {
  const cfg = getConfig()
  const [copied, setCopied] = useState('')
  const copy = async (text, tag) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1600) } catch { /* pano izni yok */ }
  }
  const aciklama = `${cust.title} · ${inv.note || 'fatura'} · ${fmtTL(inv.amount)}`
  return (
    <Modal title="Fatura ödeme" onClose={onClose}
      footer={<button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button>}>
      <div className="pl-form">
        <div className="pl-kv" style={{ marginBottom: 14 }}>
          <div><span className="k">Tutar</span><span className="v" style={{ fontWeight: 800 }}>{fmtTL(inv.amount)}</span></div>
          {inv.due_date && <div><span className="k">Son ödeme</span><span className="v">{fmtDate(inv.due_date)}</span></div>}
        </div>

        {(inv.payment_link || cfg.payment_page_link) && (
          <a className="pl-btn pl-btn-solid" href={inv.payment_link || cfg.payment_page_link} target="_blank" rel="noreferrer"
            style={{ width: '100%', textAlign: 'center', marginBottom: 14 }}>
            💳 Kartla güvenli öde →
          </a>
        )}

        <div className="pl-card" style={{ padding: 14 }}>
          <div className="t1" style={{ marginBottom: 8 }}>Havale / EFT</div>
          {cfg.payment_iban ? (
            <>
              <div className="t2">Alıcı: <b>{cfg.payment_recipient || 'GANU Sanal Ofis'}</b></div>
              <div className="t2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                IBAN: <code style={{ fontSize: 13 }}>{cfg.payment_iban}</code>
                <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => copy(cfg.payment_iban, 'iban')}>
                  {copied === 'iban' ? '✓ Kopyalandı' : 'Kopyala'}
                </button>
              </div>
              <div className="t2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                Açıklama: <span style={{ fontSize: 13 }}>{aciklama}</span>
                <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => copy(aciklama, 'acik')}>
                  {copied === 'acik' ? '✓' : 'Kopyala'}
                </button>
              </div>
              <div className="t2" style={{ marginTop: 10, color: 'var(--muted)' }}>
                Ödemeniz hesabımıza geçince faturanız "ödendi" olarak güncellenir ve size bildirilir.
              </div>
            </>
          ) : (
            <div className="t2">Havale bilgisi için bize ulaşın: <a href="mailto:merhaba@ganu.com.tr" className="pl-link">merhaba@ganu.com.tr</a></div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* Talep konuşması — panel ve müşteri portalı ortak kullanır (from: 'ganu'|'musteri') */
export function TalepSohbet({ req, from, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const load = () => requestThread(req.id).then(setMsgs)
  useEffect(() => { load() }, [req.id])
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    await sendRequestMessage({ request_id: req.id, from, text })
    setText(''); load()
  }
  return (
    <Modal title={`Talep · ${req.kind}`} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Kapat</button>
        <button className="pl-btn pl-btn-solid" form="talep-sohbet" type="submit">Gönder</button>
      </>}>
      <div className="pl-form">
        {req.note && <div className="t2" style={{ marginBottom: 10 }}>Talep: {req.note}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
          {msgs.length === 0 && <div className="pl-empty">Henüz mesaj yok — ilk mesajı yazın.</div>}
          {msgs.map((m) => (
            <div key={m.id} style={{
              alignSelf: m.from === from ? 'flex-end' : 'flex-start',
              background: m.from === 'ganu' ? 'var(--navy, #0A2540)' : '#eef2f6',
              color: m.from === 'ganu' ? '#fff' : 'inherit',
              borderRadius: 10, padding: '8px 12px', maxWidth: '85%', fontSize: 14,
            }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{m.from === 'ganu' ? 'GANU' : 'Müşteri'} · {fmtDate(m.created_at)}</div>
              {m.text}
            </div>
          ))}
        </div>
        <form id="talep-sohbet" onSubmit={send}>
          <div className="pl-field">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesajınızı yazın…" rows={2} />
          </div>
        </form>
      </div>
    </Modal>
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
