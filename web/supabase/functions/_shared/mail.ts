// Resend ile e-posta. Fail-closed: RESEND_API_KEY yoksa gönderilmez, çağıran 'kurulum yok' olarak raporlar.
//   supabase secrets set RESEND_API_KEY=... MAIL_FROM="GANU <info@ganu.com.tr>" MAIL_REPLY_TO=info@ganu.com.tr
import type { Mail } from './quote.ts'

export const mailReady = () => !!(Deno.env.get('RESEND_API_KEY') || '').trim()

export async function sendMail(to: string, mail: Mail, idempotencyKey = ''): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = (Deno.env.get('RESEND_API_KEY') || '').trim()
  if (!key) return { ok: false, error: 'E-posta servisi kurulmadı (RESEND_API_KEY yok).' }
  const from = Deno.env.get('MAIL_FROM') || 'GANU <info@ganu.com.tr>'
  const replyTo = Deno.env.get('MAIL_REPLY_TO') || 'info@ganu.com.tr'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}) },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `E-posta gönderilemedi (${res.status}): ${String(data?.message || data?.name || '').slice(0, 160)}` }
    return { ok: true, id: String(data?.id || '') }
  } catch (e) {
    return { ok: false, error: `E-posta servisine ulaşılamadı: ${String((e as Error)?.message || e).slice(0, 120)}` }
  }
}
