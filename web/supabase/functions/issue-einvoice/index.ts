// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// GANU Panel · e-Fatura / e-Arşiv kesme Edge Function (Deno)
// ------------------------------------------------------------
// Türkiye'de e-belge, GİB onaylı bir ENTEGRATÖR üzerinden kesilir.
// Bu fonksiyon istemciden gelen fatura + müşteri bilgisini alır,
// seçilen entegratörün API'sine iletir ve belge UUID/numarasını döner.
//
// PARAŞÜT AKIŞI (api.parasut.com/v4):
//   1) OAuth token (password grant)
//   2) Müşteri kaydını bul ya da oluştur (contacts, VKN/TC ile arama)
//   3) Satış faturası oluştur (sales_invoices) — tutar KDV DAHİL kabul edilir
//   4) e-Fatura mükellefi mi kontrol et (e_invoice_inboxes)
//      → mükellefse e_invoices, değilse e_archives ile resmîleştir
//   5) Trackable job'ı bekle, belge no + PDF linkini dön
//
// Gizli anahtarlar ASLA istemciye konmaz — Supabase secrets:
//   supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=...
//   supabase secrets set PARASUT_COMPANY_ID=... PARASUT_EMAIL=... PARASUT_PASSWORD=...
//
// Dağıtım:  supabase functions deploy issue-einvoice
//
// İstek gövdesi (JSON):
//   { provider, mode: "e-arsiv"|"e-fatura"|"auto",
//     invoice: { amount, issue_date, note },
//     customer: { title, contact, tax_no, tax_office, tc, email } }
// ============================================================

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
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  })
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true
}

type Invoice = { amount: number; issue_date?: string; note?: string }
type Customer = { title?: string; contact?: string; tax_no?: string; tax_office?: string; tc?: string; email?: string }

const P_BASE = 'https://api.parasut.com/v4'
const VAT_RATE = 20 // sanal ofis hizmeti — genel oran %20 (KDV dahil tutardan geri hesaplanır)

// ---- Paraşüt yardımcıları ----
async function parasutFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${P_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.errors?.map((e: { title?: string; detail?: string }) => e.detail || e.title).join('; ') || res.statusText
    throw new Error(`Paraşüt ${path} → ${res.status}: ${msg}`)
  }
  return body
}

/* Trackable job: e-belge kesimi asenkron döner; sonucu kısa aralıklarla yokla. */
async function waitJob(token: string, companyId: string, jobId: string, tries = 15) {
  for (let i = 0; i < tries; i++) {
    const r = await parasutFetch(token, `/${companyId}/trackable_jobs/${jobId}`)
    const status = r?.data?.attributes?.status
    if (status === 'done') return r
    if (status === 'error') {
      const errs = (r?.data?.attributes?.errors || []).join('; ')
      throw new Error('Paraşüt e-belge işi hata verdi: ' + (errs || 'bilinmeyen'))
    }
    await new Promise((res) => setTimeout(res, 1000))
  }
  throw new Error('Paraşüt e-belge işi zaman aşımına uğradı (belge Paraşüt panelinde oluşmuş olabilir).')
}

async function issueParasut(mode: string, invoice: Invoice, customer: Customer) {
  const clientId = Deno.env.get('PARASUT_CLIENT_ID')
  const clientSecret = Deno.env.get('PARASUT_CLIENT_SECRET')
  const companyId = Deno.env.get('PARASUT_COMPANY_ID')
  const email = Deno.env.get('PARASUT_EMAIL')
  const password = Deno.env.get('PARASUT_PASSWORD')
  if (!clientId || !clientSecret || !companyId || !email || !password) {
    throw new Error('Paraşüt secrets eksik (CLIENT_ID/SECRET, COMPANY_ID, EMAIL, PASSWORD).')
  }

  // 1) OAuth token
  const tokenRes = await fetch('https://api.parasut.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'password', client_id: clientId, client_secret: clientSecret,
      username: email, password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    }),
  })
  const tok = await tokenRes.json()
  if (!tokenRes.ok) throw new Error('Paraşüt token hata: ' + JSON.stringify(tok))
  const token: string = tok.access_token

  const taxId = (customer.tax_no || customer.tc || '').trim()

  // 2) Müşteriyi bul ya da oluştur
  const found = await parasutFetch(token,
    `/${companyId}/contacts?filter[tax_number]=${encodeURIComponent(taxId)}&page[size]=1`)
  let contactId: string
  if (found?.data?.length) {
    contactId = found.data[0].id
  } else {
    const created = await parasutFetch(token, `/${companyId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'contacts',
          attributes: {
            name: customer.title || customer.contact || 'Müşteri',
            email: customer.email || undefined,
            contact_type: customer.tax_no ? 'company' : 'person',
            tax_number: customer.tax_no || customer.tc,
            tax_office: customer.tax_office || undefined,
            account_type: 'customer',
          },
        },
      }),
    })
    contactId = created.data.id
  }

  // 3) Satış faturası — tutar KDV dahil; net birim fiyatı geri hesapla
  const gross = Number(invoice.amount) || 0
  const net = Math.round((gross / (1 + VAT_RATE / 100)) * 100) / 100
  const issueDate = invoice.issue_date || new Date().toISOString().slice(0, 10)
  const inv = await parasutFetch(token, `/${companyId}/sales_invoices`, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'sales_invoices',
        attributes: {
          item_type: 'invoice',
          issue_date: issueDate,
          due_date: issueDate,
          currency: 'TRL',
          description: invoice.note || 'Sanal ofis hizmet bedeli',
        },
        relationships: {
          contact: { data: { id: contactId, type: 'contacts' } },
          details: {
            data: [{
              type: 'sales_invoice_details',
              attributes: {
                quantity: 1,
                unit_price: net,
                vat_rate: VAT_RATE,
                description: invoice.note || 'Sanal ofis hizmet bedeli',
              },
            }],
          },
        },
      },
    }),
  })
  const invoiceId = inv.data.id

  // 4) e-Fatura mükellefi mi? (mode 'auto' ya da 'e-fatura' iken kontrol et)
  let useEInvoice = false
  let inboxAddr = ''
  if (mode !== 'e-arsiv' && customer.tax_no) {
    const inbox = await parasutFetch(token,
      `/${companyId}/e_invoice_inboxes?filter[vkn]=${encodeURIComponent(customer.tax_no)}`)
    if (inbox?.data?.length) { useEInvoice = true; inboxAddr = inbox.data[0].attributes?.e_invoice_address || '' }
  }

  // 5) Resmîleştir (asenkron iş → bekle)
  const endpoint = useEInvoice ? 'e_invoices' : 'e_archives'
  const attrs = useEInvoice
    ? { to: inboxAddr, scenario: 'basic' }
    : { internet_sale: { url: '', payment_type: 'ODEMEVADESI', payment_platform: '', payment_date: issueDate } }
  const job = await parasutFetch(token, `/${companyId}/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: endpoint.slice(0, -1) === 'e_invoice' ? 'e_invoices' : 'e_archives',
        attributes: attrs,
        relationships: { sales_invoice: { data: { id: invoiceId, type: 'sales_invoices' } } },
      },
    }),
  })
  const done = await waitJob(token, companyId, job.data.id)
  const docId = done?.data?.relationships?.trackable?.data?.id || ''

  // Belge detayı + PDF
  let uuid = '', number = '', pdfUrl = ''
  if (docId) {
    const doc = await parasutFetch(token, `/${companyId}/${endpoint}/${docId}`)
    uuid = doc?.data?.attributes?.uuid || ''
    number = doc?.data?.attributes?.invoice_number || doc?.data?.attributes?.reference_number || ''
    try {
      const pdf = await parasutFetch(token, `/${companyId}/${endpoint}/${docId}/pdf`)
      pdfUrl = pdf?.data?.attributes?.url || ''
    } catch { /* PDF hazır değilse boş bırak */ }
  }

  return {
    provider: 'parasut',
    mode: useEInvoice ? 'e-fatura' : 'e-arsiv',
    uuid, number,
    status: 'kesildi',
    pdf_url: pdfUrl,
    parasut_invoice_id: invoiceId,
  }
}

// ---- Diğer entegratörler için yer tutucu ----
async function issueGeneric(provider: string, _mode: string, _invoice: Invoice, _customer: Customer) {
  // İzibiz / Uyumsoft / Foriba / Logo / Mükellef — her biri kendi API'siyle
  throw new Error(`'${provider}' entegratörü henüz bağlanmadı. Hesap açılınca bu fonksiyona eklenecek.`)
}

Deno.serve(async (req) => {
  if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)

  try {
    const { provider, mode = 'e-arsiv', invoice, customer } = await req.json()
    if (!provider || !invoice) return json({ error: 'provider ve invoice zorunlu' }, 400)
    if (!customer?.tax_no && !customer?.tc) return json({ error: 'Müşteri vergi no/TC zorunlu' }, 400)

    let result
    if (provider === 'parasut') result = await issueParasut(mode, invoice, customer)
    else result = await issueGeneric(provider, mode, invoice, customer)

    return json(result)
  } catch (e) {
    return json({ status: 'başarısız', error: String((e as Error).message || e) }, 500)
  }
})
