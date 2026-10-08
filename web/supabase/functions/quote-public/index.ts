// GANU · Teklif modülü — müşteri uçları (verify_jwt=false; yetki yalnız 256-bit teklif linki + e-posta OTP).
// Link biçimi: https://ganu.com.tr/teklif#t=<token> (token URL parçasında; sunucu loglarına ve Referer'a gitmez).
// POST JSON { action, token, ... }:
//   view        → teklif özeti (kimlik numaraları maskeli), etkin sözleşme sürümü, ödeme durumu
//   request_otp → taraf bilgileri doğrulanır, sözleşme bu bilgilerle doldurulup DÖNDÜRÜLÜR (müşteri son metni görür),
//                 kayıtlı e-postaya 6 haneli kod gider (10 dk, 5 deneme, teklif başına en çok 5 kod, 60 sn aralık)
//   accept      → kod + aynı metnin SHA-256'sı + iki ayrı onay (KVKK aydınlatma okundu, sözleşme kabul) → kabul kaydı,
//                 tahsilat satırı ve sözleşme satırı; PayTR kurulmuşsa kart linki döner, havale bilgisi her zaman döner
//   reject      → müşteri teklifi reddeder (isteğe bağlı gerekçe)
// Secret'lar: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL, QUOTE_SECRET (≥32 rastgele karakter), RESEND_API_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanParty, contractPeriod, contractVars, istanbulToday, keyedHash, maskEmail, maskId, newOtp, otpHash, partyErrors, renderContract, sha256Hex, validToken, type PartyType } from '../_shared/quote.ts'
import { mailReady, sendMail } from '../_shared/mail.ts'
import { otpMail } from '../_shared/quote.ts'
import { createInvoiceLink, paytrLinkEnv, type LinkOutcome } from '../_shared/paytr-create.ts'

const SITE = (Deno.env.get('SITE_URL') || '').replace(/\/+$/, '')
let ORIGIN = ''
try { ORIGIN = SITE ? new URL(SITE).origin : '' } catch { ORIGIN = '' }
const cors = { ...(ORIGIN ? { 'Access-Control-Allow-Origin': ORIGIN } : {}), 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
class AppError extends Error { constructor(public status: number, message: string, public code = '') { super(message) } }

// Havale bilgisi (hizmet sözleşmesi md. 4.2 / EK-1 ile aynı; web/src/panel/lib/company.js).
const BANK = Object.freeze({ bank: 'Türkiye İş Bankası', holder: 'GANU OFİS HİZMETLERİ LTD. ŞTİ.', iban: 'TR49 0006 4000 0011 0461 2155 03' })
const LIMITS = { quote_view: [60, 3600], quote_otp: [10, 3600], quote_accept: [20, 3600] } as const

function serviceDb() {
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik')
  return createClient(url, key, { auth: { persistSession: false } })
}
type Db = ReturnType<typeof serviceDb>
function secret() { const s = Deno.env.get('QUOTE_SECRET') || ''; if (s.length < 32) throw new Error('QUOTE_SECRET en az 32 karakter olmalı'); return s }
function clientIp(req: Request) { const raw = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim(); if (!/^[0-9a-f:.]{3,45}$/i.test(raw)) throw new AppError(400, 'istemci IP başlığı yok'); return raw }
async function limit(db: Db, req: Request, action: keyof typeof LIMITS) {
  const h = await keyedHash(secret(), 'quote-rate-ip', clientIp(req))
  const [n, w] = LIMITS[action]
  const { data, error } = await db.rpc('quote_rate_limit', { p_ip_hash: h, p_action: action, p_limit: n, p_window_seconds: w })
  if (error) throw new Error('rate-limit DB hatası')
  if (data !== true) throw new AppError(429, 'Çok fazla deneme. Bir süre sonra tekrar deneyin.')
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function byToken(db: Db, token: unknown) {
  if (!validToken(token)) throw new AppError(404, 'Teklif bağlantısı geçersiz.')
  const hash = await sha256Hex(String(token))
  const { data: q } = await db.from('quotes').select('*').eq('token_hash', hash).maybeSingle()
  if (!q) throw new AppError(404, 'Teklif bağlantısı geçersiz ya da yenilenmiş. Size gönderilen son e-postadaki bağlantıyı kullanın.')
  if (q.status === 'iptal') throw new AppError(410, 'Bu teklif iptal edilmiştir.')
  if (q.status === 'gönderildi' && q.valid_until < today()) {
    await db.from('quotes').update({ status: 'süresi_doldu' }).eq('id', q.id).eq('status', 'gönderildi')
    throw new AppError(410, 'Teklifin geçerlilik süresi dolmuştur. Yeni teklif için info@ganu.com.tr adresine yazın.')
  }
  if (q.status === 'süresi_doldu') throw new AppError(410, 'Teklifin geçerlilik süresi dolmuştur.')
  return { q, hash }
}
// Teklif, gönderildiği anda etkin olan şablon sürümüne sabitlenir (quote_rotate_token); müşteri hep o metni görür.
async function quoteTemplate(db: Db, q: Record<string, any>) {
  if (!q.template_version) throw new AppError(503, 'Sözleşme metni hazırlanıyor; kısa süre sonra tekrar deneyin.')
  const { data } = await db.from('contract_templates').select('version,title,body_md').eq('version', q.template_version).maybeSingle()
  if (!data) throw new AppError(503, 'Sözleşme metni bulunamadı; info@ganu.com.tr adresine yazın.')
  return data
}
function partyFrom(q: Record<string, any>, raw: Record<string, unknown>) {
  const p = cleanParty(q.party_type as PartyType, raw || {})
  const errs = partyErrors(q.party_type as PartyType, p)
  if (errs.length) throw new AppError(422, `Eksik/hatalı bilgi: ${errs.join(', ')}`, 'party')
  return p
}
async function render(db: Db, q: Record<string, any>, p: ReturnType<typeof cleanParty>) {
  const tpl = await quoteTemplate(db, q)
  const { data: c } = await db.from('customers').select('email,phone').eq('id', q.customer_id).single()
  const today = istanbulToday()
  const text = renderContract(tpl.body_md, contractVars(q, { ...p, email: c?.email, phone: c?.phone }, today))
  return { tpl, text, sha: await sha256Hex(text), email: String(c?.email || ''), period: contractPeriod(q.start_date || today, q.billing_period) }
}

async function view(db: Db, token: unknown) {
  const { q } = await byToken(db, token)
  if (!q.viewed_at) await db.from('quotes').update({ viewed_at: new Date().toISOString() }).eq('id', q.id)
  const { data: c } = await db.from('customers').select('title,contact,email,tc,tax_no,tax_office,address,city,district').eq('id', q.customer_id).single()
  let payment: Record<string, unknown> | null = null
  if (q.status === 'kabul' && q.invoice_id) {
    const { data: inv } = await db.from('invoices').select('status,payment_link,amount').eq('id', q.invoice_id).maybeSingle()
    payment = { paid: inv?.status === 'ödendi', link: inv?.status === 'ödendi' ? null : inv?.payment_link || null, amount: inv?.amount, bank: BANK, reference: q.quote_no }
  }
  const { data: tpl } = q.template_version ? await db.from('contract_templates').select('version,title').eq('version', q.template_version).maybeSingle() : { data: null }
  return json({
    quote: { quote_no: q.quote_no, status: q.status, party_type: q.party_type, planned_company: q.planned_company, package_id: q.package_id, billing_period: q.billing_period,
      list_amount: q.list_amount, discount_pct: q.discount_pct, amount: q.amount, currency: q.currency, valid_until: q.valid_until, start_date: q.start_date, accepted_at: q.accepted_at },
    customer: { title: c?.title || '', contact: c?.contact || '', email: maskEmail(c?.email), tc_masked: maskId(c?.tc), tax_no_masked: maskId(c?.tax_no), tax_office: c?.tax_office || '',
      address: c?.address || '', city: c?.city || '', district: c?.district || '' },
    contract: tpl ? { version: tpl.version, title: tpl.title } : null,
    contract_text: q.status === 'kabul' ? q.contract_text : null,
    payment,
  })
}

async function requestOtp(db: Db, b: Record<string, any>) {
  if (!mailReady()) throw new AppError(503, 'Doğrulama e-postası şu an gönderilemiyor; lütfen info@ganu.com.tr adresine yazın.')
  const { q, hash } = await byToken(db, b.token)
  if (q.status !== 'gönderildi') throw new AppError(409, q.status === 'kabul' ? 'Teklif zaten onaylanmış.' : 'Teklif onaya açık değil.')
  const p = partyFrom(q, b.party)
  const r = await render(db, q, p)
  const otp = newOtp()
  // Sayaç, 60 sn bekleme ve kodun bağlı olduğu metin özeti tek kilit altında; RPC 'ok' demezse e-posta gitmez.
  const { data, error } = await db.rpc('quote_issue_otp', { p_quote: q.id, p_token_hash: hash, p_otp_hash: await otpHash(secret(), q.id, otp), p_sha: r.sha })
  if (error) throw new Error('OTP kaydedilemedi')
  if (data === 'limit') throw new AppError(429, 'Çok fazla kod istendi. Yeni bağlantı için info@ganu.com.tr adresine yazın.')
  if (data === 'bekle') throw new AppError(429, 'Yeni kod için 1 dakika bekleyin.')
  if (data !== 'ok') throw new AppError(409, 'Teklif onaya açık değil.')
  const m = await sendMail(r.email, otpMail(q, otp))
  if (!m.ok) throw new AppError(502, 'Doğrulama kodu gönderilemedi; 1 dakika sonra tekrar deneyin.')
  return json({ state: 'kod_gönderildi', email: maskEmail(r.email), contract_version: r.tpl.version, contract_title: r.tpl.title, contract_text: r.text, sha256: r.sha })
}

async function accept(db: Db, req: Request, b: Record<string, any>) {
  if (b.kvkk_ack !== true || b.contract_ack !== true) throw new AppError(400, 'Aydınlatma metnini okuduğunuzu ve sözleşmeyi kabul ettiğinizi ayrı ayrı işaretleyin.')
  if (!/^\d{6}$/.test(String(b.otp || ''))) throw new AppError(400, '6 haneli kodu girin.')
  const { q, hash } = await byToken(db, b.token)
  if (q.status === 'kabul') return view(db, b.token)
  const p = partyFrom(q, b.party)
  const r = await render(db, q, p)
  if (r.sha !== String(b.sha256 || '')) throw new AppError(409, 'Sözleşme metni değişti (tarih ya da bilgiler güncellendi). Lütfen metni yeniden görüntüleyip yeni kod isteyin.', 'sha')
  const key = secret()
  const evidence = {
    method: 'otp_email', email: r.email, otp_verified_at: new Date().toISOString(), template: r.tpl.version, sha256: r.sha,
    kvkk_ack: true, contract_ack: true, ip_hmac: await keyedHash(key, 'quote-legal-ip', clientIp(req)),
    ua_hmac: await keyedHash(key, 'quote-legal-ua', req.headers.get('user-agent') || ''), party_type: q.party_type,
  }
  // Kod doğrulaması, kodun üretildiği metinle eşleşme ve kabul tek RPC'de, aynı satır kilidi altında.
  const { data, error } = await db.rpc('quote_accept', { p_quote: q.id, p_token_hash: hash, p_otp_hash: await otpHash(key, q.id, String(b.otp)), p_template: r.tpl.version,
    p_text: r.text, p_sha: r.sha, p_method: 'otp_email', p_evidence: evidence, p_party: p, p_start: r.period.start, p_end: r.period.end })
  if (error) throw new Error(`kabul kaydı: ${error.message}`)
  const st = data?.state
  if (st === 'hatalı') throw new AppError(400, 'Kod hatalı.')
  if (st === 'süre') throw new AppError(400, 'Kodun süresi doldu; yeni kod isteyin.')
  if (st === 'kilit') throw new AppError(429, 'Çok fazla hatalı deneme; yeni kod isteyin.')
  if (st === 'metin') throw new AppError(409, 'Kod, ekranda gördüğünüzden farklı bilgilerle istenmiş. Yeni kod isteyin.', 'sha')
  if (st === 'süresi_doldu') throw new AppError(410, 'Teklifin süresi dolmuş.')
  if (st !== 'kabul' && st !== 'zaten') throw new AppError(409, 'Teklif onaylanamadı.')
  let link: string | null = null, linkStatus = 'kapalı'
  const env = paytrLinkEnv()
  if (env && data.invoice_id) {
    const out = await createInvoiceLink(db, data.invoice_id, env).catch((e): LinkOutcome => ({ status: 500, body: { state: 'başarısız', message: String((e as Error)?.message || e) } }))
    link = out.body.link || null
    linkStatus = link ? 'hazır' : 'başarısız'
    if (!link) await db.from('quotes').update({ last_error: `Kart linki üretilemedi: ${out.body.message || out.status}`.slice(0, 500) }).eq('id', q.id)
  }
  return json({ state: 'kabul', payment: { paid: false, link, link_status: linkStatus, amount: q.amount, bank: BANK, reference: q.quote_no } })
}

async function reject(db: Db, b: Record<string, any>) {
  const { q, hash } = await byToken(db, b.token)
  if (q.status !== 'gönderildi') throw new AppError(409, 'Teklif bu durumda reddedilemez.')
  await db.from('quotes').update({ status: 'reddedildi', rejected_at: new Date().toISOString(), reject_reason: String(b.reason || '').trim().slice(0, 500) || null, otp_hash: null })
    .eq('id', q.id).eq('token_hash', hash).eq('status', 'gönderildi')
  return json({ state: 'reddedildi' })
}

Deno.serve(async (req) => {
  if (!ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const origin = req.headers.get('origin') || ''
  if (origin && origin !== ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  try {
    secret()
    const db = serviceDb()
    const b = await req.json().catch(() => ({}))
    if (b.action === 'view') { await limit(db, req, 'quote_view'); return await view(db, b.token) }
    if (b.action === 'request_otp') { await limit(db, req, 'quote_otp'); return await requestOtp(db, b) }
    if (b.action === 'accept') { await limit(db, req, 'quote_accept'); return await accept(db, req, b) }
    if (b.action === 'reject') { await limit(db, req, 'quote_accept'); return await reject(db, b) }
    return json({ error: 'bilinmeyen action' }, 400)
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status)
    console.error('quote-public:', (e as Error)?.message || e)
    return json({ error: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' }, 500)
  }
})
