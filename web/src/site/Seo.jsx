import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { publicRoute } from './routes.js'
import { absolutePublicUrl } from './url.js'

function meta(property, value, propertyAttr='name') {
  let el=document.head.querySelector(`meta[${propertyAttr}="${property}"]`)
  if(!el){el=document.createElement('meta');el.setAttribute(propertyAttr,property);document.head.appendChild(el)}
  el.setAttribute('content',value);el.dataset.ganuSeo='1'
}
function link(rel, href, attrs={}) {
  const el=document.createElement('link');el.rel=rel;el.href=href
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));el.dataset.ganuSeo='1';document.head.appendChild(el)
}
export default function Seo() {
  const location=useLocation()
  useEffect(()=>{
    const route=publicRoute(location.pathname)
    if(!route){
      document.documentElement.lang='tr'
      document.head.querySelectorAll('[data-ganu-seo="1"],link[rel="alternate"],link[rel="canonical"],meta[property^="og:"],meta[name="description"],meta[name^="twitter:"]').forEach((el)=>el.remove())
      meta('robots','noindex,nofollow')
      return
    }
    document.documentElement.lang=route.locale
    document.title=route.seo.title
    meta('description',route.seo.description)
    meta('robots','index,follow')
    meta('og:type','website','property');meta('og:site_name','GANU','property')
    meta('og:locale',route.locale==='tr'?'tr_TR':'en_US','property')
    meta('og:locale:alternate',route.locale==='tr'?'en_US':'tr_TR','property')
    meta('og:url',absolutePublicUrl(route.path),'property');meta('og:title',route.seo.title,'property');meta('og:description',route.seo.description,'property')
    meta('og:image',absolutePublicUrl('/og.png'),'property')
    meta('twitter:card','summary_large_image');meta('twitter:title',route.seo.title);meta('twitter:description',route.seo.description)
    meta('twitter:image',absolutePublicUrl('/og.png'))
    document.head.querySelectorAll('link[rel="canonical"],link[rel="alternate"][data-ganu-seo]').forEach((el)=>el.remove())
    link('canonical',absolutePublicUrl(route.path))
    const tr=route.locale==='tr'?route.path:route.counterpart,en=route.locale==='en'?route.path:route.counterpart
    link('alternate',absolutePublicUrl(tr),{hreflang:'tr'});link('alternate',absolutePublicUrl(en),{hreflang:'en'});link('alternate',absolutePublicUrl(tr),{hreflang:'x-default'})
  },[location.pathname])
  return null
}
