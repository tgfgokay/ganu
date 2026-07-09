import { useEffect, useState, useMemo } from 'react'
import { partners, partnerSummary, recordCommissionPayment, PARTNER_STATUS, PARTNER_PROFESSIONS } from '../lib/store.js'
import { Modal, fmtTL } from './_ui.jsx'

const emptyForm = () => ({
  name: '', profession: PARTNER_PROFESSIONS[0], contact: '', email: '', phone: '',
  iban: '', tax_no: '', commission_rate: 10, access_code: '', status: 'aktif', notes: '',
})

const P_BADGE = { aktif: 'b-ok', pasif: 'b-warn', başvuru: 'b-bild' }

/* addres koduna dönüştür: ASCII harf/rakam + 2 haneli sayı */
const genCode = (name) => {
  const base = (name || 'ORTAK').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'ORTAK'
  return base + Math.floor(10 + Math.random() * 89)
}

export default function Ortaklar() {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [payModal, setPayModal] = useState(null)

  const load = async () => { setRows(await partnerSummary()) }
  useEffect(() => { load() }, [])

  const totals = useMemo(() => ({
    partners: rows.filter((r) => r.status !== 'başvuru').length,
    pending: rows.filter((r) => r.status === 'başvuru').length,
    customers: rows.reduce((s, r) => s + r.customerCount, 0),
    commission: rows.reduce((s, r) => s + (r.commissionEarned || 0), 0),
    paid: rows.reduce((s, r) => s + (r.commissionPaid || 0), 0),
    due: rows.reduce((s, r) => s + (r.commissionDue || 0), 0),
  }), [rows])

  const save = async (form) => {
    const payload = { ...form, commission_rate: Number(form.commission_rate) || 0 }
    if (modal.mode === 'new') await partners.create(payload)
    else await partners.update(modal.data.id, payload)
    setModal(null); load()
  }
  const approve = async (r) => {
    const patch = { status: 'aktif' }
    if (!r.access_code) patch.access_code = genCode(r.name)
    await partners.update(r.id, patch)
    load()
  }
  const del = async (id) => {
    if (confirm('İş ortağı silinsin mi? (Getirdiği müşteriler silinmez, sadece bağ kalkar.)')) { await partners.remove(id); load() }
  }

  return (
    <div>
      <div className="pl-head">
        <div>
          <h1>İş Ortakları</h1>
          <p>Yönlendiren ortaklar (avukat, mali müşavir, marka-patent vekili…) — getirdikleri müşteriler ve hakedişleri tek ekranda.</p>
        </div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })}>+ İş ortağı</button>
      </div>

      <div className="pl-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <span className="ic" aria-hidden="true">🤝</span>
        <span className="msg">
          Ortaklar <b>/is-ortakligi</b> sayfasından başvurur (durum: <b>başvuru</b>). <b>Onayla</b> dediğinde hesap aktifleşir ve bir
          erişim kodu üretilir; ortak bu kodla <b>/ortak</b> panelinden getirdiği müşterileri ve komisyonunu izler.
          Bir müşteriyi ortağa bağlamak için: <b>Müşteriler → Düzenle → İş ortağı</b>. Komisyon, o müşterilerin ödenmiş faturaları × oran ile hesaplanır.
        </span>
      </div>

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Aktif/pasif ortak</div><div className="val">{totals.partners}</div></div>
        <div className="pl-stat"><div className="lab">Bekleyen başvuru</div><div className="val">{totals.pending}</div></div>
        <div className="pl-stat"><div className="lab">Getirilen müşteri</div><div className="val teal">{totals.customers}</div></div>
        <div className="pl-stat"><div className="lab">Toplam hakediş</div><div className="val teal">{fmtTL(totals.commission)}</div></div>
        <div className="pl-stat"><div className="lab">Ödenen komisyon</div><div className="val">{fmtTL(totals.paid)}</div></div>
        <div className="pl-stat"><div className="lab">Kalan hakediş</div><div className="val teal">{fmtTL(totals.due)}</div></div>
      </div>

      <div className="pl-tablewrap">
        <table className="pl-table">
          <thead>
            <tr><th>Ortak</th><th>Meslek</th><th>Müşteri</th><th>Komisyon</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}><div className="pl-empty">Henüz iş ortağı yok.</div></td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="strong">{r.name}</span>
                  <div className="sub">
                    {r.contact || '—'}{r.phone ? ` · ${r.phone}` : ''}
                    {r.access_code ? <> · kod: <code>{r.access_code}</code></> : ''}
                  </div>
                </td>
                <td>{r.profession || '—'}</td>
                <td className="pl-num">{r.customerCount}</td>
                <td className="pl-num">
                  <span className="strong">{fmtTL(r.commissionEarned)}</span>
                  <div className="sub">%{r.commissionRate} · ödenen {fmtTL(r.commissionPaid || 0)} · kalan <b>{fmtTL(r.commissionDue || 0)}</b></div>
                </td>
                <td><span className={`pl-badge ${P_BADGE[r.status] || 'b-warn'}`}>{r.status}</span></td>
                <td>
                  <div className="pl-actions">
                    {r.status === 'başvuru' && (
                      <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => approve(r)}>Onayla</button>
                    )}
                    {(r.commissionDue || 0) > 0 && (
                      <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => setPayModal(r)}>Ödeme</button>
                    )}
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setModal({ mode: 'edit', data: { ...r } })}>Düzenle</button>
                    <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => del(r.id)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <OrtakForm modal={modal} onClose={() => setModal(null)} onSave={save} />}
      {payModal && <OdemeForm partner={payModal} onClose={() => setPayModal(null)} onDone={() => { setPayModal(null); load() }} />}
    </div>
  )
}

function OdemeForm({ partner, onClose, onDone }) {
  const [amount, setAmount] = useState(partner.commissionDue || 0)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const a = Number(amount)
    if (!a || a <= 0) { setErr('Tutar girin'); return }
    if (a > (partner.commissionDue || 0) + 0.01) { setErr(`Kalan hakedişten fazla: en çok ${fmtTL(partner.commissionDue)}`); return }
    setBusy(true)
    try { await recordCommissionPayment(partner, { amount: a, date, note }); onDone() }
    catch (ex) { setErr(ex.message || 'Kayıt başarısız'); setBusy(false) }
  }
  return (
    <Modal title={`Komisyon ödemesi — ${partner.name}`} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="compay-form" type="submit" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Ödemeyi kaydet'}</button>
      </>}>
      <form id="compay-form" className="pl-form" onSubmit={submit}>
        <div className="pl-alert" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <span className="msg">Kalan hakediş: <b>{fmtTL(partner.commissionDue || 0)}</b>{partner.iban ? <> · IBAN: <code>{partner.iban}</code></> : ' · IBAN kayıtlı değil'}</span>
        </div>
        <div className="two">
          <div className="pl-field"><label>Tutar (₺) *</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setErr('') }} required /></div>
          <div className="pl-field"><label>Tarih</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="pl-field"><label>Not</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Haziran dönemi hakedişi" /></div>
        {err && <span className="pl-login-err">{err}</span>}
        <p className="sub" style={{ margin: 0 }}>Kayıt, masraflara "İş ortağı komisyonu" kalemi olarak işlenir ve ortak portalında "ödendi" görünür.</p>
      </form>
    </Modal>
  )
}

function OrtakForm({ modal, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (!f.name) return; onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni iş ortağı' : 'İş ortağını düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="ortak-form" type="submit">Kaydet</button>
      </>}>
      <form id="ortak-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Ortak / firma adı *</label>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} required placeholder="ör. Yılmaz Mali Müşavirlik" />
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Meslek</label>
            <select value={f.profession || PARTNER_PROFESSIONS[0]} onChange={(e) => set('profession', e.target.value)}>
              {PARTNER_PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Yetkili</label><input value={f.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Ad Soyad" /></div>
        </div>
        <div className="two">
          <div className="pl-field"><label>Telefon</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="05.." /></div>
          <div className="pl-field"><label>E-posta</label><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="ornek@firma.com" /></div>
        </div>
        <div className="two">
          <div className="pl-field"><label>Komisyon oranı (%)</label><input type="number" min="0" max="100" step="0.5" value={f.commission_rate} onChange={(e) => set('commission_rate', e.target.value)} /></div>
          <div className="pl-field"><label>Vergi / T.C. no</label><input value={f.tax_no} onChange={(e) => set('tax_no', e.target.value)} placeholder="Makbuz için" /></div>
        </div>
        <div className="pl-field">
          <label>IBAN <span style={{ fontWeight: 400, color: 'var(--pl-muted, #64748b)' }}>— komisyon bu hesaba ödenir</span></label>
          <input value={f.iban} onChange={(e) => set('iban', e.target.value)} placeholder="TR.. .... .... .... .... .... .." />
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Erişim kodu <span style={{ fontWeight: 400, color: 'var(--pl-muted, #64748b)' }}>— /ortak girişi</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={f.access_code} onChange={(e) => set('access_code', e.target.value.toUpperCase())} placeholder="ör. ORTAK01" />
              <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => set('access_code', genCode(f.name))}>Üret</button>
            </div>
          </div>
          <div className="pl-field">
            <label>Durum</label>
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {PARTNER_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="pl-field"><label>Not</label><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </form>
    </Modal>
  )
}
