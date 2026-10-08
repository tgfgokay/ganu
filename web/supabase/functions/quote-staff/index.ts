// GANU · Teklif modülü — personel uçları (Deno Edge Function, verify_jwt=true + is_staff()).
// POST JSON { action, ... }:
//   create        → aday müşteri (yeni ya da mevcut) + taslak teklif (fiyat katalogdan; Kurumsal için tutar zorunlu)
//   send          → yeni 256-bit link üretir (eskisi geçersiz olur), teklifi 'gönderildi' yapar, e-posta gönderir; link her durumda döner
//   cancel        → kabul edilmemiş teklif iptal; kabul edilmiş ama ödenmemişse fatura satırı silinir, sözleşme 'iptal'
//   accept_manual → ıslak imzalı sözleşme yüklendiyse (belge türü 'sozlesme') personel kabul eder
//   address_doc   → adres tahsis belgesi: yüklendi | gerekmiyor (gerekçe zorunlu) | bekliyor
//   pay_link      → kabul edilmiş teklifin faturasına PayTR kart linki
//   sync          → ödeme sonrası hattı yeniden çalıştırır (e-Belge, e-posta, aktivasyon)
// Secret'lar: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL, QUOTE_SECRET (≥32), [RESEND_API_KEY, MAIL_FROM]
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanParty, contractVars, newToken, partyErrors, quoteAmount, quoteMail, renderContract, sha256Hex, validEmail, digits, type PartyType } from '../_shared/quote.ts'
import { mailReady, sendMail } from '../_shared/mail.ts'
import { createInvoiceLink, paytrLinkEnv } from '../_shared/paytr-create.ts'
import { runQuotePipeline } from '../_shared/quote-pipeline.ts'

const SITE = (Deno.env.get('SITE_URL') || '').replace(/\/+$/, '')
let ORIGIN = ''
try { ORIGIN = SITE ? new URL(SITE).origin : '' } catch { ORIGIN = '' }
const cors = { ...(ORIGIN ? { 'Access-Control-Allow-Origin': ORIGIN } : {}), 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PARTY: PartyType[] = ['şahıs', 'şirket', 'kuruluş']

function serviceDb() {
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik')
  return createClient(url, key, { auth: { persistSession: false } })
}
async function staffUser(req: Request): Promise<{ id: string } | null> {
  const url = Deno.env.get('SUPABASE_URL') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  if (!url || !anon || !authorization.toLowerCase().startsWith('bearer ')) return null
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data, error } = await client.rpc('is_staff')
  if (error || data !== true) return null
  const { data: u } = await client.auth.getUser()
  return u?.user ? { id: u.user.id } : null
}
type Db = ReturnType<typeof serviceDb>
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function loadQuote(db: Db, id: unknown) {
  if (!UUID.test(String(id || ''))) return null
  const { data } = await db.from('quotes').select('*').eq('id', String(id)).maybeSingle()
  return data
}

async function create(db: Db, b: Record<string, any>, uid: string) {
  const party_type = String(b.party_type || '') as PartyType
  if (!PARTY.includes(party_type)) return json({ error: 'Taraf türü seçin: şahıs, şirket ya da kuruluş.' }, 400)
  const period = b.billing_period === 'aylık' ? 'aylık' : 'yıllık'
  const { data: pkg } = await db.from('packages').select('id,list_amount,monthly_amount,price_version,is_custom,active,currency').eq('id', String(b.package_id || '')).maybeSingle()
  if (!pkg || !pkg.active) return json({ error: 'Paket geçersiz.' }, 400)
  const pct = Math.min(100, Math.max(0, Math.trunc(Number(b.discount_pct) || 0)))
  let list = Number(period === 'aylık' ? pkg.monthly_amount : pkg.list_amount) || 0
  if (pkg.is_custom) { list = Number(b.amount) || 0; if (!(list > 0)) return json({ error: 'Kurumsal (özel) teklifte KDV dahil tutar girilmeli.' }, 400) }
  if (!(list > 0)) return json({ error: `${pkg.id} paketinin ${period} fiyatı katalogda yok.` }, 400)
  const amount = quoteAmount(list, pct)
  if (!(amount > 0)) return json({ error: 'Teklif tutarı sıfır olamaz.' }, 400)

  let customerId = String(b.customer_id || '')
  if (customerId) {
    if (!UUID.test(customerId)) return json({ error: 'Müşteri geçersiz.' }, 400)
    const { data: c } = await db.from('customers').select('id,email').eq('id', customerId).maybeSingle()
    if (!c) return json({ error: 'Müşteri bulunamadı.' }, 404)
  } else {
    const raw = b.customer || {}
    const p = cleanParty(party_type, raw)
    const email = String(raw.email || '').trim().toLowerCase().slice(0, 254), phone = String(raw.phone || '').replace(/[^0-9+]/g, '').slice(0, 16)
    if (p.title.length < 3) return json({ error: 'Ad soyad / unvan en az 3 karakter.' }, 400)
    if (!validEmail(email)) return json({ error: 'Geçerli e-posta adresi gerekli (teklif ve doğrulama kodu e-postayla gider).' }, 400)
    if (phone && !(digits(phone).length >= 10 && digits(phone).length <= 13)) return json({ error: 'Telefon numarası geçersiz.' }, 400)
    const { data: c, error } = await db.from('customers').insert({
      title: p.title, contact: p.contact || null, email, phone: phone || null, tc: p.tc || null, tax_no: p.tax_no || null, tax_office: p.tax_office || null,
      address: p.address || null, city: p.city || null, district: p.district || null, status: 'aday', notes: 'Teklif modülünden oluşturuldu',
    }).select('id').single()
    if (error || !c) return json({ error: `Müşteri kaydı açılamadı: ${error?.message || ''}` }, 500)
    customerId = c.id
  }
  const { data: no, error: ne } = await db.rpc('quote_next_no')
  if (ne || !no) return json({ error: 'Teklif numarası alınamadı.' }, 500)
  const validDays = Math.min(60, Math.max(1, Math.trunc(Number(b.valid_days) || 15)))
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start_date || '')) ? String(b.start_date) : null
  const { data: q, error } = await db.from('quotes').insert({
    quote_no: no, customer_id: customerId, party_type, planned_company: party_type === 'kuruluş' ? String(b.planned_company || '').trim().slice(0, 200) || null : null,
    representative: null, package_id: pkg.id, billing_period: period, list_amount: list, discount_pct: pct, amount, currency: pkg.currency || 'TL',
    price_version: Number(pkg.price_version) || 1, start_date: start, valid_until: addDays(today(), validDays), status: 'taslak',
    notes: String(b.notes || '').trim().slice(0, 1000) || null, created_by: uid,
  }).select('*').single()
  if (error || !q) return json({ error: `Teklif kaydedilemedi: ${error?.message || ''}` }, 500)
  return json({ state: 'taslak', quote: q })
}

async function send(db: Db, q: Record<string, any>) {
  if (!['taslak', 'gönderildi'].includes(q.status)) return json({ error: `Bu teklif '${q.status}' durumunda; gönderilemez.` }, 409)
  if (q.valid_until < today()) return json({ error: 'Teklifin süresi dolmuş; yeni teklif oluşturun.' }, 409)
  const { data: tpl } = await db.from('contract_templates').select('version').eq('active', true).maybeSingle()
  if (!tpl) return json({ error: 'Etkin sözleşme şablonu yok. Önce Ayarlar > Sözleşme şablonu bölümünden onaylı metni yükleyin.' }, 409)
  const { data: c } = await db.from('customers').select('*').eq('id', q.customer_id).single()
  if (!c || !validEmail(c.email)) return json({ error: 'Müşterinin geçerli e-posta adresi yok.' }, 422)
  const token = newToken(), hash = await sha256Hex(token)
  const link = `${SITE}/teklif#t=${token}`
  const { error } = await db.from('quotes').update({ token_hash: hash, status: 'gönderildi', sent_at: new Date().toISOString(), sent_to: c.email, send_count: (q.send_count || 0) + 1, otp_hash: null, otp_expires_at: null, otp_attempts: 0 }).eq('id', q.id).in('status', ['taslak', 'gönderildi'])
  if (error) return json({ error: `Teklif güncellenemedi: ${error.message}` }, 500)
  let mail = { ok: false, error: 'E-posta servisi kurulmadı; linki kopyalayıp müşteriye iletin.' } as { ok: boolean; error?: string }
  if (mailReady()) mail = await sendMail(c.email, quoteMail(q, c, link), `quote-send-${q.id}-${hash.slice(0, 16)}`)
  return json({ state: 'gönderildi', link, mailed: mail.ok, mail_error: mail.ok ? undefined : mail.error })
}

async function cancel(db: Db, q: Record<string, any>) {
  if (['iptal', 'reddedildi', 'süresi_doldu'].includes(q.status)) return json({ state: q.status })
  if (q.status === 'kabul') {
    const { data: inv } = await db.from('invoices').select('id,status,parasut_invoice_id,paytr_merchant_oid').eq('id', q.invoice_id).maybeSingle()
    if (inv && (inv.status === 'ödendi' || inv.parasut_invoice_id || inv.paytr_merchant_oid)) return json({ error: 'Ödemesi alınmış/faturası kesilmiş teklif iptal edilemez; iade ve fesih elle yürütülür.' }, 409)
    if (q.activated_at) return json({ error: 'Aktif hizmet iptal edilemez.' }, 409)
    const { error: ue } = await db.from('quotes').update({ status: 'iptal', cancelled_at: new Date().toISOString(), invoice_id: null }).eq('id', q.id).eq('status', 'kabul')
    if (ue) return json({ error: ue.message }, 500)
    if (inv) await db.from('invoices').delete().eq('id', inv.id).eq('status', 'bekliyor')
    if (q.contract_id) await db.from('contracts').update({ status: 'iptal' }).eq('id', q.contract_id)
    return json({ state: 'iptal' })
  }
  const { error } = await db.from('quotes').update({ status: 'iptal', cancelled_at: new Date().toISOString(), token_hash: null, otp_hash: null }).eq('id', q.id).in('status', ['taslak', 'gönderildi'])
  if (error) return json({ error: error.message }, 500)
  return json({ state: 'iptal' })
}

async function acceptManual(db: Db, q: Record<string, any>, b: Record<string, any>, uid: string) {
  if (!['taslak', 'gönderildi'].includes(q.status)) return json({ error: `Teklif '${q.status}' durumunda.` }, 409)
  if (!UUID.test(String(b.document_id || ''))) return json({ error: 'Islak imzalı sözleşme belgesini seçin.' }, 400)
  const { data: doc } = await db.from('documents').select('id,customer_id,type,file_url').eq('id', String(b.document_id)).maybeSingle()
  if (!doc || doc.customer_id !== q.customer_id || doc.type !== 'sozlesme' || !doc.file_url) return json({ error: "Belge bu müşteriye ait 'Sözleşme' türünde yüklenmiş dosya olmalı." }, 422)
  const { data: tpl } = await db.from('contract_templates').select('*').eq('active', true).maybeSingle()
  if (!tpl) return json({ error: 'Etkin sözleşme şablonu yok.' }, 409)
  const { data: c } = await db.from('customers').select('*').eq('id', q.customer_id).single()
  const errs = partyErrors(q.party_type, { title: c.title, contact: c.contact, tc: c.tc, tax_no: c.tax_no, tax_office: c.tax_office, address: c.address, city: c.city, district: c.district })
  if (errs.length) return json({ error: `Müşteri kaydında eksik: ${errs.join(', ')}` }, 422)
  let text: string
  try { text = renderContract(tpl.body_md, contractVars(q, c)) } catch (e) { return json({ error: String((e as Error).message) }, 422) }
  const sha = await sha256Hex(text)
  const evidence = { method: 'ıslak_imza', staff: uid, document_id: doc.id, template: tpl.version, at: new Date().toISOString() }
  const { data, error } = await db.rpc('quote_accept', { p_quote: q.id, p_token_hash: q.token_hash, p_template: tpl.version, p_text: text, p_sha: sha, p_method: 'ıslak_imza', p_evidence: evidence, p_party: {} })
  if (error) return json({ error: error.message }, 500)
  return json(data)
}

async function addressDoc(db: Db, q: Record<string, any>, b: Record<string, any>, uid: string) {
  const v = String(b.value || '')
  if (!['yüklendi', 'gerekmiyor', 'bekliyor'].includes(v)) return json({ error: 'Değer geçersiz.' }, 400)
  const note = String(b.note || '').trim().slice(0, 500)
  if (v === 'gerekmiyor' && note.length < 5) return json({ error: "'Gerekmiyor' için gerekçe yazın." }, 400)
  if (v === 'yüklendi') {
    const { count } = await db.from('documents').select('id', { count: 'exact', head: true }).eq('customer_id', q.customer_id).eq('type', 'isyeri_kullanim')
    if (!count) return json({ error: "Önce müşteriye 'İşyeri/Adres Kullanım Belgesi' türünde imzalı belgeyi yükleyin." }, 422)
  }
  const { error } = await db.from('quotes').update({ address_doc: v, address_doc_note: note || null, address_doc_by: uid, address_doc_at: new Date().toISOString() }).eq('id', q.id)
  if (error) return json({ error: error.message }, 500)
  const r = await runQuotePipeline(db, q.id, ORIGIN)
  return json({ state: v, pipeline: r })
}

Deno.serve(async (req) => {
  if (!ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const origin = req.headers.get('origin') || ''
  if (origin && origin !== ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  const user = await staffUser(req)
  if (!user) return json({ error: 'Personel yetkisi gerekli' }, 403)
  try {
    const b = await req.json().catch(() => ({}))
    const db = serviceDb()
    if (b.action === 'create') return await create(db, b, user.id)
    const q = await loadQuote(db, b.quote_id)
    if (!q) return json({ error: 'Teklif bulunamadı.' }, 404)
    if (b.action === 'send') return await send(db, q)
    if (b.action === 'cancel') return await cancel(db, q)
    if (b.action === 'accept_manual') return await acceptManual(db, q, b, user.id)
    if (b.action === 'address_doc') return await addressDoc(db, q, b, user.id)
    if (b.action === 'pay_link') {
      if (q.status !== 'kabul' || !q.invoice_id) return json({ error: 'Önce teklif kabul edilmeli.' }, 409)
      const env = paytrLinkEnv()
      if (!env) return json({ state: 'kapalı', message: 'PayTR link kurulumu tamamlanmadı.' }, 503)
      const out = await createInvoiceLink(db, q.invoice_id, env, b.renew === true)
      return json(out.body, out.status)
    }
    if (b.action === 'sync') return json(await runQuotePipeline(db, q.id, ORIGIN))
    return json({ error: 'bilinmeyen action' }, 400)
  } catch (e) {
    console.error('quote-staff:', (e as Error)?.message || e)
    return json({ error: 'İşlem tamamlanamadı.' }, 500)
  }
})
