// GANU · Paraşüt e-Fatura / e-Arşiv kesimi (Deno Edge Function)
// ------------------------------------------------------------
// İstek: POST { invoice_id } — yalnız personel JWT. POST { check: true } yalnız bağlantıyı dener (belge kesmez). Tutar, müşteri ve adres istemciden alınmaz;
// fatura satırı sunucuda einvoice_claim ile tek sahiplikle alınır ve veritabanından okunur.
// Akış ve kaldığı yerden devam kuralları: ./parasut.ts · ortak çalıştırıcı: ../_shared/einvoice-run.ts
//
// Fail-closed: EINVOICE_ENABLED=true ve tüm Paraşüt secret'ları yoksa hiçbir dış çağrı yapılmaz.
//   supabase secrets set EINVOICE_ENABLED=true SITE_URL=https://ganu.com.tr
//   supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=... PARASUT_COMPANY_ID=...
//   supabase secrets set PARASUT_EMAIL=... PARASUT_PASSWORD=...        (2FA'sız ayrı API kullanıcısı)
//   supabase secrets set PARASUT_PRODUCT_ID=... PARASUT_ACCOUNT_ID=... (ürün + tahsilat hesabı; önerilir)
// Dağıtım: supabase functions deploy issue-einvoice

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parasutEnv, runEInvoice } from '../_shared/einvoice-run.ts'
import { checkConnection } from './parasut.ts'

const SITE = Deno.env.get('SITE_URL') || ''
let ALLOW_ORIGIN = ''
try { ALLOW_ORIGIN = SITE ? new URL(SITE).origin : '' } catch { ALLOW_ORIGIN = '' }
const cors = {
  ...(ALLOW_ORIGIN ? { 'Access-Control-Allow-Origin': ALLOW_ORIGIN } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function isStaffRequest(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  if (!url || !anon || !authorization.toLowerCase().startsWith('bearer ')) return false
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)
  const env = parasutEnv(ALLOW_ORIGIN)
  if (!env) return json({ state: 'kapalı', message: 'e-Belge kurulumu tamamlanmadı (Paraşüt anahtarları bekleniyor); işlem yapılmadı.' }, 503)

  const body = await req.json().catch(() => ({}))
  if (body?.check === true) return json(await checkConnection({ fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), env }))
  const { invoice_id } = body
  if (!UUID.test(String(invoice_id || ''))) return json({ error: 'invoice_id geçersiz' }, 400)
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY eksik' }, 500)
  const out = await runEInvoice(createClient(url, key, { auth: { persistSession: false } }), invoice_id, env)
  return json(out.body, out.status)
})
