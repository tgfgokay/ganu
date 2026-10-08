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
import { processCallback, type LinkEnv } from './paytr.ts'
import { parasutEnv, runEInvoice } from '../_shared/einvoice-run.ts'
import { createInvoiceLink, paytrLinkEnv } from '../_shared/paytr-create.ts'
import { runQuotePipeline } from '../_shared/quote-pipeline.ts'

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

function linkEnv(): LinkEnv | null { return paytrLinkEnv() }
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
  // İstemci yalnız imza doğrulandıktan sonra, ilk veritabanı adımında kurulur.
  let client: ReturnType<typeof serviceDb> | null = null
  const db = () => (client ??= serviceDb())
  const out = await processCallback(post, env, {
    readInvoice: async (id) => {
      const r = await db().from('invoices').select('id,amount,status,note,due_date').eq('id', id).maybeSingle()
      return { data: r.data, error: r.error }
    },
    noteReview: async (id, note) => ({ error: (await db().from('invoices').update({ payment_review: note }).eq('id', id)).error }),
    markPaid: async (id, oid, paid) => {
      const r = await db().rpc('paytr_mark_paid', { p_invoice: id, p_oid: oid, p_paid: paid, p_date: istanbulToday() })
      return { data: r.data, error: r.error }
    },
  })
  if (out.paidInvoiceId) {
    const waitUntil = (p: Promise<unknown>) => (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(p)
    const { data: linked } = await db().from('invoices').select('quote_id').eq('id', out.paidInvoiceId).maybeSingle()
    if (linked?.quote_id) {
      // Teklif faturası: e-Belge + ödeme/sözleşme e-postası + aktivasyon hattı (yanıtı bekletmeden; takılırsa panelden "Devam ettir").
      waitUntil(runQuotePipeline(db(), linked.quote_id, ALLOW_ORIGIN).catch(() => undefined))
    } else if (Deno.env.get('EINVOICE_AUTO') === 'true') {
      const penv = parasutEnv(ALLOW_ORIGIN)
      // Yanıtı bekletmeden arka planda sürdür; yoksa personel "e-Belge kes" ile tamamlar.
      if (penv) waitUntil(runEInvoice(db(), out.paidInvoiceId, penv).catch(() => undefined))
    }
  }
  return text(out.body, out.status)
}

async function handleCreate(req: Request, env: LinkEnv): Promise<Response> {
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)
  const { invoice_id, renew } = await req.json().catch(() => ({}))
  if (!UUID.test(String(invoice_id || ''))) return json({ error: 'invoice_id geçersiz' }, 400)
  const out = await createInvoiceLink(serviceDb(), String(invoice_id), env, renew === true)
  return json(out.body, out.status)
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
