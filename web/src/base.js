// İç bağlantıları base path ile üretir.
// dev'de BASE_URL = '/', canlıda '/ganu/'. Ham <a href="/x"> alan adı köküne
// (tgfmalimusavirlik.com/x) gidip yanlış siteyi açıyordu; withBase bunu düzeltir.
// withBase('/is-ortakligi') → dev '/is-ortakligi', canlı '/ganu/is-ortakligi'
export const withBase = (p = '') => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') // '' ya da '/ganu'
  const path = String(p).replace(/^\//, '')                        // baştaki / temizle
  return `${base}/${path}`
}
