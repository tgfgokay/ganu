// Paraşüt → panel eşitleme: sahte Paraşüt sunucusuyla senaryolar (ağ yok).
import assert from 'node:assert/strict'
import { syncFromParasut, methodFor } from '../supabase/functions/_shared/parasut-sync.ts'

const env = { clientId: 'cid', clientSecret: 'sec', username: 'info@ganu.com.tr', password: 'pw', companyId: '777', productId: '55', accountId: '9', siteUrl: 'https://ganu.com.tr' }
const TODAY = '2026-10-12'

// Paraşüt faturası: kimlik, cari, tutar, kalan, belge ve tahsilatlar.
const pinv = ({ id, contact = 'k1', gross = 18000, remaining = gross, status = remaining <= 0 ? 'paid' : 'unpaid', issue = TODAY, doc = 'e_archives',
  docNo = `GA0202600000000${id}`, uuid = `aaaaaaaa-0000-4000-8000-00000000000${id}`, description = 'Sanal ofis', pays = [], invoiceNo = docNo } = {}) => ({
  row: { id: String(id), type: 'sales_invoices',
    attributes: { issue_date: issue, due_date: issue, gross_total: String(gross), remaining: String(remaining), payment_status: status, item_type: 'invoice', currency: 'TRL', description, invoice_no: invoiceNo, archived: false },
    relationships: { contact: { data: { id: contact, type: 'contacts' } }, active_e_document: { data: doc ? { id: `d${id}`, type: doc } : null },
      payments: { data: pays.map((p) => ({ id: p.id, type: 'payments' })) } } },
  included: [
    ...(doc ? [{ id: `d${id}`, type: doc, attributes: doc === 'e_archives' ? { uuid, invoice_number: docNo } : { uuid } }] : []),
    ...pays.flatMap((p) => [
      { id: p.id, type: 'payments', attributes: { date: p.date || TODAY, amount: String(p.amount ?? gross) }, relationships: { transaction: { data: { id: `t${p.id}`, type: 'transactions' } } } },
      { id: `t${p.id}`, type: 'transactions', attributes: {}, relationships: { debit_account: { data: { id: p.account, type: 'accounts' } }, credit_account: { data: { id: 'cari', type: 'accounts' } } } },
    ]),
  ],
})
const contacts = { k1: '1111111111', k2: '2222222222', k3: '3333333333' }

function fakeParasut(invoices, { single = [] } = {}) {
  const calls = [], posts = []
  const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const contactRows = Object.entries(contacts).map(([id, tax]) => ({ id, type: 'contacts', attributes: { tax_number: tax } }))
  async function fetch(url, init = {}) {
    const method = init.method || 'GET', u = new URL(url)
    calls.push(`${method} ${u.pathname.replace('/v4/777', '')}`)
    if (u.hostname === 'files.parasut.test') return new Response(new TextEncoder().encode('%PDF-1.7 test'), { status: 200 })
    if (u.pathname === '/oauth/token') return ok({ access_token: 'tok' })
    if (method === 'GET' && u.pathname.endsWith('/accounts')) return ok({ data: [
      { id: '9', type: 'accounts', attributes: { name: 'İş Bankası', account_type: 'bank' } },
      { id: '50', type: 'accounts', attributes: { name: 'iyzico', account_type: 'bank' } },
      { id: '60', type: 'accounts', attributes: { name: 'Kasa', account_type: 'cash' } } ] })
    if (method === 'GET' && u.pathname.endsWith('/sales_invoices')) {
      assert.equal(u.searchParams.get('include'), 'contact,payments,payments.transaction,active_e_document')
      assert.equal(u.searchParams.get('sort'), '-issue_date')
      const page = Number(u.searchParams.get('page[number]'))
      const list = page === 1 ? invoices : []
      return ok({ data: list.map((x) => x.row), included: [...list.flatMap((x) => x.included), ...contactRows] })
    }
    const one = u.pathname.match(/\/sales_invoices\/(\w+)$/)
    if (method === 'GET' && one) {
      const x = single.find((s) => s.row.id === one[1]); assert.ok(x, `beklenmeyen tekil okuma ${one[1]}`)
      return ok({ data: x.row, included: [...x.included, ...contactRows] })
    }
    if (method === 'POST' && /\/sales_invoices\/\w+\/payments$/.test(u.pathname)) { posts.push({ path: u.pathname, body: JSON.parse(init.body) }); return ok({ data: { id: 'newpay', type: 'payments' } }, 201) }
    if (method === 'GET' && /\/(e_archives|e_invoices)\/\w+\/pdf$/.test(u.pathname)) return ok({ data: { attributes: { url: 'https://files.parasut.test/doc.pdf' } } })
    throw new Error(`beklenmeyen istek ${method} ${url}`)
  }
  return { fetch, calls, posts }
}

function fakeStore({ linked = [], customers = [{ id: 'c1', tax_no: '1111111111', parasut_contact_id: null }, { id: 'c2', tax_no: '2222222222', parasut_contact_id: null }], importReturns } = {}) {
  const s = { imports: [], paid: [], patches: [], contacts: [], pdfs: [],
    async linked() { return linked },
    async customers() { return customers },
    async importInvoice(a) { s.imports.push(a); return importReturns === undefined ? `panel-${a.parasut_id}` : importReturns },
    async markPaid(id, a) { s.paid.push({ id, ...a }) },
    async patchInvoice(id, patch) { s.patches.push({ id, patch }) },
    async setContact(customerId, contactId) { s.contacts.push({ customerId, contactId }) },
    async savePdf(customerId, invoiceId) { s.pdfs.push(invoiceId); return `secure:customers/${customerId}/efatura-${invoiceId}.pdf` } }
  return s
}
const sync = (fake, store, over = {}) => syncFromParasut({ fetch: fake.fetch, sleep: async () => {}, env, store, today: TODAY, now: () => '2026-10-12T09:00:00Z', ...over })
const run = async (name, fn) => { await fn(); console.log(`PASS ${name}`) }
const linkedRow = (over = {}) => ({ id: 'p1', customer_id: 'c1', amount: 18000, status: 'bekliyor', paid_date: null, payment_method: null, parasut_invoice_id: '1',
  parasut_payment_at: null, payment_review: null, einvoice_status: 'kesildi', einvoice_pdf: 'secure:x.pdf', ...over })

await run('Paraşüt\'te kesilmiş e-Arşiv vergi no ile panele bağlanır; cari ve PDF kaydedilir; ödenmediyse ödendi yapılmaz', async () => {
  const f = fakeParasut([pinv({ id: 1 })]), s = fakeStore()
  const r = await sync(f, s)
  assert.equal(r.imported, 1); assert.equal(r.paid, 0)
  assert.deepEqual(s.imports[0], { customer_id: 'c1', parasut_id: '1', amount: 18000, issue_date: TODAY, due_date: TODAY, kind: 'e-arşiv',
    no: 'GA02026000000001', uuid: 'aaaaaaaa-0000-4000-8000-000000000001', note: "Paraşüt'te kesildi: GA02026000000001" })
  assert.deepEqual(s.contacts, [{ customerId: 'c1', contactId: 'k1' }])
  assert.deepEqual(s.pdfs, ['panel-1']); assert.equal(s.patches[0].patch.einvoice_pdf, 'secure:customers/c1/efatura-panel-1.pdf')
  assert.equal(s.paid.length, 0); assert.equal(f.posts.length, 0)
})

await run('e-Fatura numarası satış faturasının numarasından alınır', async () => {
  const f = fakeParasut([pinv({ id: 2, contact: 'k2', gross: 20000, doc: 'e_invoices', invoiceNo: 'GN02026000000001' })]), s = fakeStore()
  await sync(f, s)
  assert.equal(s.imports[0].kind, 'e-fatura'); assert.equal(s.imports[0].no, 'GN02026000000001'); assert.equal(s.imports[0].customer_id, 'c2')
})

await run('iyzico hesabına giren tahsilat panelde kart ile ödendi yapar', async () => {
  const f = fakeParasut([pinv({ id: 1, remaining: 0, pays: [{ id: 'pay7', account: '50', date: '2026-10-11' }] })]), s = fakeStore({ linked: [linkedRow()] })
  const r = await sync(f, s)
  assert.equal(r.paid, 1); assert.equal(r.imported, 0)
  assert.deepEqual(s.paid[0], { id: 'p1', paid_date: '2026-10-11', method: 'kart', amount: 18000, reference: 'Paraşüt tahsilat pay7' })
})

await run('banka hesabına giren tahsilat havale olarak işlenir; yeni bağlanan fatura aynı koşuda ödendi olur', async () => {
  const f = fakeParasut([pinv({ id: 3, remaining: 0, pays: [{ id: 'pay8', account: '9' }] })]), s = fakeStore()
  const r = await sync(f, s)
  assert.equal(r.imported, 1); assert.equal(r.paid, 1)
  assert.equal(s.paid[0].id, 'panel-3'); assert.equal(s.paid[0].method, 'havale')
})

await run('eşleşmeyen ya da birden çok müşteride olan vergi no bağlanmaz', async () => {
  const f = fakeParasut([pinv({ id: 4, contact: 'k3' }), pinv({ id: 5, contact: 'k2' })])
  const s = fakeStore({ customers: [{ id: 'c2', tax_no: '2222222222' }, { id: 'c9', tc: '', tax_no: '2222222222' }] })
  const r = await sync(f, s)
  assert.equal(r.imported, 0); assert.equal(r.skipped, 2); assert.equal(s.imports.length, 0)
  assert.match(r.items.find((i) => i.parasut_id === '4').reason, /eşleşen müşteri yok/)
  assert.match(r.items.find((i) => i.parasut_id === '5').reason, /birden çok/)
})

await run('panelin kestiği (GANU işaretli) ya da resmî belgesi olmayan fatura bağlanmaz', async () => {
  const f = fakeParasut([pinv({ id: 6, description: 'Sanal ofis · GANU 0b1c2d3e' }), pinv({ id: 7, doc: null })]), s = fakeStore()
  const r = await sync(f, s)
  assert.equal(s.imports.length, 0); assert.equal(r.skipped, 2)
})

await run('kısmi tahsilat ve tutar farkı panelde ödendi yapmaz', async () => {
  const f = fakeParasut([pinv({ id: 1, remaining: 5000, status: 'partially_paid' }), pinv({ id: 8, gross: 18500, remaining: 0, pays: [{ id: 'p9', account: '9' }] })])
  const s = fakeStore({ linked: [linkedRow(), linkedRow({ id: 'p8', parasut_invoice_id: '8' })] })
  const r = await sync(f, s)
  assert.equal(s.paid.length, 0); assert.equal(r.skipped, 2)
  assert.match(r.items.find((i) => i.parasut_id === '1').reason, /kısmi/)
  assert.match(r.items.find((i) => i.parasut_id === '8').reason, /tutarı farklı/)
})

await run('panelde ödendi, Paraşüt\'te açık ve belgesi kesilmiş faturaya tahsilat Paraşüt\'e bir kez girilir', async () => {
  const f = fakeParasut([pinv({ id: 1 }), pinv({ id: 9 })])
  const s = fakeStore({ linked: [linkedRow({ status: 'ödendi', paid_date: '2026-10-10', payment_method: 'havale' }),
    linkedRow({ id: 'p9', parasut_invoice_id: '9', status: 'ödendi', einvoice_status: 'işleniyor' })] })
  const r = await sync(f, s)
  assert.equal(r.pushed, 1); assert.equal(f.posts.length, 1)
  assert.match(f.posts[0].path, /\/sales_invoices\/1\/payments$/)
  assert.deepEqual(f.posts[0].body.data.attributes, { account_id: 9, date: '2026-10-10', amount: 18000, description: 'GANU tahsilat havale' })
  assert.deepEqual(s.patches.find((p) => p.id === 'p1').patch, { parasut_payment_at: '2026-10-12T09:00:00Z' })
})

await run('panelde ödendi ve Paraşüt\'te de kapalıysa ikinci tahsilat girilmez, yalnız işaretlenir', async () => {
  const f = fakeParasut([pinv({ id: 1, remaining: 0, pays: [{ id: 'pay1', account: '9' }] })])
  const s = fakeStore({ linked: [linkedRow({ status: 'ödendi', paid_date: TODAY })] })
  const r = await sync(f, s)
  assert.equal(f.posts.length, 0); assert.equal(r.pushed, 0); assert.equal(s.patches[0].patch.parasut_payment_at, '2026-10-12T09:00:00Z')
})

await run('listede olmayan eski bağlı fatura tek tek okunur ve ödendi yapılır', async () => {
  const old = pinv({ id: 11, issue: '2026-01-05', remaining: 0, pays: [{ id: 'pay11', account: '50' }] })
  const f = fakeParasut([], { single: [old] }), s = fakeStore({ linked: [linkedRow({ id: 'p11', parasut_invoice_id: '11' })] })
  const r = await sync(f, s)
  assert.ok(f.calls.includes('GET /sales_invoices/11')); assert.equal(r.paid, 1); assert.equal(s.paid[0].method, 'kart')
})

await run('ETTN başka faturada kayıtlıysa (bağlama null) atlanır', async () => {
  const f = fakeParasut([pinv({ id: 1 })]), s = fakeStore({ importReturns: null })
  const r = await sync(f, s)
  assert.equal(r.imported, 0); assert.match(r.items[0].reason, /ETTN/); assert.equal(s.contacts.length, 0)
})

await run('deneme koşusu hiçbir şey yazmaz, ne yapılacağını raporlar', async () => {
  const f = fakeParasut([pinv({ id: 1, remaining: 0, pays: [{ id: 'x', account: '50' }] }), pinv({ id: 2, contact: 'k2' })])
  const s = fakeStore()
  const r = await sync(f, s, { dryRun: true })
  assert.equal(r.dry_run, true); assert.equal(r.imported, 2); assert.equal(r.paid, 1)
  assert.equal(s.imports.length + s.paid.length + s.patches.length + s.contacts.length + s.pdfs.length + f.posts.length, 0)
})

await run('rapor müşteri adı ve tutar içermez', async () => {
  const f = fakeParasut([pinv({ id: 1, remaining: 0, pays: [{ id: 'x', account: '9' }] }), pinv({ id: 4, contact: 'k3' })]), s = fakeStore()
  const r = await sync(f, s)
  const text = JSON.stringify(r)
  assert.ok(!/18000|18\.000|1111111111/.test(text), text)
})

await run('ödeme yöntemi: iyzico → kart, banka → havale, kasa/bilinmeyen → diğer', async () => {
  assert.equal(methodFor([{ name: 'iyzico', account_type: 'bank' }]), 'kart')
  assert.equal(methodFor([{ name: 'İş Bankası', account_type: 'bank' }]), 'havale')
  assert.equal(methodFor([{ name: 'Kasa', account_type: 'cash' }]), 'diğer')
  assert.equal(methodFor([]), 'diğer')
})

console.log('parasut sync tests PASS')
