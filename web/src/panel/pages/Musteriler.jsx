import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { customers, contracts, mail, partners, CUSTOMER_STATUS } from '../lib/store.js'
import { Modal, fmtDate } from './_ui.jsx'

const randCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()
const emptyForm = () => ({ title: '', contact: '', email: '', phone: '', tax_no: '', tax_office: '', tc: '', status: 'aktif', access_code: randCode(), partner_id: '', notes: '' })

const CU_CLS = { aktif: 'b-aktif', 'askıda': 'b-warn', 'ayrıldı': 'b-danger' }
const CuBadge = ({ s }) => <span className={`pl-badge ${CU_CLS[s] || 'b-aktif'}`}>{s || 'aktif'}</span>

export default function Musteriler() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [pts, setPts] = useState([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [cs, ct, ml, ps] = await Promise.all([customers.list(), contracts.list(), mail.list(), partners.list()])
    setRows(cs)
    setPts(ps)
    const c = {}
    cs.forEach((x) => { c[x.id] = { soz: ct.filter((r) => r.customer_id === x.id).length, kargo: ml.filter((r) => r.customer_id === x.id).length } })
    setCounts(c)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((r) =>
    !q || (r.title + ' ' + r.contact + ' ' + r.email + ' ' + r.phone).toLowerCase().includes(q.toLowerCase())
  ), [rows, q])

  const save = async (form) => {
    if (modal.mode === 'new') await customers.create(form)
    else await customers.update(modal.data.id, form)
    setModal(null); load()
  }
  const del = async (r) => {
    const cc = counts[r.id] || { soz: 0, kargo: 0 }
    if (cc.soz || cc.kargo) { alert(`Bu müşterinin ${cc.soz} sözleşmesi ve ${cc.kargo} gönderisi var. Önce onları silmelisin.`); return }
    if (confirm('Müşteri silinsin mi?')) { await customers.remove(r.id); load() }
  }

  return (
    <div>
      <div className="pl-head">
        <div><h1>Müşteriler</h1><p>Sözleşme ve kargo kayıtları bu müşterilere bağlanır.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })}>+ Yeni müşteri</button>
      </div>

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <input type="search" placeholder="Ünvan, yetkili, e-posta ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="spacer" />
          <span style={{ fontSize: 13, color: '#64748b' }}>{filtered.length} müşteri</span>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Ünvan / Yetkili</th><th>İletişim</th><th>Durum</th><th>Sözleşme</th><th>Gönderi</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><div className="pl-empty">Müşteri yok. İlk müşteriyi ekle.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/panel/musteriler/${r.id}`} className="pl-link strong">{r.title}</Link>{r.contact && <div className="sub">{r.contact}</div>}</td>
                <td>{r.email || '—'}<div className="sub">{r.phone}</div></td>
                <td><CuBadge s={r.status} /></td>
                <td className="pl-num">{counts[r.id]?.soz ?? 0}</td>
                <td className="pl-num">{counts[r.id]?.kargo ?? 0}</td>
                <td>
                  <div className="pl-actions">
                    <Link to={`/panel/musteriler/${r.id}`} className="pl-btn pl-btn-ghost pl-btn-sm">Detay</Link>
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setModal({ mode: 'edit', data: { ...r } })}>Düzenle</button>
                    <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => del(r)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <MustForm modal={modal} partners={pts} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function MustForm({ modal, partners = [], onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (!f.title.trim()) return; onSave(f) }
  return (
    <Modal title={modal.mode === 'new' ? 'Yeni müşteri' : 'Müşteriyi düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="must-form" type="submit">Kaydet</button>
      </>}>
      <form id="must-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Ünvan / Şirket adı *</label>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ör. Aydın Yazılım Ltd. Şti." required autoFocus />
        </div>
        <div className="two">
          <div className="pl-field"><label>Yetkili kişi</label><input value={f.contact} onChange={(e) => set('contact', e.target.value)} /></div>
          <div className="pl-field"><label>Telefon</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="05.." /></div>
        </div>
        <div className="pl-field"><label>E-posta</label><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="two">
          <div className="pl-field"><label>Vergi no</label><input value={f.tax_no || ''} onChange={(e) => set('tax_no', e.target.value)} placeholder="10 haneli" /></div>
          <div className="pl-field"><label>Vergi dairesi</label><input value={f.tax_office || ''} onChange={(e) => set('tax_office', e.target.value)} /></div>
        </div>
        <div className="two">
          <div className="pl-field"><label>TC (şahıs ise)</label><input value={f.tc || ''} onChange={(e) => set('tc', e.target.value)} placeholder="11 haneli" /></div>
          <div className="pl-field">
            <label>Durum</label>
            <select value={f.status || 'aktif'} onChange={(e) => set('status', e.target.value)}>
              {CUSTOMER_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="pl-field">
          <label>İş ortağı (yönlendiren mali müşavir)</label>
          <select value={f.partner_id || ''} onChange={(e) => set('partner_id', e.target.value)}>
            <option value="">— Yok / doğrudan —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="pl-field">
          <label>Müşteri portalı erişim kodu</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.access_code || ''} onChange={(e) => set('access_code', e.target.value.toUpperCase())} placeholder="Müşteri bununla giriş yapar" />
            <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => set('access_code', randCode())}>Üret</button>
          </div>
        </div>
        <div className="pl-field"><label>Not</label><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </form>
    </Modal>
  )
}
