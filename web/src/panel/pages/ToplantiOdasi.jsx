import { useEffect, useState, useMemo } from 'react'
import {
  bookings, customers, withCustomerNames, notifyEvent,
  BOOKING_STATUS, timeSlots, bookingConflict,
} from '../lib/store.js'
import { Modal, fmtDate } from './_ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const SLOTS = timeSlots()
const emptyForm = () => ({ customer_id: '', date: today(), start: '10:00', end: '11:00', attendees: 2, note: '', status: 'onaylandı' })

const badgeClass = (s) =>
  s === 'onaylandı' ? 'b-ok' : s === 'reddedildi' ? 'b-danger' : s === 'iptal' ? 'b-mektup' : 'b-warn'

export default function ToplantiOdasi() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [bk, cs] = await Promise.all([bookings.list(), customers.list()])
    setRows(await withCustomerNames(bk))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((r) => {
    if (fStatus && r.status !== fStatus) return false
    if (q) {
      const s = ((r.note || '') + ' ' + (r.customer?.title || '')).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)), [rows, q, fStatus])

  const stats = useMemo(() => {
    const t = today()
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
    return {
      today: rows.filter((r) => r.date === t && r.status === 'onaylandı').length,
      pending: rows.filter((r) => r.status === 'talep').length,
      week: rows.filter((r) => r.status === 'onaylandı' && r.date >= t && r.date <= weekEnd).length,
      total: rows.length,
    }
  }, [rows])

  const save = async (form) => {
    const data = { ...form, attendees: Number(form.attendees) || 1 }
    const conflict = bookingConflict(rows, { date: data.date, start: data.start, end: data.end, exceptId: modal.data.id })
    if (data.status !== 'reddedildi' && data.status !== 'iptal' && conflict) {
      const c = custs.find((x) => x.id === conflict.customer_id)
      if (!confirm(`⚠ Bu saatte çakışan rezervasyon var:\n${fmtDate(conflict.date)} ${conflict.start}–${conflict.end} · ${c?.title || 'müşteri'} (${conflict.status})\n\nYine de kaydedilsin mi?`)) return
    }
    if (data.start >= data.end) { alert('Bitiş saati başlangıçtan sonra olmalı.'); return }
    if (modal.mode === 'new') await bookings.create({ ...data, created_by: 'ganu' })
    else await bookings.update(modal.data.id, data)
    setModal(null); load()
  }

  const setStatus = async (r, status) => {
    await bookings.update(r.id, { status })
    const cust = custs.find((c) => c.id === r.customer_id)
    if (cust && status === 'onaylandı') await notifyEvent('booking_confirmed', cust, { tarih: fmtDate(r.date), saat: `${r.start}–${r.end}` })
    if (cust && status === 'reddedildi') await notifyEvent('booking_rejected', cust, { tarih: fmtDate(r.date), saat: `${r.start}–${r.end}` })
    load()
  }
  const del = async (id) => { if (confirm('Bu randevu silinsin mi?')) { await bookings.remove(id); load() } }

  return (
    <div>
      <div className="pl-head">
        <div><h1>Toplantı Odası</h1><p>Randevuları planla, müşteri taleplerini onayla. Onaylanan randevular müşteri portalında görünür.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })}>+ Yeni randevu</button>
      </div>

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Bugün</div><div className="val">{stats.today}</div></div>
        <div className="pl-stat"><div className="lab">Bekleyen talep</div><div className={`val${stats.pending ? ' warn' : ''}`}>{stats.pending}</div></div>
        <div className="pl-stat"><div className="lab">Bu hafta onaylı</div><div className="val">{stats.week}</div></div>
        <div className="pl-stat"><div className="lab">Toplam</div><div className="val">{stats.total}</div></div>
      </div>

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <input type="search" placeholder="Konu veya müşteri ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {BOOKING_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Tarih</th><th>Saat</th><th>Müşteri</th><th>Kişi</th><th>Konu</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7}><div className="pl-empty">Randevu kaydı yok.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="pl-num">{fmtDate(r.date)}</td>
                <td className="pl-num strong">{r.start}–{r.end}</td>
                <td>{r.customer?.title || '—'}{r.created_by === 'musteri' && <div className="sub">müşteri talebi</div>}</td>
                <td className="pl-num">{r.attendees || '—'}</td>
                <td>{r.note || '—'}</td>
                <td><span className={`pl-badge ${badgeClass(r.status)}`}>{r.status}</span></td>
                <td>
                  <div className="pl-actions">
                    {r.status === 'talep' && (
                      <>
                        <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => setStatus(r, 'onaylandı')}>Onayla</button>
                        <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => setStatus(r, 'reddedildi')}>Reddet</button>
                      </>
                    )}
                    {r.status === 'onaylandı' && (
                      <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setStatus(r, 'iptal')}>İptal et</button>
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

      {modal && <RandevuForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function RandevuForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni randevu' : 'Randevuyu düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="randevu-form" type="submit">Kaydet</button>
      </>}>
      <form id="randevu-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Müşteri *</label>
          <select value={f.customer_id || ''} onChange={(e) => set('customer_id', e.target.value)} required>
            <option value="">— müşteri seç —</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Tarih *</label>
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required />
          </div>
          <div className="pl-field">
            <label>Kişi sayısı</label>
            <input type="number" min="1" max="20" value={f.attendees} onChange={(e) => set('attendees', e.target.value)} />
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Başlangıç *</label>
            <select value={f.start} onChange={(e) => set('start', e.target.value)}>
              {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Bitiş *</label>
            <select value={f.end} onChange={(e) => set('end', e.target.value)}>
              {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="pl-field">
          <label>Durum</label>
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            {BOOKING_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="pl-field">
          <label>Konu / not</label>
          <textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="ör. Yatırımcı sunumu, 3 kişi" />
        </div>
      </form>
    </Modal>
  )
}
