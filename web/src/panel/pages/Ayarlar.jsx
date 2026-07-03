import { useState } from 'react'
import { changePass, authMode } from '../lib/auth.js'
import { verifyMigration } from '../lib/store.js'

export default function Ayarlar() {
  const cloud = authMode === 'supabase'
  const [oldP, setOldP] = useState('')
  const [n1, setN1] = useState('')
  const [n2, setN2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (n1.length < 6) return setMsg({ ok: false, t: 'Yeni parola en az 6 karakter olmalı.' })
    if (n1 !== n2) return setMsg({ ok: false, t: 'Yeni parolalar eşleşmiyor.' })
    setBusy(true)
    const r = await changePass(oldP, n1)
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, t: 'Parola güncellendi.' }); setOldP(''); setN1(''); setN2('') }
    else setMsg({ ok: false, t: r.error || 'Parola güncellenemedi.' })
  }

  const exportData = () => {
    const raw = localStorage.getItem('ganu.panel.v1') || '{}'
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ganu-panel-yedek-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const resetData = () => {
    if (confirm('Tüm panel verisi (müşteri/kargo/sözleşme) silinip örnek veriye dönülecek. Emin misin?')) {
      localStorage.removeItem('ganu.panel.v1'); window.location.reload()
    }
  }

  return (
    <div>
      <div className="pl-head"><div><h1>Ayarlar</h1><p>Panel parolası ve veri yönetimi.</p></div></div>

      <div className="pl-grid2">
        <div className="pl-card">
          <div className="pl-card-h"><h2>Parola değiştir</h2></div>
          <form className="pl-form" onSubmit={submit}>
            {!cloud && (
              <div className="pl-field"><label>Mevcut parola</label><input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} autoComplete="current-password" /></div>
            )}
            <div className="pl-field"><label>Yeni parola</label><input type="password" value={n1} onChange={(e) => setN1(e.target.value)} autoComplete="new-password" /></div>
            <div className="pl-field"><label>Yeni parola (tekrar)</label><input type="password" value={n2} onChange={(e) => setN2(e.target.value)} autoComplete="new-password" /></div>
            {cloud && <span style={{ fontSize: 12.5, color: '#64748b' }}>Bulut modu: oturumdaki ekip hesabınızın parolası güncellenir.</span>}
            {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? '#059669' : '#dc2626' }}>{msg.t}</span>}
            <div><button className="pl-btn pl-btn-solid" type="submit" disabled={busy}>{busy ? 'Güncelleniyor…' : 'Güncelle'}</button></div>
          </form>
        </div>

        <div className="pl-card">
          <div className="pl-card-h"><h2>Veri yönetimi</h2></div>
          <div className="pl-form">
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              Şu an veriler bu tarayıcıda saklanıyor (yerel). Yedek al ya da örnek veriye dön.
              Kalıcı bulut + çoklu cihaz için Supabase'e geçiş kılavuzuna bak.
            </p>
            <div className="pl-actions">
              <button className="pl-btn pl-btn-ghost" onClick={exportData}>↓ Yedek indir (JSON)</button>
              <button className="pl-btn pl-btn-danger" onClick={resetData}>Verileri sıfırla</button>
            </div>
          </div>
        </div>
      </div>

      <div className="pl-card" style={{ marginTop: 20 }}>
        <div className="pl-card-h"><h2>Müşteri portalı</h2></div>
        <div className="pl-form">
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
            Müşterileriniz kendi kargolarını, sözleşmelerini ve belgelerini görebilir, yönlendirme/teslim talebi açabilir.
            Giriş adresi: <code>/musteri</code> — her müşteri, kartındaki <b>erişim kodu</b> ile girer (Müşteriler → Detay/Düzenle).
          </p>
          <div className="pl-actions">
            <a className="pl-btn pl-btn-ghost" href="/musteri" target="_blank" rel="noreferrer">Müşteri portalını aç ↗</a>
          </div>
        </div>
      </div>

      <MigrationCheck />

      <div className="pl-alert" style={{ marginTop: 20, background: '#eefdfa', borderColor: '#a7f3e4' }}>
        <span className="ic">☁️</span>
        <span className="msg">
          <b>Buluta geçiş:</b> Supabase projesi açıp <code>.env</code> dosyasına anahtarları girince veriler tüm cihazlarda ortak olur; bu yönetim paneli gerçek e-posta + parola girişine (Supabase Auth) geçer, müşteri paneli de aynı altyapıyı kullanır. Adımlar proje kökündeki <b>SUPABASE-KURULUM.md</b> dosyasında.
        </span>
      </div>
    </div>
  )
}

/* ---- geçiş (Supabase) doğrulama — tablo erişimi + oturum + kanallar ---- */
function MigrationCheck() {
  const [rep, setRep] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); try { setRep(await verifyMigration()) } finally { setBusy(false) } }
  const badge = (ok, okT, noT) => <span className={`pl-badge ${ok ? 'b-ok' : 'b-danger'}`}>{ok ? okT : noT}</span>

  return (
    <div className="pl-card" style={{ marginTop: 20 }}>
      <div className="pl-card-h">
        <h2>Geçiş doğrulama</h2>
        {rep && <span className={`pl-badge ${rep.mode === 'cloud' ? 'b-ok' : 'b-warn'}`}>{rep.mode === 'cloud' ? '☁️ Bulut modu' : '💾 Yerel mod'}</span>}
      </div>
      <div className="pl-card-b">
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          Bulut moduna geçince tabloların erişilebilirliğini, oturumu ve kanalları buradan doğrula.
          Gizli anahtar okunmaz — yalnızca erişim ve özet raporlanır.
        </p>
        <div className="pl-actions"><button className="pl-btn pl-btn-teal" onClick={run} disabled={busy}>{busy ? 'Kontrol ediliyor…' : 'Doğrula'}</button></div>

        {rep && (
          <div style={{ marginTop: 12 }}>
            <div className="pl-row">
              <div className="grow"><div className="t1">Ortam anahtarları (.env)</div><div className="t2">VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY</div></div>
              {badge(rep.env.url && rep.env.key, 'tanımlı', 'yok · yerel')}
            </div>
            {rep.mode === 'cloud' && (
              <div className="pl-row">
                <div className="grow"><div className="t1">Oturum (Supabase Auth)</div><div className="t2">{rep.auth.email || 'ekip hesabı'}</div></div>
                {badge(rep.auth.ok, 'açık', 'oturum yok')}
              </div>
            )}
            <div className="pl-row">
              <div className="grow"><div className="t1">Gerçek gönderim</div><div className="t2">Bildirimler → kanallar</div></div>
              <span className={`pl-badge ${rep.real_send ? 'b-ok' : 'b-warn'}`}>{rep.real_send ? 'açık' : 'kayıt modu'}</span>
            </div>

            <div className="pl-sublabel">Tablolar {rep.mode === 'local' && '(yerel kayıt sayısı)'}</div>
            {rep.tables.map((t) => (
              <div className="pl-row" key={t.name}>
                <div className="grow"><div className="t1">{t.label}</div><div className="t2"><code>{t.table}</code>{t.error ? ` · ${t.error}` : ''}</div></div>
                {t.ok ? <span className="pl-badge b-ok">{t.count} kayıt</span> : <span className="pl-badge b-danger">erişilemedi</span>}
              </div>
            ))}
          </div>
        )}

        <div className="pl-sublabel">Bulut kurulum adımları</div>
        <ol className="pl-steps">
          <li><code>supabase-schema.sql</code> → SQL Editor'de çalıştır (9 tablo + RLS)</li>
          <li><code>.env</code> → <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code></li>
          <li><code>supabase functions deploy send-notification</code> + <code>secrets set …</code></li>
          <li><code>supabase functions deploy issue-einvoice</code> + entegratör anahtarları</li>
        </ol>
        <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Ayrıntılar: proje kökünde <b>SUPABASE-KURULUM.md</b>.</span>
      </div>
    </div>
  )
}
