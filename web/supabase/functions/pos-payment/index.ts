// ============================================================
// GANU · Sanal POS (kredi kartı tahsilatı) Edge Function (Deno)
// ------------------------------------------------------------
// Kredi kartı tahsilatı GİB/BDDK uyumlu bir SANAL POS sağlayıcısı
// (PayTR / iyzico) üzerinden yapılır. Kart bilgisi ASLA GANU
// sunucusuna/DB'sine yazılmaz; kullanıcı sağlayıcının 3D Secure
// ekranında kartını girer. Bu fonksiyon:
//   action=init      → ödeme oturumu başlatır (iframe/redirect döner)
//   action=callback  → sağlayıcıdan gelen sonucu doğrular, DB'yi günceller
//
// GÜVENLİK (P0.3):
//   • TUTAR İSTEMCİDEN ALINMAZ — sunucu package_id + izinli indirim
//     kodundan fiyatı kendisi hesaplar (aşağıda CATALOG/DISCOUNTS).
//   • Sipariş DB'ye yazılmadan ödeme oturumu (token) üretilmez.
//   • Callback'te sağlayıcı tutarı ve para birimi kayıtlı siparişle
//     karşılaştırılır; uyuşmazlık güvenlik olayı olarak loglanır.
//   • Callback idempotenttir: sonuçlanmış sipariş tekrar işlenmez.
//   • CORS yalnız SITE_URL origin'ine açıktır.
//
// Gizli anahtarlar ASLA istemciye konmaz — Supabase secrets:
//   supabase secrets set PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=...
//   supabase secrets set IYZICO_API_KEY=... IYZICO_SECRET=... IYZICO_BASE=https://api.iyzipay.com
//   supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   supabase secrets set SITE_URL=https://tgfmalimusavirlik.com/ganu
//
// Dağıtım:  supabase functions deploy pos-payment --no-verify-jwt
//   (--no-verify-jwt: anon müşteri ve sağlayıcı callback'i çağırabilsin diye)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

type InitBody = {
  provider?: string
  customer_id?: string
  package_id?: string
  code?: string
  email?: string
  name?: string
  phone?: string
  ip?: string
  purchase_token?: string
}

// ============================================================
// SUNUCU TARAFI FİYAT KATALOĞU (P0.3)
// İstemci fiyatı asla belirlemez. packages/discount_codes tabloları tek gerçek
// kaynaktır; katalog sorgusu başarısızsa sabit fallback olmadan fail-closed durur.
// ============================================================
const CURRENCY = 'TL'

type Db = ReturnType<typeof admin>
type Order = { amount: number; list: number; pct: number; code: string; price_version: number }

// P0.2/P0.3: fiyat YALNIZ DB kataloğundan (tek gerçek kaynak). SABİT FALLBACK YOK.
// Katalog/indirim sorgusu hata verirse ödeme FAIL-CLOSED durur.
//
// STAGING HATA ENJEKSİYONU (fail-closed kapısını KANITLAMAK için):
//   secret POS_TEST_FAULT=catalog|discount → ilgili sorgu GERÇEKTEN hata verir
//   (var olmayan tablo) ve if(pErr/dErr) dalı çalışır → 5xx, sipariş 0, PayTR 0.
//   ⚠️ YALNIZ PAYTR_TEST_MODE=1 iken aktiftir; production'da (test_mode=0) ASLA
//   tetiklenmez. Test bitince secret'ı kaldır.
async function computeOrder(db: Db, packageId: string, code: string): Promise<Order> {
  const fault = (Deno.env.get('PAYTR_TEST_MODE') === '1') ? (Deno.env.get('POS_TEST_FAULT') || '') : ''
  const pkgTable   = fault === 'catalog'  ? '__ganu_fault_no_such_table__' : 'packages'
  const discTable  = fault === 'discount' ? '__ganu_fault_no_such_table__' : 'discount_codes'

  const { data: pkg, error: pErr } = await db.from(pkgTable)
    .select('list_amount, price_version, is_custom, active').eq('id', packageId).maybeSingle()
  if (pErr) throw new Error('Fiyat kataloğu okunamadı — ödeme durduruldu (fail-closed).')
  if (!pkg) throw new Error('Geçersiz paket.')
  if (pkg.is_custom) throw new Error('Bu paket özel tekliftir; online ödeme alınmaz.')
  if (!pkg.active) throw new Error('Paket aktif değil.')
  const list = Number(pkg.list_amount) || 0
  const priceVersion = Number(pkg.price_version) || 1
  if (!(list > 0)) throw new Error('Geçersiz paket fiyatı.')

  // İndirim: yalnız DB (gizli kodlar). Sorgu hatası → fail-closed.
  const norm = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  let pct = 0
  if (norm) {
    const { data: dc, error: dErr } = await db.from(discTable)
      .select('pct, active').eq('code', norm).maybeSingle()
    if (dErr) throw new Error('İndirim kodu doğrulanamadı — ödeme durduruldu (fail-closed).')
    if (dc && dc.active) pct = Number(dc.pct) || 0
    // bilinmeyen/pasif kod → indirim uygulanmaz (ödeme durmaz; kod opsiyoneldir)
  }
  const amount = Math.round(list * (100 - pct)) / 100
  return { amount, list, pct, code: pct ? norm : '', price_version: priceVersion }
}

// ---- yardımcılar ----
const enc = new TextEncoder()
const dec = new TextDecoder()
const unb64u = (s: string) => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)), c => c.charCodeAt(0))

type Purchase = { v:number; sid:string; cid:string; pkg:string; amt:number; pv:number; disc:string; exp:number }
class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
async function verifyPurchase(db: Db, raw: string): Promise<{ purchase: Purchase; order: Order }> {
  const secret = Deno.env.get('PURCHASE_FLOW_SECRET') || ''
  if (secret.length < 32) throw new Error('PURCHASE_FLOW_SECRET eksik/geçersiz.')
  const [body, sig, extra] = String(raw || '').split('.')
  if (!body || !sig || extra) throw new HttpError(400,'purchase token geçersiz.')
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['verify'])
  try { if (!await crypto.subtle.verify('HMAC', key, unb64u(sig), enc.encode(body))) throw new Error() }
  catch { throw new HttpError(400,'purchase token geçersiz.') }
  let p:Purchase
  try { p=JSON.parse(dec.decode(unb64u(body))) as Purchase } catch { throw new HttpError(400,'purchase token geçersiz.') }
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if(p.v!==1||!uuid.test(String(p.sid))||!uuid.test(String(p.cid))||typeof p.pkg!=='string'||typeof p.disc!=='string'||!Number.isFinite(Number(p.amt))||!Number.isInteger(Number(p.pv))||!Number.isFinite(Number(p.exp)))throw new HttpError(400,'purchase token geçersiz.')
  if (Date.now() >= Number(p.exp) * 1000) throw new HttpError(400,'purchase token süresi dolmuş.')
  const { data:s, error } = await db.from('purchase_sessions')
    .select('id,customer_id,package_id,amount,price_version,discount_code,expires_at,claimed_at,use_kind,customers!inner(status)')
    .eq('id',p.sid).eq('customer_id',p.cid).maybeSingle()
  if(error)throw new Error('Satın alma oturumu DB sorgusu başarısız.')
  const linked=Array.isArray(s?.customers)?s.customers[0]:s?.customers
  if (!s || linked?.status !== 'aday' || s.claimed_at || (s.use_kind&&s.use_kind!=='pos') || Date.now() >= new Date(s.expires_at).getTime()) throw new HttpError(409,'satın alma oturumu kullanılamaz.')
  if (s.package_id !== p.pkg || Number(s.amount) !== Number(p.amt) || Number(s.price_version) !== Number(p.pv) || (s.discount_code || '') !== (p.disc || '')) throw new HttpError(400,'satın alma oturumu uyuşmuyor.')
  const order = await computeOrder(db, p.pkg, p.disc || '')
  if (order.amount !== Number(p.amt) || order.price_version !== Number(p.pv) || order.code !== (p.disc || '')) throw new Error('fiyat/token uyuşmuyor; ödeme durduruldu.')
  return { purchase:p, order }
}

// P0.5/#5: İstemci IP'sini GÜVENİLİR proxy başlığından al; body.ip'ye güvenme.
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0].trim()
  if (!/^([0-9a-f:.]{3,45})$/i.test(first)) throw new Error('Güvenilir istemci IP başlığı yok.')
  return first
}

async function hmacSha256B64(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY secret eksik.')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Not: sipariş/müşteri güncellemesi ve güvenlik logu artık pos_settle RPC'si
// (0001_pricing_catalog.sql) içinde ATOMİK yapılır — burada ayrı helper yok.

// ============================================================
// PayTR — iframe token akışı (deterministik HMAC)
// https://dev.paytr.com/iframe-api
// ============================================================
async function paytrInit(b: InitBody, verified: { purchase: Purchase; order: Order }) {
  const merchant_id = Deno.env.get('PAYTR_MERCHANT_ID')
  const merchant_key = Deno.env.get('PAYTR_MERCHANT_KEY')
  const merchant_salt = Deno.env.get('PAYTR_MERCHANT_SALT')
  if (!merchant_id || !merchant_key || !merchant_salt) {
    throw new Error('PayTR secrets eksik (MERCHANT_ID/KEY/SALT).')
  }
  const site = SITE
  // P0.3: tutar SUNUCUDA (DB kataloğundan) hesaplanır; istemci tutarı yok sayılır.
  const db = admin()
  const { amount, pct, list, code, price_version } = verified.order
  b.customer_id = verified.purchase.cid; b.package_id = verified.purchase.pkg
  const amountKurus = Math.round(amount * 100)
  if (amountKurus <= 0) throw new Error('Geçersiz tutar.')

  const merchant_oid = `GANU${Date.now()}${Math.floor(Math.random() * 1000)}`
  const { data: started, error: startErr } = await db.rpc('purchase_start_pos', {
    p_session: verified.purchase.sid, p_customer: verified.purchase.cid, p_merchant_oid: merchant_oid,
    p_amount: amount, p_package: verified.purchase.pkg, p_provider: 'paytr', p_price_version: price_version,
    p_list_amount: list, p_discount_code: code, p_discount_pct: pct, p_currency: CURRENCY,
  })
  if (startErr || !started) throw new Error('POS siparişi atomik başlatılamadı.')
  if (started.state === 'ready') return { provider:'paytr', mode:'iframe', token:started.provider_token, iframe_url:started.provider_url, merchant_oid:started.merchant_oid, amount:Number(started.amount) }
  if (started.state === 'in_progress') throw new Error('Ödeme başlatma işlemi sürüyor; kısa süre sonra tekrar deneyin.')
  if (started.state !== 'new') throw new Error('Ödeme başlatma sonucu belirsiz; güvenlik için tekrar denenmedi. Destekle iletişime geçin.')
  const activeOid = String(started.merchant_oid || merchant_oid)
  const user_ip = b.ip || '0.0.0.0'
  const email = b.email || 'musteri@ganu.com.tr'
  const basket = btoa(JSON.stringify([[`GANU ${b.package_id}${pct ? ` (-%${pct})` : ''}`, amount.toFixed(2), 1]]))
  const no_installment = 0
  const max_installment = 0
  const currency = CURRENCY
  const test_mode = Deno.env.get('PAYTR_TEST_MODE') || '0'

  // PayTR imzası: merchant_id + user_ip + merchant_oid + email + amount + basket
  //   + no_installment + max_installment + currency + test_mode → HMAC(key)+salt
  const hashStr = `${merchant_id}${user_ip}${activeOid}${email}${amountKurus}${basket}${no_installment}${max_installment}${currency}${test_mode}`
  const paytr_token = await hmacSha256B64(merchant_key, hashStr + merchant_salt)

  const form = new URLSearchParams({
    merchant_id, user_ip, merchant_oid: activeOid, email,
    payment_amount: String(amountKurus),
    paytr_token,
    user_basket: basket,
    debug_on: '1', no_installment: String(no_installment), max_installment: String(max_installment),
    user_name: b.name || 'GANU Müşteri',
    user_address: 'GANU Sanal Ofis',
    user_phone: b.phone || '0000000000',
    merchant_ok_url: `${site}/#/satin-al?paid=1`,
    merchant_fail_url: `${site}/#/satin-al?paid=0`,
    timeout_limit: '30', currency, test_mode,
  })

  let res: Response
  try { res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form }) }
  catch (e) {
    await db.rpc('purchase_finish_pos_init',{p_merchant_oid:activeOid,p_outcome:'ambiguous',p_provider_token:'',p_provider_url:''})
    throw new Error('PayTR bağlantı sonucu belirsiz; otomatik tekrar yapılmadı.')
  }
  const out = await res.json().catch(() => null)
  if (!out) {
    await db.rpc('purchase_finish_pos_init',{p_merchant_oid:activeOid,p_outcome:'ambiguous',p_provider_token:'',p_provider_url:''})
    throw new Error('PayTR yanıtı belirsiz; otomatik tekrar yapılmadı.')
  }
  if (out.status !== 'success' || !out.token) {
    const { data:released,error:releaseErr } = await db.rpc('purchase_finish_pos_init',{p_merchant_oid:activeOid,p_outcome:'definite_failed',p_provider_token:'',p_provider_url:''})
    if (releaseErr || released!==true) throw new Error('PayTR kesin red sonrası oturum güvenle bırakılamadı; manuel inceleme gerekli.')
    throw new Error('PayTR ödeme oturumu oluşturmayı reddetti.')
  }
  const providerUrl=`https://www.paytr.com/odeme/guvenli/${out.token}`
  const { data:saved,error:saveErr }=await db.rpc('purchase_finish_pos_init',{p_merchant_oid:activeOid,p_outcome:'ready',p_provider_token:String(out.token),p_provider_url:providerUrl})
  if(saveErr||saved!==true){await db.rpc('purchase_finish_pos_init',{p_merchant_oid:activeOid,p_outcome:'ambiguous',p_provider_token:'',p_provider_url:''});throw new Error('PayTR tokenı alındı ancak güvenle kaydedilemedi; otomatik tekrar yapılmadı.')}
  return { provider: 'paytr', mode: 'iframe', token: out.token, iframe_url: providerUrl, merchant_oid:activeOid, amount }
}

// PayTR callback (form-encoded POST). Hash doğrula → tutar/currency + idempotency.
async function paytrCallback(req: Request): Promise<Response> {
  const merchant_key = Deno.env.get('PAYTR_MERCHANT_KEY')
  const merchant_salt = Deno.env.get('PAYTR_MERCHANT_SALT')
  if (!merchant_key || !merchant_salt) return new Response('config', { status: 500 })

  const form = await req.formData()
  const merchant_oid = String(form.get('merchant_oid') || '')
  const status = String(form.get('status') || '')
  const total_amount = String(form.get('total_amount') || '')
  const hash = String(form.get('hash') || '')

  // PayTR callback imzası: merchant_oid + merchant_salt + status + total_amount → HMAC(key)
  const expected = await hmacSha256B64(merchant_key, `${merchant_oid}${merchant_salt}${status}${total_amount}`)
  if (hash !== expected) return new Response('PAYTR notification failed: bad hash', { status: 400 })

  try {
    const db = admin()
    // P0.3: sipariş + müşteri güncellemesi TEK ATOMİK RPC içinde (satır kilidi +
    // idempotency + tutar doğrulama). total_amount kuruş (integer) beklenir.
    const totalKurus = Math.round(Number(total_amount))
    const { data: result, error } = await db.rpc('pos_settle', {
      p_merchant_oid: merchant_oid,
      p_status: status,
      p_total_amount: totalKurus,
    })
    if (error) { console.error('pos_settle:', error.message); return new Response('db error', { status: 500 }) }
    // Tutar uyuşmazlığında PayTR'a başarısızlık bildir (güvenlik olayı RPC içinde yazıldı).
    if (result === 'mismatch') return new Response('PAYTR amount mismatch', { status: 400 })
    // 'ok' | 'idempotent' | 'unknown' | 'failed' → PayTR düz "OK" bekler.
  } catch (e) {
    console.error('paytr callback:', e)
    return new Response('db error', { status: 500 })
  }
  return new Response('OK', { status: 200 })
}

// ============================================================
// iyzico — 3DS/Checkout Form (yapılandırılmış placeholder)
// Hesap + API anahtarı gelince buraya gerçek imza/handshake eklenecek.
// Tutar yine computeOrder ile SUNUCUDA hesaplanmalı.
// ============================================================
async function iyzicoInit(_b: InitBody) {
  const apiKey = Deno.env.get('IYZICO_API_KEY')
  const secret = Deno.env.get('IYZICO_SECRET')
  if (!apiKey || !secret) {
    throw new Error('iyzico secrets eksik (IYZICO_API_KEY/IYZICO_SECRET). Hesap açılınca bağlanacak.')
  }
  throw new Error('iyzico entegrasyonu iskelet aşamasında — Checkout Form handshake hesap/anahtar gelince tamamlanacak.')
}

Deno.serve(async (req) => {
  if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)

  // Sağlayıcı callback'i genelde form-encoded gelir; JSON init'ten ayır.
  const ctype = req.headers.get('content-type') || ''
  if (ctype.includes('application/x-www-form-urlencoded') || ctype.includes('multipart/form-data')) {
    return await paytrCallback(req)
  }

  try {
    const body = (await req.json()) as InitBody & { action?: string }
    const action = body.action || 'init'

    if (action === 'init') {
      if (!body.purchase_token) return json({ error: 'purchase_token zorunlu' }, 400)
      body.ip = clientIp(req) // #5: istemcinin ip alanını GÜVENİLİR başlıkla ez
      const verified = await verifyPurchase(admin(), body.purchase_token)
      let result
      if (body.provider === 'paytr') result = await paytrInit(body, verified)
      else if (body.provider === 'iyzico') return json({ error: 'iyzico henüz güvenli state-machine entegrasyonuna bağlı değil' }, 503)
      else return json({ error: "provider 'paytr' veya 'iyzico' olmalı" }, 400)
      return json(result)
    }

    return json({ error: 'bilinmeyen action' }, 400)
  } catch (e) {
    console.error('pos-payment init:',(e as Error)?.message||e)
    return e instanceof HttpError ? json({status:'başarısız',error:e.message},e.status) : json({status:'başarısız',error:'Ödeme başlatılamadı.'},500)
  }
})
