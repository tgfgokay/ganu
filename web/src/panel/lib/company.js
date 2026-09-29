// Havale/EFT ile tahsilat hesabı — hizmet sözleşmesi md. 4.2 ve EK-1'deki hesapla aynıdır.
// Müşteriye verilmek üzere açık bilgidir; yalnız personel panelinde gösterilir.
export const PAYMENT_ACCOUNT = Object.freeze({
  bank: 'Türkiye İş Bankası',
  holder: 'GANU OFİS HİZMETLERİ LTD. ŞTİ.',
  iban: 'TR49 0006 4000 0011 0461 2155 03',
})

const tl = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR') : '')

// Müşteriye WhatsApp/e-posta ile gönderilecek hazır ödeme metni.
export function paymentMessage(invoice, customer) {
  const who = customer?.title || ''
  const note = invoice?.note ? ` (${invoice.note})` : ''
  const due = invoice?.due_date ? `, son ödeme tarihi ${day(invoice.due_date)}` : ''
  return [
    `Merhaba${customer?.contact ? ` ${customer.contact}` : ''},`,
    `GANU sanal ofis hizmet bedeli${note}: ${tl(invoice?.amount)} TL (KDV dahil)${due}.`,
    ...(invoice?.payment_link ? [`Kartla ödemek için: ${invoice.payment_link}`] : []),
    invoice?.payment_link
      ? `Havale/EFT ile ödemek isterseniz: ${PAYMENT_ACCOUNT.bank}, ${PAYMENT_ACCOUNT.holder}, ${PAYMENT_ACCOUNT.iban}${who ? ` (açıklama: "${who}")` : ''}.`
      : `Ödemeyi ${PAYMENT_ACCOUNT.bank}, ${PAYMENT_ACCOUNT.holder} adına ${PAYMENT_ACCOUNT.iban} IBAN'a${who ? `, açıklamaya "${who}" yazarak` : ''} yapabilirsiniz.`,
    'Teşekkür ederiz.',
  ].join('\n')
}
