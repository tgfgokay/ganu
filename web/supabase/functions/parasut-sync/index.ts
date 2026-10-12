// GANU · Paraşüt → panel eşitleme (Deno Edge Function)
// ------------------------------------------------------------
// Paraşüt'te kesilen belgeyi panele bağlar, Paraşüt'te kapanan faturayı (iyzico kart / havale) panelde ödendi yapar,
// panelde ödendi olup Paraşüt'te açık kalan faturaya tahsilat girer. Kurallar: ../_shared/parasut-sync.ts
//
// Çağıranlar: GitHub Actions einvoice-daily (x-cron-secret = EINVOICE_CRON_SECRET) ve panel "Paraşüt'ten eşitle"
// düğmesi (personel JWT). POST { dry_run: true } hiçbir şey yazmadan ne yapılacağını döner.
// Fail-closed: EINVOICE_ENABLED ya da Paraşüt secret'ları eksikse 503, dış çağrı yok.
// Dağıtım: supabase functions deploy parasut-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parasutEnv } from '../_shared/einvoice-run.ts'
import { syncFromParasut, type SyncStore } from '../_shared/parasut-sync.ts'

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

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function isStaffRequest(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  if (!url || !anon || !authorization.toLowerCase().startsWith('bearer ')) return false
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)

  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader !== null) {
    const expected = (Deno.env.get('EINVOICE_CRON_SECRET') || '').trim()
    if (expected.length < 32 || !sameSecret(cronHeader, expected)) return json({ error: 'Yetkisiz' }, 401)
  } else if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)

  let origin = 'https://ganu.com.tr'
  try { origin = new URL(SITE || origin).origin } catch { /* varsayılan */ }
  const env = parasutEnv(origin)
  if (!env) return json({ state: 'kapalı', message: "e-Belge kurulumu tamamlanmadı (EINVOICE_ENABLED / Paraşüt secret'ları); eşitleme yapılmadı." }, 503)
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY eksik' }, 500)
  const db = createClient(url, key, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  const fail = (what: string, error: { message: string } | null) => { if (error) throw new Error(`${what}: ${error.message}`) }
  const store: SyncStore = {
    async linked() {
      const { data, error } = await db.from('invoices')
        .select('id,customer_id,amount,status,paid_date,payment_method,parasut_invoice_id,parasut_payment_at,payment_review,einvoice_status,einvoice_pdf')
        .not('parasut_invoice_id', 'is', null)
      fail('Bağlı faturalar okunamadı', error)
      return data || []
    },
    async customers() {
      const { data, error } = await db.from('customers').select('id,tax_no,tc,parasut_contact_id')
      fail('Müşteriler okunamadı', error)
      return data || []
    },
    async importInvoice(a) {
      const { data, error } = await db.rpc('parasut_import_invoice', { p_customer: a.customer_id, p_parasut_id: a.parasut_id, p_amount: a.amount,
        p_issue: a.issue_date, p_due: a.due_date, p_kind: a.kind, p_no: a.no, p_uuid: a.uuid, p_note: a.note })
      fail('Fatura bağlanamadı', error)
      return (data as string | null) || null
    },
    async markPaid(id, a) {
      const { error } = await db.rpc('parasut_mark_paid', { p_invoice: id, p_paid_date: a.paid_date, p_method: a.method, p_amount: a.amount, p_reference: a.reference })
      fail('Ödendi işaretlenemedi', error)
    },
    async patchInvoice(id, patch) {
      const { error } = await db.from('invoices').update(patch).eq('id', id); fail('Fatura kaydı güncellenemedi', error)
    },
    async setContact(customerId, contactId) {
      const { error } = await db.from('customers').update({ parasut_contact_id: contactId }).eq('id', customerId); fail('Cari kaydı güncellenemedi', error)
    },
    async savePdf(customerId, id, bytes) {
      const path = `customers/${customerId}/efatura-${id}.pdf`
      const { error } = await db.storage.from('secure-docs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      fail('PDF depolanamadı', error)
      return `secure:${path}`
    },
  }

  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
    const result = await syncFromParasut({ fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), env, store, today, dryRun: body?.dry_run === true })
    return json(result, result.errors ? 207 : 200)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 502)
  }
})
