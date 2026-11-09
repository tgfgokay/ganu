import { authMode, beginAuthorization, completeAuthorization, legacyAllowed, OAuthError, oauthConfig, type AuthDeps } from './parasut-auth.ts'

type HandlerDeps = AuthDeps & { get: (key: string) => string; staff: (req: Request) => Promise<string | null> }

// The registered callback is the staff panel page. It forwards only code/state using its authenticated
// JWT; verifier, client secret and tokens never cross the browser. A different staff UID cannot finish it.
export function oauthHandler(d: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    const site = d.get('SITE_URL')
    let origin = ''
    try { origin = new URL(site).origin } catch { /* fail closed */ }
    const headers = { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json',
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (!origin) return reply({ error: 'SITE_URL eksik.' }, 503)
    const requestOrigin = req.headers.get('origin')
    if (requestOrigin && requestOrigin !== origin) return reply({ error: 'Origin izinli değil.' }, 403)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply({ error: 'POST kullanın.' }, 405)
    let user: string | null
    try { user = await d.staff(req) } catch { user = null }
    if (!user) return reply({ error: 'Personel yetkisi gerekli.' }, 403)
    if (Number(req.headers.get('content-length') || 0) > 8192) return reply({ error: 'İstek çok büyük.' }, 413)
    const raw = await req.text()
    if (raw.length > 8192) return reply({ error: 'İstek çok büyük.' }, 413)
    let input: any
    try { input = JSON.parse(raw) } catch { return reply({ error: 'Geçersiz istek.' }, 400) }
    const c = oauthConfig(d.get, site), mode = authMode(d.get)
    try {
      if (input?.action === 'status') {
        const connection = c ? await d.rpc('parasut_oauth_status', { p_company: c.companyId, p_client: c.clientId, p_subject: c.expectedSubject }) : null
        const refreshValid = connection && Date.parse(connection.refresh_expires_at) > (d.now?.() ?? Date.now()) + 60_000
        return reply({ mode, legacy_available: legacyAllowed(d.now?.()), legacy_closes_at: '2026-12-10T00:00:00+03:00',
          configured: !!c, connection: connection ? { ...connection, status: refreshValid ? connection.status : 'reconnect_required' } : null })
      }
      if (!c) return reply({ code: 'setup', error: 'Paraşüt OAuth kurulumu eksik; sunucu yapılandırması tamamlanmalı.' }, 503)
      if (input?.action === 'start') return reply(await beginAuthorization(c, d, user))
      if (input?.action === 'complete') return reply(await completeAuthorization(c, d, user, input))
      return reply({ error: 'Geçersiz işlem.' }, 400)
    } catch (e) {
      return reply({ code: e instanceof OAuthError ? e.code : 'storage', error: e instanceof OAuthError ? e.message : 'Paraşüt oturum işlemi tamamlanamadı. Yeniden bağlayın.' }, 400)
    }
  }
}
