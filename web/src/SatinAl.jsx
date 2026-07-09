import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import GanuMark from './GanuMark'
import { customerApply, customers, activateAfterPayment, submitPaymentReceipt, fileToStoredUrl, getConfig, posPay, posEnabled, PACKAGES, PACKAGE_PRICES, indirimCoz, indirimliTutar } from './panel/lib/store.js'

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
  const refCode = (params.get('ref') || '').trim().toUpperCase() // iş ortağı yönlendirme kodu
  const [pkg, setPkg] = useState(PACKAGES.includes(urlPkg) ? urlPkg : 'Başlangıç')
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ title: '', email: '', phone: '', tax_no: '', tax_office: '' })
  const [err, setErr] = useState('')
  const [cust, setCust] = useState(null)       // adım 1'de oluşan aday kaydı
  const [payTab, setPayTab] = useState('kart') // kart | havale
  const [result, setResult] = useState(null)   // { mode:'kart', code } | { mode:'havale' }
  const [codeInput, setCodeInput] = useState('') // müşterinin girdiği indirim kodu
  const [discount, setDiscount] = useState(null) // { code, pct } | null
  const [codeMsg, setCodeMsg] = useState('')     // kod geri bildirimi
  const cfg = getConfig()
  const listPrice = PACKAGE_PRICES[pkg]
  const isCorp = pkg === 'Kurumsal'
  const price = discount && listPrice ? indirimliTutar(listPrice, discount.pct) : listPrice

  useEffect(() => { document.title = 'GANU · Satın Al'; window.scrollTo(0, 0) }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])

  const set = (k) => (e) => {
    setErr('')
    setF((s) => ({ ...s, [k]: k === 'phone' ? fmtPhoneInput(e.target.value) : e.target.value }))
  }

  /* indirim kodu uygula — kod sahibi (ör. BNI üyesi) kendi girer */
  const applyCode = () => {
    const d = indirimCoz(codeInput)
    if (d) { setDiscount(d); setCodeMsg(`✓ %${d.pct} indirim uygulandı`) }
    else { setDiscount(null); setCodeMsg('Kod geçersiz.') }
  }
  const clearCode = () => { setDiscount(null); setCodeInput(''); setCodeMsg('') }
  const bniPct = discount ? discount.pct : 0

  /* Adım 1 → 2: aday kaydı oluştur */
  const submitInfo = async (e) => {
    e.preventDefault()
    const email = f.email.trim(), phone = f.phone.trim()
    if (!f.title.trim()) return setErr('Şirket ünvanı / adınız zorunlu.')
    if (!email && !phone) return setErr('E-posta ya da telefondan en az birini yazın.')
    if (phone && !validPhone(phone)) return setErr('Telefon eksik/hatalı — 05xx xxx xx xx biçiminde 11 hane yazın.')
    if (email && !validEmail(email)) return setErr('E-posta hatalı görünüyor — ör. ad@firma.com')
    const vkn = f.tax_no.replace(/\D/g, '')
    if (!isCorp && vkn.length !== 10 && vkn.length !== 11) return setErr('Vergi no (10 hane) ya da TC kimlik no (11 hane) zorunlu — faturanız otomatik kesilir.')
    const row = await customerApply({ ...f, package: pkg, ref: refCode, bni: !!discount })
    setCust(row)
    if (isCorp) { setResult({ mode: 'teklif' }); setStep(3) }
    else setStep(2)
  }

  /* Kart ödemesi (SİMÜLASYON) başarılı → kurulum otomatik tamamlanır */
  const onCardPaid = async () => {
    const updated = await activateAfterPayment(cust, pkg, price, { bniPct })
    setResult({ mode: 'kart', code: updated.access_code })
    setStep(3)
  }

  /* Gerçek sanal POS (PayTR/iyzico) — ayarda pos_enabled AÇIK ise çalışır.
     Sağlayıcının 3D Secure ekranına yönlendirir; kart bilgisi GANU'ya girmez.
     Tahsilat sonrası sağlayıcı callback'i DB'yi işaretler, dönüşte panel onaylar. */
  const startPos = async () => {
    const provider = cfg.pos_provider || 'paytr'
    const out = await posPay(provider, {
      customerId: cust.id, amount: price, pkg,
      email: f.email, name: f.title, phone: f.phone,
    })
    const url = out?.iframe_url || out?.redirect_url || out?.payment_url
    if (!url) throw new Error('POS yönlendirme adresi alınamadı.')
    window.location.href = url
  }

  /* Havale: dekont yükle + bildirim.
     - Ayarda "dekontla otomatik aktivasyon" AÇIK ve dekont varsa → anında
       aktive et (karttaki gibi kod ekranda). Aksi halde onay kuyruğuna düşer. */
  const onTransferClaim = async ({ receiptUrl = '' } = {}) => {
    if (cfg.auto_activate_receipt && receiptUrl) {
      try {
        // dekontu da kaydet, sonra aktive et
        await submitPaymentReceipt(cust.id, { receiptUrl, amount: price, pkg, sender: f.title })
        const updated = await activateAfterPayment(cust, pkg, price, { bniPct })
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
            {isCorp ? (
              <div style={{ fontWeight: 800, fontSize: 20 }}>Özel teklif</div>
            ) : (
              <>
                {discount && <div style={{ fontSize: 13, opacity: 0.5, textDecoration: 'line-through' }}>₺{listPrice.toLocaleString('tr-TR')}</div>}
                <div style={{ fontWeight: 800, fontSize: 20, color: discount ? 'var(--teal-dark, #04352c)' : undefined }}>₺{price.toLocaleString('tr-TR')}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{discount ? `${discount.code} · −%${discount.pct} · KDV dahil` : '/ yıl · KDV dahil'}</div>
              </>
            )}
          </div>
          {step === 1 && (
            <select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Paket değiştir"
              style={{ font: 'inherit', padding: '8px 12px', border: '1.5px solid rgba(10,37,64,.25)', borderRadius: 4, width: '100%' }}>
              {PACKAGES.map((p) => <option key={p} value={p}>{p}{PACKAGE_PRICES[p] ? ` — ₺${PACKAGE_PRICES[p].toLocaleString('tr-TR')}/yıl` : ' — özel teklif'}</option>)}
            </select>
          )}
        </div>

        {step === 1 && !isCorp && (
          <div style={{ background: '#fff', border: '2px solid var(--line, #dbe2ea)', borderRadius: 4, padding: '14px 18px', marginBottom: 22 }}>
            <label style={{ ...labelS, display: 'block', marginBottom: 8 }}>İndirim kodunuz var mı?</label>
            {discount ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal-dark, #04352c)' }}>✓ {discount.code} — %{discount.pct} indirim uygulandı</span>
                <button type="button" className="btn btn-line" style={{ padding: '5px 12px', fontSize: 13 }} onClick={clearCode}>Kaldır</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="sa-in" value={codeInput} style={{ flex: 1, minWidth: 160, textTransform: 'uppercase' }}
                    placeholder="ör. üye kodunuz" aria-label="İndirim kodu"
                    onChange={(e) => { setCodeMsg(''); setCodeInput(e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }} />
                  <button type="button" className="btn btn-line" style={{ padding: '0 18px' }} onClick={applyCode} disabled={!codeInput.trim()}>Uygula</button>
                </div>
                {codeMsg && <span style={{ display: 'block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>{codeMsg}</span>}
              </>
            )}
          </div>
        )}

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={field}>
                <label style={labelS} htmlFor="sa-vkn">Vergi no / TC kimlik no {isCorp ? '' : '*'}</label>
                <input id="sa-vkn" className="sa-in" inputMode="numeric" maxLength={11} value={f.tax_no}
                  onChange={set('tax_no')} placeholder="10 ya da 11 hane" required={!isCorp} />
              </div>
              <div style={field}>
                <label style={labelS} htmlFor="sa-vd">Vergi dairesi</label>
                <input id="sa-vd" className="sa-in" value={f.tax_office} onChange={set('tax_office')} placeholder="ör. Beykoz VD" />
              </div>
            </div>
            <span style={{ fontSize: 12.5, opacity: 0.65, marginTop: -6 }}>
              Bu bilgilerle faturanız ödemenin ardından otomatik düzenlenip e-postanıza gönderilir.
            </span>
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
            <div className="pay-tabs">
              {[['kart', '💳', 'Kredi kartı'], ['havale', '🏦', 'Havale / EFT']].map(([k, ic, l]) => (
                <button key={k} type="button" onClick={() => setPayTab(k)} className={`pay-tab${payTab === k ? ' on' : ''}`}>
                  <span aria-hidden="true">{ic}</span>{l}
                </button>
              ))}
            </div>
            {payTab === 'kart'
              ? (posEnabled()
                  ? <PosPay amount={price} provider={cfg.pos_provider || 'paytr'} onStart={startPos} />
                  : <CardPay amount={price} onPaid={onCardPaid} />)
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

        /* ---- Ödeme adımı ---- */
        .pay-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .pay-tab {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font: inherit; font-weight: 700; cursor: pointer;
          padding: 13px 12px; border-radius: 10px;
          background: #fff; color: var(--navy, #0A2540);
          border: 2px solid var(--line, #dbe2ea); transition: all .18s;
        }
        .pay-tab span { font-size: 18px; }
        .pay-tab:hover { border-color: var(--teal, #00D4B2); }
        .pay-tab.on {
          border-color: var(--teal, #00D4B2);
          background: rgba(0,212,178,.08);
          box-shadow: 0 0 0 3px rgba(0,212,178,.12);
        }

        .pay-card { perspective: 1200px; width: 100%; max-width: 380px; margin: 0 auto; aspect-ratio: 1.586; }
        .pay-card-inner {
          position: relative; width: 100%; height: 100%;
          transition: transform .6s cubic-bezier(.4,.2,.2,1);
          transform-style: preserve-3d;
        }
        .pay-card.flip .pay-card-inner { transform: rotateY(180deg); }
        .pay-face {
          position: absolute; inset: 0; border-radius: 16px;
          backface-visibility: hidden; -webkit-backface-visibility: hidden;
          color: #fff; overflow: hidden;
          box-shadow: 0 18px 40px -12px rgba(10,37,64,.55);
        }
        .pay-face-front {
          padding: 20px 22px;
          display: flex; flex-direction: column; justify-content: space-between;
          background: linear-gradient(135deg, #0A2540 0%, #04352c 55%, #00D4B2 160%);
        }
        .pay-face-back {
          transform: rotateY(180deg);
          background: linear-gradient(135deg, #0A2540 0%, #04352c 100%);
        }
        .pay-glow {
          position: absolute; top: -60%; right: -30%;
          width: 320px; height: 320px; border-radius: 50%;
          background: radial-gradient(circle, rgba(0,212,178,.45) 0%, transparent 70%);
          pointer-events: none;
        }
        .pay-chip {
          width: 42px; height: 32px; border-radius: 6px;
          background: linear-gradient(135deg, #f5d67b, #d9a93a);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.18);
        }
        .pay-num {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 20px; letter-spacing: 3px; font-weight: 600;
          text-shadow: 0 1px 2px rgba(0,0,0,.3);
        }

        .pay-lab { display: block; font-size: 13px; font-weight: 600; color: var(--navy, #0A2540); margin-bottom: 6px; }
        .pay-field {
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 2px solid var(--line, #dbe2ea);
          border-radius: 10px; padding: 0 12px; transition: all .18s;
        }
        .pay-field:focus-within {
          border-color: var(--teal, #00D4B2);
          box-shadow: 0 0 0 3px rgba(0,212,178,.12);
        }
        .pay-ic { font-size: 16px; opacity: .8; }
        .pay-in2 {
          font: inherit; color: var(--navy, #0A2540); width: 100%;
          padding: 13px 4px; border: 0; outline: none; background: transparent;
        }

        .pay-btn {
          font: inherit; font-weight: 800; font-size: 16px; color: #fff; cursor: pointer;
          padding: 15px 18px; border: 0; border-radius: 12px;
          background: linear-gradient(135deg, #00D4B2, #04352c);
          box-shadow: 0 12px 26px -10px rgba(0,212,178,.7);
          transition: transform .12s, box-shadow .18s, filter .18s;
        }
        .pay-btn:hover { filter: brightness(1.05); box-shadow: 0 16px 30px -10px rgba(0,212,178,.8); }
        .pay-btn:active { transform: translateY(1px); }
        .pay-btn:disabled { opacity: .65; cursor: default; filter: grayscale(.2); box-shadow: none; }

        .pay-badges { display: flex; flex-wrap: wrap; gap: 8px 14px; justify-content: center; }
        .pay-badge { font-size: 12px; font-weight: 600; color: #5b6b7a; }
      `}</style>
    </div>
  )
}

/* ---- Kart ödeme (TEST MODU — tahsilat yok, simülasyon) ---- */
/* Gerçek sanal POS ödemesi — sağlayıcının güvenli 3D Secure ekranına yönlendirir.
   Kart bilgisi bu ekrana GİRİLMEZ; sağlayıcıda girilir (PCI-DSS uyumlu). */
function PosPay({ amount, provider, onStart }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const label = provider === 'iyzico' ? 'iyzico' : 'PayTR'

  const go = async () => {
    setErr(''); setBusy(true)
    try { await onStart() } // başarılıysa sayfa yönlenir; buraya dönerse hata var
    catch (e) { setErr(String(e?.message || e) || 'Ödeme başlatılamadı.'); setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eef7f4', border: '1.5px solid #9fd8cb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--teal-dark, #04352c)' }}>
        🔒 Güvenli ödeme — kart bilgileriniz {label}'ın 3D Secure ekranında girilir, GANU'ya iletilmez.
      </div>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 4 }}>Ödenecek tutar</div>
        <div style={{ fontWeight: 800, fontSize: 30, color: 'var(--navy, #0A2540)' }}>₺{Number(amount).toLocaleString('tr-TR')}</div>
      </div>
      {err && <span style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>{err}</span>}
      <button type="button" className="pay-btn" onClick={go} disabled={busy}>
        {busy ? 'Yönlendiriliyor…' : `${label} ile güvenli öde →`}
      </button>
      <span style={{ fontSize: 12.5, opacity: 0.6, textAlign: 'center' }}>Ödeme sonrası bu sayfaya geri dönersiniz; paketiniz otomatik aktive olur.</span>
    </div>
  )
}

function CardPay({ amount, onPaid }) {
  const [c, setC] = useState({ no: '', name: '', exp: '', cvv: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [flip, setFlip] = useState(false)
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

  const digits = c.no.replace(/\D/g, '')
  const shownNo = [0, 1, 2, 3].map((i) => digits.slice(i * 4, i * 4 + 4).padEnd(4, '•')).join(' ')
  const brand = /^4/.test(digits) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(digits) ? 'MASTERCARD' : /^(9|65)/.test(digits) ? 'TROY' : ''

  return (
    <form onSubmit={pay} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff7e6', border: '1.5px solid #f0c36d', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#7a5b12' }}>
        🧪 TEST MODU — gerçek tahsilat yapılmaz. Sanal POS (iyzico/PayTR) bağlanınca gerçek ödemeye döner.
      </div>

      {/* canlı kart önizleme */}
      <div className={`pay-card${flip ? ' flip' : ''}`} aria-hidden="true">
        <div className="pay-card-inner">
          <div className="pay-face pay-face-front">
            <div className="pay-glow" />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="pay-chip" />
              <span style={{ fontWeight: 800, fontStyle: 'italic', letterSpacing: 1, fontSize: 15 }}>{brand || 'ganu'}</span>
            </div>
            <div className="pay-num" style={{ position: 'relative' }}>{shownNo}</div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, opacity: 0.55, letterSpacing: 1.2 }}>KART SAHİBİ</div>
                <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || 'AD SOYAD'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, opacity: 0.55, letterSpacing: 1.2 }}>AA/YY</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.exp || '••/••'}</div>
              </div>
            </div>
          </div>
          <div className="pay-face pay-face-back">
            <div style={{ height: 40, background: '#04101d', marginTop: 20 }} />
            <div style={{ padding: '14px 22px' }}>
              <div style={{ background: '#fff', borderRadius: 4, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', color: '#0A2540', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 3, fontWeight: 700 }}>{c.cvv || '•••'}</div>
              <div style={{ fontSize: 10, opacity: 0.55, marginTop: 8, textAlign: 'right' }}>CVV / güvenlik kodu</div>
            </div>
          </div>
        </div>
      </div>

      {/* alanlar */}
      <div>
        <label className="pay-lab" htmlFor="cp-no">Kart numarası</label>
        <div className="pay-field">
          <span className="pay-ic">💳</span>
          <input id="cp-no" className="pay-in2" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"
            value={c.no} onChange={set('no', fmtCardNo)} onFocus={() => setFlip(false)} style={{ letterSpacing: 2 }} />
        </div>
      </div>
      <div>
        <label className="pay-lab" htmlFor="cp-name">Kart üzerindeki isim</label>
        <div className="pay-field">
          <span className="pay-ic">👤</span>
          <input id="cp-name" className="pay-in2" autoComplete="cc-name" placeholder="AD SOYAD"
            value={c.name} onChange={set('name', (v) => v.toUpperCase())} onFocus={() => setFlip(false)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label className="pay-lab" htmlFor="cp-exp">Son kullanma</label>
          <div className="pay-field">
            <span className="pay-ic">📅</span>
            <input id="cp-exp" className="pay-in2" inputMode="numeric" autoComplete="cc-exp" placeholder="AA/YY"
              value={c.exp} onChange={set('exp', fmtExpiry)} onFocus={() => setFlip(false)} />
          </div>
        </div>
        <div>
          <label className="pay-lab" htmlFor="cp-cvv">CVV</label>
          <div className="pay-field">
            <span className="pay-ic">🔒</span>
            <input id="cp-cvv" className="pay-in2" inputMode="numeric" autoComplete="cc-csc" placeholder="123" type="password"
              value={c.cvv} onChange={set('cvv', (v) => v.replace(/\D/g, '').slice(0, 4))}
              onFocus={() => setFlip(true)} onBlur={() => setFlip(false)} />
          </div>
        </div>
      </div>
      {err && <span style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{err}</span>}
      <button type="submit" className="pay-btn" disabled={busy}>
        {busy ? 'Banka onayı bekleniyor…' : `🔒 ₺${(amount || 0).toLocaleString('tr-TR')} güvenle öde →`}
      </button>
      <div className="pay-badges">
        <span className="pay-badge">🔒 256-bit SSL</span>
        <span className="pay-badge">🛡️ 3D Secure</span>
        <span className="pay-badge">🚫 Kart saklanmaz</span>
      </div>
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
