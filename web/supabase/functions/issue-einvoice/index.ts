// GANU · Paraşüt e-Fatura / e-Arşiv kesimi (Deno Edge Function)
// ------------------------------------------------------------
// İstek: POST { invoice_id } — yalnız personel JWT. Tutar, müşteri ve adres istemciden alınmaz;
// fatura satırı sunucuda einvoice_claim ile tek sahiplikle alınır ve veritabanından okunur.
// Akış ve kaldığı yerden devam kuralları: ./parasut.ts
//
// Fail-closed: EINVOICE_ENABLED=true ve tüm Paraşüt secret'ları yoksa hiçbir dış çağrı yapılmaz.
//   supabase secrets set EINVOICE_ENABLED=true SITE_URL=https://ganu.com.tr
//   supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=... PARASUT_COMPANY_ID=...
//   supabase secrets set PARASUT_EMAIL=... PARASUT_PASSWORD=...        (2FA'sız ayrı API kullanıcısı)
//   supabase secrets set PARASUT_PRODUCT_ID=... PARASUT_ACCOUNT_ID=... (ürün + tahsilat hesabı; önerilir)
// Dağıtım: supabase functions deploy issue-einvoice

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { processInvoice, type CustomerRow, type Env, type InvoiceRow } from './parasut.ts'

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

function parasutEnv(): Env | null {
  const get = (k: string) => (Deno.env.get(k) || '').trim()
  const env: Env = {
    clientId: get('PARASUT_CLIENT_ID'), clientSecret: get('PARASUT_CLIENT_SECRET'), companyId: get('PARASUT_COMPANY_ID'),
    username: get('PARASUT_EMAIL'), password: get('PARASUT_PASSWORD'),
    productId: get('PARASUT_PRODUCT_ID') || undefined, accountId: get('PARASUT_ACCOUNT_ID') || undefined, siteUrl: ALLOW_ORIGIN,
  }
  if (get('EINVOICE_ENABLED') !== 'true' || !env.clientId || !env.clientSecret || !env.companyId || !env.username || !env.password) return null
  return env
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)
  const env = parasutEnv()
  if (!env) return json({ state: 'kapalı', message: 'e-Belge kurulumu tamamlanmadı (Paraşüt anahtarları bekleniyor); işlem yapılmadı.' }, 503)

  const { invoice_id } = await req.json().catch(() => ({}))
  if (!UUID.test(String(invoice_id || ''))) return json({ error: 'invoice_id geçersiz' }, 400)
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY eksik' }, 500)
  const db = createClient(url, key, { auth: { persistSession: false } })

  const claimed = await db.rpc('einvoice_claim', { p_invoice: invoice_id })
  if (claimed.error) return json({ error: 'Fatura alınamadı' }, 500)
  const inv = (claimed.data || [])[0] as InvoiceRow | undefined
  if (!inv) {
    const { data } = await db.from('invoices').select('einvoice_status,einvoice_no,einvoice_pdf').eq('id', invoice_id).maybeSingle()
    return json({ state: data?.einvoice_status || 'yok', einvoice_no: data?.einvoice_no, pdf: data?.einvoice_pdf,
      message: data ? 'Fatura zaten kesilmiş, elle işaretlenmiş ya da şu an işleniyor.' : 'Fatura bulunamadı.' }, 409)
  }
  const { data: customer, error } = await db.from('customers').select('*').eq('id', inv.customer_id).single()
  if (error || !customer) {
    await db.from('invoices').update({ einvoice_status: 'başarısız', einvoice_error: 'Müşteri bulunamadı.' }).eq('id', inv.id)
    return json({ state: 'başarısız', message: 'Müşteri bulunamadı.' }, 422)
  }

  const store = {
    async patchInvoice(id: string, patch: Record<string, unknown>) {
      const { error } = await db.from('invoices').update(patch).eq('id', id); if (error) throw new Error(`Fatura kaydı güncellenemedi: ${error.message}`)
    },
    async setContact(customerId: string, contactId: string) {
      const { error } = await db.from('customers').update({ parasut_contact_id: contactId }).eq('id', customerId); if (error) throw new Error(`Cari kaydı güncellenemedi: ${error.message}`)
    },
    async savePdf(customerId: string, invoiceId: string, bytes: Uint8Array) {
      const path = `customers/${customerId}/efatura-${invoiceId}.pdf`
      const { error } = await db.storage.from('secure-docs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (error) throw new Error(`PDF depolanamadı: ${error.message}`)
      return `secure:${path}`
    },
  }
  const result = await processInvoice(inv, customer as CustomerRow, {
    fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), store, env,
  })
  return json(result, result.state === 'başarısız' ? 502 : 200)
})
