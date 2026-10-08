import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal, fmtDate, fmtTL } from './_ui.jsx'
import { CopyButton } from './OperationsInvoices.jsx'
import {
  quotes, customers, invoices, documents, quoteAction, listTemplates, addTemplate, activateTemplate, getTemplate,
  loadCatalog, PACKAGE_PRICES, PACKAGE_MONTHLY, PARTY_TYPES, QUOTE_STATUS, invStatus,
} from '../lib/operations-store.js'

// Teklif → (müşteri: sözleşme onayı + e-posta kodu) → ödeme → e-Belge → adres belgesi → aktif müşteri.
const Q_CLS = { taslak: 'b-mektup', 'gönderildi': 'b-bild', kabul: 'b-aktif', reddedildi: 'b-danger', 'süresi_doldu': 'b-imha', iptal: 'b-imha' }
const QuoteBadge = ({ s }) => <span className={`pl-badge ${Q_CLS[s] || 'b-mektup'}`}>{s.replace('_', ' ')}</span>
const TEMPLATE_KEYS = ['teklif_no', 'tarih', 'taraf_turu', 'musteri_unvan', 'musteri_kimlik', 'musteri_vergi_dairesi', 'musteri_adres', 'musteri_eposta', 'musteri_telefon', 'yetkili', 'kurulacak_sirket', 'paket', 'donem', 'tutar', 'liste_tutar', 'indirim', 'baslangic', 'bitis']
const pct = (list, p) => Math.round((Number(list) || 0) * (100 - (Number(p) || 0))) / 100
const emptyForm = () => ({ mode: 'yeni', customer_id: '', party_type: 'şahıs', title: '', contact: '', email: '', phone: '', tc: '', tax_no: '', tax_office: '', planned_company: '', package_id: 'Başlangıç', billing_period: 'yıllık', discount_pct: 0, amount: '', start_date: '', valid_days: 15, notes: '' })

// Teklifin hangi adımda olduğu (personelin bir bakışta göreceği tek satır).
function stage(q, inv) {
  if (q.status !== 'kabul') return { t: q.status === 'gönderildi' ? (q.viewed_at ? 'Müşteri inceledi, onay bekleniyor' : 'Müşteriye gönderildi') : q.status === 'taslak' ? 'Gönderilmedi' : '—', warn: false }
  if (q.activated_at) return { t: 'Aktif müşteri', warn: false }
  if (!inv || invStatus(inv) !== 'ödendi') return { t: 'Onaylandı · ödeme bekleniyor', warn: invStatus(inv || {}) === 'gecikti' }
  if (inv.einvoice_status !== 'kesildi') return { t: 'Ödendi · e-Belge kesilecek', warn: true }
  if (q.address_doc === 'bekliyor') return { t: 'Ödendi · adres belgesi bekleniyor', warn: true }
  return { t: 'Ödendi · aktivasyon bekliyor', warn: true }
}

export default function OperationsQuotes() {
  const [rows, setRows] = useState([]), [cs, setCs] = useState([]), [invs, setInvs] = useState([]), [filter, setFilter] = useState('açık'), [q, setQ] = useState('')
  const [adding, setAdding] = useState(false), [open, setOpen] = useState(null), [tab, setTab] = useState('teklifler'), [err, setErr] = useState('')
  const load = async () => {
    try { const [a, b, c] = await Promise.all([quotes.list(), customers.list(), invoices.list()]); setRows(a); setCs(b); setInvs(c); setErr('') }
    catch (e) { setErr(/quotes/.test(String(e?.message)) ? 'Teklif tablosu henüz kurulmamış (migration 0014 uygulanmalı).' : String(e?.message || e)) }
  }
  useEffect(() => { load() }, [])
  const byC = useMemo(() => Object.fromEntries(cs.map((c) => [c.id, c])), [cs]), byI = useMemo(() => Object.fromEntries(invs.map((i) => [i.id, i])), [invs])
  const shown = rows.filter((r) => {
    const s = stage(r, byI[r.invoice_id])
    if (filter === 'açık' && (['iptal', 'reddedildi', 'süresi_doldu'].includes(r.status) || r.activated_at)) return false
    if (filter === 'dikkat' && !s.warn && !r.last_error) return false
    if (QUOTE_STATUS.includes(filter) && r.status !== filter) return false
    const c = byC[r.customer_id]
    return !q || `${r.quote_no} ${c?.title || ''} ${c?.email || ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))
  })
  const current = open ? rows.find((r) => r.id === open) : null
  return <div>
    <div className="pl-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button className={`pl-btn pl-btn-sm ${tab === 'teklifler' ? 'pl-btn-teal' : 'pl-btn-ghost'}`} onClick={() => setTab('teklifler')}>Teklifler</button>
      <button className={`pl-btn pl-btn-sm ${tab === 'sablon' ? 'pl-btn-teal' : 'pl-btn-ghost'}`} onClick={() => setTab('sablon')}>Sözleşme şablonu</button>
    </div>
    {err && <div className="pl-card" style={{ marginBottom: 16, borderColor: '#f59e0b' }}><div className="pl-card-b">{err}</div></div>}
    {tab === 'sablon' ? <Templates /> : <>
      <div className="pl-tablewrap"><div className="pl-toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teklif no / müşteri ara…" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>{['açık', 'dikkat', 'tümü', ...QUOTE_STATUS].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <span className="spacer" /><button className="pl-btn pl-btn-teal" onClick={() => setAdding(true)}>+ Yeni teklif</button>
      </div>
        <table className="pl-table"><thead><tr><th>Teklif</th><th>Müşteri</th><th>Paket</th><th className="pl-num">Tutar</th><th>Durum</th><th>Adım</th><th /></tr></thead><tbody>
          {shown.map((r) => { const s = stage(r, byI[r.invoice_id]), c = byC[r.customer_id]; return <tr key={r.id}>
            <td className="strong">{r.quote_no}<div className="sub">{fmtDate(r.created_at.slice(0, 10))}</div></td>
            <td>{c ? <Link to={`/panel/musteriler/${c.id}`} className="strong">{c.title}</Link> : '—'}<div className="sub">{r.party_type}{r.planned_company ? ` · ${r.planned_company}` : ''}</div></td>
            <td>{r.package_id}<div className="sub">{r.billing_period}{r.discount_pct ? ` · %${r.discount_pct}` : ''}</div></td>
            <td className="pl-num">{fmtTL(r.amount)}</td><td><QuoteBadge s={r.status} /></td>
            <td style={{ color: s.warn || r.last_error ? '#b45309' : undefined }}>{s.t}{r.last_error && <div className="sub" style={{ color: '#b91c1c' }}>{r.last_error}</div>}</td>
            <td><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setOpen(r.id)}>Aç</button></td></tr> })}
          {!shown.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>Kayıt yok</td></tr>}
        </tbody></table></div>
      {adding && <NewQuote customers={cs} onClose={() => setAdding(false)} onDone={async (id) => { setAdding(false); await load(); setOpen(id) }} />}
      {current && <QuoteDetail q={current} c={byC[current.customer_id]} inv={byI[current.invoice_id]} onClose={() => setOpen(null)} onChange={load} />}
    </>}
  </div>
}

function NewQuote({ customers: cs, onClose, onDone }) {
  const [f, setF] = useState(emptyForm()), [busy, setBusy] = useState(false), [error, setError] = useState(''), [, setTick] = useState(0)
  useEffect(() => { Promise.resolve(loadCatalog()).then(() => setTick((n) => n + 1)) }, [])
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const custom = f.package_id === 'Kurumsal'
  const list = custom ? Number(f.amount) || 0 : (f.billing_period === 'aylık' ? PACKAGE_MONTHLY[f.package_id] : PACKAGE_PRICES[f.package_id]) || 0
  const total = pct(list, f.discount_pct)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    const payload = { party_type: f.party_type, planned_company: f.planned_company, package_id: f.package_id, billing_period: f.billing_period, discount_pct: Number(f.discount_pct) || 0,
      amount: custom ? Number(f.amount) : undefined, start_date: f.start_date || undefined, valid_days: Number(f.valid_days) || 15, notes: f.notes,
      ...(f.mode === 'mevcut' ? { customer_id: f.customer_id } : { customer: { title: f.title, contact: f.contact, email: f.email, phone: f.phone, tc: f.tc, tax_no: f.tax_no, tax_office: f.tax_office } }) }
    const r = await quoteAction('create', payload); setBusy(false)
    if (r?.error || !r?.quote) return setError(r?.error || 'Teklif oluşturulamadı.')
    onDone(r.quote.id)
  }
  return <Modal title="Yeni teklif" onClose={onClose} footer={<><button className="pl-btn pl-btn-ghost" onClick={onClose}>Vazgeç</button><button className="pl-btn pl-btn-teal" form="nq" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Taslak oluştur'}</button></>}>
    <form id="nq" className="pl-form" onSubmit={submit}>
      <div className="pl-field"><label>Taraf türü *</label><select value={f.party_type} onChange={(e) => set('party_type', e.target.value)}>{PARTY_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select>
        {f.party_type === 'kuruluş' && <div className="sub">Sözleşme ve fatura kurucu gerçek kişi adına (TCKN) düzenlenir; kurulacak şirket yalnız bilgi olarak yazılır.</div>}</div>
      {f.party_type === 'kuruluş' && <div className="pl-field"><label>Kurulacak şirketin unvanı</label><input value={f.planned_company} onChange={(e) => set('planned_company', e.target.value)} /></div>}
      <div className="pl-field"><label>Müşteri</label><select value={f.mode} onChange={(e) => set('mode', e.target.value)}><option value="yeni">Yeni müşteri (aday)</option><option value="mevcut">Kayıtlı müşteri</option></select></div>
      {f.mode === 'mevcut' ? <div className="pl-field"><label>Kayıtlı müşteri *</label><select value={f.customer_id} onChange={(e) => set('customer_id', e.target.value)} required><option value="">Seçin…</option>{cs.map((c) => <option key={c.id} value={c.id}>{c.title}{c.email ? ` · ${c.email}` : ''}</option>)}</select></div> : <>
        <div className="pl-field"><label>{f.party_type === 'şirket' ? 'Şirket unvanı *' : 'Ad soyad *'}</label><input value={f.title} onChange={(e) => set('title', e.target.value)} required minLength={3} /></div>
        {f.party_type === 'şirket' && <div className="pl-field"><label>Yetkili ad soyad</label><input value={f.contact} onChange={(e) => set('contact', e.target.value)} /></div>}
        <div className="two"><div className="pl-field"><label>E-posta *</label><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
          <div className="pl-field"><label>Telefon</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="05xx…" /></div></div>
        {f.party_type === 'şirket'
          ? <div className="two"><div className="pl-field"><label>VKN (bilinmiyorsa boş)</label><input value={f.tax_no} inputMode="numeric" maxLength={10} onChange={(e) => set('tax_no', e.target.value)} /></div><div className="pl-field"><label>Vergi dairesi</label><input value={f.tax_office} onChange={(e) => set('tax_office', e.target.value)} /></div></div>
          : <div className="pl-field"><label>TC kimlik no (boş bırakılabilir; müşteri onayda girer)</label><input value={f.tc} inputMode="numeric" maxLength={11} onChange={(e) => set('tc', e.target.value)} /></div>}
      </>}
      <div className="two"><div className="pl-field"><label>Paket *</label><select value={f.package_id} onChange={(e) => set('package_id', e.target.value)}>{['Başlangıç', 'Pro', 'Kurumsal'].map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="pl-field"><label>Dönem</label><select value={f.billing_period} onChange={(e) => set('billing_period', e.target.value)}><option value="yıllık">yıllık (peşin)</option><option value="aylık">aylık</option></select></div></div>
      <div className="two">{custom ? <div className="pl-field"><label>Tutar (₺, KDV dahil) *</label><input type="number" min="1" step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} required /></div>
        : <div className="pl-field"><label>İndirim %</label><input type="number" min="0" max="100" value={f.discount_pct} onChange={(e) => set('discount_pct', e.target.value)} /></div>}
        <div className="pl-field"><label>Teklif tutarı</label><div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>{list ? fmtTL(total) : '—'}</div>{!custom && !list && <div className="sub">Katalog fiyatı yüklenemedi</div>}</div></div>
      <div className="two"><div className="pl-field"><label>Hizmet başlangıcı (boşsa kabul günü)</label><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></div>
        <div className="pl-field"><label>Geçerlilik (gün)</label><input type="number" min="1" max="60" value={f.valid_days} onChange={(e) => set('valid_days', e.target.value)} /></div></div>
      <div className="pl-field"><label>İç not</label><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      {error && <div className="pl-err" role="alert" style={{ color: '#b91c1c' }}>{error}</div>}
    </form>
  </Modal>
}

function QuoteDetail({ q, c, inv, onClose, onChange }) {
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [link, setLink] = useState(''), [docs, setDocs] = useState([]), [docId, setDocId] = useState(''), [note, setNote] = useState(''), [showText, setShowText] = useState(false)
  useEffect(() => { documents.list().then((d) => setDocs(d.filter((x) => x.customer_id === q.customer_id))).catch(() => setDocs([])) }, [q.customer_id])
  const run = async (action, payload = {}, confirmText = '') => {
    if (confirmText && !confirm(confirmText)) return
    setBusy(action); setMsg('')
    const r = await quoteAction(action, { quote_id: q.id, ...payload }); setBusy('')
    if (r?.error) { setMsg(`⚠ ${r.error}`); return }
    if (r?.link) setLink(r.link)
    if (action === 'send') setMsg(r.mailed ? `✓ Teklif e-postası ${c?.email} adresine gönderildi.` : `Link hazır. ${r.mail_error || ''}`)
    else if (action === 'sync' || r?.pipeline) { const p = r.pipeline || r; setMsg(`${p.state}${p.missing?.length ? ` · eksik: ${p.missing.join(', ')}` : ''}${p.steps?.length ? ` · ${p.steps.join(' · ')}` : ''}${p.error ? ` · ${p.error}` : ''}`) }
    else setMsg(`✓ ${r?.state || 'tamam'}${r?.message ? ` · ${r.message}` : ''}`)
    onChange()
  }
  const paid = inv && invStatus(inv) === 'ödendi'
  const steps = [
    ['Oluşturuldu', q.created_at], ['Gönderildi', q.sent_at], ['Müşteri açtı', q.viewed_at],
    ['Sözleşme onayı', q.accepted_at, q.acceptance_method === 'ıslak_imza' ? 'ıslak imza' : q.accepted_at ? 'e-posta kodu' : ''],
    ['Ödeme', paid ? inv.paid_date : null, inv ? `${invStatus(inv)}${inv.paytr_merchant_oid ? ' · kart' : inv.payment_method ? ` · ${inv.payment_method}` : ''}` : ''],
    ['e-Belge', inv?.einvoice_status === 'kesildi' ? (inv.einvoice_no || 'kesildi') : null, inv?.einvoice_status || ''],
    ['Adres belgesi', q.address_doc !== 'bekliyor' ? q.address_doc_at : null, q.address_doc === 'gerekmiyor' ? `gerekmiyor · ${q.address_doc_note}` : q.address_doc],
    ['Aktif müşteri', q.activated_at],
  ]
  return <Modal title={`${q.quote_no} · ${c?.title || ''}`} onClose={onClose}>
    <div className="pl-form">
      <div className="two"><div><div className="sub">Paket</div><strong>{q.package_id} · {q.billing_period}</strong></div><div><div className="sub">Tutar (KDV dahil)</div><strong>{fmtTL(q.amount)}</strong>{q.discount_pct ? <span className="sub"> · liste {fmtTL(q.list_amount)}, %{q.discount_pct}</span> : null}</div></div>
      <div className="two"><div><div className="sub">Taraf</div>{q.party_type}{q.planned_company ? ` · ${q.planned_company}` : ''}</div><div><div className="sub">Geçerlilik</div>{fmtDate(q.valid_until)}</div></div>
      <ol style={{ margin: '14px 0', paddingLeft: 18, lineHeight: 1.9 }}>{steps.map(([t, at, extra]) => <li key={t} style={{ color: at ? undefined : '#94a3b8' }}>{at ? '✓ ' : ''}{t}{at ? ` · ${fmtDate(String(at).slice(0, 10))}` : ''}{extra ? <span className="sub"> · {extra}</span> : null}</li>)}</ol>
      {q.last_error && <div style={{ color: '#b91c1c', marginBottom: 10 }}>Son hata: {q.last_error}</div>}
      {msg && <div role="status" style={{ background: '#f1f5f9', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 14 }}>{msg}</div>}
      {link && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{link}</code><CopyButton text={link} label="Linki kopyala" /></div>}
      <div className="pl-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
        {['taslak', 'gönderildi'].includes(q.status) && <button className="pl-btn pl-btn-teal" disabled={!!busy} onClick={() => run('send', {}, q.status === 'gönderildi' ? 'Yeni link üretilecek; önceki link geçersiz olur. Devam?' : '')}>{q.status === 'taslak' ? 'Müşteriye gönder' : 'Yeniden gönder (yeni link)'}</button>}
        {q.status === 'kabul' && !paid && <button className="pl-btn pl-btn-ghost" disabled={!!busy} onClick={() => run('pay_link')}>Kart ödeme linki</button>}
        {q.status === 'kabul' && !q.activated_at && <button className="pl-btn pl-btn-ghost" disabled={!!busy} onClick={() => run('sync')}>Devam ettir</button>}
        {!['iptal', 'reddedildi', 'süresi_doldu'].includes(q.status) && !paid && !q.activated_at && <button className="pl-btn pl-btn-danger" disabled={!!busy} onClick={() => run('cancel', {}, 'Teklif iptal edilsin mi?')}>İptal</button>}
      </div>
      {inv && !paid && <div className="sub" style={{ marginTop: 8 }}>Havale/EFT geldiyse <Link to="/panel/faturalar">Faturalar</Link> sayfasından “Ödendi (elle)” işaretleyin, sonra burada “Devam ettir”e basın.</div>}
      {['taslak', 'gönderildi'].includes(q.status) && <fieldset style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}><legend className="sub">Islak imzalı sözleşme ile onay</legend>
        <div className="sub">Müşteri e-postayla onaylamak yerine imzalı sözleşme getirdiyse: önce müşteri sayfasından “Sözleşme” türünde yükleyin.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><select value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Belge seçin…</option>{docs.filter((d) => d.type === 'sozlesme').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!docId || !!busy} onClick={() => run('accept_manual', { document_id: docId }, 'Islak imzalı sözleşmeyle kabul kaydedilsin mi?')}>Kabul kaydet</button></div></fieldset>}
      {q.status === 'kabul' && !q.activated_at && <fieldset style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}><legend className="sub">Adres tahsis / kullanım belgesi</legend>
        <div className="sub">İmzalı belgeyi müşteri sayfasından “İşyeri/Adres Kullanım Belgesi” türünde yükleyip “Yüklendi” deyin. Gerekmiyorsa gerekçe yazın.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!!busy} onClick={() => run('address_doc', { value: 'yüklendi' })}>Yüklendi</button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gerekmiyor gerekçesi" style={{ flex: 1, minWidth: 160 }} />
          <button className="pl-btn pl-btn-ghost pl-btn-sm" disabled={!!busy || note.trim().length < 5} onClick={() => run('address_doc', { value: 'gerekmiyor', note })}>Gerekmiyor</button></div></fieldset>}
      {q.contract_text && <div style={{ marginTop: 16 }}><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setShowText((v) => !v)}>{showText ? 'Sözleşme metnini gizle' : 'Onaylanan sözleşme metni'}</button>
        {showText && <><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f8fafc', padding: 12, borderRadius: 8, maxHeight: 320, overflow: 'auto' }}>{q.contract_text}</pre><div className="sub">Şablon {q.template_version} · SHA-256 {q.contract_sha256}</div></>}</div>}
    </div>
  </Modal>
}

function Templates() {
  const [rows, setRows] = useState([]), [f, setF] = useState({ version: '', title: 'Sanal Ofis Hizmet Sözleşmesi', body_md: '' }), [msg, setMsg] = useState(''), [preview, setPreview] = useState(null)
  const load = () => listTemplates().then(setRows).catch((e) => setMsg(String(e?.message || e)))
  useEffect(() => { load() }, [])
  const save = async (e) => {
    e.preventDefault(); setMsg('')
    const unknown = [...f.body_md.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !TEMPLATE_KEYS.includes(k))
    if (unknown.length) return setMsg(`Bilinmeyen alan: ${[...new Set(unknown)].join(', ')}`)
    try { await addTemplate(f); setF({ ...f, version: '', body_md: '' }); setMsg('✓ Sürüm eklendi (etkin değil). Kontrol edip “Etkinleştir”e basın.'); load() } catch (e2) { setMsg(`⚠ ${e2?.message || e2}`) }
  }
  return <div>
    <div className="pl-card" style={{ marginBottom: 16 }}><div className="pl-card-b" style={{ fontSize: 14, lineHeight: 1.6 }}>
      Müşterinin teklif sayfasında gördüğü ve onayladığı metin buradaki <b>etkin</b> sürümdür. Eklenen sürüm değiştirilemez; düzeltme için yeni sürüm ekleyin. Onaylanmış her teklif kendi metninin kopyasını saklar.
      <div className="sub" style={{ marginTop: 6 }}>Kullanılabilir alanlar: {TEMPLATE_KEYS.map((k) => <code key={k} style={{ marginRight: 6 }}>{`{{${k}}}`}</code>)}</div></div></div>
    <table className="pl-table" style={{ marginBottom: 20 }}><thead><tr><th>Sürüm</th><th>Başlık</th><th>Eklendi</th><th>Durum</th><th /></tr></thead><tbody>
      {rows.map((r) => <tr key={r.version}><td className="strong">{r.version}</td><td>{r.title}</td><td>{fmtDate(r.created_at.slice(0, 10))}</td><td>{r.active ? <span className="pl-badge b-aktif">etkin</span> : '—'}</td>
        <td><div className="pl-actions"><button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={async () => setPreview(await getTemplate(r.version))}>Gör</button>
          {!r.active && <button className="pl-btn pl-btn-teal pl-btn-sm" onClick={async () => { if (!confirm(`${r.version} etkinleştirilsin mi? Bundan sonra gönderilen/onaylanan teklifler bu metni kullanır.`)) return; try { await activateTemplate(r.version); load() } catch (e) { setMsg(`⚠ ${e?.message || e} (yalnız yönetici etkinleştirebilir)`) } }}>Etkinleştir</button>}</div></td></tr>)}
      {!rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: 18 }}>Henüz şablon yok — teklif gönderilemez.</td></tr>}
    </tbody></table>
    <form className="pl-form" onSubmit={save}>
      <div className="two"><div className="pl-field"><label>Sürüm adı *</label><input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="2026-10-08.v1" pattern="[0-9A-Za-z._-]{3,40}" required /></div>
        <div className="pl-field"><label>Başlık *</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div></div>
      <div className="pl-field"><label>Sözleşme metni (onaylı nihai metin) *</label><textarea rows={14} value={f.body_md} onChange={(e) => setF({ ...f, body_md: e.target.value })} required minLength={200} style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
      <button className="pl-btn pl-btn-teal">Yeni sürüm ekle</button>
      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
    </form>
    {preview && <Modal title={`${preview.version} · ${preview.title}`} onClose={() => setPreview(null)}><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 480, overflow: 'auto' }}>{preview.body_md}</pre><div className="sub">SHA-256 {preview.sha256}</div></Modal>}
  </div>
}
