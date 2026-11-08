import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

async function request(body) {
  if (!supabase) throw new Error('Paraşüt bağlantısı için personel hesabıyla giriş yapın.')
  const { data, error } = await supabase.functions.invoke('parasut-oauth', { body })
  if (!error && !data?.error) return data
  let failure = data
  try { failure ||= await error?.context?.json() } catch { /* no raw provider response */ }
  throw new Error(failure?.error || 'Paraşüt bağlantısı okunamadı.')
}

// Mount this on the exact PARASUT_OAUTH_REDIRECT_URI panel route. Browser history is scrubbed
// before networking. Only the standard OAuth authorization code/state enter this component.
export default function ParasutConnectionCard() {
  const [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const operation = useRef(null)
  const load = async () => setStatus(await request({ action: 'status' }))
  useEffect(() => {
    let alive = true
    if (!operation.current) operation.current = (async () => {
      const callback = new URL(window.location.href), state = callback.searchParams.get('state')
      const hasCode = callback.searchParams.has('code'), hasError = callback.searchParams.has('error')
      const code = callback.searchParams.get('code'), denied = callback.searchParams.get('error')
      if (hasCode || hasError || state) {
        for (const key of ['code', 'state', 'error', 'error_description', 'error_uri', 'session_state', 'iss']) callback.searchParams.delete(key)
        window.history.replaceState(window.history.state, '', callback.pathname + callback.search + callback.hash)
      }
      let message = '', error = ''
      if (hasCode || hasError || state) {
        try { message = (await request({ action: 'complete', state, code, error: denied })).message }
        catch (e) { error = e.message }
      }
      return { message, error, status: await request({ action: 'status' }) }
    })()
    const run = async () => {
      setBusy(true)
      try {
        const result = await operation.current
        if (alive) { setStatus(result.status); setMessage(result.message); setError(result.error) }
      } catch (e) { if (alive) setError(e.message) }
      finally { if (alive) setBusy(false) }
    }
    run()
    return () => { alive = false }
  }, [])
  const start = async () => {
    setBusy(true); setError('')
    try {
      const result = await request({ action: 'start' })
      const url = new URL(result.authorization_url)
      if (url.origin !== 'https://id.parasut.com' || url.pathname !== '/realms/parasut/protocol/openid-connect/auth') throw new Error('Paraşüt yönlendirmesi doğrulanamadı.')
      window.location.assign(url.href)
    } catch (e) { setError(e.message); setBusy(false) }
  }
  const connected = status?.connection?.status === 'connected'
  const line = !status ? 'Bağlantı durumu okunuyor.' : !status.configured ? 'Yeni OAuth kurulumu bekleniyor.'
    : connected && status.mode === 'oauth' ? 'Kullanıcı onayı ve şirket erişimi doğrulandı. Yeni OAuth kullanılıyor.'
    : connected ? 'Yeni OAuth onayı tamamlandı; sunucuda geçişin etkinleştirilmesi gerekiyor.'
    : 'Yeni Paraşüt hesabı henüz bağlı değil; kullanıcı onayı gerekiyor.'
  return <div className="pl-card" style={{ marginBottom: 20 }}><div className="pl-card-b">
    <div className="pl-row"><div className="grow"><div className="t1">Paraşüt hesap yetkisi</div><div className="t2" role="status">{line}</div></div>
      <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={busy || !status?.configured} onClick={start}>{busy ? 'İşleniyor…' : connected ? 'Hesabı yeniden bağla' : 'Paraşüt hesabını bağla'}</button>
      <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await load() } catch (e) { setError(e.message) } finally { setBusy(false) } }}>Durumu yenile</button>
    </div>
    {status?.mode === 'transition' && <p className="sub">{status.legacy_available ? 'Mevcut bağlantı geçiş süresince kullanılıyor. Eski giriş 10 Aralık 2026 tarihinde kapanacak.' : 'Eski giriş kapandı. Sunucuda yeni OAuth etkinleştirilmeden otomatik fatura ve eşitleme çalışmaz.'}</p>}
    {status?.connection?.refresh_pending && <p className="sub">Oturum yenilemesi sürüyor. Bu durum devam ederse hesabı yeniden bağlayın.</p>}
    {message && <p role="status" className="sub">{message}</p>}{error && <p role="alert" style={{ color: '#b45309' }}>{error}</p>}
  </div></div>
}
