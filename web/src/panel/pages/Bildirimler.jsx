import { useEffect, useState } from 'react'
import {
  notifications, contracts, customers, withCustomerNames,
  getConfig, setConfig, notifyEvent, daysLeft, CHANNELS,
  getTemplates, setTemplate, sampleVars, TEMPLATE_VARS, renderTemplate,
} from '../lib/store.js'
import { fmtDate } from './_ui.jsx'

const CH_LABEL = { email: 'E-posta', sms: 'SMS', whatsapp: 'WhatsApp' }
const CH_CLS = { email: 'b-mektup', sms: 'b-kargo', whatsapp: 'b-ok' }

export default function Bildirimler() {
  const [cfg, setCfg] = useState(getConfig())
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const rows = await notifications.list()
    setLog(await withCustomerNames(rows))
  }
  useEffect(() => { load() }, [])

  const saveCfg = (patch) => { setCfg(setConfig(patch)) }
  const toggleCh = (ch) => saveCfg({ channels: { ...cfg.channels, [ch]: !cfg.channels[ch] } })

  // yaklaşan yenilemelere elle hatırlatma gönder (log'a yazar)
  const runRenewals = async () => {
    setBusy(true); setMsg('')
    const [ct, cs] = await Promise.all([contracts.list(), customers.list()])
    const byId = Object.fromEntries(cs.map((c) => [c.id, c]))
    let n = 0
    for (const c of ct) {
      const d = daysLeft(c.end_date)
      if (d <= 30 && d >= 0) {
        const cust = byId[c.customer_id]
        if (cust) { await notifyEvent('renewal_due', cust, { paket: c.package, gun: d, tarih: c.end_date }); n++ }
      }
    }
    setBusy(false); setMsg(`${n} yenileme hatırlatması kuyruğa alındı.`); load()
  }

  const activeCount = CHANNELS.filter((c) => cfg.channels[c]).length

  return (
    <div>
      <div className="pl-head">
        <div><h1>Bildirimler</h1><p>Kanalları ayarla, şablonları gör, gönderim kaydını izle.</p></div>
        <button className="pl-btn pl-btn-teal" onClick={runRenewals} disabled={busy}>{busy ? 'Çalışıyor…' : 'Yenileme hatırlatmalarını gönder'}</button>
      </div>

      <div className="pl-alert">
        <span className="ic">{cfg.real_send ? '📨' : 'ℹ️'}</span>
        <span className="msg">
          {cfg.real_send ? (
            <>
              <b>Gerçek gönderim açık.</b> Bulut modunda mesajlar <code>send-notification</code> Edge Function
              üzerinden Netgsm/e-posta ile gönderilir. Yerel modda yine kayıt tutulur (gönderilmez).
            </>
          ) : (
            <>
              Şu an bildirimler <b>kayıt modunda</b>: mesajlar hazırlanıp log'a yazılır ama gönderilmez.
              Gerçek gönderim için aşağıdan <b>“Gerçek gönderimi aç”</b> seçeneğini işaretle; Supabase'e
              <code> send-notification</code> Edge Function'ını dağıt ve secrets'ı gir.
            </>
          )}
        </span>
      </div>

      {msg && <div className="pl-alert" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}><span className="ic">✅</span><span className="msg">{msg}</span></div>}

      {/* kanallar */}
      <div className="pl-card" style={{ marginBottom: 20 }}>
        <div className="pl-card-h"><h2>Kanallar {activeCount === 0 && <span className="count" style={{ color: 'var(--danger)' }}>hiç açık kanal yok</span>}</h2></div>
        <div className="pl-card-b">
          <div className="pl-chk-row">
            {CHANNELS.map((ch) => (
              <label key={ch} className={`pl-chk${cfg.channels[ch] ? ' on' : ''}`}>
                <input type="checkbox" checked={!!cfg.channels[ch]} onChange={() => toggleCh(ch)} />
                {CH_LABEL[ch]}
              </label>
            ))}
          </div>

          <div className="pl-form" style={{ marginTop: 16 }}>
            <div className="pl-field">
              <label>Gönderen adı (imza)</label>
              <input value={cfg.sender_name} onChange={(e) => saveCfg({ sender_name: e.target.value })} placeholder="GANU Sanal Ofis" />
            </div>
            {(cfg.channels.sms || cfg.channels.whatsapp) && (
              <>
                <div className="two">
                  <div className="pl-field"><label>Netgsm kullanıcı no</label><input value={cfg.netgsm_user} onChange={(e) => saveCfg({ netgsm_user: e.target.value })} placeholder="850..." /></div>
                  <div className="pl-field"><label>Netgsm başlık (header)</label><input value={cfg.netgsm_header} onChange={(e) => saveCfg({ netgsm_header: e.target.value })} placeholder="Onaylı başlık" /></div>
                </div>
                <div className="pl-field">
                  <label>Netgsm API parolası</label>
                  <input type="password" value={cfg.netgsm_pass} onChange={(e) => saveCfg({ netgsm_pass: e.target.value })} placeholder="••••••" />
                  <div className="t2" style={{ marginTop: 6 }}>Not: Güvenlik için parola gerçek gönderimde Supabase tarafında saklanmalı; burada yalnızca test amaçlı tutulur.</div>
                </div>
              </>
            )}

            <div className="pl-field" style={{ marginTop: 4 }}>
              <label className="pl-chk" style={{ display: 'inline-flex' }}>
                <input type="checkbox" checked={!!cfg.real_send} onChange={(e) => saveCfg({ real_send: e.target.checked })} />
                Gerçek gönderimi aç (bulut modu + Edge Function gerekir)
              </label>
              <div className="t2" style={{ marginTop: 6 }}>
                Gizli anahtarlar (Netgsm parolası, e-posta API) istemcide DEĞİL, Supabase secrets'ta saklanır.
                Kurulum: <code>supabase functions deploy send-notification</code> + <code>supabase secrets set …</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* şablonlar (düzenlenebilir) */}
      <TemplatesEditor />

      {/* gönderim kaydı */}
      <div className="pl-tablewrap">
        <div className="pl-toolbar"><b style={{ fontSize: 14 }}>Gönderim kaydı</b><span className="spacer" /><span style={{ fontSize: 13, color: 'var(--muted)' }}>{log.length} kayıt</span></div>
        <table className="pl-table">
          <thead><tr><th>Tarih</th><th>Müşteri</th><th>Kanal</th><th>Mesaj</th><th>Durum</th></tr></thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={5}><div className="pl-empty">Henüz bildirim yok.</div></td></tr>}
            {log.map((r) => (
              <tr key={r.id}>
                <td className="pl-num">{fmtDate(r.sent_at)}</td>
                <td>{r.customer?.title || '—'}</td>
                <td><span className={`pl-badge ${CH_CLS[r.channel] || 'b-mektup'}`}>{CH_LABEL[r.channel] || r.channel}</span></td>
                <td><div className="sub" style={{ maxWidth: 420 }}>{r.message}</div></td>
                <td><span className={`pl-badge ${r.status === 'gönderildi' ? 'b-ok' : r.status === 'başarısız' ? 'b-danger' : 'b-warn'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---- düzenlenebilir mesaj şablonları (canlı önizleme) ---- */
function TemplatesEditor() {
  const [tpls, setTpls] = useState(getTemplates())
  const sample = sampleVars()
  const refresh = () => setTpls(getTemplates())
  const onEdit = (k, text) => { setTemplate(k, text); refresh() }
  const onReset = (k) => { setTemplate(k, null); refresh() }

  return (
    <div className="pl-card" style={{ marginBottom: 20 }}>
      <div className="pl-card-h"><h2>Mesaj şablonları</h2><span className="count">düzenlenebilir · canlı önizleme</span></div>
      <div className="pl-card-b">
        {tpls.map((t) => {
          const preview = renderTemplate(t.text, sample)
          const len = preview.length
          const parts = Math.max(1, Math.ceil(len / 160))
          return (
            <div className="pl-tpl" key={t.key}>
              <div className="pl-tpl-head">
                <span className="t1">{t.label}</span>
                {t.custom
                  ? <button type="button" className="pl-linkbtn" onClick={() => onReset(t.key)}>↺ varsayılana dön</button>
                  : <span className="pl-tpl-def">varsayılan</span>}
              </div>
              <textarea className="pl-tpl-ta" value={t.text} rows={2} onChange={(e) => onEdit(t.key, e.target.value)} />
              <div className="pl-tpl-foot">
                <span className={`pl-tpl-len${len > 160 ? ' warn' : ''}`}>{len} karakter · SMS {parts} parça</span>
                {t.custom && <span className="pl-badge b-warn">özel</span>}
              </div>
              <div className="pl-tpl-prev"><span className="lbl">Önizleme</span> {preview}</div>
            </div>
          )
        })}
        <div className="pl-tpl-vars">
          <span className="lbl">Yer tutucular</span>
          {TEMPLATE_VARS.map((v) => (
            <code className="pl-var" key={v.key} title={v.desc}>{`{${v.key}}`}</code>
          ))}
        </div>
      </div>
    </div>
  )
}
