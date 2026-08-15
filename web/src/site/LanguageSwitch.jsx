import { useLocation } from 'react-router-dom'
import { withBase } from '../base.js'
import { counterpartHash, publicRoute } from './routes.js'

export default function LanguageSwitch({ locale }) {
  const location=useLocation(),route=publicRoute(location.pathname)
  if(!route)return null
  // Query hiçbir koşulda taşınmaz: ref/payment token ve gelecekteki hassas parametreler dahil.
  const href=withBase(`${route.counterpart}${counterpartHash(route,location.hash)}`)
  return <a className="lang-switch" href={href} hrefLang={locale==='tr'?'en':'tr'} aria-label={locale==='tr'?'View in English':'Türkçe görüntüle'}>{locale==='tr'?'EN':'TR'}</a>
}
