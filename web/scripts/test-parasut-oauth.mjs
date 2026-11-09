// Offline integration: exact production OAuth helper/handler and invoice/sync clients, no real API/DB.
import assert from 'node:assert/strict'
import { authMode, beginAuthorization, completeAuthorization, LEGACY_CUTOFF, legacyAllowed, OAuthError, oauthConfig, OAUTH_AUTH, OAUTH_TOKEN, OAUTH_USERINFO, randomSecret, seal, serverRpc, sha256, tokenProvider, unseal } from '../supabase/functions/_shared/parasut-auth.ts'
import { oauthHandler } from '../supabase/functions/_shared/parasut-oauth-handler.ts'
import { client, processInvoice } from '../supabase/functions/issue-einvoice/parasut.ts'
import { syncFromParasut } from '../supabase/functions/_shared/parasut-sync.ts'
import { parasutEnv } from '../supabase/functions/_shared/einvoice-run.ts'

const at = Date.parse('2026-11-08T12:00:00Z')
const c = { clientId: 'new-client', clientSecret: 'SECRET-CLIENT', companyId: '777', expectedSubject: 'expected-sub', redirectUri: 'https://panel.example.invalid/panel/faturalar', encryptionKey: randomSecret() }
const uid = '00000000-0000-4000-8000-000000000001'
const tokenContext = `parasut:token:${c.companyId}:${c.clientId}:${c.expectedSubject}`
const ok = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } })
const run = async (name, test) => { await test(); console.log(`PASS ${name}`) }
const goodTokens = (n = 1) => ({ access_token: `ACCESS-${n}`, refresh_token: `REFRESH-${n}`, token_type: 'Bearer', expires_in: 7200, refresh_expires_in: 2592000 })

function mock({ subject = c.expectedSubject, company = c.companyId, tokenError = '', tokenStatus = 400, network = false, beforeToken, tokens = goodTokens(), beforeComplete } = {}) {
  const flow = new Map(), requests = [], rpcs = []
  let row = null, clock = at, accountSubject = subject
  const fetch = async (url, init = {}) => {
    requests.push({ url, init })
    assert.equal(init.redirect, 'error')
    if (url === OAUTH_TOKEN) {
      assert.equal(init.method, 'POST')
      const form = new URLSearchParams(init.body)
      assert.equal(form.get('client_id'), c.clientId); assert.equal(form.get('client_secret'), c.clientSecret)
      await beforeToken?.(form)
      if (network) throw new Error('NETWORK SECRET-CLIENT REFRESH-1')
      return tokenError ? ok({ error: tokenError, error_description: 'SECRET-CLIENT REFRESH-1 ACCESS-1' }, tokenStatus) : ok(tokens)
    }
    if (url === OAUTH_USERINFO) return ok({ sub: accountSubject })
    if (url === 'https://api.parasut.com/v4/me?include=companies') return ok({ data: { id: 'user' }, included: [{ id: company, type: 'companies' }] })
    throw new Error(`Unexpected request ${url}`)
  }
  const rpc = async (name, a) => {
    rpcs.push({ name, a })
    if (name === 'parasut_oauth_begin') { for (const [key, value] of flow) if (value.user === a.p_user) flow.delete(key); flow.set(a.p_state_hash, { user: a.p_user, client: a.p_client, company: a.p_company, verifier: a.p_verifier, expires: clock + 600_000 }); return null }
    if (name === 'parasut_oauth_consume') {
      const f = flow.get(a.p_state_hash)
      if (!f || f.user !== a.p_user || f.client !== a.p_client || f.company !== a.p_company || f.expires <= clock) return null
      flow.delete(a.p_state_hash); return f.verifier
    }
    if (name === 'parasut_oauth_connect') {
      if (row && row.subject !== a.p_subject) return false
      row = { status: 'connected', subject: a.p_subject, tokens_ciphertext: a.p_tokens, access_expires_at: a.p_expires, refresh_expires_at: a.p_refresh_expires, generation: (row?.generation || 0) + 1, refresh_owner: null }
      return true
    }
    if (name === 'parasut_oauth_read') return row && (!a.p_subject || row.subject === a.p_subject) ? structuredClone(row) : null
    if (name === 'parasut_oauth_status') return row && { status: row.status, refresh_expires_at: row.refresh_expires_at, refresh_pending: !!row.refresh_owner }
    if (name === 'parasut_oauth_claim') {
      if (!row || row.status !== 'connected' || row.refresh_owner || row.generation !== a.p_generation || Date.parse(row.access_expires_at) > clock + 60_000) return null
      row.refresh_owner = crypto.randomUUID(); return row.refresh_owner
    }
    if (name === 'parasut_oauth_complete') {
      await beforeComplete?.(row)
      if (!row || row.refresh_owner !== a.p_owner || row.generation !== a.p_generation) return false
      Object.assign(row, { tokens_ciphertext: a.p_tokens, access_expires_at: a.p_expires, refresh_expires_at: a.p_refresh_expires, generation: row.generation + 1, refresh_owner: null }); return true
    }
    if (name === 'parasut_oauth_fail' || name === 'parasut_oauth_reject') {
      if (!row || row.generation !== a.p_generation || (name.endsWith('_fail') && row.refresh_owner !== a.p_owner)) return false
      Object.assign(row, { status: 'reconnect_required', tokens_ciphertext: null, generation: row.generation + 1, refresh_owner: null }); return true
    }
    throw new Error(`Unexpected RPC ${name}`)
  }
  const deps = { fetch, rpc, now: () => clock, sleep: () => new Promise((r) => setTimeout(r, 2)) }
  return { deps, flow, requests, rpcs, row: () => row, advance: (ms) => { clock += ms },
    setSubject: (value) => { accountSubject = value },
    async seed({ accessExpires = at - 1000, refreshExpires = at + 86400000, generation = 1, refresh = 'REFRESH-1' } = {}) {
      row = { status: 'connected', subject: c.expectedSubject, tokens_ciphertext: await seal({ access: 'ACCESS-OLD', refresh }, c.encryptionKey, tokenContext),
        access_expires_at: new Date(accessExpires).toISOString(), refresh_expires_at: new Date(refreshExpires).toISOString(), generation, refresh_owner: null }
    },
  }
}
const start = async (m) => new URL((await beginAuthorization(c, m.deps, uid)).authorization_url)
const finish = (m, url, extra = {}) => completeAuthorization(c, m.deps, uid, { state: url.searchParams.get('state'), code: 'CODE', ...extra })

await run('PKCE S256, encrypted verifier/token, UID-bound one-use state, strict redirect', async () => {
  const m = mock(), url = await start(m), hash = await sha256(url.searchParams.get('state'))
  assert.equal(url.origin + url.pathname, OAUTH_AUTH); assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.equal(url.searchParams.get('scope'), 'openid')
  assert.equal(url.searchParams.get('redirect_uri'), c.redirectUri); assert.equal(url.searchParams.get('state').length, 43)
  const verifier = await unseal(m.flow.get(hash).verifier, c.encryptionKey, `parasut:state:${hash}:${uid}`)
  assert.equal(await sha256(verifier), url.searchParams.get('code_challenge')); assert.equal(verifier.length, 43)
  assert.ok(!url.href.includes(verifier)); assert.ok(!JSON.stringify([...m.flow]).includes(verifier))
  await assert.rejects(completeAuthorization(c, m.deps, 'other-person', { state: url.searchParams.get('state'), code: 'CODE' }), { code: 'state' })
  assert.equal(m.requests.length, 0)
  assert.equal((await finish(m, url)).state, 'bağlı')
  const form = new URLSearchParams(m.requests[0].init.body)
  assert.equal(form.get('code_verifier'), verifier); assert.equal(form.get('grant_type'), 'authorization_code')
  assert.ok(!JSON.stringify(m.row()).includes('ACCESS-1')); assert.ok(!JSON.stringify(m.row()).includes('REFRESH-1'))
  await assert.rejects(finish(m, url), { code: 'state' }); assert.equal(m.requests.filter((r) => r.url === OAUTH_TOKEN).length, 1)
})
await run('expired/missing state, cancelled consent, missing code never exchange tokens', async () => {
  const m = mock(), url = await start(m)
  m.advance(600_000); await assert.rejects(finish(m, url), { code: 'state' })
  await assert.rejects(completeAuthorization(c, m.deps, uid, { code: 'CODE' }), { code: 'state' })
  const denied = await start(m); await assert.rejects(finish(m, denied, { error: 'access_denied' }), { code: 'denied' })
  const noCode = await start(m); await assert.rejects(finish(m, noCode, { code: '' }), { code: 'state' })
  assert.equal(m.requests.length, 0); assert.equal(m.row(), null)
})
await run('wrong account/company and failed token exchange never report connected', async () => {
  for (const opts of [{ subject: 'wrong-user' }, { company: 'other-company' }, { tokenError: 'invalid_grant' }, { tokens: { ...goodTokens(), refresh_token: '' } }]) {
    const m = mock(opts), url = await start(m)
    await assert.rejects(finish(m, url), OAuthError); assert.equal(m.row(), null)
  }
})
await run('AES-GCM tamper/key/context mismatch fails without exposing credentials', async () => {
  const cipher = await seal({ access: 'PRIVATE-TOKEN' }, c.encryptionKey, 'purpose')
  for (const [value, key, aad] of [[cipher, randomSecret(), 'purpose'], [cipher, c.encryptionKey, 'other'], [cipher.slice(0, -5) + 'AAAAA', c.encryptionKey, 'purpose']]) {
    await assert.rejects(unseal(value, key, aad), (e) => e.code === 'storage' && !e.message.includes('PRIVATE-TOKEN'))
  }
})
await run('fresh access token makes no IdP call; expired refresh requests reconnect', async () => {
  const m = mock(); await m.seed({ accessExpires: at + 3600000 })
  assert.equal(await tokenProvider(c, m.deps).accessToken(), 'ACCESS-OLD'); assert.equal(m.requests.length, 0)
  await m.seed({ refreshExpires: at - 1 })
  await assert.rejects(tokenProvider(c, m.deps).accessToken(), { code: 'reconnect' }); assert.equal(m.requests.length, 0); assert.equal(m.row().tokens_ciphertext, null)
})
await run('two concurrent refreshes use one owner and save latest rotated refresh token', async () => {
  let release; const gate = new Promise((r) => { release = r })
  let entered; const hit = new Promise((r) => { entered = r })
  const m = mock({ beforeToken: async (form) => { assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), 'REFRESH-1'); entered(); await gate } })
  await m.seed(); const first = tokenProvider(c, m.deps).accessToken(); await hit
  const second = tokenProvider(c, m.deps).accessToken(); release()
  assert.deepEqual(await Promise.all([first, second]), ['ACCESS-1', 'ACCESS-1'])
  assert.equal(m.requests.filter((r) => r.url === OAUTH_TOKEN).length, 1)
  assert.equal(m.row().generation, 2); assert.equal(m.row().refresh_owner, null)
  const saved = await unseal(m.row().tokens_ciphertext, c.encryptionKey, tokenContext); assert.equal(saved.refresh, 'REFRESH-1')
  m.row().access_expires_at = new Date(at - 1).toISOString()
  await tokenProvider(c, m.deps).accessToken()
  assert.equal(m.requests.filter((r) => r.url === OAUTH_TOKEN).length, 2)
})
await run('refresh rotation replaces old token; absent rotation keeps original absolute expiry', async () => {
  const m = mock({ tokens: goodTokens(2) }); await m.seed()
  await tokenProvider(c, m.deps).accessToken()
  assert.equal((await unseal(m.row().tokens_ciphertext, c.encryptionKey, tokenContext)).refresh, 'REFRESH-2')
  const noRotation = { ...goodTokens(), refresh_token: undefined, refresh_expires_in: undefined }
  const n = mock({ tokens: noRotation }); await n.seed()
  const expiry = n.row().refresh_expires_at; await tokenProvider(c, n.deps).accessToken()
  assert.equal(n.row().refresh_expires_at, expiry)
  assert.equal((await unseal(n.row().tokens_ciphertext, c.encryptionKey, tokenContext)).refresh, 'REFRESH-1')
})
await run('invalid grant/network ambiguity/429 fail safely with no retry or password fallback', async () => {
  for (const opts of [{ tokenError: 'invalid_grant' }, { network: true }, { tokenError: 'too_many_requests', tokenStatus: 429 }]) {
    const m = mock(opts); await m.seed()
    await assert.rejects(tokenProvider(c, m.deps).accessToken(), (e) => e.code === 'reconnect' && !/SECRET|REFRESH|ACCESS/.test(e.message))
    await assert.rejects(tokenProvider(c, m.deps).accessToken(), { code: 'reconnect' })
    assert.equal(m.requests.length, 1); assert.equal(m.row().status, 'reconnect_required'); assert.equal(m.row().tokens_ciphertext, null)
  }
})
await run('old refresh owner and stale access rejection cannot damage a newer consent', async () => {
  const m = mock({ beforeComplete: async (row) => { row.generation++; row.refresh_owner = null; row.tokens_ciphertext = 'new-consent-cipher' } })
  await m.seed(); await assert.rejects(tokenProvider(c, m.deps).accessToken(), { code: 'reconnect' })
  assert.equal(m.row().status, 'connected'); assert.equal(m.row().tokens_ciphertext, 'new-consent-cipher')
  const n = mock(); await n.seed({ accessExpires: at + 3600000 }); const p = tokenProvider(c, n.deps)
  await p.accessToken(); n.row().generation++; await p.rejected(); assert.equal(n.row().status, 'connected')
})
await run('crashed refresh claim is never taken over or replayed', async () => {
  const m = mock(); await m.seed(); m.row().refresh_owner = crypto.randomUUID()
  await assert.rejects(tokenProvider(c, m.deps).accessToken(), { code: 'busy' }); assert.equal(m.requests.length, 0)
})
const values = { SITE_URL: 'https://panel.example.invalid', PARASUT_AUTH_MODE: 'transition', PARASUT_OAUTH_CLIENT_ID: c.clientId,
  PARASUT_OAUTH_CLIENT_SECRET: c.clientSecret, PARASUT_COMPANY_ID: c.companyId, PARASUT_OAUTH_EXPECTED_SUB: c.expectedSubject,
  PARASUT_OAUTH_REDIRECT_URI: c.redirectUri, PARASUT_OAUTH_ENCRYPTION_KEY: c.encryptionKey }
const get = (key) => values[key] || ''
await run('config and transition: exact callback route, optional strict subject, hard cutoff, no silent fallback', async () => {
  assert.deepEqual(oauthConfig(get, values.SITE_URL), c)
  for (const patch of [{ PARASUT_OAUTH_REDIRECT_URI: 'https://evil.test/cb' }, { PARASUT_OAUTH_REDIRECT_URI: 'https://panel.example.invalid/other' }, { PARASUT_OAUTH_REDIRECT_URI: `${c.redirectUri}?return=evil` }, { PARASUT_OAUTH_ENCRYPTION_KEY: 'short' }]) {
    assert.equal(oauthConfig((k) => ({ ...values, ...patch })[k] || '', values.SITE_URL), null)
  }
  assert.equal(oauthConfig((k) => ({ ...values, PARASUT_OAUTH_EXPECTED_SUB: '' })[k] || '', values.SITE_URL).expectedSubject, '')
  assert.ok(oauthConfig((k) => ({ ...values, PARASUT_OAUTH_REDIRECT_URI: 'https://panel.example.invalid/ganu/panel/faturalar' })[k] || '', `${values.SITE_URL}/ganu`))
  assert.equal(oauthConfig(get, `${values.SITE_URL}/ganu`), null)
  assert.equal(authMode(() => ''), 'transition'); assert.equal(authMode((k) => k === 'PARASUT_AUTH_MODE' ? 'surprise' : ''), 'invalid')
  assert.equal(legacyAllowed(LEGACY_CUTOFF - 1), true); assert.equal(legacyAllowed(LEGACY_CUTOFF), false)
  const p = client({ fetch: async () => { throw new Error('must not call legacy endpoint') }, sleep: async () => {}, env: { companyId: c.companyId, authMode: 'oauth' } })
  await assert.rejects(p.auth(), /OAuth kurulumu/)
})
await run('first-run bootstrap pins verified userinfo subject; later wrong account cannot replace it', async () => {
  const boot = { ...c, expectedSubject: '' }, m = mock()
  const url = new URL((await beginAuthorization(boot, m.deps, uid)).authorization_url)
  assert.equal((await completeAuthorization(boot, m.deps, uid, { state: url.searchParams.get('state'), code: 'CODE' })).state, 'bağlı')
  assert.equal(m.row().subject, c.expectedSubject)
  assert.equal(await tokenProvider(boot, m.deps).accessToken(), 'ACCESS-1')
  const previous = structuredClone(m.row())
  m.setSubject('different-user-same-company')
  const bad = new URL((await beginAuthorization(boot, m.deps, uid)).authorization_url)
  await assert.rejects(completeAuthorization(boot, m.deps, uid, { state: bad.searchParams.get('state'), code: 'CODE' }), { code: 'identity' })
  assert.deepEqual(m.row(), previous, 'failed second consent preserves original subject and connection')
  m.row().access_expires_at = new Date(at - 1).toISOString()
  await assert.rejects(tokenProvider(boot, m.deps).accessToken(), { code: 'reconnect' })
  assert.equal(m.row().subject, c.expectedSubject, 'refresh mismatch never changes the account pin')
})
await run('production env wiring: four callers share explicit mode; missing consent never uses old credentials', async () => {
  const originalDeno = globalThis.Deno, originalFetch = globalThis.fetch, originalNow = Date.now
  const runtime = { ...values, EINVOICE_ENABLED: 'true', SUPABASE_URL: 'https://db.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'SERVER-ONLY',
    PARASUT_CLIENT_ID: 'legacy', PARASUT_CLIENT_SECRET: 'legacy-secret', PARASUT_EMAIL: 'legacy@example.invalid', PARASUT_PASSWORD: 'legacy-password' }
  try {
    Date.now = () => at
    globalThis.Deno = { env: { get: (key) => runtime[key] } }
    assert.equal(parasutEnv(values.SITE_URL).authMode, 'transition')
    runtime.PARASUT_AUTH_MODE = 'oauth'
    delete runtime.PARASUT_EMAIL; delete runtime.PARASUT_PASSWORD
    let calls = 0
    globalThis.fetch = async (url) => { calls++; assert.equal(url, 'https://db.example.invalid/rest/v1/rpc/parasut_oauth_read'); return ok(null) }
    const connectedEnv = parasutEnv(values.SITE_URL)
    assert.equal(connectedEnv.authMode, 'oauth')
    await assert.rejects(client({ env: connectedEnv, fetch: globalThis.fetch, sleep: async () => {} }).auth(), { code: 'reconnect' })
    assert.equal(calls, 1, 'only server connection read; no password token request')
    delete runtime.PARASUT_COMPANY_ID; assert.equal(parasutEnv(values.SITE_URL), null)
    runtime.PARASUT_COMPANY_ID = c.companyId; runtime.PARASUT_AUTH_MODE = 'unexpected'; assert.equal(parasutEnv(values.SITE_URL), null)
    runtime.PARASUT_AUTH_MODE = 'transition'; runtime.PARASUT_EMAIL = 'legacy@example.invalid'; runtime.PARASUT_PASSWORD = 'legacy-password'
    Date.now = () => LEGACY_CUTOFF; assert.equal(parasutEnv(values.SITE_URL), null)
    await assert.rejects(client({ env: runtime, fetch: async () => { throw new Error('legacy must not call network') }, sleep: async () => {} }).auth(), /Eski Paraşüt/)
  } finally { globalThis.Deno = originalDeno; globalThis.fetch = originalFetch; Date.now = originalNow }
})
await run('HTTP handler requires staff, validates Origin/body/action, and never leaks provider errors', async () => {
  const m = mock(), handler = oauthHandler({ ...m.deps, get, staff: async (req) => req.headers.get('Authorization') === 'Bearer STAFF' ? uid : null })
  const post = (body, headers = {}) => new Request('https://edge.invalid', { method: 'POST', headers: { Authorization: 'Bearer STAFF', Origin: values.SITE_URL, ...headers }, body: JSON.stringify(body) })
  assert.equal((await handler(post({ action: 'start' }, { Authorization: '' }))).status, 403)
  assert.equal((await handler(post({ action: 'start' }, { Origin: 'https://evil.test' }))).status, 403)
  assert.equal((await handler(new Request('https://edge.invalid'))).status, 405)
  assert.equal((await handler(post({ action: 'bogus' }))).status, 400)
  const status = await (await handler(post({ action: 'status' }))).json()
  assert.equal(status.connection, null); assert.equal(status.mode, 'transition'); assert.equal(status.configured, true)
  const started = await handler(post({ action: 'start' })); assert.equal(started.headers.get('Cache-Control'), 'no-store')
  assert.ok(!(await started.text()).includes('SECRET-CLIENT'))
  const error = await handler(post({ action: 'complete', state: 'invalid', code: 'CODE' }))
  assert.equal(error.status, 400); assert.doesNotMatch(await error.text(), /SECRET|REFRESH|ACCESS|CODE/)
})
await run('server RPC is service-only and suppresses database response details', async () => {
  const rpc = serverRpc((k) => ({ SUPABASE_URL: 'https://db.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'SERVER-KEY' })[k] || '', async (url, init) => {
    assert.equal(url, 'https://db.example.invalid/rest/v1/rpc/parasut_oauth_read'); assert.equal(init.headers.Authorization, 'Bearer SERVER-KEY')
    assert.equal(init.redirect, 'error'); return ok({ message: 'TOKEN-LEAK' }, 500)
  })
  await assert.rejects(rpc('parasut_oauth_read', {}), (e) => e.code === 'storage' && !e.message.includes('TOKEN-LEAK'))
  await assert.rejects(rpc('other_function', {}), { code: 'setup' })
})
await run('invoice and sync share OAuth provider; 401/403 writes are never replayed', async () => {
  const m = mock(); await m.seed({ accessExpires: at + 3600000 }); const provider = tokenProvider(c, m.deps)
  const calls = [], env = { companyId: c.companyId, siteUrl: 'https://panel.example.invalid', authMode: 'oauth', accessToken: provider.accessToken, authRejected: provider.rejected }
  const request = async (url, init) => { calls.push({ url, init }); assert.equal(init.headers.Authorization, 'Bearer ACCESS-OLD'); return ok({ data: [] }) }
  const s = await syncFromParasut({ fetch: request, sleep: async () => {}, env, today: '2026-11-08', store: { linked: async () => [], customers: async () => [] } })
  assert.equal(s.errors, 0); assert.equal(calls.length, 2); assert.equal(m.requests.length, 0)
  const inv = await processInvoice({ id: 'invoice', customer_id: 'customer', amount: 100, issue_date: '2026-11-08', einvoice_status: 'kesildi', parasut_invoice_id: 'existing' }, {},
    { fetch: async (url, init) => { assert.equal(init.headers.Authorization, 'Bearer ACCESS-OLD'); return ok({ data: { id: 'existing' } }) }, sleep: async () => {}, env, store: { patchInvoice: async () => {} } })
  assert.ok(inv); assert.equal(m.requests.length, 0)
  for (const status of [403, 401]) {
    let count = 0
    const p = client({ fetch: async () => { count++; return ok({ errors: [{ detail: 'ACCESS-OLD SECRET' }] }, status) }, sleep: async () => {}, env })
    await assert.rejects(p.call('POST', '/sales_invoices', {}), (e) => e.status === status && !/ACCESS-OLD|SECRET/.test(e.message)); assert.equal(count, 1)
  }
  assert.equal(m.row().status, 'reconnect_required')
})
console.log('Paraşüt OAuth: all offline integration tests passed; no real service was called.')
