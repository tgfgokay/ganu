// Paraşüt e-Belge akışı: sahte Paraşüt sunucusuyla uçtan uca senaryolar (ağ yok).
import assert from 'node:assert/strict'
import { processInvoice, missingFields, checkConnection } from '../supabase/functions/issue-einvoice/parasut.ts'

const env = { clientId: 'cid', clientSecret: 'sec', username: 'api@ganu.com.tr', password: 'pw', companyId: '777', productId: '55', accountId: '9', siteUrl: 'https://ganu.com.tr' }
const customer = (over = {}) => ({ id: 'c1', title: 'Aydın Yazılım Ltd. Şti.', email: 'muhasebe@aydin.test', tax_no: '1234567890', tc: '', tax_office: 'Beykoz', address: 'Kavacık Mah. Ekinciler Cad. No:19', city: 'İstanbul', district: 'Beykoz', parasut_contact_id: null, ...over })
const invoice = (over = {}) => ({ id: '0b1c2d3e-0000-4000-8000-000000000001', customer_id: 'c1', amount: 1199, issue_date: '2026-09-29', due_date: '2026-10-04', status: 'ödendi', paid_date: '2026-09-29', note: 'Ekim 2026', payment_method: 'havale', parasut_invoice_id: null, parasut_payment_at: null, einvoice_kind: null, einvoice_job_id: null, einvoice_status: 'işleniyor', ...over })

function fakeParasut({ inbox = null, grossDelta = 0, jobPendingPolls = 1, pdf204 = 1, rateLimitOnce = false, activeDocFromStart = false } = {}) {
  const calls = [], state = { contacts: 0, invoices: 0, jobs: 0, deleted: [], jobPolls: 0, pdfPolls: 0, doc: activeDocFromStart ? { id: 'ea1', type: 'e_archives' } : null, limited: false, bodies: {} }
  const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  async function fetch(url, init = {}) {
    const method = init.method || 'GET', u = new URL(url), path = u.pathname.replace('/v4/777', '') + u.search
    calls.push(`${method} ${u.pathname.startsWith('/v4/') ? path.split('?')[0] : u.pathname}`)
    if (u.hostname === 'files.parasut.test') return new Response(new TextEncoder().encode('%PDF-1.7 test'), { status: 200 })
    if (u.pathname === '/oauth/token') { assert.equal(new URLSearchParams(init.body.toString()).get('grant_type'), 'password'); return ok({ access_token: 'tok' }) }
    assert.equal(init.headers.Authorization, 'Bearer tok')
    const body = init.body ? JSON.parse(init.body) : null
    if (rateLimitOnce && !state.limited) { state.limited = true; return ok({ errors: [{ title: 'Too Many Requests' }] }, 429) }
    if (method === 'GET' && u.pathname.endsWith('/contacts')) return ok({ data: [] })
    if (method === 'POST' && u.pathname.endsWith('/contacts')) { state.contacts++; state.bodies.contact = body; return ok({ data: { id: 'k1', type: 'contacts' } }, 201) }
    if (method === 'POST' && u.pathname.endsWith('/sales_invoices')) {
      state.invoices++; state.bodies.invoice = body
      const d = body.data.relationships.details.data[0].attributes
      const gross = Math.round(d.unit_price * (1 + d.vat_rate / 100) * 100) / 100 + grossDelta
      return ok({ data: { id: `s${state.invoices}`, type: 'sales_invoices', attributes: { gross_total: String(gross), net_total: String(d.unit_price) } } }, 201)
    }
    if (method === 'DELETE' && /\/sales_invoices\/s\d+$/.test(u.pathname)) { state.deleted.push(u.pathname.split('/').pop()); return ok(null, 204) }
    if (method === 'POST' && /\/sales_invoices\/s\d+\/payments$/.test(u.pathname)) { state.bodies.payment = body; return ok({ data: { id: 'pay1', type: 'payments' } }, 201) }
    if (method === 'GET' && /\/sales_invoices\/s\d+$/.test(u.pathname)) {
      assert.equal(u.searchParams.get('include'), 'active_e_document')
      if (!state.doc) return ok({ data: { id: 's1', type: 'sales_invoices', relationships: { active_e_document: { data: null } } } })
      return ok({ data: { id: 's1', type: 'sales_invoices', relationships: { active_e_document: { data: state.doc } } }, included: [{ id: state.doc.id, type: state.doc.type, attributes: { uuid: 'uuid-1', invoice_number: 'GAN2026000000001' } }] })
    }
    if (method === 'GET' && u.pathname.endsWith('/e_invoice_inboxes')) { assert.equal(u.searchParams.get('filter[vkn]'), '1234567890'); return ok({ data: inbox ? [{ id: 'i1', attributes: { e_invoice_address: inbox } }] : [] }) }
    if (method === 'POST' && (u.pathname.endsWith('/e_archives') || u.pathname.endsWith('/e_invoices'))) { state.jobs++; state.bodies.edoc = { path: u.pathname, body }; return ok({ data: { id: `job${state.jobs}`, type: 'trackable_jobs' } }, 201) }
    if (method === 'GET' && /\/trackable_jobs\/job\d+$/.test(u.pathname)) {
      state.jobPolls++
      if (state.jobPolls <= jobPendingPolls) return ok({ data: { attributes: { status: 'running' } } })
      state.doc = { id: 'ed1', type: u.pathname && state.bodies.edoc.path.endsWith('/e_invoices') ? 'e_invoices' : 'e_archives' }
      return ok({ data: { attributes: { status: 'done' } } })
    }
    if (method === 'GET' && /\/(e_archives|e_invoices)\/\w+\/pdf$/.test(u.pathname)) {
      state.pdfPolls++
      if (state.pdfPolls <= pdf204) return ok(null, 204)
      return ok({ data: { attributes: { url: 'https://files.parasut.test/doc.pdf', expires_at: '2026-09-29T12:00:00Z' } } })
    }
    throw new Error(`beklenmeyen istek ${method} ${url}`)
  }
  return { fetch, calls, state }
}
function fakeStore() {
  const patches = [], contacts = [], pdfs = []
  return { patches, contacts, pdfs, last: () => Object.assign({}, ...patches.map((p) => p.patch)),
    async patchInvoice(id, patch) { patches.push({ id, patch }) },
    async setContact(customerId, contactId) { contacts.push({ customerId, contactId }) },
    async savePdf(customerId, invoiceId, bytes) { pdfs.push(bytes.length); return `secure:customers/${customerId}/efatura-${invoiceId}.pdf` } }
}
const deps = (fake, store) => ({ fetch: fake.fetch, sleep: async () => {}, store, env })
const run = async (name, fn) => { await fn(); console.log(`PASS ${name}`) }

await run('e-Arşiv mutlu yol: cari → fatura (KDV hariç birim) → tahsilat → e-Arşiv → PDF', async () => {
  const f = fakeParasut(), s = fakeStore()
  const r = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(r.einvoice_no, 'GAN2026000000001'); assert.equal(r.kind, 'e-arşiv')
  assert.equal(r.pdf, 'secure:customers/c1/efatura-0b1c2d3e-0000-4000-8000-000000000001.pdf')
  const inv = f.state.bodies.invoice.data, det = inv.relationships.details.data[0]
  assert.equal(inv.attributes.currency, 'TRL'); assert.equal(det.attributes.unit_price, 999.17); assert.equal(det.attributes.vat_rate, 20)
  assert.deepEqual(det.relationships.product.data, { id: '55', type: 'products' })
  assert.match(inv.attributes.description, /GANU 0b1c2d3e/)
  const c = f.state.bodies.contact.data.attributes
  assert.equal(c.contact_type, 'company'); assert.equal(c.city, 'İstanbul'); assert.equal(c.district, 'Beykoz'); assert.equal(c.tax_number, '1234567890')
  assert.equal(f.state.bodies.payment.data.attributes.amount, 1199); assert.equal(f.state.bodies.payment.data.attributes.account_id, 9)
  assert.equal(f.state.bodies.edoc.path, '/v4/777/e_archives'); assert.deepEqual(f.state.bodies.edoc.body.data.attributes, {})
  assert.deepEqual(f.state.bodies.edoc.body.data.relationships.sales_invoice.data, { id: 's1', type: 'sales_invoices' })
  const last = s.last()
  assert.equal(last.parasut_invoice_id, 's1'); assert.equal(last.einvoice_status, 'kesildi'); assert.equal(last.einvoice_job_id, 'job1'); assert.ok(last.parasut_payment_at)
  assert.deepEqual(s.contacts, [{ customerId: 'c1', contactId: 'k1' }]); assert.deepEqual(s.pdfs, [13])
})

await run('kaldığı yerden devam: kayıtlı cari/fatura/tahsilat tekrar oluşturulmaz', async () => {
  const f = fakeParasut(), s = fakeStore()
  const r = await processInvoice(invoice({ parasut_invoice_id: 's1', parasut_payment_at: '2026-09-29T10:00:00Z' }), customer({ parasut_contact_id: 'k1' }), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(f.state.contacts, 0); assert.equal(f.state.invoices, 0); assert.equal(f.state.bodies.payment, undefined)
  assert.equal(f.calls.filter((c) => c.startsWith('POST /contacts') || c === 'POST /sales_invoices').length, 0)
})

await run('zaten resmîleşmiş fatura: yeni e-Belge açılmaz, yalnız PDF alınır', async () => {
  const f = fakeParasut({ activeDocFromStart: true }), s = fakeStore()
  const r = await processInvoice(invoice({ parasut_invoice_id: 's1', parasut_payment_at: 'x', einvoice_status: 'kesildi' }), customer({ parasut_contact_id: 'k1' }), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(f.state.jobs, 0); assert.deepEqual(s.pdfs, [13])
})

await run('e-Fatura mükellefi: e_invoices + relationships.invoice + to=etiket', async () => {
  const f = fakeParasut({ inbox: 'urn:mail:defaultpk@aydin.test' }), s = fakeStore()
  const r = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(r.kind, 'e-fatura')
  const b = f.state.bodies.edoc
  assert.equal(b.path, '/v4/777/e_invoices'); assert.equal(b.body.data.attributes.to, 'urn:mail:defaultpk@aydin.test'); assert.equal(b.body.data.attributes.scenario, 'basic')
  assert.deepEqual(b.body.data.relationships.invoice.data, { id: 's1', type: 'sales_invoices' })
})

await run('kartla internet satışı: e-Arşiv internet_sale zorunlu alanları', async () => {
  const f = fakeParasut(), s = fakeStore()
  await processInvoice(invoice({ payment_method: 'kart' }), customer(), deps(f, s))
  assert.deepEqual(f.state.bodies.edoc.body.data.attributes.internet_sale, { url: 'https://ganu.com.tr', payment_type: 'KREDIKARTI/BANKAKARTI', payment_platform: 'PayTR', payment_date: '2026-09-29' })
})

await run('eksik adres: Paraşüt\'e hiç istek gitmez, başarısız işaretlenir', async () => {
  const f = fakeParasut(), s = fakeStore()
  const r = await processInvoice(invoice(), customer({ address: '', district: '' }), deps(f, s))
  assert.equal(r.state, 'başarısız'); assert.match(r.message, /adres, ilçe/); assert.equal(f.calls.length, 0)
  assert.equal(s.last().einvoice_status, 'başarısız')
  assert.deepEqual(missingFields(customer({ tax_no: '', tc: '12345678901', tax_office: '' })), [])
  assert.deepEqual(missingFields(customer({ tax_office: '' })), ['vergi dairesi'])
})

await run('KDV toplamı tutmazsa: taslak silinir, fatura id kaydedilmez, resmîleşmez', async () => {
  const f = fakeParasut({ grossDelta: 0.5 }), s = fakeStore()
  const r = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(r.state, 'başarısız'); assert.match(r.message, /toplamı doğrulanamadı/)
  assert.deepEqual(f.state.deleted, ['s1']); assert.equal(f.state.jobs, 0); assert.equal(s.last().parasut_invoice_id, undefined)
})

await run('uzun süren iş: işleniyor döner, ikinci çağrı aynı işi bitirir', async () => {
  const f = fakeParasut({ jobPendingPolls: 12 }), s = fakeStore()
  const first = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(first.state, 'işleniyor'); assert.equal(f.state.jobs, 1)
  const saved = s.last()
  const second = await processInvoice(invoice({ parasut_invoice_id: saved.parasut_invoice_id, parasut_payment_at: saved.parasut_payment_at, einvoice_job_id: saved.einvoice_job_id, einvoice_kind: saved.einvoice_kind }), customer({ parasut_contact_id: 'k1' }), deps(f, s))
  assert.equal(second.state, 'kesildi'); assert.equal(f.state.jobs, 1); assert.equal(f.state.invoices, 1)
})

await run('429: bekleyip tekrar dener', async () => {
  const f = fakeParasut({ rateLimitOnce: true }), s = fakeStore()
  const r = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(f.calls.filter((c) => c === 'GET /contacts').length, 2)
})

await run('PDF gecikirse: kesildi kalır, PDF sonra alınır', async () => {
  const f = fakeParasut({ pdf204: 5 }), s = fakeStore()
  const r = await processInvoice(invoice(), customer(), deps(f, s))
  assert.equal(r.state, 'kesildi'); assert.equal(r.pdf, null); assert.equal(s.last().einvoice_pdf, undefined)
})

function fakeCheck({ tokenError = null, companies = [{ id: '777', type: 'companies', attributes: { name: 'GANU OFİS HİZMETLERİ LTD. ŞTİ.' } }] } = {}) {
  const calls = []
  const ok = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  async function fetch(url, init = {}) {
    const method = init.method || 'GET', u = new URL(url)
    calls.push(`${method} ${u.pathname}`)
    if (u.pathname === '/oauth/token') return tokenError ? ok({ error: tokenError, error_description: 'x' }, 401) : ok({ access_token: 'tok' })
    assert.equal(method, 'GET', 'bağlantı testi yazma isteği yapmamalı')
    if (u.pathname === '/v4/me') { assert.equal(u.searchParams.get('include'), 'companies'); return ok({ data: { id: 'u1' }, included: companies }) }
    if (u.pathname === '/v4/777/products/55') return ok({ data: { id: '55', attributes: { name: 'Sanal Ofis Hizmeti' } } })
    if (u.pathname === '/v4/777/accounts/9') return ok({ data: { id: '9', attributes: { name: 'İş Bankası TL — Tahsilat' } } })
    throw new Error(`beklenmeyen istek ${method} ${url}`)
  }
  return { fetch, calls }
}
await run('bağlantı testi: yalnız okur, şirket/ürün/hesap adını döner', async () => {
  const f = fakeCheck(), r = await checkConnection({ fetch: f.fetch, sleep: async () => {}, env })
  assert.equal(r.state, 'bağlı'); assert.equal(r.company, 'GANU OFİS HİZMETLERİ LTD. ŞTİ.'); assert.equal(r.product, 'Sanal Ofis Hizmeti'); assert.equal(r.account, 'İş Bankası TL — Tahsilat')
  assert.deepEqual(f.calls, ['POST /oauth/token', 'GET /v4/me', 'GET /v4/777/products/55', 'GET /v4/777/accounts/9'])
})
await run('bağlantı testi: yanlış şifre/2FA → oturum adımında invalid_grant', async () => {
  const r = await checkConnection({ fetch: fakeCheck({ tokenError: 'invalid_grant' }).fetch, sleep: async () => {}, env })
  assert.equal(r.state, 'hata'); assert.equal(r.step, 'oturum'); assert.match(r.message, /invalid_grant/); assert.match(r.message, /iki adımlı/)
})
await run('bağlantı testi: yanlış client → invalid_client', async () => {
  const r = await checkConnection({ fetch: fakeCheck({ tokenError: 'invalid_client' }).fetch, sleep: async () => {}, env })
  assert.equal(r.step, 'oturum'); assert.match(r.message, /Client ID\/Secret/)
})
await run('bağlantı testi: kullanıcı şirkete erişemiyorsa şirket adımında durur', async () => {
  const f = fakeCheck({ companies: [{ id: '999', type: 'companies', attributes: { name: 'Başka' } }] }), r = await checkConnection({ fetch: f.fetch, sleep: async () => {}, env })
  assert.equal(r.state, 'hata'); assert.equal(r.step, 'şirket'); assert.equal(f.calls.length, 2)
})
console.log('einvoice parasut flow tests PASS')
