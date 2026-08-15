export const showPartnerCommercialFields = (locale) => locale === 'tr'
export const PARTNER_PROFESSIONS = ['Mali müşavir', 'Avukat', 'Marka & patent vekili', 'Şirket kuruluşu danışmanı', 'Diğer']

export function partnershipPayload(form, locale) {
  return locale === 'tr' ? { ...form } : { ...form, tax_no:'', iban:'' }
}
