import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import GanuMark from './GanuMark'
import { customerApply, customers, activateAfterPayment, submitPaymentReceipt, fileToStoredUrl, getConfig, PACKAGES, PACKAGE_PRICES } from './panel/lib/store.js'

/* ============================================================
   /satin-al — 3 adımlı satın alma sayfası
   1 Bilgiler → 2 Ödeme (kart TEST MODU | havale) → 3 Aktivasyon
   Kart ödemesi şimdilik SİMÜLASYON: tahsilat yapılmaz; sanal POS
   (iyzico/PayTR) bağlanınca bu ekran gerçek ödemeye döner.
   ============================================================ */

const validPhone = (p) => { const d = (p || '').replace(/\D/g, ''); return /^5\d{9}$/.test(d) || /^0\d{10}$/.test(d) }
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim())
const fmtPhoneInput = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  if (!d.startsWith('0')) return d
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(' ')
}
const fmtCardNo = (v) => (v || '').replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const fmtExpiry = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d
}
const validExpiry = (v) => {
  const m = /^(\d{2})\/(\d{2})$/.exec(v || '')
  if (!m) return false
  const mm = Number(m[1]), yy = 2000 + Number(m[2])
  if (mm < 1 || mm > 12) return false
  const now = new Date()
  return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1)
}

function Steps({ current }) {
  const steps = ['Bilgiler', 'Ödeme', 'Aktivasyon']
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '26px 0 30px', flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span key={s} style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '.02em', padding: '6px 14px', borderRadius: 999,
          background: i + 1 === current ? 'var(--teal, #00D4B2)' : i + 1 < current ? 'var(--navy, #0A2540)' : 'transparent',
          color: i + 1 === current ? '#04352c' : i + 1 < current ? '#fff' : 'var(--navy, #0A2540)',
          border: i + 1 > current ? '1.5px solid rgba(10,37,64,.3)' : 'none',
          opacity: i + 1 > current ? 0.55 : 1,
        }}>{i + 1 < current ? '✓' : `${i + 1}.`} {s}</span>
      ))}
    </div>
  )
}

const field = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelS = { fontSize: 13, fontWeight: 700, color: 'var(--navy, #0A2540)' }

export default function SatinAl() {
  const [params] = useSearchParams()
  const urlPkg = params.get('paket')
  const [pkg, setPkg] = useState(PACKAGES.includes(urlPkg) ? urlPkg : 'Başlangıç')
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ title: '', email: '', phone: '' })
  const [err, setErr] = useState('')
  const [cust, setCust] = useState(null)       // adım 1'de oluşan aday kaydı
  const [payTab, setPayTab] = useState('kart') // kart | havale
  const [result, setResult] = useState(null)   // { mode:'kart', code } | { mode:'havale' }
  const cfg = getConfig()
  const price = PACKAGE_PRICES[pkg]
  const isCorp = pkg === 'Kurumsal'

  useEffect(() => { document.title = 'GANU · Satın Al'; window.scrollTo(0, 0) }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])

  const set = (k) => (e) => {
    setErr('')
    setF((s) => ({ ...s, [k]: k === 'phone' ? fmtPhoneInput(e.target.value) : e.target.value }))
  }

  /* Adım 1 → 2: aday kaydı oluştur */
  const submitInfo = async (e) => {
    e.preventDefault()
    const email = f.email.trim(), phone = f.phone.trim()
    if (!f.title.trim()) return setErr('Şirket ünvanı / adınız zorunlu.')
    if (!email && !phone) return setErr('E-posta ya da telefondan en az birini yazın.')
    if (phone && !validPhone(phone)) return setErr('Telefon eksik/hatalı — 05xx xxx xx xx biçiminde 11 hane yazın.')
    if (email && !validEmail(email)) return setErr('E-posta hatalı görünüyor — ör. ad@firma.com')
    const row = await customerApply({ ...f, package: pkg })
    setCust(row)
    if (isCorp) { setResult({ mode: 'teklif' }); setStep(3) }
    else setStep(2)
  }

  /* Kart ödemesi (SİMÜLASYON) başarılı → kurulum otomatik tamamlanır */
  const onCardPaid = async () => {
    const updated = await activateAfterPayment(cust, pkg, price)
    setResult({ mode: 'kart', code: updated.access_code })
    setStep(3)
  }

  /* Havale: dekont yükle + bildirim.
     - Ayarda "dekontla otomatik aktivasyon" AÇIK ve dekont varsa → anında
       aktive et (karttaki gibi kod ekranda). Aksi halde onay kuyruğuna düşer. */
  const onTransferClaim = async ({ receiptUrl = '' } = {}) => {
    if (cfg.auto_activate_receipt && receiptUrl) {
      try {
        // dekontu da kaydet, sonra aktive et
        await submitPaymentReceipt(cust.id, { receiptUrl, amount: price, pkg, sender: f.title })
        const updated = await activateAfterPayment(cust, pkg, price)
        setResult({ mode: 'kart', code: updated.access_code })
        setStep(3)
        return
      } catch { /* hata olursa aşağıdaki kuyruğa düşür */ }
    }
    try {
      await submitPaymentReceipt(cust.id, { receiptUrl, amount: price, pkg, sender: f.title })
    } catch { /* bildirim düşmese de müşteri onayını göster */ }
    setResult({ mode: 'havale', withReceipt: !!receiptUrl })
    setStep(3)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper, #F4F6F8)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px clamp(20px,5vw,48px)', borderBottom: '2px solid var(--navy, #0A2540)' }}>
        <a href="/" style={{ display: 'inline-flex', color: 'var(--navy, #0A2540)' }} aria-label="Ana sayfa">
          <GanuMark style={{ height: 26, width: 'auto', display: 'block' }} />
        </a>
        <a href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy, #0A2540)' }}>← Siteye dön</a>
      </header>

      <main style={{ maxWidth: 620, margin: '0 auto', padding: '10px 20px 80px' }}>
        <Steps current={step} />

        {/* sipariş özeti — her adımda sabit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          border: '2px solid var(--navy, #0A2540)', borderRadius: 4, padding: '14px 18px', background: '#fff', marginBottom: 22 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{pkg} Paketi</div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>{isCorp ? 'ihtiyaca göre fiyatlanır' : `yıllık peşin · ≈₺${Math.round(price / 12).toLocaleString('tr-TR')}/ay'a gelir`}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{isCorp ? 'Özel teklif' : `₺${price.toLocaleString('tr-TR')}`}</div>
            {!isCorp && <div style={{ fontSize: 12, opacity: 0.6 }}>/ yıl · KDV dahil</div>}
          </div>
          {step === 1 && (
            <select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Paket değiştir"
              style={{ font: 'inherit', padding: '8px 12px', border: '1.5px solid rgba(10,37,64,.25)', borderRadius: 4, width: '100%' }}>
              {PACKAGES.map((p) => <option key={p} value={p}>{p}{PACKAGE_PRICES[p] ? ` — ₺${PACKAGE_PRICES[p].toLocaleString('tr-TR')}/yıl` : ' — özel teklif'}</option>)}
            </select>
          )}
        </div>

        {step === 1 && (
          <form onSubmit={submitInfo} style={{ display: 'grid', gap: 14, background: '#fff', border: '2px solid var(--line, #dbe2ea)', borderRadius: 4, padding: 22 }}>
            <div style={field}>
              <label style={labelS} htmlFor="sa-title">Şirket ünvanı / adınız *</label>
              <input id="sa-title" className="sa-in" value={f.title} onChange={set('title')} required autoFocus placeholder="ör. Yıldız E-Ticaret Ltd. Şti." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={field}>
                <label style={labelS} htmlFor="sa-mail">E-posta</label>
                <input id="sa-mail" className="sa-in" type="email" inputMode="email" value={f.email} onChange={set('email')} placeholder="ad@firma.com" />
              </div>
              <div style={field}>
                <label style={labelS} htmlFor="sa-tel">Telefon</label>
                <input id="sa-tel" className="sa-in" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" />
              </div>
            </div>
            {err && <span style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{err}</span>}
            <button type="submit" className="btn btn-solid big" style={{ width: '100%' }}>
              {isCorp ? 'Teklif iste →' : 'Ödemeye geç →'}
            </button>
            <span style={{ fontSize: 13, opacity: 0.65, textAlign: 'center' }}>30 saniyede tamamlanır · Sözleşme + KVKK metinleri aktivasyonda paylaşılır</span>
          </form>
        )}

        {step === 2 && (
          <div style={{ background: '#fff', border: '2px solid var(--line, #dbe2ea)', borderRadius: 4, padding: 22 }}>
            {/* ödeme yöntemi sekmeleri */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {[['kart', '💳 Kredi kartı'], ['havale', '🏦 Havale / EFT']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPayTab(k)} style={{
                  flex: 1, font: 'inherit', fontWeight: 700, fontSize: 14, padding: '10px 8px', cursor: 'pointer',
                  borderRadius: 4, border: '2px solid var(--navy, #0A2540)',
                  background: payTab === k ? 'var(--navy, #0A2540)' : 'transparent',
                  color: payTab === k ? '#fff' : 'var(--navy, #0A2540)',
                }}>{l}</button>
              ))}
            </div>
            {payTab === 'kart'
              ? <CardPay amount={price} onPaid={onCardPaid} />
              : <TransferPay cfg={cfg} applicant={f.title || cust?.title} pkg={pkg} amount={price} onClaim={onTransferClaim} />}
          </div>
        )}

        {step === 3 && result && (
          <div style={{ background: '#fff', border: '2px solid var(--line, #dbe2ea)', borderRadius: 4, padding: 26, textAlign: 'center' }}>
            {result.mode === 'kart' && (
              <>
                <div style={{ fontSize: 44, marginBottom: 6 }}>🎉</div>
                <h2 style={{ fontSize: 24, marginBottom: 10 }}>Ödeme alındı — adresiniz hazır!</h2>
                <p style={{ marginBottom: 16 }}>
                  {pkg} paketiniz aktif edildi; sözleşmeniz ve faturanız oluşturuldu.
                  Müşteri portalına aşağıdaki bilgilerle giriş yapabilirsiniz:
                </p>
                <div style={{ background: 'var(--paper, #F4F6F8)', border: '2px dashed var(--navy, #0A2540)', borderRadius: 4, padding: '16px 14px', marginBottom: 16, textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <span style={{ opacity: 0.7 }}>E-posta</span>
                    <b>{f.email || '(panelden iletilecek)'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span style={{ opacity: 0.7 }}>İlk şifre</span>
                    <b style={{ fontSize: 22, letterSpacing: 3 }}>{result.code}</b>
                  </div>
                </div>
                <Link to="/musteri" className="btn btn-solid big" style={{ display: 'inline-block' }}>Portala giriş yap →</Link>
                <p style={{ fontSize: 13, opacity: 0.65, marginTop: 14 }}>
                  Giriş bilgileriniz e-posta/SMS ile de iletilir. İlk girişte KVKK metnini onaylar,
                  ardından şifrenizi değiştirebilirsiniz. Sözleşme imzası ve kimlik belgeleri için ekibimiz sizinle iletişime geçecek.
                </p>
              </>
            )}
            {result.mode === 'havale' && (
              <>
                <div style={{ fontSize: 44, marginBottom: 6 }}>{result.withReceipt ? '🧾' : '⏳'}</div>
                <h2 style={{ fontSize: 24, marginBottom: 10 }}>{result.withReceipt ? 'Dekontunuz alındı' : 'Bildiriminiz alındı'}</h2>
                <p>
                  {result.withReceipt
                    ? 'Dekontunuz ekibimizin onayına düştü. Doğrulanınca (mesai içinde genellikle 1 saat) paketiniz aktif edilir; '
                    : 'Ödemenizi yaptıktan sonra dekontu iletmeniz onayı hızlandırır. Ödeme görülünce '}
                  sözleşmeniz ve portal giriş bilgileriniz e-posta/telefonunuza iletilir.
                </p>
                <p style={{ marginTop: 10, opacity: 0.7 }}>Dekont iletmek / acil durum için: <a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a></p>
              </>
            )}
            {result.mode === 'teklif' && (
              <>
                <div style={{ fontSize: 44, marginBottom: 6 }}>🤝</div>
                <h2 style={{ fontSize: 24, marginBottom: 10 }}>Teklif talebiniz alındı</h2>
                <p>Kurumsal paket ihtiyaca göre fiyatlanır — size özel teklifi hazırlayıp bugün arıyoruz.</p>
              </>
            )}
          </div>
        )}
      </main>

      <style>{`
        .sa-in {
          font: inherit; color: var(--navy, #0A2540); width: 100%;
          padding: 13px 15px; background: var(--paper, #F4F6F8);
          border: 2px solid var(--line, #dbe2ea); border-radius: 4px;
          transition: border-color .2s;
        }
        .sa-in:focus { outline: none; border-color: var(--teal, #00D4B2); }
      `}</style>
    </div>
  )
}

/* ---- Kart ödeme (TEST MODU — tahsilat yok, simülasyon) ---- */
function CardPay({ amount, onPaid }) {
  const [c, setC] = useState({ no: '', name: '', exp: '', cvv: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, fmt) => (e) => { setErr(''); setC((s) => ({ ...s, [k]: fmt ? fmt(e.target.value) : e.target.value })) }

  const pay = async (e) => {
    e.preventDefault()
    if (c.no.replace(/\D/g, '').length !== 16) return setErr('Kart numarası 16 hane olmalı.')
    if (!c.name.trim()) return setErr('Kart üzerindeki isim zorunlu.')
    if (!validExpiry(c.exp)) return setErr('Son kullanma tarihi hatalı (AA/YY) ya da geçmiş.')
    if (!/^\d{3,4}$/.test(c.cvv)) return setErr('CVV 3 haneli olmalı.')
    setBusy(true)
    await new Promise((r) => setTimeout(r, 1800)) // banka onayı simülasyonu
    setBusy(false)
    onPaid()
  }

  return (
    <form onSubmit={pay} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff7e6', border: '1.5px solid #f0c36d', borderRadius: 4, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
        🧪 TEST MODU — gerçek tahsilat yapılmaz. Sanal POS (iyzico/PayTR) bağlanınca bu ekran gerçek ödemeye döner.
      </div>
      <div style={field}>
        <label style={labelS} htmlFor="cp-no">Kart numarası</label>
        <input id="cp-no" className="sa-in" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"
          value={c.no} onChange={set('no', fmtCardNo)} style={{ letterSpacing: 2 }} />
      </div>
      <div style={field}>
        <label style={labelS} htmlFor="cp-name">Kart üzerindeki isim</label>
        <input id="cp-name" className="sa-in" autoComplete="cc-name" placeholder="AD SOYAD"
          value={c.name} onChange={set('name', (v) => v.toUpperCase())} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={field}>
          <label style={labelS} htmlFor="cp-exp">Son kullanma (AA/YY)</label>
          <input id="cp-exp" className="sa-in" inputMode="numeric" autoComplete="cc-exp" placeholder="12/28"
            value={c.exp} onChange={set('exp', fmtExpiry)} />
        </div>
        <div style={field}>
          <label style={labelS} htmlFor="cp-cvv">CVV</label>
          <input id="cp-cvv" className="sa-in" inputMode="numeric" autoComplete="cc-csc" placeholder="123" type="password"
            value={c.cvv} onChange={set('cvv', (v) => v.replace(/\D/g, '').slice(0, 4))} />
        </div>
      </div>
      {err && <span style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{err}</span>}
      <button type="submit" className="btn btn-solid big" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Banka onayı bekleniyor…' : `₺${(amount || 0).toLocaleString('tr-TR')} öde →`}
      </button>
      <span style={{ fontSize: 12.5, opacity: 0.6, textAlign: 'center' }}>🔒 256-bit SSL · Kart bilgileriniz saklanmaz · 3D Secure</span>
    </form>
  )
}

/* ---- Havale / EFT — banka bilgileri + dekont yükleme ---- */
function TransferPay({ cfg, applicant, pkg, amount, onClaim }) {
  const [copied, setCopied] = useState('')
  const [receipt, setReceipt] = useState('')   // yüklenen dekont (dataURL)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const copy = async (text, tag) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1600) } catch { /* pano izni yok */ }
  }
  const aciklama = `${applicant} · ${pkg} paketi`

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setErr('Dosya çok büyük (en fazla 8 MB).'); return }
    setErr(''); setBusy(true)
    try {
      const url = await fileToStoredUrl(file, { maxW: 1600, quality: 0.7 })
      setReceipt(url); setFileName(file.name)
    } catch { setErr('Dosya yüklenemedi, tekrar deneyin.') }
    setBusy(false)
  }

  const isImg = receipt.startsWith('data:image')

  const Row = ({ label, value, tag }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line, #dbe2ea)', flexWrap: 'wrap' }}>
      <span style={{ opacity: 0.65, fontSize: 14 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14 }}>{value}</b>
        {tag && <button type="button" className="btn btn-line" style={{ padding: '3px 9px', fontSize: 12.5 }} onClick={() => copy(value, tag)}>{copied === tag ? '✓' : 'Kopyala'}</button>}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* banka hesap bilgileri */}
      {cfg.payment_iban ? (
        <div style={{ background: 'var(--paper, #F4F6F8)', border: '2px solid var(--navy, #0A2540)', borderRadius: 4, padding: '6px 16px 12px' }}>
          {cfg.payment_bank && <Row label="Banka" value={cfg.payment_bank} />}
          <Row label="Alıcı" value={cfg.payment_recipient || 'GANU Sanal Ofis'} />
          <Row label="IBAN" value={cfg.payment_iban} tag="iban" />
          <Row label="Tutar" value={`₺${(amount || 0).toLocaleString('tr-TR')}`} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', flexWrap: 'wrap' }}>
            <span style={{ opacity: 0.65, fontSize: 14 }}>Açıklama</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 13.5 }}>{aciklama}</b>
              <button type="button" className="btn btn-line" style={{ padding: '3px 9px', fontSize: 12.5 }} onClick={() => copy(aciklama, 'acik')}>{copied === 'acik' ? '✓' : 'Kopyala'}</button>
            </span>
          </div>
          <p style={{ fontSize: 12.5, opacity: 0.6, marginTop: 4 }}>
            💡 Açıklamaya ünvanınızı yazın — ödemenizi hızlı eşleştirmemizi sağlar.
          </p>
        </div>
      ) : (
        <p>Havale bilgileri için bize ulaşın: <a href="mailto:merhaba@ganu.com.tr">merhaba@ganu.com.tr</a></p>
      )}

      {/* dekont yükleme */}
      <div>
        <label style={{ ...labelS, display: 'block', marginBottom: 6 }}>Dekont / makbuz yükle (önerilir)</label>
        {receipt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '2px solid var(--teal, #00D4B2)', borderRadius: 4, padding: 10, background: '#fff' }}>
            {isImg
              ? <img src={receipt} alt="dekont" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 4 }} />
              : <span style={{ fontSize: 30 }}>📄</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName || 'Dekont eklendi'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--teal-dark, #04352c)' }}>✓ Eklendi — göndermeye hazır</div>
            </div>
            <button type="button" className="btn btn-line" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => { setReceipt(''); setFileName('') }}>Kaldır</button>
          </div>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '2px dashed rgba(10,37,64,.35)', borderRadius: 4, padding: '22px 14px', cursor: 'pointer', background: '#fff', textAlign: 'center' }}>
            <span style={{ fontSize: 26 }}>⬆️</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{busy ? 'Yükleniyor…' : 'Dekont seçin (görsel ya da PDF)'}</span>
            <span style={{ fontSize: 12.5, opacity: 0.6 }}>Banka uygulamasından aldığınız işlem dekontu · en fazla 8 MB</span>
            <input type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {err && <span style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600, display: 'block', marginTop: 6 }}>{err}</span>}
      </div>

      <button type="button" className="btn btn-solid big" style={{ width: '100%' }}
        onClick={() => onClaim({ receiptUrl: receipt })} disabled={busy}>
        {receipt ? 'Dekontu gönder ve ödemeyi bildir ✓' : 'Dekontsuz bildir (sonra iletirim)'}
      </button>
      <span style={{ fontSize: 13, opacity: 0.65, textAlign: 'center' }}>
        Bildiriminiz ekibimizin onay kuyruğuna düşer; dekont doğrulanınca (mesai içinde genellikle 1 saat) paketiniz aktif edilir.
      </span>
    </div>
  )
}
