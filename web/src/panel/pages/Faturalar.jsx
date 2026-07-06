import { useEffect, useState, useMemo } from 'react'
import { invoices, customers, withCustomerNames, revenueByMonth, issueEInvoice, notifyEvent, invStatus, getConfig, setConfig, INVOICE_STATUS, EFATURA_PROVIDERS } from '../lib/store.js'
import { Modal, fmtDate, fmtTL } from './_ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  customer_id: '', amount: '', status: 'bekliyor',
  issue_date: today(), due_date: '', paid_date: '', note: '', payment_link: '', notify: true,
})

const INV_CLS = { bekliyor: 'b-warn', 'ödendi': 'b-ok', gecikti: 'b-danger' }
const InvBadge = ({ s }) => <span className={`pl-badge ${INV_CLS[s] || 'b-warn'}`}>{s}</span>

export default function Faturalar() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [chart, setChart] = useState([])
  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [cfg, setCfg] = useState(getConfig())
  const [showEfat, setShowEfat] = useState(false)
  const saveCfg = (patch) => setCfg(setConfig(patch))

  const load = async () => {
    const [iv, cs, rev] = await Promise.all([invoices.list(), customers.list(), revenueByMonth(6)])
    setRows(await withCustomerNames(iv))
    setCusts(cs)
    setChart(rev)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((r) => {
    if (fStatus && invStatus(r) !== fStatus) return false
    if (q) {
      const s = ((r.customer?.title || '') + ' ' + (r.note || '')).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || '')), [rows, q, fStatus])

  const totals = useMemo(() => {
    const paid = rows.filter((r) => invStatus(r) === 'ödendi').reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const wait = rows.filter((r) => invStatus(r) === 'bekliyor').reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const late = rows.filter((r) => invStatus(r) === 'gecikti').reduce((s, r) => s + (Number(r.amount) || 0), 0)
    return { paid, wait, late }
  }, [rows])

  const save = async (form) => {
    const { notify, ...rest } = form
    const data = { ...rest, amount: Number(rest.amount) || 0 }
    if (data.status === 'ödendi' && !data.paid_date) data.paid_date = today()
    if (modal.mode === 'new') {
      await invoices.create(data)
      if (notify) {
        const cust = custs.find((c) => c.id === data.customer_id)
        if (cust) await notifyEvent('invoice_issued', cust, { tutar: fmtTL(data.amount), tarih: fmtDate(data.issue_date) })
      }
    } else await invoices.update(modal.data.id, data)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Bu fatura silinsin mi?')) { await invoices.remove(id); load() } }
  const markPaid = async (r) => { await invoices.update(r.id, { status: 'ödendi', paid_date: today() }); load() }

  const issueE = async (r) => {
    const cust = custs.find((c) => c.id === r.customer_id)
    const res = await issueEInvoice(r, cust)
    if (res.ok) { alert('e-Belge kesildi: ' + (res.number || res.uuid || '—')); load() }
    else alert('e-Belge kesilemedi:\n' + res.reason)
  }

  const maxRev = Math.max(1, ...chart.map((b) => b.total))

  return (
    <div>
      <div className="pl-head">
        <div><h1>Fatura & Gelir</h1><p>Tahsilatları takip et, aylık ciroyu gör.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })} disabled={!custs.length}>
          + Yeni fatura
        </button>
      </div>

      {!custs.length && (
        <div className="pl-alert"><span className="ic">ℹ️</span><span className="msg">Önce en az bir <b>müşteri</b> eklemelisin.</span></div>
      )}

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Tahsil edilen</div><div className="val teal">{fmtTL(totals.paid)}</div></div>
        <div className="pl-stat"><div className="lab">Bekleyen</div><div className={`val${totals.wait ? ' warn' : ''}`}>{fmtTL(totals.wait)}</div></div>
        <div className="pl-stat"><div className="lab">Geciken</div><div className={`val${totals.late ? ' danger' : ''}`}>{fmtTL(totals.late)}</div></div>
        <div className="pl-stat"><div className="lab">Fatura sayısı</div><div className="val">{rows.length}</div></div>
      </div>

      {/* aylık ciro grafiği */}
      <div className="pl-card" style={{ marginBottom: 20 }}>
        <div className="pl-card-h"><h2>Aylık ciro (son 6 ay)</h2></div>
        <div className="pl-card-b">
          <div className="pl-chart">
            {chart.map((b) => (
              <div className="pl-bar-col" key={b.key}>
                <div className="pl-bar-val">{b.total ? fmtTL(b.total) : ''}</div>
                <div className="pl-bar" style={{ height: `${Math.round((b.total / maxRev) * 100)}%` }} />
                <div className="pl-bar-lab">{b.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* e-Belge (e-fatura / e-arşiv) ayarları */}
      <div className="pl-card" style={{ marginBottom: 20 }}>
        <div className="pl-card-h">
          <h2>e-Belge (e-Fatura / e-Arşiv)</h2>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setShowEfat((v) => !v)}>{showEfat ? 'Gizle' : 'Ayarlar'}</button>
        </div>
        <div className="pl-card-b">
          <div className="t2" style={{ marginBottom: showEfat ? 14 : 0 }}>
            {cfg.efatura_enabled
              ? <>Entegrasyon <b>açık</b> — sağlayıcı: <b>{EFATURA_PROVIDERS.find((p) => p.v === cfg.efatura_provider)?.l || '(seçilmedi)'}</b>, mod: <b>{cfg.efatura_mode}</b>. Fatura satırındaki <b>e-Belge</b> ile kes.</>
              : <>Türkiye'de e-belge GİB onaylı bir <b>entegratör</b> (Paraşüt, Uyumsoft, İzibiz…) üzerinden kesilir. Hesabını bağlayınca faturaları tek tıkla e-belgeye çevirirsin. Gizli anahtarlar Supabase secrets'ta saklanır.</>}
          </div>
          {showEfat && (
            <div className="pl-form">
              <div className="two">
                <div className="pl-field">
                  <label>Entegratör</label>
                  <select value={cfg.efatura_provider} onChange={(e) => saveCfg({ efatura_provider: e.target.value })}>
                    <option value="">Seç…</option>
                    {EFATURA_PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </div>
                <div className="pl-field">
                  <label>Belge tipi</label>
                  <select value={cfg.efatura_mode} onChange={(e) => saveCfg({ efatura_mode: e.target.value })}>
                    <option value="e-arsiv">e-Arşiv (mükellef olmayana)</option>
                    <option value="e-fatura">e-Fatura (e-fatura mükellefine)</option>
                  </select>
                </div>
              </div>
              <div className="pl-field">
                <label>Entegratör kullanıcı / e-posta</label>
                <input value={cfg.efatura_user} onChange={(e) => saveCfg({ efatura_user: e.target.value })} placeholder="Hesap kullanıcı adı" />
              </div>
              <div className="pl-field">
                <label className="pl-chk" style={{ display: 'inline-flex' }}>
                  <input type="checkbox" checked={!!cfg.efatura_enabled} onChange={(e) => saveCfg({ efatura_enabled: e.target.checked })} />
                  e-Belge kesimini aç (bulut modu + issue-einvoice Edge Function gerekir)
                </label>
                <div className="t2" style={{ marginTop: 6 }}>
                  Kurulum: <code>supabase functions deploy issue-einvoice</code> + entegratör anahtarlarını <code>supabase secrets set …</code> ile gir.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <input type="search" placeholder="Müşteri veya not ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {INVOICE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Müşteri</th><th>Tutar</th><th>Kesim</th><th>Vade</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><div className="pl-empty">Fatura yok.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="strong">{r.customer?.title || '—'}</span>
                  {r.note && <div className="sub">{r.note}</div>}
                  {r.einvoice_status && <div className="sub">e-Belge: {r.einvoice_no || r.einvoice_uuid} · {r.einvoice_status}{r.einvoice_pdf && <> · <a className="pl-link" href={r.einvoice_pdf} target="_blank" rel="noreferrer">PDF</a></>}</div>}
                </td>
                <td className="pl-num strong">{fmtTL(r.amount)}</td>
                <td className="pl-num">{fmtDate(r.issue_date)}</td>
                <td className="pl-num">{fmtDate(r.due_date)}</td>
                <td><InvBadge s={invStatus(r)} /></td>
                <td>
                  <div className="pl-actions">
                    {r.status !== 'ödendi' && <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => markPaid(r)}>Ödendi</button>}
                    {cfg.efatura_enabled && !r.einvoice_status && <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => issueE(r)}>e-Belge</button>}
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setModal({ mode: 'edit', data: { ...r } })}>Düzenle</button>
                    <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => del(r.id)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <FaturaForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function FaturaForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (!f.customer_id) return; onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni fatura' : 'Faturayı düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="fatura-form" type="submit">Kaydet</button>
      </>}>
      <form id="fatura-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Müşteri *</label>
          <select value={f.customer_id} onChange={(e) => set('customer_id', e.target.value)} required>
            <option value="">Seç…</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Tutar (₺) *</label>
            <input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} required placeholder="0" />
          </div>
          <div className="pl-field">
            <label>Durum</label>
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {INVOICE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Kesim tarihi</label>
            <input type="date" value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
          </div>
          <div className="pl-field">
            <label>Vade tarihi</label>
            <input type="date" value={f.due_date || ''} onChange={(e) => set('due_date', e.target.value)} />
          </div>
        </div>
        {f.status === 'ödendi' && (
          <div className="pl-field">
            <label>Ödeme tarihi</label>
            <input type="date" value={f.paid_date || ''} onChange={(e) => set('paid_date', e.target.value)} />
          </div>
        )}
        <div className="pl-field">
          <label>Not</label>
          <textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="ör. Yıllık sanal ofis bedeli" />
        </div>
        <div className="pl-field">
          <label>Kartla ödeme linki (opsiyonel)</label>
          <input value={f.payment_link || ''} onChange={(e) => set('payment_link', e.target.value)} placeholder="iyzico/PayTR ödeme linki — müşteri portalında 'Kartla öde' olarak çıkar" />
        </div>
        {modal.mode === 'new' && (
          <div className="pl-field">
            <label className="pl-chk" style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={!!f.notify} onChange={(e) => set('notify', e.target.checked)} />
              Müşteriye bildirim gönder (fatura oluşturuldu)
            </label>
          </div>
        )}
      </form>
    </Modal>
  )
}
