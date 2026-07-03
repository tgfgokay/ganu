import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  customers, contracts, mail, invoices, documents, requests,
  fileToStoredUrl, DOC_TYPES, REQUEST_STATUS,
} from '../lib/store.js'
import { Modal, StatusBadge, TypeBadge, DaysBadge, fmtDate, fmtTL } from './_ui.jsx'

const docLabel = (v) => (DOC_TYPES.find((d) => d.v === v) || {}).l || v

export default function MusteriDetay() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [ct, setCt] = useState([])
  const [ml, setMl] = useState([])
  const [inv, setInv] = useState([])
  const [docs, setDocs] = useState([])
  const [reqs, setReqs] = useState([])
  const [docModal, setDocModal] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const load = async () => {
    const cust = await customers.get(id)
    if (!cust) { setNotFound(true); return }
    setC(cust)
    const [a, b, d, e, r] = await Promise.all([contracts.list(), mail.list(), invoices.list(), documents.list(), requests.list()])
    setCt(a.filter((x) => x.customer_id === id))
    setMl(b.filter((x) => x.customer_id === id))
    setInv(d.filter((x) => x.customer_id === id))
    setDocs(e.filter((x) => x.customer_id === id))
    setReqs(r.filter((x) => x.customer_id === id))
  }
  useEffect(() => { load() }, [id])

  if (notFound) return <div className="pl-empty">Müşteri bulunamadı. <Link to="/panel/musteriler" className="pl-link">Listeye dön</Link></div>
  if (!c) return <div className="pl-empty">Yükleniyor…</div>

  const saveDoc = async (form) => { await documents.create({ ...form, customer_id: id }); setDocModal(false); load() }
  const delDoc = async (d) => { if (confirm('Belge silinsin mi?')) { await documents.remove(d.id); load() } }
  const setReqStatus = async (r, status) => { await requests.update(r.id, { status }); load() }

  const revenue = inv.filter((i) => i.status === 'ödendi').reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const outstanding = inv.filter((i) => i.status !== 'ödendi').reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const openReq = reqs.filter((r) => r.status === 'yeni' || r.status === 'işlemde')

  return (
    <div>
      <div className="pl-head">
        <div>
          <div className="pl-crumb"><Link to="/panel/musteriler" className="pl-link">← Müşteriler</Link></div>
          <h1>{c.title}</h1>
          <p>{c.contact || '—'} · {c.status || 'aktif'}</p>
        </div>
      </div>

      {/* künye */}
      <div className="pl-card" style={{ marginBottom: 20 }}>
        <div className="pl-card-b">
          <div className="pl-kv">
            <div><span className="k">E-posta</span><span className="v">{c.email || '—'}</span></div>
            <div><span className="k">Telefon</span><span className="v">{c.phone || '—'}</span></div>
            <div><span className="k">Vergi No / Daire</span><span className="v">{c.tax_no || '—'} {c.tax_office ? `· ${c.tax_office}` : ''}</span></div>
            <div><span className="k">TC</span><span className="v">{c.tc || '—'}</span></div>
            <div><span className="k">Portal kodu</span><span className="v"><code>{c.access_code || '—'}</code></span></div>
            <div><span className="k">Eklendi</span><span className="v">{fmtDate(c.created_at)}</span></div>
          </div>
          {c.notes && <p style={{ marginTop: 12, color: 'var(--muted)' }}>{c.notes}</p>}
        </div>
      </div>

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Sözleşme</div><div className="val">{ct.length}</div></div>
        <div className="pl-stat"><div className="lab">Gönderi</div><div className="val">{ml.length}</div></div>
        <div className="pl-stat"><div className="lab">Tahsil edilen</div><div className="val teal">{fmtTL(revenue)}</div></div>
        <div className="pl-stat"><div className={`lab`}>Açık talep</div><div className={`val${openReq.length ? ' warn' : ''}`}>{openReq.length}</div></div>
      </div>

      {/* açık talepler */}
      {openReq.length > 0 && (
        <div className="pl-card" style={{ marginBottom: 20 }}>
          <div className="pl-card-h"><h2>Müşteri talepleri</h2></div>
          <div className="pl-card-b">
            {reqs.map((r) => (
              <div className="pl-row" key={r.id}>
                <span className="pl-badge b-kargo">{r.kind}</span>
                <div className="grow">
                  <div className="t1">{r.note || '—'}</div>
                  <div className="t2">{fmtDate(r.created_at)}</div>
                </div>
                <select value={r.status} onChange={(e) => setReqStatus(r, e.target.value)}
                  style={{ font: 'inherit', fontSize: 13, padding: '5px 8px', border: '1.5px solid #e4e9ef', borderRadius: 8 }}>
                  {REQUEST_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pl-grid2">
        {/* sözleşmeler */}
        <div className="pl-card">
          <div className="pl-card-h"><h2>Sözleşmeler</h2><Link to="/panel/sozlesmeler" className="count">Yönet →</Link></div>
          <div className="pl-card-b">
            {ct.length === 0 && <div className="pl-empty">Sözleşme yok.</div>}
            {ct.map((x) => (
              <div className="pl-row" key={x.id}>
                <div className="grow">
                  <div className="t1">{x.package} · {fmtTL(x.price)}</div>
                  <div className="t2">{fmtDate(x.start_date)} – {fmtDate(x.end_date)}</div>
                </div>
                <DaysBadge endDate={x.end_date} />
              </div>
            ))}
          </div>
        </div>

        {/* faturalar */}
        <div className="pl-card">
          <div className="pl-card-h"><h2>Faturalar</h2><Link to="/panel/faturalar" className="count">Yönet →</Link></div>
          <div className="pl-card-b">
            {inv.length === 0 && <div className="pl-empty">Fatura yok.</div>}
            {inv.map((x) => (
              <div className="pl-row" key={x.id}>
                <div className="grow">
                  <div className="t1">{fmtTL(x.amount)}</div>
                  <div className="t2">{fmtDate(x.issue_date)} · {x.status}</div>
                </div>
                <span className={`pl-badge ${x.status === 'ödendi' ? 'b-ok' : x.status === 'gecikti' ? 'b-danger' : 'b-warn'}`}>{x.status}</span>
              </div>
            ))}
            {outstanding > 0 && <div className="pl-row"><div className="grow"><div className="t2">Bekleyen toplam: <b>{fmtTL(outstanding)}</b></div></div></div>}
          </div>
        </div>
      </div>

      {/* gönderiler */}
      <div className="pl-card" style={{ marginTop: 20 }}>
        <div className="pl-card-h"><h2>Kargo & Posta</h2><Link to="/panel/kargo" className="count">Yönet →</Link></div>
        <div className="pl-card-b">
          {ml.length === 0 && <div className="pl-empty">Gönderi yok.</div>}
          {ml.map((x) => (
            <div className="pl-row" key={x.id}>
              <TypeBadge t={x.type} />
              <div className="grow">
                <div className="t1">{x.sender || '—'}{x.shelf ? ` · ${x.shelf}` : ''}</div>
                <div className="t2">{fmtDate(x.received_date)}</div>
              </div>
              <StatusBadge s={x.status} />
            </div>
          ))}
        </div>
      </div>

      {/* belge kasası */}
      <div className="pl-card" style={{ marginTop: 20 }}>
        <div className="pl-card-h">
          <h2>Belge Kasası</h2>
          <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={() => setDocModal(true)}>+ Belge ekle</button>
        </div>
        <div className="pl-card-b">
          {docs.length === 0 && <div className="pl-empty">Belge yok. İmza sirküleri, vergi levhası, işyeri kullanım belgesi vb. ekleyin.</div>}
          {docs.map((d) => (
            <div className="pl-row" key={d.id}>
              <span className="pl-badge b-mektup">{docLabel(d.type)}</span>
              <div className="grow">
                <div className="t1">{d.name}</div>
                {d.note && <div className="t2">{d.note}</div>}
              </div>
              {d.file_url && <a className="pl-btn pl-btn-ghost pl-btn-sm" href={d.file_url} download={d.name}>İndir</a>}
              <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => delDoc(d)}>Sil</button>
            </div>
          ))}
        </div>
      </div>

      {docModal && <BelgeForm onClose={() => setDocModal(false)} onSave={saveDoc} />}
    </div>
  )
}

function BelgeForm({ onClose, onSave }) {
  const [f, setF] = useState({ name: '', type: 'diger', note: '', file_url: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try {
      const url = await fileToStoredUrl(file, { maxW: 1400, quality: 0.7 })
      setF((s) => ({ ...s, file_url: url, name: s.name || file.name }))
    } catch { alert('Dosya yüklenemedi.') }
    setBusy(false)
  }
  const submit = (e) => { e.preventDefault(); if (!f.name.trim()) return; onSave(f) }
  return (
    <Modal title="Belge ekle" onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="belge-form" type="submit" disabled={busy}>{busy ? 'Yükleniyor…' : 'Kaydet'}</button>
      </>}>
      <form id="belge-form" className="pl-form" onSubmit={submit}>
        <div className="two">
          <div className="pl-field">
            <label>Belge türü</label>
            <select value={f.type} onChange={(e) => set('type', e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Ad *</label><input value={f.name} onChange={(e) => set('name', e.target.value)} required placeholder="ör. İmza Sirküleri 2026" /></div>
        </div>
        <div className="pl-field">
          <label>Dosya (PDF / görsel)</label>
          <input type="file" accept="image/*,application/pdf" onChange={onFile} />
          {f.file_url && <div className="t2" style={{ marginTop: 6, color: 'var(--ok)' }}>Dosya eklendi ✓</div>}
        </div>
        <div className="pl-field"><label>Not</label><textarea value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
      </form>
    </Modal>
  )
}
