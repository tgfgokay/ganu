// PayTR Linkle Ödeme (Link API) — Deno'ya özgü API kullanmaz; scripts/test-paytr-link.mjs ile test edilir.
// Kaynak: dev.paytr.com/link-api/link-api-create ve /linkle-api-callback (2026-09-29).
//   create token  = base64(HMAC-SHA256(name+price+currency+max_installment+link_type+lang+email+merchant_salt, merchant_key))
//   callback hash = base64(HMAC-SHA256(callback_id+merchant_oid+merchant_salt+status+total_amount, merchant_key))
// Bildirim yalnız başarılı ödemede gelir, birden fazla gelebilir; yanıt düz metin "OK" olmalıdır.

export const PAYTR_LINK_CREATE = 'https://www.paytr.com/odeme/api/link/create'

export type LinkEnv = {
  merchantId: string; merchantKey: string; merchantSalt: string
  callbackUrl: string; maxInstallment: string; debug: boolean; acceptTest: boolean
}
export type LinkInvoice = { id: string; amount: number | string; status?: string | null; note?: string | null; due_date?: string | null }
export type LinkCustomer = { title: string; email?: string | null }

const enc = new TextEncoder()
export async function hmacB64(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)))
  let bin = ''
  for (const b of sig) bin += String.fromCharCode(b)
  return btoa(bin)
}
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const toKurus = (amount: number | string) => Math.round(Number(amount) * 100)
// callback_id alfanümerik ve en fazla 64 karakter olmalı: UUID tireleri atılır (32 hex).
export const callbackIdFor = (invoiceId: string) => invoiceId.replace(/-/g, '').toLowerCase()
export function invoiceIdFromCallback(callbackId: string): string | null {
  const h = String(callbackId || '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(h)) return null
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
// Ürün/hizmet adı 4–200 karakter.
export function linkName(customer: LinkCustomer, inv: LinkInvoice): string {
  const base = `GANU sanal ofis hizmeti · ${customer.title}${inv.note ? ` · ${inv.note}` : ''}`.replace(/\s+/g, ' ').trim()
  return base.length > 200 ? base.slice(0, 200) : base
}
// Son kullanma: İstanbul saatiyle, "YYYY-MM-DD HH:MM:SS".
export function expiryFor(now: Date, days = 30): string {
  const end = new Date(now.getTime() + days * 86400000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(end).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} 23:59:59`
}

export async function buildCreateRequest(inv: LinkInvoice, customer: LinkCustomer, env: LinkEnv, now = new Date()): Promise<URLSearchParams> {
  const email = String(customer.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Müşterinin e-posta adresi yok ya da geçersiz; fatura/cari linki e-posta ister.')
  const price = toKurus(inv.amount)
  if (!(price > 0)) throw new Error('Tutar sıfırdan büyük olmalı.')
  const f = { name: linkName(customer, inv), price: String(price), currency: 'TL', max_installment: env.maxInstallment, link_type: 'collection', lang: 'tr' }
  const token = await hmacB64(env.merchantKey, `${f.name}${f.price}${f.currency}${f.max_installment}${f.link_type}${f.lang}${email}${env.merchantSalt}`)
  return new URLSearchParams({
    merchant_id: env.merchantId, ...f, email, expiry_date: expiryFor(now),
    callback_link: env.callbackUrl, callback_id: callbackIdFor(inv.id), debug_on: env.debug ? '1' : '0', get_qr: '0', paytr_token: token,
  })
}

export async function verifyCallback(post: Record<string, string>, env: LinkEnv): Promise<boolean> {
  const expected = await hmacB64(env.merchantKey, `${post.callback_id ?? ''}${post.merchant_oid ?? ''}${env.merchantSalt}${post.status ?? ''}${post.total_amount ?? ''}`)
  return sameText(expected, String(post.hash || ''))
}

export type CallbackDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'review'; reason: string }
  | { action: 'mark_paid'; merchantOid: string; paid: number }

// İmza doğrulandıktan sonra: yanlış mağaza, test bildirimi ya da tutar/para birimi uyuşmazlığı ödenmiş sayılmaz.
export function decideCallback(inv: LinkInvoice | null, post: Record<string, string>, env: LinkEnv): CallbackDecision {
  if (post.merchant_id !== env.merchantId) return { action: 'ignore', reason: 'başka mağaza' }
  if (post.status !== 'success') return { action: 'ignore', reason: `durum ${post.status}` }
  if (post.test_mode === '1' && !env.acceptTest) return { action: 'ignore', reason: 'test ödemesi (PAYTR_ACCEPT_TEST kapalı)' }
  if (!inv) return { action: 'ignore', reason: 'fatura bulunamadı' }
  if ((post.currency || 'TL') !== 'TL') return { action: 'review', reason: `para birimi ${post.currency}` }
  if (Number(post.payment_amount) !== toKurus(inv.amount)) return { action: 'review', reason: `tutar uyuşmuyor (beklenen ${toKurus(inv.amount)}, gelen ${post.payment_amount})` }
  if (!/^[A-Za-z0-9]{1,64}$/.test(String(post.merchant_oid || ''))) return { action: 'review', reason: 'geçersiz merchant_oid' }
  return { action: 'mark_paid', merchantOid: post.merchant_oid, paid: Number(post.total_amount) / 100 }
}

// Bildirimin veritabanı adımları (index.ts gerçek Supabase istemcisini verir; testler sahtesini).
export type CallbackDb = {
  readInvoice(id: string): Promise<{ data: LinkInvoice | null; error: unknown }>
  noteReview(id: string, note: string): Promise<{ error: unknown }>
  markPaid(id: string, merchantOid: string, paid: number): Promise<{ data: unknown; error: unknown }>
}
export type CallbackOutcome = { status: number; body: string; paidInvoiceId?: string }

// PayTR yalnız düz metin "OK" görünce yeniden göndermeyi bırakır. Bu yüzden veritabanı hatası asla "OK" ile
// kapatılmaz (ör. Supabase projesi duraklatılmışken okuma hatası "fatura yok" sayılırsa ödeme kaybolurdu):
// 500 döner, PayTR tekrar dener. İnceleme/yok sayma kararları yazıldıktan sonra "OK" döner.
export async function processCallback(post: Record<string, string>, env: LinkEnv, db: CallbackDb): Promise<CallbackOutcome> {
  if (!(await verifyCallback(post, env))) return { status: 400, body: 'PAYTR notification failed: bad hash' }
  const id = invoiceIdFromCallback(post.callback_id)
  let inv: LinkInvoice | null = null
  if (id) {
    const read = await db.readInvoice(id)
    if (read.error) return { status: 500, body: 'retry' }
    inv = read.data
  }
  const decision = decideCallback(inv, post, env)
  if (decision.action === 'review' && inv) {
    const noted = await db.noteReview(inv.id, `PayTR ${post.merchant_oid || '?'}: ${decision.reason}`.slice(0, 500))
    if (noted.error) return { status: 500, body: 'retry' }
  }
  if (decision.action !== 'mark_paid' || !inv) return { status: 200, body: 'OK' }
  const marked = await db.markPaid(inv.id, decision.merchantOid, decision.paid)
  if (marked.error) return { status: 500, body: 'retry' }
  return { status: 200, body: 'OK', paidInvoiceId: marked.data === 'ödendi' ? inv.id : undefined }
}
