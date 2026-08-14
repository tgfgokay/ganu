export const showPartnerCommercialFields = (locale) => locale === 'tr'

export function partnershipPayload(form, locale) {
  return locale === 'tr' ? { ...form } : { ...form, tax_no:'', iban:'' }
}
