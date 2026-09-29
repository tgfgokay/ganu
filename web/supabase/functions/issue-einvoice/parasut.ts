// Paraşüt v4 e-Belge akışı — Deno'ya özgü API kullanmaz; Node testleri (scripts/test-einvoice.mjs)
// sahte Paraşüt sunucusuyla aynı kodu koşturur.
//
// Kaynak: https://apidocs.parasut.com/swagger.json (2026-02-26). Her adım sonucu hemen kaydedilir;
// iş yarıda kalırsa kaldığı yerden devam eder, ikinci satış faturası ya da ikinci e-Belge açmaz.

export const PARASUT_API = 'https://api.parasut.com'
export const VAT_RATE = 20 // sanal ofis hizmeti genel oran; fatura tutarı KDV dahildir
const JOB_POLLS = 10, JOB_POLL_MS = 2500, PDF_POLLS = 3, PDF_POLL_MS = 3000, MIN_GAP_MS = 1000

export type Env = {
  clientId: string; clientSecret: string; username: string; password: string; companyId: string
  productId?: string; accountId?: string; siteUrl: string
}
export type InvoiceRow = {
  id: string; customer_id: string; amount: number | string; issue_date: string; due_date?: string | null
  status?: string | null; paid_date?: string | null; note?: string | null; payment_method?: string | null
  parasut_invoice_id?: string | null; parasut_payment_at?: string | null; einvoice_kind?: string | null
  einvoice_job_id?: string | null; einvoice_status?: string | null
}
export type CustomerRow = {
  id: string; title: string; email?: string | null; tax_no?: string | null; tc?: string | null
  tax_office?: string | null; address?: string | null; city?: string | null; district?: string | null
  parasut_contact_id?: string | null
}
export type Store = {
  patchInvoice(id: string, patch: Record<string, unknown>): Promise<void>
  setContact(customerId: string, contactId: string): Promise<void>
  savePdf(customerId: string, invoiceId: string, bytes: Uint8Array): Promise<string>
}
export type Deps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; store: Store; env: Env }
export type Result = { state: 'kesildi' | 'işleniyor' | 'başarısız'; einvoice_no?: string; kind?: string; pdf?: string | null; message?: string }

type Doc = { id: string; type: string; kind: 'e-arşiv' | 'e-fatura'; uuid: string; number: string }
type Json = { data?: any; included?: any[]; errors?: { title?: string; detail?: string }[] } | null

export class ParasutError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100

export function missingFields(c: CustomerRow): string[] {
  const out: string[] = []
  const vkn = digits(c.tax_no), tckn = digits(c.tc)
  if (!String(c.title || '').trim()) out.push('ünvan')
  if (vkn.length !== 10 && tckn.length !== 11) out.push('vergi no (10) ya da TC (11)')
  if (vkn.length === 10 && !String(c.tax_office || '').trim()) out.push('vergi dairesi')
  for (const [k, v] of [['adres', c.address], ['il', c.city], ['ilçe', c.district]] as const) if (!String(v || '').trim()) out.push(k)
  return out
}

export function client(deps: Deps) {
  let token = '', last = 0
  const pace = async () => { const wait = last + MIN_GAP_MS - Date.now(); if (wait > 0) await deps.sleep(wait); last = Date.now() }
  async function auth() {
    if (token) return token
    await pace()
    const body = new URLSearchParams({
      grant_type: 'password', client_id: deps.env.clientId, client_secret: deps.env.clientSecret,
      username: deps.env.username, password: deps.env.password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    })
    const res = await deps.fetch(`${PARASUT_API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.access_token) throw new ParasutError(res.status, `Paraşüt oturumu açılamadı (${res.status}).`)
    token = json.access_token
    return token
  }
  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
    for (let attempt = 0; ; attempt++) {
      const bearer = await auth()
      await pace()
      const res = await deps.fetch(`${PARASUT_API}/v4/${deps.env.companyId}${path}`, {
        method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (res.status === 429 && attempt < 2) { await deps.sleep(10_000); continue }
      if (res.status === 204) return { status: 204, json: null }
      const json: Json = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = json?.errors?.map((e) => e.detail || e.title).filter(Boolean).join('; ') || res.statusText || 'hata'
        throw new ParasutError(res.status, `Paraşüt ${method} ${path.split('?')[0]} → ${res.status}: ${detail}`)
      }
      return { status: res.status, json }
    }
  }
  return { call }
}
type Client = ReturnType<typeof client>

async function findOrCreateContact(p: Client, c: CustomerRow): Promise<string> {
  const taxId = digits(c.tax_no) || digits(c.tc)
  const found = await p.call('GET', `/contacts?filter[tax_number]=${taxId}&page[size]=1`)
  if (found.json?.data?.length) return String(found.json.data[0].id)
  const created = await p.call('POST', '/contacts', { data: { type: 'contacts', attributes: {
    name: c.title.trim(), account_type: 'customer', contact_type: digits(c.tax_no).length === 10 ? 'company' : 'person',
    tax_number: taxId, tax_office: c.tax_office?.trim() || undefined, email: c.email?.trim() || undefined,
    address: c.address?.trim(), city: c.city?.trim(), district: c.district?.trim(), is_abroad: false,
  } } })
  return String(created.json?.data?.id)
}

async function createSalesInvoice(p: Client, inv: InvoiceRow, contactId: string, env: Env): Promise<string> {
  const gross = round2(Number(inv.amount)), net = round2(gross / (1 + VAT_RATE / 100))
  const text = `${String(inv.note || '').trim() || 'Sanal ofis hizmet bedeli'} · GANU ${inv.id.slice(0, 8)}`
  const detail: Record<string, unknown> = { type: 'sales_invoice_details', attributes: { quantity: 1, unit_price: net, vat_rate: VAT_RATE, description: text } }
  if (env.productId) detail.relationships = { product: { data: { id: env.productId, type: 'products' } } }
  const created = await p.call('POST', '/sales_invoices', { data: { type: 'sales_invoices',
    attributes: { item_type: 'invoice', issue_date: inv.issue_date, due_date: inv.due_date || inv.issue_date, currency: 'TRL', description: text },
    relationships: { contact: { data: { id: contactId, type: 'contacts' } }, details: { data: [detail] } } } })
  const id = String(created.json?.data?.id || '')
  const total = Number(created.json?.data?.attributes?.gross_total)
  // Birim fiyatın KDV hariç yorumlandığı canlı yanıtla doğrulanır; tutmazsa taslak silinir, resmîleşmez.
  if (!id || !Number.isFinite(total) || Math.abs(total - gross) > 0.02) {
    if (id) await p.call('DELETE', `/sales_invoices/${id}`).catch(() => undefined)
    throw new Error(`Paraşüt fatura toplamı doğrulanamadı (beklenen ${gross.toFixed(2)}, gelen ${Number.isFinite(total) ? total.toFixed(2) : 'yok'}); taslak silindi.`)
  }
  return id
}

async function activeDoc(p: Client, invoiceId: string): Promise<Doc | null> {
  const r = await p.call('GET', `/sales_invoices/${invoiceId}?include=active_e_document`)
  const ref = r.json?.data?.relationships?.active_e_document?.data
  if (!ref?.id) return null
  const item = (r.json?.included || []).find((x: any) => String(x.id) === String(ref.id) && x.type === ref.type)
  const a = item?.attributes || {}
  return { id: String(ref.id), type: ref.type, kind: ref.type === 'e_invoices' ? 'e-fatura' : 'e-arşiv', uuid: a.uuid || '', number: a.invoice_number || '' }
}

async function createEDocument(p: Client, inv: InvoiceRow, c: CustomerRow, invoiceId: string, env: Env) {
  const taxId = digits(c.tax_no) || digits(c.tc)
  const inbox = await p.call('GET', `/e_invoice_inboxes?filter[vkn]=${taxId}`)
  const address = inbox.json?.data?.[0]?.attributes?.e_invoice_address
  if (address) {
    const r = await p.call('POST', '/e_invoices', { data: { type: 'e_invoices', attributes: { scenario: 'basic', to: address },
      relationships: { invoice: { data: { id: invoiceId, type: 'sales_invoices' } } } } })
    return { kind: 'e-fatura', job: String(r.json?.data?.id || '') }
  }
  // İnternetten (sitede kartla) satışta e-Arşiv'e internet satış bilgisi zorunludur (509 VUK GT IV.2.4.5).
  const attributes = inv.payment_method === 'kart'
    ? { internet_sale: { url: env.siteUrl, payment_type: 'KREDIKARTI/BANKAKARTI', payment_platform: 'PayTR', payment_date: inv.paid_date || inv.issue_date } }
    : {}
  const r = await p.call('POST', '/e_archives', { data: { type: 'e_archives', attributes,
    relationships: { sales_invoice: { data: { id: invoiceId, type: 'sales_invoices' } } } } })
  return { kind: 'e-arşiv', job: String(r.json?.data?.id || '') }
}

async function waitJob(p: Client, deps: Deps, job: string): Promise<'done' | 'pending' | 'expired'> {
  for (let i = 0; i < JOB_POLLS; i++) {
    let r
    try { r = await p.call('GET', `/trackable_jobs/${job}`) } catch (e) { if (e instanceof ParasutError && e.status === 404) return 'expired'; throw e }
    const a = r.json?.data?.attributes || {}
    if (a.status === 'done') return 'done'
    if (a.status === 'error') throw new Error(`Paraşüt e-Belge hatası: ${(a.errors || []).join('; ') || 'ayrıntı yok'}`)
    await deps.sleep(JOB_POLL_MS)
  }
  return 'pending'
}

async function pdfBytes(p: Client, deps: Deps, doc: Doc): Promise<Uint8Array | null> {
  for (let i = 0; i < PDF_POLLS; i++) {
    const r = await p.call('GET', `/${doc.type}/${doc.id}/pdf`)
    const url = r.status === 204 ? '' : r.json?.data?.attributes?.url
    if (url) {
      // URL 1 saat geçerlidir; müşteriyle paylaşılmaz, hemen indirilip kendi depomuza konur.
      const res = await deps.fetch(url)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!res.ok || new TextDecoder().decode(bytes.slice(0, 4)) !== '%PDF') throw new Error('Paraşüt PDF indirilemedi.')
      return bytes
    }
    await deps.sleep(PDF_POLL_MS)
  }
  return null
}

export async function processInvoice(inv: InvoiceRow, customer: CustomerRow, deps: Deps): Promise<Result> {
  const { store, env } = deps
  const missing = missingFields(customer)
  if (missing.length) {
    const message = `Müşteri bilgisi eksik: ${missing.join(', ')}.`
    await store.patchInvoice(inv.id, { einvoice_status: 'başarısız', einvoice_error: message })
    return { state: 'başarısız', message }
  }
  let issued = inv.einvoice_status === 'kesildi'
  try {
    const p = client(deps)
    let contactId = customer.parasut_contact_id || ''
    if (!contactId) { contactId = await findOrCreateContact(p, customer); await store.setContact(customer.id, contactId) }
    let invoiceId = inv.parasut_invoice_id || ''
    if (!invoiceId) { invoiceId = await createSalesInvoice(p, inv, contactId, env); await store.patchInvoice(inv.id, { parasut_invoice_id: invoiceId }) }
    if (inv.status === 'ödendi' && !inv.parasut_payment_at && env.accountId) {
      await p.call('POST', `/sales_invoices/${invoiceId}/payments`, { data: { type: 'payments', attributes: {
        account_id: Number(env.accountId), date: inv.paid_date || inv.issue_date, amount: round2(Number(inv.amount)),
        description: `GANU tahsilat ${inv.payment_method || ''}`.trim() } } })
      await store.patchInvoice(inv.id, { parasut_payment_at: new Date().toISOString() })
    }
    let doc = await activeDoc(p, invoiceId)
    if (!doc) {
      let job = inv.einvoice_job_id || ''
      for (let round = 0; round < 2 && !doc; round++) {
        if (!job) {
          const made = await createEDocument(p, inv, customer, invoiceId, env)
          job = made.job
          await store.patchInvoice(inv.id, { einvoice_kind: made.kind, einvoice_job_id: job })
        }
        const state = await waitJob(p, deps, job)
        if (state === 'pending') return { state: 'işleniyor', message: 'Paraşüt belgeyi işliyor; birkaç dakika sonra tekrar deneyin.' }
        doc = await activeDoc(p, invoiceId)
        if (!doc && state === 'expired') job = ''
      }
      if (!doc) throw new Error('Paraşüt işi tamamlandı ama e-Belge bulunamadı.')
    }
    issued = true
    await store.patchInvoice(inv.id, { einvoice_status: 'kesildi', einvoice_kind: doc.kind, einvoice_no: doc.number || null, einvoice_uuid: doc.uuid || null, einvoice_error: null })
    const bytes = await pdfBytes(p, deps, doc)
    if (!bytes) return { state: 'kesildi', einvoice_no: doc.number, kind: doc.kind, pdf: null, message: 'Belge kesildi; PDF hazırlanıyor, birkaç dakika sonra tekrar deneyin.' }
    const stored = await store.savePdf(customer.id, inv.id, bytes)
    await store.patchInvoice(inv.id, { einvoice_pdf: stored })
    return { state: 'kesildi', einvoice_no: doc.number, kind: doc.kind, pdf: stored }
  } catch (e) {
    const message = String((e as Error)?.message || e).slice(0, 500)
    await store.patchInvoice(inv.id, { einvoice_status: issued ? 'kesildi' : 'başarısız', einvoice_error: message })
    return { state: issued ? 'kesildi' : 'başarısız', message }
  }
}
