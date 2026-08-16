// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// GANU Panel · Bildirim gönderme Edge Function (Deno)
// ------------------------------------------------------------
// Kanallar: SMS (Netgsm), WhatsApp (Netgsm/BSP), E-posta (Resend).
// Gizli anahtarlar ASLA istemciye konmaz — Supabase secrets'ta durur:
//
//   supabase secrets set NETGSM_USER=... NETGSM_PASS=... NETGSM_HEADER=...
//   supabase secrets set RESEND_API_KEY=... MAIL_FROM="GANU <info@ganu.com.tr>"
//   supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_FROM=...
//
// Dağıtım:
//   supabase functions deploy send-notification
//
// İstek gövdesi (JSON):
//   { "channel": "sms" | "whatsapp" | "email",
//     "to": "+9053...", "message": "metin", "subject": "(email için)" }
//
// Yalnızca giriş yapmış (authenticated) personel çağırabilir; RLS
// yerine burada Authorization header doğrulanır (Supabase otomatik).
// ============================================================

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

async function isStaffRequest(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  if (!url || !anon || !authorization.toLowerCase().startsWith('bearer ')) return false
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  })
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true
}

// ---- SMS: Netgsm ----
async function sendSms(to: string, message: string) {
  const user = Deno.env.get('NETGSM_USER')
  const pass = Deno.env.get('NETGSM_PASS')
  const header = Deno.env.get('NETGSM_HEADER') // onaylı başlık
  if (!user || !pass || !header) throw new Error('Netgsm secrets eksik (NETGSM_USER/PASS/HEADER).')

  const params = new URLSearchParams({
    usercode: user, password: pass, gsmno: to.replace(/\D/g, ''),
    message, msgheader: header, dil: 'TR',
  })
  const res = await fetch('https://api.netgsm.com.tr/sms/send/get/?' + params.toString())
  const text = await res.text()
  // Netgsm başarıda "00 <bulkid>" veya "01/02..." döner; 00/01/02 = kabul
  const ok = /^0[0-2]/.test(text.trim())
  if (!ok) throw new Error('Netgsm hata: ' + text)
  return { provider: 'netgsm', raw: text.trim() }
}

// ---- WhatsApp: Netgsm/BSP (basit metin) ----
async function sendWhatsapp(to: string, message: string) {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const from = Deno.env.get('WHATSAPP_FROM')
  if (!token || !from) throw new Error('WhatsApp secrets eksik (WHATSAPP_TOKEN/FROM).')
  // Meta Cloud API biçimi (BSP'ye göre uyarlanır)
  const res = await fetch(`https://graph.facebook.com/v19.0/${from}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: message },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('WhatsApp hata: ' + JSON.stringify(data))
  return { provider: 'whatsapp', raw: data }
}

// ---- E-posta: Resend ----
async function sendEmail(to: string, subject: string, message: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM') || 'GANU <onboarding@resend.dev>'
  if (!key) throw new Error('RESEND_API_KEY eksik.')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject: subject || 'GANU Bilgilendirme',
      text: message,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('E-posta hata: ' + JSON.stringify(data))
  return { provider: 'resend', raw: data }
}

Deno.serve(async (req) => {
  if (!ALLOW_ORIGIN) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== ALLOW_ORIGIN) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  if (!(await isStaffRequest(req))) return json({ error: 'Personel yetkisi gerekli' }, 403)

  try {
    const { channel, to, message, subject } = await req.json()
    if (!channel || !to || !message) return json({ error: 'channel, to, message zorunlu' }, 400)

    let result
    if (channel === 'sms') result = await sendSms(to, message)
    else if (channel === 'whatsapp') result = await sendWhatsapp(to, message)
    else if (channel === 'email') result = await sendEmail(to, subject, message)
    else return json({ error: 'geçersiz channel' }, 400)

    return json({ status: 'gönderildi', ...result })
  } catch (e) {
    return json({ status: 'başarısız', error: String((e as Error).message || e) }, 500)
  }
})
