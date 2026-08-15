import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  customers, contracts, mail, invoices, documents, requests, inspections,
  fileToStoredUrl, invStatus, onboardingSteps, activateAfterPayment,
  DOC_TYPES, REQUEST_STATUS, PACKAGES, PACKAGE_PRICES, BNI_INDIRIM, bniPrice,
} from '../lib/store.js'
import { Modal, StatusBadge, TypeBadge, DaysBadge, fmtDate, fmtTL } from './_ui.jsx'
import { TalepSohbet } from '../MusteriPortal.jsx'
import { SecureImage, SecureLink } from '../components/SecureAsset.jsx'

const docLabel = (v) => (DOC_TYPES.find((d) => d.v === v) || {}).l || v

export default function MusteriDetay() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [ct, setCt] = useState([])
  const [ml, setMl] = useState([])
  const [inv, setInv] = useState([])
  const [docs, setDocs] = useState([])
  const [reqs, setReqs] = useState([])
  const [insp, setInsp] = useState([])
  const [docModal, setDocModal] = useState(false)
  const [chatReq, setChatReq] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const load = async () => {
    const cust = await customers.get(id)
    if (!cust) { setNotFound(true); return }
    setC(cust)
    const [a, b, d, e, r, ins] = await Promise.all([contracts.list(), mail.list(), invoices.list(), documents.list(), requests.list(), inspections.list()])
    setCt(a.filter((x) => x.customer_id === id))
    setMl(b.filter((x) => x.customer_id === id))
    setInv(d.filter((x) => x.customer_id === id))
    setDocs(e.filter((x) => x.customer_id === id))
    setReqs(r.filter((x) => x.customer_id === id))
    setInsp(ins.filter((x) => x.customer_id === id))
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

  const steps = onboardingSteps(c, { contracts: ct, documents: docs, invoices: inv, inspections: insp })
  const doneCount = steps.filter((s) => s.done).length
  const genCode = async () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    await customers.update(id, { access_code: code }); load()
  }
  const activate = async () => { await customers.update(id, { status: 'aktif' }); load() }
  const clearClaim = async () => {
    if (!confirm('Ödeme bildirimini temizle? (dekont ve tutar bilgisi silinir)')) return
    await customers.update(id, { payment_claimed_at: '', payment_receipt_url: '', payment_expected: 0, payment_pkg: '', payment_sender: '' })
    load()
  }

  /* Ödeme onayı: para hesaba geçti / kartla ödendi → sözleşme + ödendi
     faturası + kod + aktif durum tek tıkla. Paket, başvuru notundan gelir. */
  const noteMatch = (c.notes || '').match(/İstenen paket:\s*(\S+)/)
  const wantedPkg = PACKAGES.includes(noteMatch?.[1]) ? noteMatch[1] : 'Başlangıç'
  const toggleBni = async () => { await customers.update(id, { bni: !c.bni }); load() }
  const paymentReceived = async () => {
    const pkg = prompt(`Hangi paket için ödeme alındı? (${PACKAGES.join(' / ')})`, wantedPkg)
    if (!pkg || !PACKAGES.includes(pkg)) return
    let price = PACKAGE_PRICES[pkg]
    if (!price) { // Kurumsal — özel teklif tutarı elle girilir
      const v = prompt('Kurumsal paket için anlaşılan YILLIK tutarı girin (₺):', '24990')
      price = Number((v || '').replace(/\D/g, ''))
      if (!price) return
    }
    const finalPrice = c.bni ? bniPrice(price) : price
    const bniLine = c.bni
      ? `\n• BNI Nişantaşı indirimi (−%${BNI_INDIRIM}): ₺${price.toLocaleString('tr-TR')} → ₺${finalPrice.toLocaleString('tr-TR')}`
      : ''
    if (!confirm(`${pkg} paketi (₺${finalPrice.toLocaleString('tr-TR')}) için ödeme onaylanacak:${bniLine}\n• 1 yıllık sözleşme açılır\n• ₺${finalPrice.toLocaleString('tr-TR')} ÖDENDİ faturası kesilir\n• Erişim kodu üretilir, müşteri AKTİF olur\n• Müşteriye bildirim gider\n\nDevam?`)) return
    const updated = await activateAfterPayment(c, pkg, finalPrice, { bniPct: c.bni ? BNI_INDIRIM : 0 })
    const ei = updated._einvoice
    const eiMsg = ei ? (ei.ok
      ? `\ne-Belge kesildi ✓${ei.mailed ? ' ve müşteriye maillendi ✓' : ''}`
      : `\ne-Belge kesilemedi: ${ei.reason || 'bilinmeyen hata'} — Faturalar'dan tekrar deneyin.`) : ''
    alert(`Kurulum tamamlandı ✓\nPortal erişim kodu: ${updated.access_code}\nKodu müşteriye iletin.${eiMsg}`)
    load()
  }

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

      {/* ödeme onayı — aday müşteri için tek tıkla kurulum */}
      {c.status === 'aday' && (
        <div className="pl-card" style={{ marginBottom: 20, borderColor: c.payment_claimed_at ? 'var(--teal)' : undefined }}>
          <div className="pl-card-h">
            <h2>💰 Ödeme Onayı</h2>
            {c.payment_claimed_at && <span className="pl-badge b-warn">dekont bildirimi bekliyor</span>}
          </div>
          <div className="pl-card-b">
            {c.payment_claimed_at ? (
              <div className="pl-kv" style={{ marginBottom: 14 }}>
                <div><span className="k">Bildirim</span><span className="v">{fmtDate(c.payment_claimed_at)} · {new Date(c.payment_claimed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div><span className="k">Beklenen tutar</span><span className="v"><b>{fmtTL(c.payment_expected || 0)}</b> · {c.payment_pkg || wantedPkg}</span></div>
                <div><span className="k">Gönderen (beyan)</span><span className="v">{c.payment_sender || c.title}</span></div>
              </div>
            ) : (
              <p className="t2" style={{ marginBottom: 12 }}>Müşteri henüz ödeme bildirmedi. Havale/kart ulaştıysa aşağıdan tek tıkla kurulumu tamamlayabilirsiniz.</p>
            )}

            {c.payment_receipt_url && (
              <div style={{ marginBottom: 14 }}>
                <div className="t2" style={{ marginBottom: 6 }}>Yüklenen dekont:</div>
                {c.payment_receipt_url.startsWith('data:image') || /\.(png|jpe?g|webp)$/i.test(c.payment_receipt_url)
                  ? <SecureImage stored={c.payment_receipt_url} alt="dekont" onClick={(e) => setLightbox(e.currentTarget.src)}
                      style={{ maxHeight: 160, borderRadius: 6, border: '1px solid #e4e9ef', cursor: 'zoom-in' }} />
                  : <SecureLink className="pl-btn pl-btn-ghost pl-btn-sm" stored={c.payment_receipt_url} target="_blank" rel="noreferrer">📄 Dekontu aç (PDF)</SecureLink>}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={!!c.bni} onChange={toggleBni} />
              <span>BNI Nişantaşı müşterisi <span className="t2">— ödeme onayında %{BNI_INDIRIM} indirim uygulanır</span></span>
            </label>

            <div className="pl-actions">
              <button className="pl-btn pl-btn-teal" onClick={paymentReceived}>Ödeme doğru → kurulumu tamamla</button>
              {c.payment_claimed_at && <button className="pl-btn pl-btn-ghost" onClick={clearClaim}>Bildirimi temizle</button>}
            </div>
          </div>
        </div>
      )}

      {/* kurulum adımları — satın alma sonrası süreç; tamamlanınca gizlenir */}
      {doneCount < steps.length && (
        <div className="pl-card" style={{ marginBottom: 20 }}>
          <div className="pl-card-h">
            <h2>Kurulum Adımları</h2>
            <span className="count">{doneCount}/{steps.length} tamam</span>
          </div>
          <div className="pl-card-b">
            {steps.map((s, i) => (
              <div className="pl-row" key={s.key}>
                <span aria-hidden="true" style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: s.done ? 'var(--teal, #00D4B2)' : '#eef2f6',
                  color: s.done ? '#04352c' : '#64748b',
                }}>{s.done ? '✓' : i + 1}</span>
                <div className="grow">
                  <div className="t1" style={s.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{s.label}</div>
                  {!s.done && <div className="t2">{s.hint}</div>}
                </div>
                {!s.done && s.key === 'portal' && !c.access_code && (
                  <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={genCode}>Kod üret</button>
                )}
                {!s.done && s.key === 'aktif' && (
                  <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={activate}>Aktif yap</button>
                )}
                {!s.done && s.key === 'belge' && (
                  <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setDocModal(true)}>Belge ekle</button>
                )}
                {!s.done && s.to && <Link className="pl-btn pl-btn-ghost pl-btn-sm" to={s.to}>Git →</Link>}
              </div>
            ))}
          </div>
        </div>
      )}

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
                <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setChatReq(r)}>Yanıtla</button>
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
                  <div className="t2">{fmtDate(x.issue_date)} · {invStatus(x)}</div>
                </div>
                <span className={`pl-badge ${invStatus(x) === 'ödendi' ? 'b-ok' : invStatus(x) === 'gecikti' ? 'b-danger' : 'b-warn'}`}>{invStatus(x)}</span>
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
              {d.file_url && <SecureLink className="pl-btn pl-btn-ghost pl-btn-sm" stored={d.file_url} download={d.name}>İndir</SecureLink>}
              <button className="pl-btn pl-btn-danger pl-btn-sm" onClick={() => delDoc(d)}>Sil</button>
            </div>
          ))}
        </div>
      </div>

      {docModal && <BelgeForm customerId={id} onClose={() => setDocModal(false)} onSave={saveDoc} />}
      {chatReq && <TalepSohbet req={chatReq} from="ganu" onClose={() => setChatReq(null)} />}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="dekont" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

function BelgeForm({ customerId, onClose, onSave }) {
  const [f, setF] = useState({ name: '', type: 'diger', note: '', file_url: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try {
      const url = await fileToStoredUrl(file, { maxW: 1400, quality: 0.7, prefix: 'customers', customerId })
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
