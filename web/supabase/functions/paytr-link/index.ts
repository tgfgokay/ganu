// GANU · PayTR Linkle Ödeme (Deno Edge Function)
// ------------------------------------------------------------
// POST JSON { invoice_id } + personel JWT → faturaya fatura/cari tahsilat linki üretir (tutar DB'den).
// POST form (PayTR bildirimi)            → imzayı doğrular, tutarı kontrol eder, faturayı "ödendi (kart)"
//                                          yapar; yanıt düz metin "OK". EINVOICE_AUTO=true ise e-Belge kesilir.
// config.toml: verify_jwt=false (PayTR bildirimi JWT taşımaz); personel yolu JWT'yi kendisi doğrular.
//
// Fail-closed: PAYTR_LINK_ENABLED=true + PAYTR_MERCHANT_ID/KEY/SALT yoksa hiçbir dış çağrı yapılmaz.
//   supabase secrets set PAYTR_LINK_ENABLED=true PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=...
//   isteğe bağlı: PAYTR_MAX_INSTALLMENT=1 (tek çekim) · PAYTR_ACCEPT_TEST=true (test bildirimlerini işle) · PAYTR_DEBUG=true
// Dağıtım: supabase functions deploy paytr-link --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCreateRequest, decideCallback, invoiceIdFromCallback, PAYTR_LINK_CREATE, verifyCallback, type LinkEnv } from './paytr.ts'
import { parasutEnv, runEInvoice } from '../_shared/einvoice-run.ts'

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
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function linkEnv(): LinkEnv | null {
  const get = (k: string) => (Deno.env.get(k) || '').trim()
  const base = get('SUPABASE_URL').replace(/\/+$/, '')
  const env: LinkEnv = {
    merchantId: get('PAYTR_MERCHANT_ID'), merchantKey: get('PAYTR_MERCHANT_KEY'), merchantSalt: get('PAYTR_MERCHANT_SALT'),
    callbackUrl: `${base}/functions/v1/paytr-link`, maxInstallment: get('PAYTR_MAX_INSTALLMENT') || '1',
    debug: get('PAYTR_DEBUG') === 'true', acceptTest: get('PAYTR_ACCEPT_TEST') === 'true',
  }
  if (get('PAYTR_LINK_ENABLED') !== 'true' || !base || !env.merchantId || !env.merchantKey || !env.merchantSalt) return null
  return env
}
function serviceDb() {
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik')
  return createClient(url, key, { auth: { persistSession: false } })
}
async function isStaffRequest(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  if (!url || !anon || !authorization.toLowerCase().startsWith('bearer ')) return false
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true
}
const istanbulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function handleCallback(req: Request, env: LinkEnv): Promise<Response> {
  const form = await req.formData().catch(() => null)
  if (!form) return text('bad request', 400)
  const post: Record<string, string> = {}
  for (const [k, v] of form.entries()) post[k] = String(v)
  if (!(await verifyCallback(post, env))) return text('PAYTR notification failed: bad hash', 400)
  const db = serviceDb()
  const id = invoiceIdFromCallback(post.callback_id)
  const inv = id ? (await db.from('invoices').select('id,amount,status,note,due_date').eq('id', id).maybeSingle()).data : null
  const decision = decideCallback(inv, post, env)
  if (decision.action === 'review' && inv) {
    await db.from('invoices').update({ payment_review: `PayTR ${post.merchant_oid || '?'}: ${decision.reason}`.slice(0, 500) }).eq('id', inv.id)
  }
  // İnceleme/ret durumlarında da "OK" dönülür: PayTR tekrar göndermesin, kayıt personelin önüne düşsün.
  if (decision.action !== 'mark_paid' || !inv) return text('OK')
  const marked = await db.rpc('paytr_mark_paid', { p_invoice: inv.id, p_oid: decision.merchantOid, p_paid: decision.paid, p_date: istanbulToday() })
  if (marked.error) return text('retry', 500)
  if (marked.data === 'ödendi' && Deno.env.get('EINVOICE_AUTO') === 'true') {
    const penv = parasutEnv(ALLOW_ORIGIN)
    if (penv) {
      const task = runEInvoice(db, inv.id, penv).catch(() => undefined)
      // Yanıtı bekletmeden arka planda sürdür; yoksa personel "e-Belge kes" ile tamamlar.
      ;(globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task)
    }
  }
  return text('OK')
}

async function handleCreate(req: Request, env: LinkEnv): Promise<Response> {
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)
  const { invoice_id, renew } = await req.json().catch(() => ({}))
  if (!UUID.test(String(invoice_id || ''))) return json({ error: 'invoice_id geçersiz' }, 400)
  const db = serviceDb()
  const { data: inv } = await db.from('invoices').select('id,customer_id,amount,status,note,due_date,payment_link,paytr_link_id').eq('id', invoice_id).maybeSingle()
  if (!inv) return json({ state: 'yok', message: 'Fatura bulunamadı.' }, 404)
  if (inv.status === 'ödendi') return json({ state: 'ödendi', message: 'Fatura zaten ödenmiş.' }, 409)
  if (inv.paytr_link_id && inv.payment_link && renew !== true) return json({ state: 'hazır', link: inv.payment_link, message: 'Bu faturanın kart linki zaten var.' })
  const { data: customer } = await db.from('customers').select('title,email').eq('id', inv.customer_id).maybeSingle()
  if (!customer) return json({ state: 'başarısız', message: 'Müşteri bulunamadı.' }, 422)
  let body: URLSearchParams
  try { body = await buildCreateRequest(inv, customer, env) } catch (e) { return json({ state: 'başarısız', message: String((e as Error).message) }, 422) }
  const res = await fetch(PAYTR_LINK_CREATE, { method: 'POST', body })
  const out = await res.json().catch(() => null)
  if (out?.status !== 'success' || !out?.link) return json({ state: 'başarısız', message: `PayTR link oluşturamadı: ${out?.err_msg || out?.status || res.status}` }, 502)
  const { error } = await db.from('invoices').update({ payment_link: String(out.link), paytr_link_id: String(out.id) }).eq('id', inv.id)
  if (error) return json({ state: 'başarısız', message: `Link oluştu ama kaydedilemedi: ${out.link}` }, 500)
  return json({ state: 'hazır', link: String(out.link) })
}

Deno.serve(async (req) => {
  const type = req.headers.get('content-type') || ''
  const isCallback = req.method === 'POST' && (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data'))
  if (!isCallback) {
    if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
    const origin = req.headers.get('origin') || ''
    if (origin && origin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  }
  const env = linkEnv()
  if (!env) return isCallback ? text('not configured', 503) : json({ state: 'kapalı', message: 'PayTR link kurulumu tamamlanmadı; işlem yapılmadı.' }, 503)
  try {
    return isCallback ? await handleCallback(req, env) : await handleCreate(req, env)
  } catch (e) {
    return isCallback ? text('retry', 500) : json({ state: 'başarısız', message: String((e as Error)?.message || e) }, 500)
  }
})
