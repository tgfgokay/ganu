// Yalnız service-role Edge istemcisi kullanır; 0018 yoksa RPC hatasıyla kapalı kalır.
import type { PaymentStore } from '../issue-einvoice/parasut.ts'

// deno-lint-ignore no-explicit-any
export function paymentStore(db: any): PaymentStore {
  const fail = (error: { message: string } | null) => { if (error) throw new Error(`Tahsilat sahipliği kaydedilemedi: ${error.message}`) }
  return {
    async claimPayment(id, parasutId, amount) {
      const { data, error } = await db.rpc('parasut_payment_claim', { p_invoice: id, p_parasut_id: parasutId, p_amount: amount })
      fail(error)
      return (data as string | null) || null
    },
    async completePayment(id, token) {
      const { error } = await db.rpc('parasut_payment_complete', { p_invoice: id, p_token: token }); fail(error)
    },
    async releasePayment(id, token) {
      const { error } = await db.rpc('parasut_payment_release', { p_invoice: id, p_token: token }); fail(error)
    },
  }
}
