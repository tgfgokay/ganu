// GANU · Günlük otomatik e-Belge (Deno Edge Function)
// ------------------------------------------------------------
// Yedek iş: ödeme gelince e-Belge panelden ("Ödendi (elle)" › hemen kes) ya da PayTR bildiriminden anında kesilir;
// kaçan olursa GitHub Actions (einvoice-daily) her sabah bu fonksiyonu çağırır. Adaylar sunucuda einvoice_auto_candidates
// (0016) ile seçilir: ödenmiş (son 7 gün), e-Belgesi hiç denenmemiş, müşterinin fatura bilgileri tam.
// Her aday issue-einvoice ile aynı akıştan (../_shared/einvoice-run.ts, einvoice_claim tek sahiplik) sırayla kesilir.
//
// Güvenlik: verify_jwt (anon anahtar) + x-cron-secret başlığı (EINVOICE_CRON_SECRET, en az 32 karakter).
// Fail-closed: EINVOICE_AUTO_DAILY=true değilse belge kesilmez (dry_run yalnız aday listesini döner);
// EINVOICE_ENABLED ya da Paraşüt secret'ları eksikse 503.
//   supabase secrets set EINVOICE_CRON_SECRET=... EINVOICE_AUTO_DAILY=true
// Dağıtım: supabase functions deploy auto-einvoice

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parasutEnv, runEInvoice } from '../_shared/einvoice-run.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  const expected = (Deno.env.get('EINVOICE_CRON_SECRET') || '').trim()
  if (expected.length < 32) return json({ error: 'EINVOICE_CRON_SECRET tanımlı değil' }, 503)
  if (!sameSecret(req.headers.get('x-cron-secret') || '', expected)) return json({ error: 'Yetkisiz' }, 401)

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dry_run === true
  const day = DAY.test(String(body?.day || '')) ? String(body.day) : null
  const url = Deno.env.get('SUPABASE_URL') || '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY eksik' }, 500)
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: candidates, error } = await db.rpc('einvoice_auto_candidates', { p_day: day, p_limit: 10 })
  if (error) return json({ error: `Aday listesi alınamadı: ${error.message}` }, 500)
  const list = (candidates || []) as { invoice_id: string; customer_title: string; amount: number; issue_date: string }[]
  // Yanıt GitHub Actions kaydına düşer (repo herkese açık): müşteri adı ve tutar yazılmaz.
  const summary = list.map((c) => ({ invoice_id: c.invoice_id, issue_date: c.issue_date }))

  if (dryRun) return json({ mode: 'dry_run', count: list.length, candidates: summary })
  if (Deno.env.get('EINVOICE_AUTO_DAILY') !== 'true') return json({ mode: 'kapalı', message: 'EINVOICE_AUTO_DAILY=true değil; belge kesilmedi.', count: list.length, candidates: summary })
  let origin = 'https://ganu.com.tr'
  try { origin = new URL(Deno.env.get('SITE_URL') || origin).origin } catch { /* varsayılan */ }
  const env = parasutEnv(origin)
  if (!env) return json({ mode: 'kapalı', message: "e-Belge kurulumu tamamlanmadı (EINVOICE_ENABLED / Paraşüt secret'ları); belge kesilmedi." }, 503)

  // Sırayla: Paraşüt oran sınırı (10 istek/10 sn) parasut.ts içinde ayrıca gözetilir.
  const results: { invoice_id: string; status: number; state: unknown; einvoice_no: unknown; message: unknown }[] = []
  for (const c of list) {
    const out = await runEInvoice(db, c.invoice_id, env)
    const b = out.body as Record<string, unknown>
    results.push({ invoice_id: c.invoice_id, status: out.status, state: b.state ?? null,
      einvoice_no: b.einvoice_no ?? b.number ?? null, message: b.message ?? b.error ?? null })
  }
  const failed = results.filter((r) => r.state === 'başarısız' || r.status >= 400)
  return json({ mode: 'kesim', count: results.length, issued: results.length - failed.length, failed: failed.length, results }, failed.length ? 207 : 200)
})
