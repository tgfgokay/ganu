// issue-einvoice (personel düğmesi) ve paytr-link (ödeme bildirimi) aynı e-Belge akışını buradan çalıştırır.
// Fatura einvoice_claim ile tek sahiplikle alınır; tutar, müşteri ve adres veritabanından okunur.
import { processInvoice, type CustomerRow, type Env, type InvoiceRow, type Result } from '../issue-einvoice/parasut.ts'

// GANU'nun Paraşüt kayıtları (gizli değil; 30.09.2026'da Paraşüt arayüzünden alındı). Secret verilirse o geçerlidir.
export const GANU_PARASUT = Object.freeze({ companyId: '852734', productId: '1077554069', accountId: '1000681581' })

// Fail-closed: EINVOICE_ENABLED=true ve OAuth secret'ları (client + kullanıcı) yoksa null (hiçbir dış çağrı yapılmaz).
export function parasutEnv(siteUrl: string): Env | null {
  const get = (k: string) => (Deno.env.get(k) || '').trim()
  const env: Env = {
    clientId: get('PARASUT_CLIENT_ID'), clientSecret: get('PARASUT_CLIENT_SECRET'), companyId: get('PARASUT_COMPANY_ID') || GANU_PARASUT.companyId,
    username: get('PARASUT_EMAIL'), password: get('PARASUT_PASSWORD'),
    productId: get('PARASUT_PRODUCT_ID') || GANU_PARASUT.productId, accountId: get('PARASUT_ACCOUNT_ID') || GANU_PARASUT.accountId, siteUrl,
  }
  if (get('EINVOICE_ENABLED') !== 'true' || !env.clientId || !env.clientSecret || !env.companyId || !env.username || !env.password) return null
  return env
}

export type RunOutcome = { status: number; body: Result | Record<string, unknown> }

// deno-lint-ignore no-explicit-any
export async function runEInvoice(db: any, invoiceId: string, env: Env): Promise<RunOutcome> {
  const claimed = await db.rpc('einvoice_claim', { p_invoice: invoiceId })
  if (claimed.error) return { status: 500, body: { error: 'Fatura alınamadı' } }
  const inv = (claimed.data || [])[0] as InvoiceRow | undefined
  if (!inv) {
    const { data } = await db.from('invoices').select('einvoice_status,einvoice_no,einvoice_pdf').eq('id', invoiceId).maybeSingle()
    return { status: 409, body: { state: data?.einvoice_status || 'yok', einvoice_no: data?.einvoice_no, pdf: data?.einvoice_pdf,
      message: data ? 'Fatura zaten kesilmiş, elle işaretlenmiş ya da şu an işleniyor.' : 'Fatura bulunamadı.' } }
  }
  const { data: customer, error } = await db.from('customers').select('*').eq('id', inv.customer_id).single()
  if (error || !customer) {
    await db.from('invoices').update({ einvoice_status: 'başarısız', einvoice_error: 'Müşteri bulunamadı.' }).eq('id', inv.id)
    return { status: 422, body: { state: 'başarısız', message: 'Müşteri bulunamadı.' } }
  }
  const store = {
    async patchInvoice(id: string, patch: Record<string, unknown>) {
      const { error } = await db.from('invoices').update(patch).eq('id', id); if (error) throw new Error(`Fatura kaydı güncellenemedi: ${error.message}`)
    },
    async setContact(customerId: string, contactId: string) {
      const { error } = await db.from('customers').update({ parasut_contact_id: contactId }).eq('id', customerId); if (error) throw new Error(`Cari kaydı güncellenemedi: ${error.message}`)
    },
    async savePdf(customerId: string, id: string, bytes: Uint8Array) {
      const path = `customers/${customerId}/efatura-${id}.pdf`
      const { error } = await db.storage.from('secure-docs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (error) throw new Error(`PDF depolanamadı: ${error.message}`)
      return `secure:${path}`
    },
  }
  const result = await processInvoice(inv, customer as CustomerRow, { fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), store, env })
  return { status: result.state === 'başarısız' ? 502 : 200, body: result }
}
