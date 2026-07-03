import { useEffect, useState, useMemo } from 'react'
import { contracts, customers, withCustomerNames, daysLeft, PACKAGES } from '../lib/store.js'
import { Modal, DaysBadge, fmtDate, fmtTL } from './_ui.jsx'

const oneYearLater = (start) => {
  const d = new Date(start + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
const emptyForm = () => {
  const start = new Date().toISOString().slice(0, 10)
  return { customer_id: '', package: 'Başlangıç', start_date: start, end_date: oneYearLater(start), price: 499, status: 'aktif', auto_renew: false }
}

export default function Sozlesmeler() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [modal, setModal] = useState(null)
  const [onlySoon, setOnlySoon] = useState(false)

  const load = async () => {
    const [ct, cs] = await Promise.all([contracts.list(), customers.list()])
    setRows((await withCustomerNames(ct)).map((r) => ({ ...r, _days: daysLeft(r.end_date) })).sort((a, b) => a._days - b._days))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => onlySoon ? rows.filter((r) => r._days <= 30) : rows, [rows, onlySoon])
  const soonCount = rows.filter((r) => r._days <= 30).length

  const save = async (form) => {
    const payload = { ...form, price: Number(form.price) || 0 }
    if (modal.mode === 'new') await contracts.create(payload)
    else await contracts.update(modal.data.id, payload)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Sözleşme silinsin mi?')) { await contracts.remove(id); load() } }
  const renew = async (r) => {
    const newStart = r.end_date
    await contracts.update(r.id, { start_date: newStart, end_date: oneYearLater(newStart), status: 'aktif' })
    load()
  }

  return (
    <div>
      <div className="pl-head">
        <div><h1>Sözleşmeler</h1><p>Yıllık sözleşmeleri ve yenileme tarihlerini takip et.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })} disabled={!custs.length}>
          + Yeni sözleşme
        </button>
      </div>

      {soonCount > 0 && (
        <div className="pl-alert">
          <span className="ic">⏰</span>
          <span className="msg"><b>{soonCount} sözleşme</b> 30 gün içinde yeniliyor. Zamanında yenile ki müşterinin yasal adresi kesintisiz kalsın.</span>
        </div>
      )}

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#0A2540' }}>
            <input type="checkbox" checked={onlySoon} onChange={(e) => setOnlySoon(e.target.checked)} />
            Sadece yaklaşanlar (30 gün)
          </label>
          <span className="spacer" />
          <span style={{ fontSize: 13, color: '#64748b' }}>{filtered.length} sözleşme</span>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Müşteri</th><th>Paket</th><th>Başlangıç</th><th>Bitiş</th><th>Ücret</th><th>Kalan</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7}><div className="pl-empty">Kayıt yok.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="strong">{r.customer?.title || '—'}</span>
                  {r.auto_renew && <span className="pl-badge b-ok" style={{ marginLeft: 8 }}>oto-yenile</span>}
                </td>
                <td>{r.package}</td>
                <td className="pl-num">{fmtDate(r.start_date)}</td>
                <td className="pl-num">{fmtDate(r.end_date)}</td>
                <td className="pl-num">{fmtTL(r.price)}<span className="sub"> /yıl</span></td>
                <td><DaysBadge endDate={r.end_date} /></td>
                <td>
                  <div className="pl-actions">
                    <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => renew(r)}>Yenile</button>
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setModal({ mode: 'edit', data: { ...r } })}>Düzenle</button>
                    <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => del(r.id)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <SozForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function SozForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setStart = (v) => setF((s) => ({ ...s, start_date: v, end_date: oneYearLater(v) }))
  const submit = (e) => { e.preventDefault(); if (!f.customer_id) return; onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni sözleşme' : 'Sözleşmeyi düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="soz-form" type="submit">Kaydet</button>
      </>}>
      <form id="soz-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Müşteri *</label>
          <select value={f.customer_id} onChange={(e) => set('customer_id', e.target.value)} required>
            <option value="">Seç…</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Paket</label>
            <select value={f.package} onChange={(e) => set('package', e.target.value)}>
              {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Yıllık ücret (₺)</label>
            <input type="number" min="0" value={f.price} onChange={(e) => set('price', e.target.value)} />
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Başlangıç</label>
            <input type="date" value={f.start_date} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="pl-field">
            <label>Bitiş <span style={{ color: '#64748b', fontWeight: 400 }}>(oto: +1 yıl)</span></label>
            <input type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </div>
        </div>
        <div className="pl-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.auto_renew} onChange={(e) => set('auto_renew', e.target.checked)} />
            Otomatik yenileme (müşteri onaylı)
          </label>
        </div>
      </form>
    </Modal>
  )
}
