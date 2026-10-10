import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mail, customers, withCustomerNames, notifyEvent, setMailStatus, fileToStoredUrl, trackingUrl, MAIL_TYPES, MAIL_STATUS, CARRIERS } from '../lib/store.js'
import { SecureImage } from '../components/SecureAsset.jsx'
import { Modal, StatusBadge, TypeBadge, fmtDate } from './_ui.jsx'
import { localISO } from '../lib/dates.js'

const emptyForm = () => ({
  customer_id: '', type: 'kargo', sender: '',
  received_date: localISO(),
  status: 'geldi', shelf: '', photo_url: '',
  forward_carrier: '', forward_tracking: '', delivered_to: '', delivered_at: '', notes: '',
  issuer: '', reference_no: '', attempted_at: '', legal_result: '', receiver_capacity: '', notify_channel: 'whatsapp',
  notify: true, // yeni girişte müşteriye bildirildi (personel WhatsApp/telefonla haber verdi)
})
// Resmî tebligat imha edilemez ve bildirim kaydı olmadan teslim/yönlendirme ile kapanmaz (0015 sunucu kuralı).
const statusOptions = (type) => MAIL_STATUS.filter((s) => !(type === 'tebligat' && s === 'imha'))
const LEGAL_RESULTS = [['teslim_girişimi', 'Teslim girişimi (kabul yetkisi yok / doğrulanmadı)'], ['teslim_alındı', 'Hukuken teslim alındı (kabul yetkisi doğrulandı)'], ['iade', 'İade edildi'], ['diğer', 'Diğer']]
const NOTIFY_CHANNELS = ['whatsapp', 'telefon', 'e-posta', 'sms']

const isOpenTebligat = (r) => r.type === 'tebligat' && ['geldi', 'bildirildi'].includes(r.status)

export default function Kargo() {
  const [rows, setRows] = useState([])
  const [custs, setCusts] = useState([])
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [modal, setModal] = useState(null) // {mode,data}
  const [lightbox, setLightbox] = useState(null) // photo url

  const [params, setParams] = useSearchParams()
  const load = async () => {
    const [ml, cs] = await Promise.all([mail.list(), customers.list()])
    setRows(await withCustomerNames(ml))
    setCusts(cs)
  }
  useEffect(() => { load() }, [])
  // Operasyon sayfası (?yeni=1) ya da müşteri sayfası (?musteri=<id>) "yeni giriş" formunu doğrudan açar.
  useEffect(() => {
    const id = params.get('musteri'), yeni = params.get('yeni')
    if (!custs.length || (!id && !yeni)) return
    setModal({ mode: 'new', data: { ...emptyForm(), ...(id && custs.some((c) => c.id === id) ? { customer_id: id } : {}) } })
    const next = new URLSearchParams(params); next.delete('musteri'); next.delete('yeni'); setParams(next, { replace: true })
  }, [custs, params, setParams])

  const filtered = useMemo(() => rows.filter((r) => {
    if (fType && r.type !== fType) return false
    if (fStatus && r.status !== fStatus) return false
    if (q) {
      const s = ((r.customer?.title || '') + ' ' + (r.sender || '') + ' ' + (r.notes || '') + ' ' + (r.shelf || '')).toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  // Bekleyen tebligat en üstte (hukuki süreler tebligatla başlar); diğerleri mevcut sırada kalır.
  }).sort((a, b) => Number(isOpenTebligat(b)) - Number(isOpenTebligat(a))), [rows, q, fType, fStatus])

  const save = async (form) => {
    const { notify, ...raw } = form
    const rest = { ...raw, attempted_at: raw.attempted_at ? new Date(raw.attempted_at).toISOString() : null, legal_result: raw.legal_result || null, notify_channel: raw.notify_channel || null }
    if (modal.mode === 'new') {
      // bildirim gidiyorsa kayıt doğrudan 'bildirildi' durumuna düşer
      const data = notify && rest.status === 'geldi' ? { ...rest, status: 'bildirildi' } : rest
      await mail.create(data)
      if (notify) {
        const cust = custs.find((c) => c.id === data.customer_id)
        if (cust) {
          const ev = data.type === 'tebligat' ? 'tebligat_arrived' : 'mail_arrived'
          await notifyEvent(ev, cust, { tur: data.type, gonderen: data.sender || '—' })
        }
      }
    } else await mail.update(modal.data.id, rest)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Bu gönderi silinsin mi?')) { await mail.remove(id); load() } }

  // Tebligatın bildirimi kanal ister: hızlı seçimde düzenleme penceresi açılır.
  const quickStatus = async (r, status) => { if (r.type === 'tebligat' && ['bildirildi', 'teslim', 'yönlendirildi'].includes(status) && !r.notify_channel) { setModal({ mode: 'edit', data: { ...r, status, notify_channel: 'whatsapp' } }); return } try { await setMailStatus(r, status, r.customer) } catch (err) { alert(err?.message || 'Durum değiştirilemedi.') } load() }

  return (
    <div>
      <div className="pl-head">
        <div><h1>Kargo & Posta</h1><p>Gelen tüm gönderileri kaydet, fotoğrafla, durumunu takip et.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={() => setModal({ mode: 'new', data: emptyForm() })} disabled={!custs.length}>
          + Yeni giriş
        </button>
      </div>

      {!custs.length && (
        <div className="pl-alert"><span className="ic">ℹ️</span><span className="msg">Önce en az bir <b>müşteri</b> eklemelisin. Müşteriler sekmesine geç.</span></div>
      )}

      <div className="pl-tablewrap">
        <div className="pl-toolbar">
          <input type="search" placeholder="Müşteri, gönderen, raf veya not ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Tüm türler</option>
            {MAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {MAIL_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <table className="pl-table">
          <thead>
            <tr><th>Foto</th><th>Müşteri</th><th>Tür</th><th>Gönderen</th><th>Tarih</th><th>Raf</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8}><div className="pl-empty">Kayıt yok.</div></td></tr>}
            {filtered.map((r) => (
              <tr key={r.id} className={isOpenTebligat(r) ? 'pl-tr-urgent' : undefined}>
                <td>
                  {r.photo_url
                    ? <SecureImage stored={r.photo_url} alt="" className="pl-thumb" onClick={(e) => setLightbox(e.currentTarget.src)} />
                    : <span className="pl-thumb pl-thumb-empty">—</span>}
                </td>
                <td>
                  <span className="strong">{r.customer?.title || '—'}</span>
                  {r.notes && <div className="sub">{r.notes}</div>}
                  {(r.status === 'teslim' || r.status === 'yönlendirildi') && (r.delivered_to || r.delivered_at) && (
                    <div className="sub">
                      {r.status === 'yönlendirildi' ? 'Yönlendirildi' : 'Teslim'}
                      {r.delivered_to ? ` · ${r.delivered_to}` : ''}
                      {r.delivered_at ? ` · ${fmtDate(r.delivered_at)}` : ''}
                      {r.forward_tracking && (
                        <> · takip: {trackingUrl(r.forward_carrier, r.forward_tracking)
                          ? <a href={trackingUrl(r.forward_carrier, r.forward_tracking)} target="_blank" rel="noreferrer" className="pl-link">{r.forward_tracking} ↗</a>
                          : r.forward_tracking}</>
                      )}
                    </div>
                  )}
                </td>
                <td><TypeBadge t={r.type} /></td>
                <td>{r.sender || '—'}</td>
                <td className="pl-num">{fmtDate(r.received_date)}</td>
                <td>{r.shelf || '—'}</td>
                <td>
                  <select className="pl-status-sel" value={r.status} onChange={(e) => quickStatus(r, e.target.value)}
                    style={{ font: 'inherit', fontSize: 13, padding: '5px 8px', border: '1.5px solid #e4e9ef', borderRadius: 8 }}>
                    {statusOptions(r.type).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
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

      {modal && <KargoForm modal={modal} custs={custs} onClose={() => setModal(null)} onSave={save} />}
      {lightbox && (
        <div className="pl-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Gönderi fotoğrafı" />
        </div>
      )}
    </div>
  )
}

function KargoForm({ modal, custs, onClose, onSave }) {
  const [f, setF] = useState(modal.data)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (!f.customer_id) return; onSave(f) }

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await fileToStoredUrl(file, { maxW: 1000, quality: 0.6, prefix: 'mail', customerId: f.customer_id })
      set('photo_url', url)
    } catch { alert('Fotoğraf yüklenemedi.') }
    setBusy(false)
  }

  const isDelivered = f.status === 'teslim'
  const isForwarded = f.status === 'yönlendirildi'

  return (
    <Modal title={modal.mode === 'new' ? 'Yeni gönderi girişi' : 'Gönderiyi düzenle'} onClose={onClose}
      footer={<>
        <button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button>
        <button className="pl-btn pl-btn-solid" form="kargo-form" type="submit" disabled={busy}>{busy ? 'Yükleniyor…' : 'Kaydet'}</button>
      </>}>
      <form id="kargo-form" className="pl-form" onSubmit={submit}>
        <div className="pl-field">
          <label>Müşteri *</label>
          <select value={f.customer_id} onChange={(e) => set('customer_id', e.target.value)} required>
            <option value="">Seç…</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Tür</label>
            <select value={f.type} onChange={(e) => set('type', e.target.value)}>
              {MAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Durum</label>
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {statusOptions(f.type).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="two">
          <div className="pl-field">
            <label>Gönderen</label>
            <input value={f.sender} onChange={(e) => set('sender', e.target.value)} placeholder="ör. Aras Kargo, Vergi Dairesi" />
          </div>
          <div className="pl-field">
            <label>Geliş tarihi</label>
            <input type="date" value={f.received_date} onChange={(e) => set('received_date', e.target.value)} />
          </div>
        </div>
        {f.type === 'tebligat' && (
          <div className="pl-card" style={{ padding: 12, marginBottom: 12, borderColor: '#f3c4c4' }}>
            <p className="sub" style={{ marginTop: 0 }}>GANU çalışanı müşteri şirketin çalışanı ya da temsilcisi değildir; tebliğ mazbatasına gerçek sıfatınızı yazdırın. Kabul yetkiniz doğrulanmadıysa "Teslim girişimi" seçin ve müşteriye aynı gün haber verin.</p>
            <div className="two">
              <div className="pl-field"><label>Tebliği çıkaran kurum</label><input value={f.issuer || ''} onChange={(e) => set('issuer', e.target.value)} placeholder="ör. Beykoz VD, İcra Dairesi" /></div>
              <div className="pl-field"><label>Evrak / takip no</label><input value={f.reference_no || ''} onChange={(e) => set('reference_no', e.target.value)} /></div>
            </div>
            <div className="two">
              <div className="pl-field"><label>Tebliğ girişimi tarih-saati</label><input type="datetime-local" value={f.attempted_at ? String(f.attempted_at).slice(0, 16) : ''} onChange={(e) => set('attempted_at', e.target.value)} /></div>
              <div className="pl-field"><label>Sonuç</label><select value={f.legal_result || ''} onChange={(e) => set('legal_result', e.target.value)}><option value="">Seç…</option>{LEGAL_RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            <div className="pl-field"><label>Teslim alan / görüşen personel ve sıfatı</label><input value={f.receiver_capacity || ''} onChange={(e) => set('receiver_capacity', e.target.value)} placeholder="ör. Ayşe Y. · GANU resepsiyon görevlisi" /></div>
          </div>
        )}

        <div className="pl-field">
          <label>Raf / dolap konumu</label>
          <input value={f.shelf || ''} onChange={(e) => set('shelf', e.target.value)} placeholder="ör. A-3, Dolap 2" />
        </div>

        {(isDelivered || isForwarded) && (
          <div className="two">
            <div className="pl-field">
              <label>{isForwarded ? 'Yönlendirme tarihi' : 'Teslim tarihi'}</label>
              <input type="date" value={f.delivered_at || ''} onChange={(e) => set('delivered_at', e.target.value)} />
            </div>
            {isDelivered ? (
              <div className="pl-field">
                <label>Teslim alan kişi</label>
                <input value={f.delivered_to || ''} onChange={(e) => set('delivered_to', e.target.value)} placeholder="Ad Soyad" />
              </div>
            ) : (
              <div className="pl-field">
                <label>Yönlendirme kargosu</label>
                <select value={f.forward_carrier || ''} onChange={(e) => set('forward_carrier', e.target.value)}>
                  <option value="">Kargo firması…</option>
                  {CARRIERS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {isForwarded && (
          <div className="pl-field">
            <label>Yönlendirme takip no</label>
            <input value={f.forward_tracking || ''} onChange={(e) => set('forward_tracking', e.target.value)} placeholder="Kargo takip numarası" />
            {trackingUrl(f.forward_carrier, f.forward_tracking) && (
              <a href={trackingUrl(f.forward_carrier, f.forward_tracking)} target="_blank" rel="noreferrer" className="pl-link" style={{ marginTop: 6, display: 'inline-block' }}>
                Takip linkini aç ↗
              </a>
            )}
          </div>
        )}

        <div className="pl-field">
          <label>Etiket / zarf fotoğrafı</label>
          <input type="file" accept="image/*" onChange={onPhoto} />
          {f.photo_url && (
            <div className="pl-photo-preview">
              <SecureImage stored={f.photo_url} alt="Önizleme" />
              <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => set('photo_url', '')}>Kaldır</button>
            </div>
          )}
        </div>

        <div className="pl-field">
          <label>Not</label>
          <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="ör. Yönlendirme adresi, aciliyet…" />
        </div>
        {modal.mode === 'new' && (
          <div className="pl-field">
            <label className="pl-chk" style={{ display: 'inline-flex' }}>
              <input type="checkbox" checked={!!f.notify} onChange={(e) => set('notify', e.target.checked)} />
              Müşteriye haber verdim (kayıt "bildirildi" olur, saat kaydedilir)
            </label>
          </div>
        )}
        {(f.notify || f.status === 'bildirildi') && (
          <div className="pl-field">
            <label>Bildirim kanalı</label>
            <select value={f.notify_channel || ''} onChange={(e) => set('notify_channel', e.target.value)}>{NOTIFY_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
        )}
      </form>
    </Modal>
  )
}
