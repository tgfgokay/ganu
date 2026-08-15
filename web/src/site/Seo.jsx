import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { resolvePublicRoute } from './resolveRoute.js'
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
    document.head.querySelectorAll('script[data-ganu-jsonld]').forEach((el)=>el.remove())
    document.head.querySelectorAll('meta[property^="article:"]').forEach((el)=>el.remove())
    const route=resolvePublicRoute(location.pathname)
    if(!route){
      document.documentElement.lang='tr'
      document.head.querySelectorAll('[data-ganu-seo="1"],link[rel="alternate"],link[rel="canonical"],meta[property^="og:"],meta[name="description"],meta[name^="twitter:"]').forEach((el)=>el.remove())
      meta('robots','noindex,nofollow')
      return
    }
    document.documentElement.lang=route.locale
    document.title=route.seo.title
    meta('description',route.seo.description)
    meta('robots',route.indexable===false?'noindex,nofollow':'index,follow')
    meta('og:type',route.kind==='blog-article'?'article':'website','property');meta('og:site_name','GANU','property')
    meta('og:locale',route.locale==='tr'?'tr_TR':'en_US','property')
    meta('og:locale:alternate',route.locale==='tr'?'en_US':'tr_TR','property')
    meta('og:url',absolutePublicUrl(route.path),'property');meta('og:title',route.seo.title,'property');meta('og:description',route.seo.description,'property')
    meta('og:image',absolutePublicUrl('/og.png'),'property')
    if(route.kind==='blog-article'){meta('article:published_time',route.post.date,'property');meta('article:modified_time',route.post.updated,'property')}
    meta('twitter:card','summary_large_image');meta('twitter:title',route.seo.title);meta('twitter:description',route.seo.description)
    meta('twitter:image',absolutePublicUrl('/og.png'))
    document.head.querySelectorAll('link[rel="canonical"],link[rel="alternate"][data-ganu-seo]').forEach((el)=>el.remove())
    link('canonical',absolutePublicUrl(route.path))
    const tr=route.locale==='tr'?route.path:route.counterpart,en=route.locale==='en'?route.path:route.counterpart
    if(tr)link('alternate',absolutePublicUrl(tr),{hreflang:'tr'})
    if(en)link('alternate',absolutePublicUrl(en),{hreflang:'en'})
    if(tr)link('alternate',absolutePublicUrl(tr),{hreflang:'x-default'})
    if(route.kind==='blog-article'){
      const script=document.createElement('script');script.type='application/ld+json';script.dataset.ganuJsonld='1'
      const url=absolutePublicUrl(route.path),home=absolutePublicUrl('/'),image=absolutePublicUrl('/og.png')
      const organization={'@type':'Organization',name:'GANU',url:home}
      script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:route.post.title,description:route.post.description,datePublished:route.post.date,dateModified:route.post.updated,inLanguage:route.locale,url,mainEntityOfPage:url,image,author:organization,publisher:organization})
      document.head.appendChild(script)
    }
  },[location.pathname])
  return null
}
