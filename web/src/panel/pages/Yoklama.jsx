import { useEffect, useState, useMemo } from 'react'
import { inspections, customers, withCustomerNames, INSPECTION_RESULT } from '../lib/store.js'
import { Modal, fmtDate } from './_ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ customer_id: '', date: today(), result: 'bekleniyor', officer: '', attendee: '', note: '' })

const RESULT_BADGE = {
  bekleniyor: 'b-warn',
  olumlu: 'b-ok',
  olumsuz: 'b-danger',
}
const RESULT_LABEL = {
  bekleniyor: 'Bekleniyor',
  olumlu: 'Olumlu',
  olumsuz: 'Olumsuz',
}

export default function Yoklama() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [ins, cs] = await Promise.all([inspections.list(), customers.list()])
    const named = await withCustomerNames(ins)
    setRows(named.sort((a, b) => (a.date < b.date ? 1 : -1)))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])

  const pendingCount = useMemo(() => rows.filter((r) => r.result === 'bekleniyor').length, [rows])

  const save = async (form) => {
    if (modal.mode === 'new') await inspections.create(form)
    else await inspections.update(modal.data.id, form)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Yoklama kaydı silinsin mi?')) { await inspections.remove(id); load() } }

  return (
    <div>
      <div className="pl-head">
        <div>
          <h1>Yoklama Kayıtları</h1>
          <p>Vergi dairesi adres yoklamalarını (VUK 127) kayıt altına al — re'sen terk riskini önle.</p>
        </div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })} disabled={!custs.length}>
          + Yoklama kaydı
        </button>
      </div>

      <div className="pl-alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <span className="ic" aria-hidden="true">🏛️</span>
        <span className="msg">
          Vergi dairesi memuru adrese <b>yoklama</b> için gelebilir. Mükellefin adreste fiilen bulunmadığı tespit edilirse
          <b> re'sen terk</b> işlemi başlatılabilir. Her ziyareti burada belgele: memur, hazır bulunan kişi ve sonuç.
        </span>
      </div>

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0A2540' }}>
            {rows.length} kayıt{pendingCount > 0 && <span style={{ color: '#b45309' }}> · {pendingCount} sonucu bekleniyor</span>}
          </span>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Müşteri</th><th>Tarih</th><th>Memur</th><th>Hazır bulunan</th><th>Sonuç</th><th>Not</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}><div className="pl-empty">Henüz yoklama kaydı yok.</div></td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><span className="strong">{r.customer?.title || '—'}</span></td>
                <td className="pl-num">{fmtDate(r.date)}</td>
                <td>{r.officer || '—'}</td>
                <td>{r.attendee || '—'}</td>
                <td><span className={`pl-badge ${RESULT_BADGE[r.result] || 'b-warn'}`}>{RESULT_LABEL[r.result] || r.result}</span></td>
                <td style={{ maxWidth: 260, color: '#475569', fontSize: 13 }}>{r.note || '—'}</td>
                <td>
                  <div className="pl-actions">
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setModal({ mode: 'edit', data: { ...r } })}>Düzenle</button>
                    <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => del(r.id)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <YoklamaForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function YoklamaForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (!f.customer_id) return; onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni yoklama kaydı' : 'Yoklama kaydını düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="yok-form" type="submit">Kaydet</button>
      </>}>
      <form id="yok-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Müşteri *</label>
          <select value={f.customer_id} onChange={(e) => set('customer_id', e.target.value)} required>
            <option value="">Seç…</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Yoklama tarihi</label>
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="pl-field">
            <label>Sonuç</label>
            <select value={f.result} onChange={(e) => set('result', e.target.value)}>
              {INSPECTION_RESULT.map((r) => <option key={r} value={r}>{RESULT_LABEL[r] || r}</option>)}
            </select>
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Gelen memur <span style={{ color: '#64748b', fontWeight: 400 }}>(varsa)</span></label>
            <input type="text" value={f.officer} placeholder="Ad / sicil" onChange={(e) => set('officer', e.target.value)} />
          </div>
          <div className="pl-field">
            <label>Hazır bulunan</label>
            <input type="text" value={f.attendee} placeholder="Adreste karşılayan kişi" onChange={(e) => set('attendee', e.target.value)} />
          </div>
        </div>
        <div className="pl-field">
          <label>Not</label>
          <textarea rows={3} value={f.note} placeholder="Yoklamanın detayı, tutanak no, vb." onChange={(e) => set('note', e.target.value)} />
        </div>
      </form>
    </Modal>
  )
}
