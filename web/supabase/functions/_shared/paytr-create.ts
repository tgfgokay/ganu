// Faturaya PayTR kart linki üretir (personel düğmesi ve teklif kabulü ortak). Tutar DB'den okunur.
import { buildCreateRequest, PAYTR_LINK_CREATE, type LinkEnv } from '../paytr-link/paytr.ts'

export function paytrLinkEnv(): LinkEnv | null {
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

export type LinkOutcome = { status: number; body: { state: string; link?: string; message?: string } }

// deno-lint-ignore no-explicit-any
export async function createInvoiceLink(db: any, invoiceId: string, env: LinkEnv, renew = false): Promise<LinkOutcome> {
  const { data: inv } = await db.from('invoices').select('id,customer_id,amount,status,note,due_date,payment_link,paytr_link_id').eq('id', invoiceId).maybeSingle()
  if (!inv) return { status: 404, body: { state: 'yok', message: 'Fatura bulunamadı.' } }
  if (inv.status === 'ödendi') return { status: 409, body: { state: 'ödendi', message: 'Fatura zaten ödenmiş.' } }
  if (inv.paytr_link_id && inv.payment_link && !renew) return { status: 200, body: { state: 'hazır', link: inv.payment_link, message: 'Bu faturanın kart linki zaten var.' } }
  const { data: customer } = await db.from('customers').select('title,email').eq('id', inv.customer_id).maybeSingle()
  if (!customer) return { status: 422, body: { state: 'başarısız', message: 'Müşteri bulunamadı.' } }
  let body: URLSearchParams
  try { body = await buildCreateRequest(inv, customer, env) } catch (e) { return { status: 422, body: { state: 'başarısız', message: String((e as Error).message) } } }
  const res = await fetch(PAYTR_LINK_CREATE, { method: 'POST', body, signal: AbortSignal.timeout(20000) })
  const out = await res.json().catch(() => null)
  if (out?.status !== 'success' || !out?.link) return { status: 502, body: { state: 'başarısız', message: `PayTR link oluşturamadı: ${out?.err_msg || out?.status || res.status}` } }
  const { error } = await db.from('invoices').update({ payment_link: String(out.link), paytr_link_id: String(out.id) }).eq('id', inv.id)
  if (error) return { status: 500, body: { state: 'başarısız', message: `Link oluştu ama kaydedilemedi: ${out.link}` } }
  return { status: 200, body: { state: 'hazır', link: String(out.link) } }
}
