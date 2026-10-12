// Paraşüt → panel eşitleme (parasut-sync). Deno'ya özgü API kullanmaz; scripts/test-parasut-sync.mjs sahte Paraşüt'le koşturur.
//
// 1) Paraşüt arayüzünde kesilen resmî belge (e-Arşiv / e-Fatura) panele fatura olarak bağlanır: cari vergi numarası
//    paneldeki tek müşteriyle eşleşmeli. parasut_invoice_id dolu olduğu için panel o belgeyi ikinci kez kesmez.
// 2) Paraşüt'te tamamen kapanan fatura (iyzico ile kartla "Tahsilat talep et" ödemesi ya da Paraşüt'e girilen havale)
//    panelde ödendi olur; kanıt Paraşüt tahsilat numarasıdır (0017 parasut_mark_paid).
// 3) Panelde ödendi olup Paraşüt'te açık kalan, e-Belgesi kesilmiş faturaya tahsilat Paraşüt'e girilir (tek seferlik).
// Kısmi tahsilat, tutar farkı, eşleşmeyen cari ve panelin kendi kestiği belge otomatik işlenmez; rapora yazılır.
// Rapor herkese açık GitHub kaydına düşebilir: müşteri adı ve tutar yazılmaz, yalnız Paraşüt no/belge no ve gerekçe.
import { client, docFrom, pdfBytes, type Client, type Doc, type Env } from '../issue-einvoice/parasut.ts'

export type LinkedInvoice = {
  id: string; customer_id: string; amount: number | string; status: string; paid_date?: string | null; payment_method?: string | null
  parasut_invoice_id: string; parasut_payment_at?: string | null; payment_review?: unknown; einvoice_status?: string | null; einvoice_pdf?: string | null
}
export type PanelCustomer = { id: string; tax_no?: string | null; tc?: string | null; parasut_contact_id?: string | null }
export type ImportArgs = {
  customer_id: string; parasut_id: string; amount: number; issue_date: string; due_date: string | null
  kind: 'e-arşiv' | 'e-fatura'; no: string; uuid: string; note: string
}
export type SyncStore = {
  linked(): Promise<LinkedInvoice[]>
  customers(): Promise<PanelCustomer[]>
  importInvoice(a: ImportArgs): Promise<string | null>
  markPaid(id: string, a: { paid_date: string; method: string; amount: number; reference: string }): Promise<void>
  patchInvoice(id: string, patch: Record<string, unknown>): Promise<void>
  setContact(customerId: string, contactId: string): Promise<void>
  savePdf(customerId: string, invoiceId: string, bytes: Uint8Array): Promise<string>
}
export type SyncDeps = {
  fetch: typeof fetch; sleep: (ms: number) => Promise<void>; env: Env; store: SyncStore
  today: string; dryRun?: boolean; days?: number; now?: () => string
}
export type SyncAction = 'bağlandı' | 'ödendi' | 'paraşüte_tahsilat' | 'atlandı' | 'hata'
export type SyncItem = { parasut_id: string; invoice_no: string | null; action: SyncAction; method?: string; reason?: string }
export type SyncResult = {
  dry_run: boolean; scanned: number; imported: number; paid: number; pushed: number; skipped: number; errors: number; items: SyncItem[]
}

const PAGE_SIZE = 25, MAX_PAGES = 4, MAX_LOOKUPS = 25
const INCLUDE = 'contact,payments,payments.transaction,active_e_document'
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100
const PANEL_MARK = /GANU [0-9a-f]{8}/i
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

type Account = { name?: string; bank_name?: string; bank_integration_type?: string; account_type?: string }
// deno-lint-ignore no-explicit-any
type Row = { id: string; type: string; attributes?: any; relationships?: any }

// Tahsilatın girdiği hesaba göre panel ödeme yöntemi: iyzico hesabı → kart, banka → havale, diğerleri → diğer.
export function methodFor(accounts: Account[]): 'kart' | 'havale' | 'diğer' {
  if (accounts.some((a) => /iyzico/i.test(`${a.name || ''} ${a.bank_name || ''} ${a.bank_integration_type || ''}`))) return 'kart'
  if (accounts.length && accounts.every((a) => a.account_type === 'bank')) return 'havale'
  return 'diğer'
}

export async function syncFromParasut(deps: SyncDeps): Promise<SyncResult> {
  const { store, env } = deps
  const dry = deps.dryRun === true
  const now = deps.now || (() => new Date().toISOString())
  const since = addDays(deps.today, -(deps.days ?? 120))
  const out: SyncResult = { dry_run: dry, scanned: 0, imported: 0, paid: 0, pushed: 0, skipped: 0, errors: 0, items: [] }
  const add = (item: SyncItem) => {
    out.items.push(item)
    if (item.action === 'bağlandı') out.imported++
    else if (item.action === 'ödendi') out.paid++
    else if (item.action === 'paraşüte_tahsilat') out.pushed++
    else if (item.action === 'hata') out.errors++
    else out.skipped++
  }
  const p: Client = client(deps)

  const accounts = new Map<string, Account>()
  const acc = await p.call('GET', `/accounts?page[size]=${PAGE_SIZE}`)
  for (const a of (acc.json?.data || []) as Row[]) accounts.set(String(a.id), a.attributes || {})

  // Son N günün satış faturaları (yeniden eskiye) + ilişkili cari, tahsilat ve resmî belge.
  const rows = new Map<string, Row>(), included = new Map<string, Row>()
  const keep = (list: Row[] = []) => { for (const x of list) included.set(`${x.type}:${x.id}`, x) }
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await p.call('GET', `/sales_invoices?filter[item_type]=invoice&sort=-issue_date&page[size]=${PAGE_SIZE}&page[number]=${page}&include=${INCLUDE}`)
    const data = (r.json?.data || []) as Row[]
    keep(r.json?.included as Row[])
    for (const d of data) rows.set(String(d.id), d)
    const last = data[data.length - 1]?.attributes?.issue_date || ''
    if (data.length < PAGE_SIZE || (last && last < since)) break
  }

  const linked = await store.linked()
  const byParasut = new Map(linked.map((i) => [String(i.parasut_invoice_id), i]))
  // Listede olmayan (eski) bağlı faturalar, işlem bekliyorsa tek tek okunur.
  let lookups = 0
  for (const inv of linked) {
    const id = String(inv.parasut_invoice_id)
    const waiting = inv.status !== 'ödendi' || (!inv.parasut_payment_at && inv.einvoice_status === 'kesildi')
    if (rows.has(id) || !waiting || lookups >= MAX_LOOKUPS) continue
    lookups++
    try {
      const r = await p.call('GET', `/sales_invoices/${id}?include=${INCLUDE}`)
      if (r.json?.data) { rows.set(id, r.json.data as Row); keep(r.json?.included as Row[]) }
    } catch (e) { add({ parasut_id: id, invoice_no: null, action: 'hata', reason: (e as Error).message.slice(0, 300) }) }
  }

  const customers = await store.customers()
  const byContact = new Map<string, PanelCustomer>(), byTax = new Map<string, PanelCustomer[]>()
  for (const c of customers) {
    if (c.parasut_contact_id) byContact.set(String(c.parasut_contact_id), c)
    for (const t of [digits(c.tax_no), digits(c.tc)]) if (t.length === 10 || t.length === 11) byTax.set(t, [...(byTax.get(t) || []), c])
  }

  const rel = (row: Row, name: string) => row.relationships?.[name]?.data
  const inc = (ref: { id?: string; type?: string } | null | undefined) => (ref?.id ? included.get(`${ref.type}:${ref.id}`) : undefined)

  for (const row of rows.values()) {
    const a = row.attributes || {}, pid = String(row.id)
    if (a.archived || (a.item_type && a.item_type !== 'invoice')) continue
    out.scanned++
    const doc: Doc | null = docFrom(row, [...included.values()])
    const no: string | null = doc?.number || a.invoice_no || null
    try {
      let inv = byParasut.get(pid)
      if (!inv) {
        if (String(a.issue_date || '') < since) continue
        if (PANEL_MARK.test(String(a.description || ''))) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Panelin kestiği fatura; panel kaydı kendi akışıyla bağlanır.' }); continue }
        if (a.currency && a.currency !== 'TRL') { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'TL dışı fatura.' }); continue }
        if (!doc) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Resmî belgesi yok (taslak ya da e-Belgesi kesilmemiş).' }); continue }
        if (!no) { add({ parasut_id: pid, invoice_no: null, action: 'atlandı', reason: 'Belge numarası henüz yok; sonraki eşitlemede denenecek.' }); continue }
        const contact = inc(rel(row, 'contact'))
        const tax = digits(contact?.attributes?.tax_number)
        const matches = contact && byContact.has(String(contact.id)) ? [byContact.get(String(contact.id))!] : (byTax.get(tax) || [])
        if (matches.length !== 1) {
          add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: matches.length ? 'Vergi numarası birden çok panel müşterisinde var.' : 'Panelde vergi numarası eşleşen müşteri yok.' })
          continue
        }
        const customer = matches[0], gross = round2(Number(a.gross_total))
        if (!(gross > 0)) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Fatura toplamı okunamadı.' }); continue }
        if (dry) { add({ parasut_id: pid, invoice_no: no, action: 'bağlandı', reason: 'deneme: bağlanacak' }); inv = undefined }
        else {
          const id = await store.importInvoice({ customer_id: customer.id, parasut_id: pid, amount: gross, issue_date: a.issue_date, due_date: a.due_date || null,
            kind: doc.kind, no, uuid: doc.uuid, note: `Paraşüt'te kesildi: ${no}` })
          if (!id) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Bu ETTN başka bir panel faturasında kayıtlı; elle kontrol edin.' }); continue }
          if (!customer.parasut_contact_id && contact) { await store.setContact(customer.id, String(contact.id)); customer.parasut_contact_id = String(contact.id) }
          inv = { id, customer_id: customer.id, amount: gross, status: 'bekliyor', parasut_invoice_id: pid, parasut_payment_at: null, einvoice_status: 'kesildi', einvoice_pdf: null }
          byParasut.set(pid, inv)
          add({ parasut_id: pid, invoice_no: no, action: 'bağlandı' })
        }
      }
      if (!inv) {
        // Deneme koşusunda bağlanacak faturanın ödeme durumu da raporlanır.
        if (dry && Number(a.remaining) <= 0.01) add({ parasut_id: pid, invoice_no: no, action: 'ödendi', reason: 'deneme: ödendi yapılacak' })
        continue
      }

      // PDF'i olmayan kesilmiş belge (ör. bağlarken henüz hazır değildi) — başarısızlık eşitlemeyi durdurmaz.
      if (!dry && doc && inv.einvoice_status === 'kesildi' && !inv.einvoice_pdf) {
        try {
          const bytes = await pdfBytes(p, deps, doc)
          if (bytes) { const path = await store.savePdf(inv.customer_id, inv.id, bytes); await store.patchInvoice(inv.id, { einvoice_pdf: path }); inv.einvoice_pdf = path }
        } catch { /* sonraki eşitlemede yeniden denenir */ }
      }

      const remaining = Number(a.remaining), gross = round2(Number(a.gross_total)), amount = round2(Number(inv.amount))
      if (inv.status !== 'ödendi') {
        if (!(Number.isFinite(remaining) && remaining <= 0.01)) {
          if (a.payment_status === 'partially_paid') add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Paraşüt\'te kısmi tahsilat var; panel otomatik ödendi yapmaz.' })
          continue
        }
        if (Math.abs(gross - amount) > 0.02) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Panel ve Paraşüt fatura tutarı farklı; elle kontrol edin.' }); continue }
        if (inv.payment_review) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'PayTR ödeme incelemesi açık.' }); continue }
        const pays = ((rel(row, 'payments') || []) as { id: string; type: string }[]).map((r) => inc(r)).filter(Boolean) as Row[]
        if (!pays.length) { add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Paraşüt kapalı gösteriyor ama tahsilat kaydı okunamadı.' }); continue }
        const paidDate = pays.map((x) => String(x.attributes?.date || '')).sort().pop() || deps.today
        const used: Account[] = []
        for (const pay of pays) {
          const tr = inc(rel(pay, 'transaction'))
          for (const side of ['debit_account', 'credit_account']) {
            const accId = tr ? String(rel(tr, side)?.id || '') : ''
            if (accounts.has(accId)) used.push(accounts.get(accId)!)
          }
        }
        const method = methodFor(used)
        const reference = `Paraşüt tahsilat ${pays.map((x) => x.id).join(',')}`.slice(0, 200)
        if (!dry) await store.markPaid(inv.id, { paid_date: paidDate > deps.today ? deps.today : paidDate, method, amount, reference })
        add({ parasut_id: pid, invoice_no: no, action: 'ödendi', method, ...(dry ? { reason: 'deneme: ödendi yapılacak' } : {}) })
      } else if (!inv.parasut_payment_at && inv.einvoice_status === 'kesildi') {
        if (Number.isFinite(remaining) && remaining <= 0.01) { if (!dry) await store.patchInvoice(inv.id, { parasut_payment_at: now() }); continue }
        if (!env.accountId || !(Math.abs(remaining - amount) <= 0.02)) {
          add({ parasut_id: pid, invoice_no: no, action: 'atlandı', reason: 'Panelde ödendi; Paraşüt\'te kalan tutar farklı ya da tahsilat hesabı yok — elle kontrol edin.' })
          continue
        }
        if (!dry) {
          await p.call('POST', `/sales_invoices/${pid}/payments`, { data: { type: 'payments', attributes: {
            account_id: Number(env.accountId), date: inv.paid_date || deps.today, amount, description: `GANU tahsilat ${inv.payment_method || ''}`.trim() } } })
          await store.patchInvoice(inv.id, { parasut_payment_at: now() })
        }
        add({ parasut_id: pid, invoice_no: no, action: 'paraşüte_tahsilat', ...(dry ? { reason: 'deneme: Paraşüt\'e tahsilat girilecek' } : {}) })
      }
    } catch (e) {
      add({ parasut_id: pid, invoice_no: no, action: 'hata', reason: String((e as Error)?.message || e).slice(0, 300) })
    }
  }
  return out
}
