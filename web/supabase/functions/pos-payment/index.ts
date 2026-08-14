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
const ALLOW_ORIGIN = SITE ? new URL(SITE).origin : '*' // P0.3: CORS allowlist
const cors = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
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
}

// ============================================================
// SUNUCU TARAFI FİYAT KATALOĞU (P0.3)
// İstemci fiyatı asla belirlemez. İleride (P0.2) bu değerler tek bir
// DB kataloğundan (sürüm + geçerlilik tarihi ile) okunmalıdır; şimdilik
// web/src/panel/lib/store.js PACKAGE_PRICES ile elle senkron tutulur.
// ============================================================
const CATALOG: Record<string, number> = {
  'Başlangıç': 9990, // KDV dahil yıllık ₺
  'Pro': 18990,
}
const DISCOUNTS: Record<string, number> = {
  'BNINISANTASI': 10, // izinli indirim kodu → yüzde
}
const CURRENCY = 'TL'

function computeOrder(packageId: string, code: string): { amount: number; list: number; pct: number; code: string } {
  const list = CATALOG[packageId]
  if (!list || !(list > 0)) throw new Error('Geçersiz paket.')
  const norm = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  const pct = norm ? (DISCOUNTS[norm] || 0) : 0
  const amount = Math.round(list * (100 - pct)) / 100
  return { amount, list, pct, code: pct ? norm : '' }
}

// ---- yardımcılar ----
const enc = new TextEncoder()

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

// Güvenlik olayı kaydı (best-effort — security_events tablosu yoksa sessiz geç + log).
async function logSecurity(db: ReturnType<typeof admin>, kind: string, detail: unknown) {
  console.error('SECURITY', kind, JSON.stringify(detail))
  try {
    await db.from('security_events').insert({ kind, detail })
  } catch { /* tablo yoksa yut — konsola zaten yazıldı */ }
}

// Ödeme doğrulanınca müşteriyi işaretle (panel ödeme onayını tetikler).
async function markPaid(customerId: string, amount: number, pkg: string, provider: string) {
  const db = admin()
  const { error } = await db.from('customers').update({
    payment_claimed_at: new Date().toISOString(),
    payment_expected: amount,
    payment_pkg: pkg,
    payment_sender: `${provider} sanal POS`,
    payment_receipt_url: `pos:${provider}`,
  }).eq('id', customerId)
  if (error) throw new Error('DB güncelleme hatası: ' + error.message)
}

// ============================================================
// PayTR — iframe token akışı (deterministik HMAC)
// https://dev.paytr.com/iframe-api
// ============================================================
async function paytrInit(b: InitBody) {
  const merchant_id = Deno.env.get('PAYTR_MERCHANT_ID')
  const merchant_key = Deno.env.get('PAYTR_MERCHANT_KEY')
  const merchant_salt = Deno.env.get('PAYTR_MERCHANT_SALT')
  if (!merchant_id || !merchant_key || !merchant_salt) {
    throw new Error('PayTR secrets eksik (MERCHANT_ID/KEY/SALT).')
  }
  const site = SITE
  // P0.3: tutar SUNUCUDA hesaplanır; istemcinin ilettiği tutar yok sayılır.
  const { amount, pct } = computeOrder(b.package_id || '', b.code || '')
  const amountKurus = Math.round(amount * 100)
  if (amountKurus <= 0) throw new Error('Geçersiz tutar.')

  const merchant_oid = `GANU${Date.now()}${Math.floor(Math.random() * 1000)}`
  const user_ip = b.ip || '0.0.0.0'
  const email = b.email || 'musteri@ganu.com.tr'
  const basket = btoa(JSON.stringify([[`GANU ${b.package_id}${pct ? ` (-%${pct})` : ''}`, amount.toFixed(2), 1]]))
  const no_installment = 0
  const max_installment = 0
  const currency = CURRENCY
  const test_mode = Deno.env.get('PAYTR_TEST_MODE') || '0'

  // P0.3: ÖNCE siparişi yaz — yazılamazsa ödeme oturumu ÜRETME.
  const db = admin()
  const { error: insErr } = await db.from('pos_orders').insert({
    merchant_oid, customer_id: b.customer_id, amount, pkg: b.package_id || null,
    provider: 'paytr', status: 'bekliyor',
  })
  if (insErr) throw new Error('Sipariş kaydı oluşturulamadı, ödeme başlatılmadı: ' + insErr.message)

  // PayTR imzası: merchant_id + user_ip + merchant_oid + email + amount + basket
  //   + no_installment + max_installment + currency + test_mode → HMAC(key)+salt
  const hashStr = `${merchant_id}${user_ip}${merchant_oid}${email}${amountKurus}${basket}${no_installment}${max_installment}${currency}${test_mode}`
  const paytr_token = await hmacSha256B64(merchant_key, hashStr + merchant_salt)

  const form = new URLSearchParams({
    merchant_id, user_ip, merchant_oid, email,
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

  const res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form })
  const out = await res.json().catch(() => null)
  if (!out || out.status !== 'success') {
    // token alınamadı → siparişi başarısız işaretle (yönlendirme üretme)
    await db.from('pos_orders').update({ status: 'başarısız' }).eq('merchant_oid', merchant_oid)
    throw new Error('PayTR token alınamadı: ' + (out?.reason || res.statusText))
  }

  return { provider: 'paytr', mode: 'iframe', token: out.token, iframe_url: `https://www.paytr.com/odeme/guvenli/${out.token}`, merchant_oid, amount }
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
    const { data: order } = await db.from('pos_orders').select('*').eq('merchant_oid', merchant_oid).single()
    // Bilinmeyen sipariş: PayTR tekrar denemesin diye OK dön, ama hiçbir işlem yapma.
    if (!order) { await logSecurity(db, 'pos_unknown_order', { merchant_oid }); return new Response('OK', { status: 200 }) }

    // IDEMPOTENCY: zaten sonuçlanmış sipariş yeniden işlenmez.
    if (order.status === 'başarılı' || order.status === 'başarısız') {
      return new Response('OK', { status: 200 })
    }

    if (status === 'success') {
      // TUTAR DOĞRULAMA (P0.3): sağlayıcı tutarı (kuruş) kayıtlı siparişle bire bir eşleşmeli.
      const expectedKurus = Math.round(Number(order.amount) * 100)
      if (String(total_amount) !== String(expectedKurus)) {
        await logSecurity(db, 'pos_amount_mismatch', { merchant_oid, expected: expectedKurus, got: total_amount })
        await db.from('pos_orders').update({ status: 'şüpheli' }).eq('merchant_oid', merchant_oid)
        return new Response('PAYTR amount mismatch', { status: 400 })
      }
      await db.from('pos_orders').update({ status: 'başarılı' }).eq('merchant_oid', merchant_oid)
      await markPaid(order.customer_id, order.amount, order.pkg || '', 'paytr')
    } else {
      await db.from('pos_orders').update({ status: 'başarısız' }).eq('merchant_oid', merchant_oid)
    }
  } catch (e) {
    console.error('paytr callback db:', e)
    return new Response('db error', { status: 500 })
  }
  // PayTR bu yanıtı BEKLER — düz "OK" gövdesi:
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
      // P0.3: yalnız customer_id + package_id (+ opsiyonel code) kabul edilir; amount YOK.
      if (!body.customer_id || !body.package_id) return json({ error: 'customer_id ve package_id zorunlu' }, 400)
      let result
      if (body.provider === 'paytr') result = await paytrInit(body)
      else if (body.provider === 'iyzico') result = await iyzicoInit(body)
      else return json({ error: "provider 'paytr' veya 'iyzico' olmalı" }, 400)
      return json(result)
    }

    return json({ error: 'bilinmeyen action' }, 400)
  } catch (e) {
    return json({ status: 'başarısız', error: String((e as Error).message || e) }, 500)
  }
})
