// Ödeme sonrası teklif hattı. Her adım kendi başına tekrar çağrılabilir (idempotent); hata olursa quotes.last_error'a yazılır,
// personel panelden "Devam ettir" ile yeniden çalıştırır. Dış servis çağrıları DB işleminin DIŞINDA yapılır.
//  1) e-Belge: EINVOICE_AUTO=true + EINVOICE_ENABLED + Paraşüt secret'ları varsa mevcut runEInvoice (einvoice_claim tek sahiplik); yoksa atlanır (elle kesilir).
//  2) "Ödemeniz alındı" e-postası + kabul edilmiş sözleşme metni (Resend idempotency anahtarıyla bir kez).
//  3) Aktivasyon denemesi (quote_try_activate); başarılıysa hoş geldin e-postası (bir kez).
import { parasutEnv, runEInvoice } from './einvoice-run.ts'
import { sendMail, mailReady } from './mail.ts'
import { paidMail, welcomeMail } from './quote.ts'

export type PipelineResult = { state: string; steps: string[]; missing?: string[]; error?: string }

// deno-lint-ignore no-explicit-any
export async function runQuotePipeline(db: any, quoteId: string, siteUrl: string): Promise<PipelineResult> {
  const steps: string[] = []
  const fail = async (msg: string) => { await db.from('quotes').update({ last_error: msg.slice(0, 500) }).eq('id', quoteId); return { state: 'hata', steps, error: msg } }
  const { data: q } = await db.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!q) return { state: 'yok', steps }
  if (q.status !== 'kabul' || !q.invoice_id) return { state: 'kabul_yok', steps }
  const { data: inv } = await db.from('invoices').select('id,status,amount,einvoice_status,einvoice_no,quote_id').eq('id', q.invoice_id).maybeSingle()
  if (!inv || inv.quote_id !== q.id) return fail('Teklifin faturası bulunamadı ya da başka teklife bağlı.')
  if (inv.status !== 'ödendi') {
    const a = await db.rpc('quote_try_activate', { p_quote: quoteId })
    return { state: 'ödeme_bekleniyor', steps, missing: a.data?.missing }
  }
  if (Number(inv.amount) !== Number(q.amount)) return fail('Fatura tutarı teklif tutarından farklı; aktivasyon durduruldu.')
  const { data: c } = await db.from('customers').select('*').eq('id', q.customer_id).maybeSingle()
  if (!c) return fail('Müşteri bulunamadı.')

  // 1) e-Belge
  let einvoiceNo = inv.einvoice_no || ''
  if (inv.einvoice_status !== 'kesildi') {
    const penv = Deno.env.get('EINVOICE_AUTO') === 'true' ? parasutEnv(siteUrl) : null
    if (penv) {
      const r = await runEInvoice(db, inv.id, penv).catch((e) => ({ status: 500, body: { state: 'başarısız', message: String((e as Error)?.message || e) } }))
      // deno-lint-ignore no-explicit-any
      const b = r.body as any
      steps.push(`e-Belge: ${b?.state || r.status}`)
      if (b?.einvoice_no) einvoiceNo = b.einvoice_no
    } else steps.push('e-Belge: otomatik kapalı (elle kesilecek)')
  }

  // 2) Ödeme + sözleşme e-postası. Önce gönderilir, sonra işaretlenir; eşzamanlı/yinelenen çalıştırmalarda
  //    Resend Idempotency-Key (24 saat) ikinci gönderimi engeller. Gönderim sonrası çökme → bir sonraki çalıştırmada aynı anahtarla tekrar (gitmez).
  if (!q.paid_mail_at && c.email) {
    if (!mailReady()) steps.push('ödeme e-postası: e-posta servisi kurulmadı')
    else {
      const m = await sendMail(c.email, paidMail(q, c, einvoiceNo), `quote-paid-${q.id}`)
      if (!m.ok) return fail(m.error || 'Ödeme e-postası gönderilemedi.')
      await db.from('quotes').update({ paid_mail_at: new Date().toISOString() }).eq('id', q.id).is('paid_mail_at', null)
      steps.push('ödeme e-postası gönderildi')
    }
  }

  // 3) Aktivasyon
  const a = await db.rpc('quote_try_activate', { p_quote: q.id })
  if (a.error) return fail(`Aktivasyon hatası: ${a.error.message}`)
  if (a.data?.state === 'eksik') { await db.from('quotes').update({ last_error: null }).eq('id', q.id); return { state: 'eksik', steps, missing: a.data.missing } }
  if (a.data?.state === 'aktif' || a.data?.state === 'zaten') {
    steps.push(a.data.state === 'aktif' ? 'müşteri aktif' : 'zaten aktif')
    const { data: q2 } = await db.from('quotes').select('welcome_mail_at').eq('id', q.id).maybeSingle()
    if (c.email && mailReady() && !q2?.welcome_mail_at) {
      const m = await sendMail(c.email, welcomeMail(q, c), `quote-welcome-${q.id}`)
      if (!m.ok) return fail(m.error || 'Hoş geldin e-postası gönderilemedi.')
      await db.from('quotes').update({ welcome_mail_at: new Date().toISOString() }).eq('id', q.id).is('welcome_mail_at', null)
      steps.push('hoş geldin e-postası gönderildi')
    }
    return { state: 'aktif', steps }
  }
  return { state: String(a.data?.state || 'bilinmiyor'), steps }
}
