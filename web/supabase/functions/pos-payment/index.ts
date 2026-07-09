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
// Gizli anahtarlar ASLA istemciye konmaz — Supabase secrets:
//   # PayTR
//   supabase secrets set PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=...
//   # iyzico
//   supabase secrets set IYZICO_API_KEY=... IYZICO_SECRET=... IYZICO_BASE=https://api.iyzipay.com
//   # DB güncellemesi için (callback ödemeyi 'aktif'e çeker)
//   supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   # Ödeme sonrası dönüş sayfası (site kökü)
//   supabase secrets set SITE_URL=https://tgfgokay.github.io/ganu
//
// Dağıtım:  supabase functions deploy pos-payment --no-verify-jwt
//   (--no-verify-jwt: anon müşteri ve sağlayıcı callback'i çağırabilsin diye)
//
// İstek gövdesi (JSON):
//   init:     { action:"init", provider:"paytr"|"iyzico",
//               customer_id, amount, pkg, email, name, phone, ip }
//   callback: sağlayıcı POST'u (PayTR form-encoded, iyzico token)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type InitBody = {
  provider?: string
  customer_id?: string
  amount?: number
  pkg?: string
  email?: string
  name?: string
  phone?: string
  ip?: string
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

// Ödeme doğrulanınca müşteriyi işaretle (panel ödeme onayını tetikler).
// Not: nihai aktivasyon (sözleşme/fatura) panelde activateAfterPayment ile
// yapılır; burada sadece "tahsil edildi" damgasını atıyoruz.
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
// PayTR — iframe token akışı (deterministik HMAC; test edilebilir)
// https://dev.paytr.com/iframe-api
// ============================================================
async function paytrInit(b: InitBody) {
  const merchant_id = Deno.env.get('PAYTR_MERCHANT_ID')
  const merchant_key = Deno.env.get('PAYTR_MERCHANT_KEY')
  const merchant_salt = Deno.env.get('PAYTR_MERCHANT_SALT')
  if (!merchant_id || !merchant_key || !merchant_salt) {
    throw new Error('PayTR secrets eksik (MERCHANT_ID/KEY/SALT).')
  }
  const site = Deno.env.get('SITE_URL') || ''
  const amount = Math.round((Number(b.amount) || 0) * 100) // kuruş
  if (amount <= 0) throw new Error('Geçersiz tutar.')

  const merchant_oid = `GANU${Date.now()}${Math.floor(Math.random() * 1000)}` // benzersiz sipariş no
  const user_ip = b.ip || '0.0.0.0'
  const email = b.email || 'musteri@ganu.com.tr'
  // sepet: tek kalem (paket)
  const basket = btoa(JSON.stringify([[`GANU ${b.pkg || 'Paket'}`, (amount / 100).toFixed(2), 1]]))
  const no_installment = 0
  const max_installment = 0
  const currency = 'TL'
  const test_mode = Deno.env.get('PAYTR_TEST_MODE') || '0'

  // PayTR imza: merchant_id + user_ip + merchant_oid + email + amount + basket
  //            + no_installment + max_installment + currency + test_mode  → HMAC(key)+salt
  const hashStr = `${merchant_id}${user_ip}${merchant_oid}${email}${amount}${basket}${no_installment}${max_installment}${currency}${test_mode}`
  const paytr_token = await hmacSha256B64(merchant_key, hashStr + merchant_salt)

  const form = new URLSearchParams({
    merchant_id, user_ip, merchant_oid, email,
    payment_amount: String(amount),
    paytr_token,
    user_basket: basket,
    debug_on: '1', no_installment: String(no_installment), max_installment: String(max_installment),
    user_name: b.name || 'GANU Müşteri',
    user_address: 'GANU Sanal Ofis',
    user_phone: b.phone || '0000000000',
    merchant_ok_url: `${site}/#/satin-al?paid=1`,
    merchant_fail_url: `${site}/#/satin-al?paid=0`,
    timeout_limit: '30', currency, test_mode,
    // callback'te müşteriyi bulmak için özel alan (PayTR merchant_oid ile geri döner):
    // merchant_oid → customer_id eşlemesini DB'de tutmak gerekir (aşağıya not).
  })

  const res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form })
  const out = await res.json().catch(() => null)
  if (!out || out.status !== 'success') {
    throw new Error('PayTR token alınamadı: ' + (out?.reason || res.statusText))
  }

  // sipariş↔müşteri eşlemesini kaydet (callback doğrulaması için)
  try {
    const db = admin()
    await db.from('pos_orders').insert({
      merchant_oid, customer_id: b.customer_id, amount: amount / 100, pkg: b.pkg || null, provider: 'paytr', status: 'bekliyor',
    })
  } catch { /* pos_orders tablosu yoksa sessiz geç — şema notuna bak */ }

  return { provider: 'paytr', mode: 'iframe', token: out.token, iframe_url: `https://www.paytr.com/odeme/guvenli/${out.token}`, merchant_oid }
}

// PayTR callback (form-encoded POST). Hash doğrula → siparişi/müşteriyi işaretle.
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
    if (order && status === 'success') {
      await db.from('pos_orders').update({ status: 'başarılı' }).eq('merchant_oid', merchant_oid)
      await markPaid(order.customer_id, order.amount, order.pkg || '', 'paytr')
    } else if (order) {
      await db.from('pos_orders').update({ status: 'başarısız' }).eq('merchant_oid', merchant_oid)
    }
  } catch (e) {
    console.error('paytr callback db:', e)
    // yine de PayTR'a OK dönmezsek tekrar dener; DB hatasında 500 dön.
    return new Response('db error', { status: 500 })
  }
  // PayTR bu yanıtı BEKLER — düz "OK" gövdesi:
  return new Response('OK', { status: 200 })
}

// ============================================================
// iyzico — 3DS/Checkout Form (yapılandırılmış placeholder)
// Hesap + API anahtarı gelince buraya gerçek imza/handshake eklenecek.
// Akış: Checkout Form initialize → token → paymentPageUrl (redirect) →
//       callback'te retrieve ile sonucu doğrula → markPaid.
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
    // Şimdilik yalnız PayTR callback form-encoded; iyzico callback JSON/token olur.
    return await paytrCallback(req)
  }

  try {
    const body = (await req.json()) as InitBody & { action?: string }
    const action = body.action || 'init'

    if (action === 'init') {
      if (!body.customer_id || !body.amount) return json({ error: 'customer_id ve amount zorunlu' }, 400)
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
