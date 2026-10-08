import { useEffect, useMemo, useState } from 'react'
import { withBase } from '../base.js'

// Müşteri teklif sayfası: /teklif#t=<token>. Token URL parçasındadır (sunucuya/Referer'a gitmez).
// Akış: teklifi gör → bilgileri tamamla → sözleşmenin SON halini gör + e-postaya kod → kodla onayla → ödeme (kart linki / havale).
const API = `${String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/quote-public`
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const tl = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
const day = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('tr-TR') : '')
async function call(action, body) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ action, ...body }), referrerPolicy: 'no-referrer' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data?.error || 'İşlem tamamlanamadı.'); e.code = data?.code; e.status = res.status; throw e }
  return data
}
const S = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '7rem 1.25rem 4rem', fontSize: 16, lineHeight: 1.6 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem 1.4rem', marginBottom: 18 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #f1f5f9' },
  label: { display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  btn: { background: '#0f766e', color: '#fff', border: 0, borderRadius: 8, padding: '12px 18px', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  ghost: { background: 'transparent', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 16px', fontSize: 15, cursor: 'pointer' },
  err: { background: '#fef2f2', color: '#991b1b', borderRadius: 8, padding: '10px 12px', margin: '10px 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 },
}

export default function QuotePage() {
  const token = useMemo(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.hash.slice(1)).get('t') || ''), [])
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [party, setParty] = useState({ title: '', contact: '', tc: '', tax_no: '', tax_office: '', address: '', city: '', district: '' })
  const [otpInfo, setOtpInfo] = useState(null), [otp, setOtp] = useState(''), [kvkk, setKvkk] = useState(false), [agree, setAgree] = useState(false), [payment, setPayment] = useState(null)
  useEffect(() => {
    document.title = 'GANU · Teklif'
    if (!token) { setError('Teklif bağlantısı eksik. Size gönderilen e-postadaki bağlantıyı kullanın.'); return }
    call('view', { token }).then((d) => {
      setData(d); if (d.payment) setPayment(d.payment)
      const c = d.customer || {}
      setParty((p) => ({ ...p, title: c.title || '', contact: c.contact || '', tax_office: c.tax_office || '', address: c.address || '', city: c.city || '', district: c.district || '' }))
    }).catch((e) => setError(e.message))
  }, [token])
  const set = (k, v) => { setParty((p) => ({ ...p, [k]: v })); setOtpInfo(null) }
  const q = data?.quote, type = q?.party_type
  const requestOtp = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { setOtpInfo(await call('request_otp', { token, party })); setOtp('') } catch (er) { setError(er.message) } setBusy(false) }
  const accept = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { const r = await call('accept', { token, party, otp, sha256: otpInfo.sha256, kvkk_ack: kvkk, contract_ack: agree }); setPayment(r.payment); setData((d) => ({ ...d, quote: { ...d.quote, status: 'kabul' } })) }
    catch (er) { setError(er.message); if (er.code === 'sha') setOtpInfo(null) }
    setBusy(false)
  }
  const reject = async () => { if (!confirm('Teklifi reddetmek istediğinize emin misiniz?')) return; setBusy(true); try { await call('reject', { token }); setData((d) => ({ ...d, quote: { ...d.quote, status: 'reddedildi' } })) } catch (er) { setError(er.message) } setBusy(false) }

  if (!data) return <main style={S.wrap} aria-busy={!error}><h1>Teklif</h1>{error ? <div style={S.err} role="alert">{error}</div> : <p>Yükleniyor…</p>}</main>
  return <main style={S.wrap}>
    <p style={{ letterSpacing: '.12em', color: '#0f766e', fontWeight: 700, fontSize: 13, margin: 0 }}>GANU · SANAL OFİS</p>
    <h1 style={{ margin: '6px 0 18px' }}>Teklif {q.quote_no}</h1>
    <section style={S.card}>
      <div style={S.row}><span>Paket</span><strong>{q.package_id} · {q.billing_period}</strong></div>
      {q.discount_pct ? <div style={S.row}><span>Liste fiyatı / indirim</span><span>{tl(q.list_amount)} TL · %{q.discount_pct}</span></div> : null}
      <div style={S.row}><span>Tutar (KDV dahil)</span><strong style={{ fontSize: 20 }}>{tl(q.amount)} TL</strong></div>
      <div style={S.row}><span>Geçerlilik</span><span>{day(q.valid_until)}</span></div>
      {q.start_date && <div style={S.row}><span>Hizmet başlangıcı</span><span>{day(q.start_date)}</span></div>}
      {type === 'kuruluş' && <p style={{ fontSize: 14, color: '#475569' }}>Şirketiniz henüz kurulmadığı için sözleşme ve fatura <b>kurucu olarak sizin adınıza</b> düzenlenir{q.planned_company ? ` (kurulacak şirket: ${q.planned_company})` : ''}.</p>}
    </section>
    {error && <div style={S.err} role="alert">{error}</div>}

    {q.status === 'reddedildi' && <section style={S.card}><p>Teklifi reddettiniz. Görüşlerinizi info@ganu.com.tr adresine iletebilirsiniz.</p></section>}

    {q.status === 'gönderildi' && !otpInfo && <form style={S.card} onSubmit={requestOtp}>
      <h2 style={{ marginTop: 0, fontSize: 19 }}>1 · Sözleşme bilgileri</h2>
      <div style={S.grid}>
        <label><span style={S.label}>{type === 'şirket' ? 'Şirket unvanı' : 'Ad soyad'} *</span><input style={S.input} value={party.title} onChange={(e) => set('title', e.target.value)} required /></label>
        {type === 'şirket' ? <>
          <label><span style={S.label}>Yetkili ad soyad *</span><input style={S.input} value={party.contact} onChange={(e) => set('contact', e.target.value)} required /></label>
          <label><span style={S.label}>Vergi kimlik no (10 hane) *</span><input style={S.input} inputMode="numeric" maxLength={10} value={party.tax_no} onChange={(e) => set('tax_no', e.target.value)} required placeholder={data.customer?.tax_no_masked || ''} /></label>
          <label><span style={S.label}>Vergi dairesi *</span><input style={S.input} value={party.tax_office} onChange={(e) => set('tax_office', e.target.value)} required /></label>
        </> : <label><span style={S.label}>TC kimlik no *</span><input style={S.input} inputMode="numeric" maxLength={11} value={party.tc} onChange={(e) => set('tc', e.target.value)} required placeholder={data.customer?.tc_masked || ''} /></label>}
        <label style={{ gridColumn: '1/-1' }}><span style={S.label}>Fatura adresi *</span><input style={S.input} value={party.address} onChange={(e) => set('address', e.target.value)} required /></label>
        <label><span style={S.label}>İlçe *</span><input style={S.input} value={party.district} onChange={(e) => set('district', e.target.value)} required /></label>
        <label><span style={S.label}>İl *</span><input style={S.input} value={party.city} onChange={(e) => set('city', e.target.value)} required /></label>
      </div>
      <p style={{ fontSize: 13, color: '#64748b' }}>Kimlik numaranız yalnız sözleşme ve e-faturada kullanılır. Doğrulama kodu {data.customer?.email} adresine gönderilecek.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button style={S.btn} disabled={busy}>{busy ? 'Hazırlanıyor…' : 'Sözleşmeyi görüntüle ve kod al'}</button><button type="button" style={S.ghost} onClick={reject} disabled={busy}>Teklifi reddet</button></div>
    </form>}

    {q.status === 'gönderildi' && otpInfo && <form style={S.card} onSubmit={accept}>
      <h2 style={{ marginTop: 0, fontSize: 19 }}>2 · Sözleşmeyi inceleyin ve onaylayın</h2>
      <p style={{ fontSize: 14, color: '#475569' }}>{otpInfo.contract_title} · sürüm {otpInfo.contract_version}</p>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, maxHeight: 420, overflow: 'auto' }}>{otpInfo.contract_text}</pre>
      <label style={{ display: 'flex', gap: 8, margin: '12px 0', alignItems: 'flex-start' }}><input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} /><span><a href={withBase('/kvkk')} target="_blank" rel="noopener noreferrer">KVKK aydınlatma metnini</a> okudum.</span></label>
      <label style={{ display: 'flex', gap: 8, margin: '12px 0', alignItems: 'flex-start' }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>Yukarıdaki hizmet sözleşmesini okudum ve kabul ediyorum.</span></label>
      <label><span style={S.label}>{otpInfo.email} adresine gelen 6 haneli kod *</span><input style={{ ...S.input, maxWidth: 200, letterSpacing: '.3em', fontSize: 22 }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required /></label>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}><button style={S.btn} disabled={busy || !kvkk || !agree || otp.length !== 6}>{busy ? 'Onaylanıyor…' : 'Onayla ve ödemeye geç'}</button><button type="button" style={S.ghost} onClick={() => setOtpInfo(null)} disabled={busy}>Bilgileri düzelt / yeni kod</button></div>
    </form>}

    {q.status === 'kabul' && <section style={S.card}>
      <h2 style={{ marginTop: 0, fontSize: 19 }}>{payment?.paid ? 'Ödemeniz alındı' : '3 · Ödeme'}</h2>
      {payment?.paid ? <p>Teşekkür ederiz. Fatura ve sözleşme kopyanız e-postanıza gönderilir.</p> : <>
        <p>Sözleşmeyi onayladınız. Tutar: <b>{tl(payment?.amount ?? q.amount)} TL</b> (KDV dahil).</p>
        {payment?.link_status === 'başarısız' && <p style={{ fontSize: 14, color: '#92400e' }}>Kartla ödeme bağlantısı şu an oluşturulamadı; havale ile ödeyebilir ya da info@ganu.com.tr adresine yazabilirsiniz.</p>}
        {payment?.link && <p><a href={payment.link} style={{ ...S.btn, display: 'inline-block', textDecoration: 'none' }} rel="noopener noreferrer">Kartla öde</a></p>}
        {payment?.bank && <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 15 }}>
          <div><b>Havale / EFT</b></div><div>{payment.bank.bank} · {payment.bank.holder}</div><div style={{ fontFamily: 'monospace', fontSize: 16 }}>{payment.bank.iban}</div><div>Açıklama: <b>{payment.reference}</b></div></div>}
        <p style={{ fontSize: 13, color: '#64748b' }}>Ödemeniz ulaştığında faturanız ve sözleşme kopyanız e-postayla gönderilir.</p></>}
      {data.contract_text && <details><summary>Onayladığınız sözleşme</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13 }}>{data.contract_text}</pre></details>}
    </section>}
    <p style={{ fontSize: 13, color: '#64748b' }}>Sorularınız için: info@ganu.com.tr · GANU Ofis Hizmetleri Ltd. Şti.</p>
  </main>
}
