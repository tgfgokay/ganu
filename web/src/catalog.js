export const usingSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

const LOCAL_PACKAGES = ['Başlangıç', 'Pro', 'Kurumsal']
export const PACKAGES = usingSupabase ? [] : [...LOCAL_PACKAGES]
export const PACKAGE_MONTHLY = usingSupabase ? {} : { 'Başlangıç': 999, 'Pro': 1899 }
export const PACKAGE_PRICES = usingSupabase ? {} : { 'Başlangıç': 9990, 'Pro': 18990 }
export const PACKAGE_CUSTOM = new Set(usingSupabase ? [] : ['Kurumsal'])
const subscribers = new Set()
export function onCatalog(cb) { subscribers.add(cb); return () => subscribers.delete(cb) }
const notify = () => subscribers.forEach((cb) => { try { cb() } catch { /* subscriber isolation */ } })
let inFlight = null
let loaded = false

function failClosed() {
  loaded = false
  PACKAGES.splice(0, PACKAGES.length)
  for (const k of Object.keys(PACKAGE_PRICES)) delete PACKAGE_PRICES[k]
  for (const k of Object.keys(PACKAGE_MONTHLY)) delete PACKAGE_MONTHLY[k]
  PACKAGE_CUSTOM.clear(); notify(); return false
}

export function loadCatalog() {
  if (!usingSupabase) return false
  if (loaded) return Promise.resolve(true)
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const { supabase } = await import('./panel/lib/supabase.js')
      if (!supabase) return failClosed()
      const { data, error } = await supabase
        .from('packages').select('id,name,list_amount,monthly_amount,is_custom,active,sort')
        .eq('active', true).order('sort')
      if (error || !Array.isArray(data) || !data.length) return failClosed()
      for (const k of Object.keys(PACKAGE_PRICES)) delete PACKAGE_PRICES[k]
      for (const k of Object.keys(PACKAGE_MONTHLY)) delete PACKAGE_MONTHLY[k]
      PACKAGE_CUSTOM.clear()
      const names = []
      for (const p of data) {
        names.push(p.id)
        if (p.is_custom || !(Number(p.list_amount) > 0)) { PACKAGE_CUSTOM.add(p.id); continue }
        PACKAGE_PRICES[p.id] = Number(p.list_amount)
        if (p.monthly_amount != null) PACKAGE_MONTHLY[p.id] = Number(p.monthly_amount)
      }
      PACKAGES.splice(0, PACKAGES.length, ...names); loaded = true; notify(); return true
    } catch { return failClosed() }
    finally { inFlight = null }
  })()
  return inFlight
}
