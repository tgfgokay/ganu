import { useEffect, useState, useMemo } from 'react'
import { expenses, customers, invoices, withCustomerNames, notifyEvent, EXPENSE_CATEGORIES } from '../lib/store.js'
import { Modal, fmtDate, fmtTL } from './_ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ date: today(), category: 'diger', amount: '', customer_id: '', billable: false, note: '' })
const catLabel = (v) => (EXPENSE_CATEGORIES.find((c) => c.v === v) || {}).l || v

export default function Masraflar() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [ex, cs] = await Promise.all([expenses.list(), customers.list()])
    setRows(await withCustomerNames(ex))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((r) => {
    if (fCat && r.category !== fCat) return false
    if (q) {
      const s = ((r.note || '') + ' ' + (r.customer?.title || '') + ' ' + catLabel(r.category)).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')), [rows, q, fCat])

  const totals = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7)
    const thisMonth = rows.filter((r) => (r.date || '').startsWith(month)).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const all = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const billable = rows.filter((r) => r.billable).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    return { thisMonth, all, billable }
  }, [rows])

  const save = async (form) => {
    const data = { ...form, amount: Number(form.amount) || 0 }
    if (modal.mode === 'new') await expenses.create(data)
    else await expenses.update(modal.data.id, data)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Bu masraf silinsin mi?')) { await expenses.remove(id); load() } }

  /* Yansıtılacak masrafı müşteri faturasına dönüştür */
  const faturala = async (r) => {
    if (!confirm(`${fmtTL(r.amount)} tutarındaki masraf ${r.customer?.title || 'müşteriye'} fatura edilsin mi?`)) return
    const due = new Date(); due.setDate(due.getDate() + 15)
    const inv = await invoices.create({
      customer_id: r.customer_id, amount: Number(r.amount) || 0, status: 'bekliyor',
      issue_date: today(), due_date: due.toISOString().slice(0, 10), paid_date: '',
      note: `Masraf yansıtma: ${r.note || catLabel(r.category)}`,
    })
    await expenses.update(r.id, { invoice_id: inv.id })
    if (r.customer) await notifyEvent('invoice_issued', r.customer, { tutar: fmtTL(r.amount), tarih: fmtDate(today()) })
    load()
  }

  return (
    <div>
      <div className="pl-head">
        <div><h1>Masraflar</h1><p>Ofis giderlerini ve müşteriye yansıtılacak harcamaları takip et.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })}>+ Yeni masraf</button>
      </div>

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Bu ay</div><div className="val danger">{fmtTL(totals.thisMonth)}</div></div>
        <div className="pl-stat"><div className="lab">Toplam</div><div className="val">{fmtTL(totals.all)}</div></div>
        <div className="pl-stat"><div className="lab">Müşteriye yansıtılacak</div><div className={`val${totals.billable ? ' warn' : ''}`}>{fmtTL(totals.billable)}</div></div>
        <div className="pl-stat"><div className="lab">Kayıt sayısı</div><div className="val">{rows.length}</div></div>
      </div>

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <input type="search" placeholder="Not, müşteri veya kategori ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Tarih</th><th>Kategori</th><th>Tutar</th><th>Müşteri</th><th>Not</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><div className="pl-empty">Masraf kaydı yok.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="pl-num">{fmtDate(r.date)}</td>
                <td><span className="pl-badge b-mektup">{catLabel(r.category)}</span></td>
                <td className="pl-num strong">{fmtTL(r.amount)}</td>
                <td>
                  {r.customer?.title || '—'}
                  {r.billable && <div className="sub">{r.invoice_id ? '✓ faturalandı' : 'yansıtılacak'}</div>}
                </td>
                <td>{r.note || '—'}</td>
                <td>
                  <div className="pl-actions">
                    {r.billable && r.customer_id && !r.invoice_id && (
                      <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => faturala(r)}>Faturala</button>
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

      {modal && <MasrafForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function MasrafForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni masraf' : 'Masrafı düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="masraf-form" type="submit">Kaydet</button>
      </>}>
      <form id="masraf-form" className="pl-form" onSubmit={submit}>
        <div className="two">
          <div className="pl-field">
            <label>Tarih *</label>
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required />
          </div>
          <div className="pl-field">
            <label>Tutar (₺) *</label>
            <input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} required placeholder="0" />
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Kategori</label>
            <select value={f.category} onChange={(e) => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Müşteri (opsiyonel)</label>
            <select value={f.customer_id || ''} onChange={(e) => set('customer_id', e.target.value)}>
              <option value="">— genel gider —</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
        {f.customer_id && (
          <div className="pl-field">
            <label className="pl-chk" style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={!!f.billable} onChange={(e) => set('billable', e.target.checked)} />
              Müşteriye yansıtılacak (faturaya eklenecek)
            </label>
          </div>
        )}
        <div className="pl-field">
          <label>Not</label>
          <textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="ör. Temmuz ofis kirası" />
        </div>
      </form>
    </Modal>
  )
}
