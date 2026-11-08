// Paraşüt DevHub OAuth (08.11.2026): confidential Authorization Code + S256 PKCE.
// Pure Web APIs: this same code is exercised by the offline Node integration tests.
export const OAUTH_AUTH = 'https://id.parasut.com/realms/parasut/protocol/openid-connect/auth'
export const OAUTH_TOKEN = 'https://id.parasut.com/realms/parasut/protocol/openid-connect/token'
export const OAUTH_USERINFO = 'https://id.parasut.com/realms/parasut/protocol/openid-connect/userinfo'
// Stop at the beginning of the announced closing day in Turkey, not its end.
export const LEGACY_CUTOFF = Date.parse('2026-12-10T00:00:00+03:00')
const API = 'https://api.parasut.com/v4'
const encoder = new TextEncoder()
const SKEW = 60_000
type GetEnv = (key: string) => string
export type OAuthConfig = {
  clientId: string; clientSecret: string; companyId: string; expectedSubject: string
  redirectUri: string; encryptionKey: string
}
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<any>
export type AuthDeps = { fetch: typeof fetch; rpc: Rpc; now?: () => number; sleep?: (ms: number) => Promise<void> }
export class OAuthError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}
const problem = (code: string) => new OAuthError(code, ({
  setup: 'Paraşüt OAuth kurulumu eksik veya geçersiz.', state: 'Yetkilendirme oturumu geçersiz, süresi dolmuş veya başka personele ait. Yeniden bağlayın.',
  denied: 'Paraşüt izni verilmedi. Yeniden bağlayabilirsiniz.', exchange: 'Paraşüt yetkilendirmesi tamamlanamadı. Yeniden bağlayın.',
  identity: 'Paraşüt hesabı veya şirketi beklenen kayıtla eşleşmedi; bağlantı kurulmadı.',
  reconnect: 'Paraşüt yeniden yetkilendirme istiyor. Hesabı yeniden bağlayın.',
  busy: 'Paraşüt oturumu başka bir işlem tarafından yenileniyor. Biraz sonra tekrar deneyin; sürerse yeniden bağlayın.',
  storage: 'Paraşüt oturumu güvenli biçimde kaydedilemedi. Yeniden bağlayın.',
  legacy_closed: 'Eski Paraşüt giriş yöntemi kapandı. Yeni OAuth hesabını bağlayın.',
} as Record<string, string>)[code] || 'Paraşüt oturum işlemi tamamlanamadı.')
const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (v: string) => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
export const randomSecret = () => b64(crypto.getRandomValues(new Uint8Array(32)))
export const sha256 = async (value: string) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))

export function oauthConfig(get: GetEnv, siteUrl: string): OAuthConfig | null {
  const c = { clientId: get('PARASUT_OAUTH_CLIENT_ID'), clientSecret: get('PARASUT_OAUTH_CLIENT_SECRET'),
    companyId: get('PARASUT_COMPANY_ID'), expectedSubject: get('PARASUT_OAUTH_EXPECTED_SUB'),
    redirectUri: get('PARASUT_OAUTH_REDIRECT_URI'), encryptionKey: get('PARASUT_OAUTH_ENCRYPTION_KEY') }
  try {
    const uri = new URL(c.redirectUri), site = new URL(siteUrl)
    const callbackPath = `${site.pathname.replace(/\/$/, '')}/panel/faturalar`
    if (Object.entries(c).some(([key, value]) => key !== 'expectedSubject' && !value) || uri.protocol !== 'https:' || uri.origin !== site.origin || uri.pathname !== callbackPath || uri.search || uri.hash || uri.username || uri.password || !/^\d+$/.test(c.companyId) || unb64(c.encryptionKey).length !== 32) return null
    return c
  } catch { return null }
}

// Authenticated encryption in addition to service-role-only tables. AAD prevents moving ciphertext
// between companies, clients, purposes or flow states. The key is only in Supabase Edge secrets.
export async function seal(value: unknown, key: string, context: string): Promise<string> {
  const aes = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, aes, encoder.encode(JSON.stringify(value)))
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`
}
export async function unseal(value: string, key: string, context: string): Promise<any> {
  try {
    const [version, iv, data, extra] = value.split('.')
    if (version !== 'v1' || extra || !iv || !data) throw new Error()
    const aes = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['decrypt'])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(context) }, aes, unb64(data))
    return JSON.parse(new TextDecoder().decode(plain))
  } catch { throw problem('storage') }
}
const context = (c: OAuthConfig) => `parasut:token:${c.companyId}:${c.clientId}:${c.expectedSubject}`
const nowOf = (d: AuthDeps) => d.now?.() ?? Date.now()

// No remote descriptions/bodies are propagated: providers can echo credentials in errors.
async function tokenRequest(c: OAuthConfig, d: AuthDeps, fields: Record<string, string>) {
  let response: Response
  try {
    response = await d.fetch(OAUTH_TOKEN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...fields, client_id: c.clientId, client_secret: c.clientSecret }) })
  } catch { throw problem('reconnect') }
  const json = await response.json().catch(() => null)
  if (!response.ok) throw problem(json?.error === 'invalid_grant' ? 'reconnect' : 'exchange')
  if (typeof json?.access_token !== 'string' || !json.access_token || String(json.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(json.expires_in) || json.expires_in <= 60) throw problem('exchange')
  return json
}

async function identity(c: OAuthConfig, d: AuthDeps, access: string): Promise<string> {
  try {
    const init = { headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' }, redirect: 'error' as RequestRedirect, signal: AbortSignal.timeout(15_000) }
    const user = await d.fetch(OAUTH_USERINFO, init)
    const profile = user.ok ? await user.json() : null
    if (typeof profile?.sub !== 'string' || !profile.sub || profile.sub.length > 256 || (c.expectedSubject && profile.sub !== c.expectedSubject)) throw problem('identity')
    const me = await d.fetch(`${API}/me?include=companies`, init)
    const data = me.ok ? await me.json() : null
    if (!Array.isArray(data?.included) || !data.included.some((r: any) => r.type === 'companies' && String(r.id) === c.companyId)) throw problem('identity')
    return profile.sub
  } catch { throw problem('identity') }
}

export async function beginAuthorization(c: OAuthConfig, d: AuthDeps, userId: string) {
  const state = randomSecret(), verifier = randomSecret(), hash = await sha256(state)
  const encrypted = await seal(verifier, c.encryptionKey, `parasut:state:${hash}:${userId}`)
  await d.rpc('parasut_oauth_begin', { p_state_hash: hash, p_user: userId, p_verifier: encrypted, p_client: c.clientId, p_company: c.companyId })
  const url = new URL(OAUTH_AUTH)
  for (const [k, v] of Object.entries({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code', scope: 'openid', state,
    code_challenge: await sha256(verifier), code_challenge_method: 'S256', kc_idp_hint: 'parasut' })) url.searchParams.set(k, v)
  return { authorization_url: url.toString() }
}

export async function completeAuthorization(c: OAuthConfig, d: AuthDeps, userId: string, input: { state?: unknown; code?: unknown; error?: unknown }) {
  if (typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw problem('state')
  const hash = await sha256(input.state)
  const flow = await d.rpc('parasut_oauth_consume', { p_state_hash: hash, p_user: userId, p_client: c.clientId, p_company: c.companyId })
  if (!flow) throw problem('state')
  if (input.error) throw problem('denied')
  if (typeof input.code !== 'string' || !input.code || input.code.length > 4096) throw problem('state')
  const verifier = await unseal(flow, c.encryptionKey, `parasut:state:${hash}:${userId}`)
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw problem('state')
  const tokens = await tokenRequest(c, d, { grant_type: 'authorization_code', code: input.code, redirect_uri: c.redirectUri, code_verifier: verifier })
  if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || !Number.isFinite(tokens.refresh_expires_in) || tokens.refresh_expires_in <= 60) throw problem('exchange')
  const subject = await identity(c, d, tokens.access_token)
  const at = nowOf(d), encrypted = await seal({ access: tokens.access_token, refresh: tokens.refresh_token }, c.encryptionKey, context({ ...c, expectedSubject: subject }))
  // First consent atomically pins the verified account. Later consents cannot change that pin.
  const saved = await d.rpc('parasut_oauth_connect', { p_company: c.companyId, p_client: c.clientId, p_subject: subject, p_tokens: encrypted,
    p_expires: new Date(at + tokens.expires_in * 1000).toISOString(), p_refresh_expires: new Date(at + tokens.refresh_expires_in * 1000).toISOString(), p_user: userId })
  if (saved !== true) throw problem('identity')
  return { state: 'bağlı', message: 'Paraşüt kullanıcı onayı, hesap ve şirket erişimi doğrulandı.' }
}

export function tokenProvider(c: OAuthConfig, d: AuthDeps) {
  let generation: number | null = null
  let lastSubject = ''
  const readArgs = { p_company: c.companyId, p_client: c.clientId, p_subject: c.expectedSubject }
  return {
    async accessToken(): Promise<string> {
      for (let attempt = 0; attempt < 12; attempt++) {
        const row = await d.rpc('parasut_oauth_read', readArgs)
        if (!row || row.status !== 'connected') throw problem('reconnect')
        if (typeof row.subject !== 'string' || !row.subject || (c.expectedSubject && row.subject !== c.expectedSubject)) throw problem('identity')
        const pinned = { ...c, expectedSubject: row.subject }, args = { ...readArgs, p_subject: row.subject }
        const tokens = await unseal(row.tokens_ciphertext, c.encryptionKey, context(pinned))
        if (typeof tokens?.access !== 'string' || !tokens.access || typeof tokens?.refresh !== 'string' || !tokens.refresh) throw problem('storage')
        const at = nowOf(d)
        if (Date.parse(row.access_expires_at) > at + SKEW) { generation = row.generation; lastSubject = row.subject; return tokens.access }
        if (Date.parse(row.refresh_expires_at) <= at + SKEW) {
          await d.rpc('parasut_oauth_reject', { ...args, p_generation: row.generation })
          throw problem('reconnect')
        }
        const owner = await d.rpc('parasut_oauth_claim', { ...args, p_generation: row.generation })
        if (!owner) { await (d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(250); continue }
        let refreshed: any
        try {
          refreshed = await tokenRequest(c, d, { grant_type: 'refresh_token', refresh_token: tokens.refresh })
          // Omitted rotation retains the last token and its original absolute expiry.
          const refresh = refreshed.refresh_token || tokens.refresh
          if (typeof refresh !== 'string') throw problem('exchange')
          const expiry = refreshed.refresh_token
            ? (Number.isFinite(refreshed.refresh_expires_in) && refreshed.refresh_expires_in > 60 ? new Date(nowOf(d) + refreshed.refresh_expires_in * 1000).toISOString() : '')
            : row.refresh_expires_at
          if (!expiry) throw problem('exchange')
          // Check expected subject and company again before accepting rotated credentials.
          await identity(pinned, d, refreshed.access_token)
          const encrypted = await seal({ access: refreshed.access_token, refresh }, c.encryptionKey, context(pinned))
          const saved = await d.rpc('parasut_oauth_complete', { ...args, p_owner: owner, p_generation: row.generation, p_tokens: encrypted,
            p_expires: new Date(nowOf(d) + refreshed.expires_in * 1000).toISOString(), p_refresh_expires: expiry })
          if (!saved) throw problem('storage')
          generation = Number(row.generation) + 1
          lastSubject = row.subject
          return refreshed.access_token
        } catch {
          // Never retry a possibly rotated refresh token. Owner CAS cannot damage a newer consent.
          await d.rpc('parasut_oauth_fail', { ...args, p_owner: owner, p_generation: row.generation }).catch(() => undefined)
          throw problem('reconnect')
        }
      }
      throw problem('busy')
    },
    async rejected() {
      if (generation !== null) await d.rpc('parasut_oauth_reject', { ...readArgs, p_subject: lastSubject, p_generation: generation })
    },
  }
}

// No remote SDK import: all invoice/sync functions can use the same server-only RPC adapter.
export function serverRpc(get: GetEnv, request: typeof fetch = fetch): Rpc {
  const base = get('SUPABASE_URL'), key = get('SUPABASE_SERVICE_ROLE_KEY')
  return async (name, args) => {
    if (!base || !key || !/^parasut_oauth_[a-z]+$/.test(name)) throw problem('setup')
    try {
      const response = await request(`${base}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
      if (!response.ok) throw problem('storage')
      return response.status === 204 ? null : await response.json()
    } catch { throw problem('storage') }
  }
}

export function legacyAllowed(now = Date.now()) { return now < LEGACY_CUTOFF }

// transition: explicitly uses existing credentials until operator activates oauth; never auto-fallback.
export function authMode(get: GetEnv): 'transition' | 'oauth' | 'invalid' {
  const mode = get('PARASUT_AUTH_MODE')
  return !mode || mode === 'transition' ? 'transition' : mode === 'oauth' ? 'oauth' : 'invalid'
}
