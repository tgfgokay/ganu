import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { contracts, customers, withCustomerNames, daysLeft, renewContract, PACKAGES, PACKAGE_PRICES, PACKAGE_MONTHLY, loadCatalog } from '../lib/store.js'
import { Modal, DaysBadge, fmtDate, fmtTL } from './_ui.jsx'
import { localISO, oneYearLaterISO } from '../lib/dates.js'

const oneYearLater = oneYearLaterISO
const CONTRACT_STATUS = ['aktif', 'askıda', 'sona erdi']
// Katalog fiyatı KDV dahildir; mevcut müşterilerde anlaşılan tutar elle girilir.
const catalogPrice = (pkg, period) => (period === 'aylık' ? PACKAGE_MONTHLY : PACKAGE_PRICES)[pkg] ?? ''
const emptyForm = (customerId = '') => {
  const start = localISO()
  return { customer_id: customerId, package: 'Başlangıç', billing_period: 'yıllık', start_date: start, end_date: oneYearLater(start), price: catalogPrice('Başlangıç', 'yıllık'), status: 'aktif', auto_renew: false }
}

export default function Sozlesmeler() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [modal, setModal] = useState(null)
  const [onlySoon, setOnlySoon] = useState(false)
  const [renewing, setRenewing] = useState(null)
  const [params, setParams] = useSearchParams()

  const load = async () => {
    const [ct, cs] = await Promise.all([contracts.list(), customers.list(), loadCatalog()])
    setRows((await withCustomerNames(ct)).map((r) => ({ ...r, _days: daysLeft(r.end_date) })).sort((a, b) => a._days - b._days))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = params.get('musteri')
    if (id && custs.some((c) => c.id === id)) { setModal({ mode: 'new', data: emptyForm(id) }); setParams({}, { replace: true }) }
  }, [custs])

  // Yenileme eski dönemi değiştirmez: sunucu (renew_contract) yeni dönem satırı açar (0015).
  const renewed = useMemo(() => new Set(rows.map((r) => r.previous_contract_id).filter(Boolean)), [rows])
  const filtered = useMemo(() => onlySoon ? rows.filter((r) => r._days <= 30 && !renewed.has(r.id)) : rows, [rows, onlySoon, renewed])
  const soonCount = rows.filter((r) => r._days <= 30 && r._days >= 0 && !renewed.has(r.id)).length

  const save = async (form) => {
    const payload = { ...form, price: Number(form.price) || 0 }
    if (modal.mode === 'new') await contracts.create(payload)
    else await contracts.update(modal.data.id, payload)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Sözleşme silinsin mi?')) { await contracts.remove(id); load() } }

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
                <td className="pl-num">{fmtTL(r.price)}<span className="sub"> /{r.billing_period === 'aylık' ? 'ay' : 'yıl'}</span></td>
                <td><DaysBadge endDate={r.end_date} /></td>
                <td>
                  <div className="pl-actions">
                    {renewed.has(r.id)
                      ? <span className="pl-badge b-mektup">yenilendi</span>
                      : <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => setRenewing(r)}>Yenile</button>}
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
      {renewing && <RenewForm contract={renewing} onClose={() => setRenewing(null)} onDone={() => { setRenewing(null); load() }} />}
    </div>
  )
}

function SozForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setPricing = (k, v) => setF((s) => {
    const next = { ...s, [k]: v }
    if (modal.mode === 'new') next.price = catalogPrice(next.package, next.billing_period)
    return next
  })
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
            <select value={f.package} onChange={(e) => setPricing('package', e.target.value)}>
              {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Faturalama</label>
            <select value={f.billing_period || 'yıllık'} onChange={(e) => setPricing('billing_period', e.target.value)}>
              <option value="yıllık">Yıllık</option>
              <option value="aylık">Aylık</option>
            </select>
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>{f.billing_period === 'aylık' ? 'Aylık' : 'Yıllık'} ücret (₺, KDV dahil)</label>
            <input type="number" min="0" step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} required />
          </div>
          <div className="pl-field">
            <label>Durum</label>
            <select value={f.status || 'aktif'} onChange={(e) => set('status', e.target.value)}>
              {CONTRACT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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

// Yenileme dayanağı sözleşmeye göre seçilir: "otomatik_madde" kendiliğinden uzama (yeni damga vergisi kâğıdı yok; fiyat artışı
// yalnız ≥45 gün önce yapılmış bildirimle), "yeni_imza" yeni imzalı sözleşme (taslak damga kaydı açılır). Yıllık dönemde
// yeni dönem faturası da açılır; aylıkta "Bu ayın aylık faturalarını hazırla" kullanılır.
export function RenewForm({ contract, onClose, onDone }) {
  const [f, setF] = useState({ basis: 'otomatik_madde', price: String(contract.price ?? ''), notice: '', months: 12 })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const raised = Number(f.price) > Number(contract.price)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await renewContract(contract.id, { basis: f.basis, price: Number(f.price), priceNoticeAt: f.notice || null, months: Number(f.months) || 12 }); onDone() }
    catch (err) { setError(err?.message || 'Yenilenemedi.') } finally { setBusy(false) }
  }
  return (
    <Modal title={`Yenile · ${contract.customer?.title || ''}`} onClose={onClose}
      footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-solid" form="renew-form" type="submit" disabled={busy}>{busy ? 'Yenileniyor…' : 'Yeni dönemi aç'}</button></>}>
      <form id="renew-form" className="pl-form" onSubmit={submit}>
        {error && <div className="pl-alert" role="alert"><span className="msg">{error}</span></div>}
        <p className="sub" style={{ marginTop: 0 }}>Mevcut dönem ({fmtDate(contract.start_date)} – {fmtDate(contract.end_date)}) olduğu gibi kalır; yeni dönem {fmtDate(contract.end_date)} sonrasından başlar.</p>
        <div className="pl-field"><label>Dayanak</label>
          <select value={f.basis} onChange={(e) => set('basis', e.target.value)}>
            <option value="otomatik_madde">Sözleşmedeki kendiliğinden yenileme maddesi</option>
            <option value="yeni_imza">Yeni imzalı sözleşme</option>
          </select></div>
        <div className="two">
          <div className="pl-field"><label>Yeni dönem bedeli (₺/{contract.billing_period === 'aylık' ? 'ay' : 'yıl'}, KDV dahil)</label><input type="number" min="0" step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} required /></div>
          <div className="pl-field"><label>Süre (ay)</label><input type="number" min="1" max="60" value={f.months} onChange={(e) => set('months', e.target.value)} /></div>
        </div>
        {raised && f.basis === 'otomatik_madde' && <div className="pl-field"><label>Fiyat artışının müşteriye bildirildiği tarih (bitişten en az 45 gün önce) *</label><input type="date" value={f.notice} onChange={(e) => set('notice', e.target.value)} required /></div>}
        {f.basis === 'yeni_imza' && <p className="sub">Yeni sözleşme için damga vergisi kaydı taslak açılır; imzalı belge yüklenince kesinleşir.</p>}
      </form>
    </Modal>
  )
}
