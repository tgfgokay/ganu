import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { publicConfig } from './url-config.mjs'

const config=publicConfig(),dist=path.resolve('dist'),ssr=path.resolve('dist-ssr/entry-server.js'),marketing=process.env.GANU_MARKETING_ONLY==='true'
const {render,prerenderRoutes}=await import(`${pathToFileURL(ssr).href}?v=${Date.now()}`)
const routes=prerenderRoutes()
const escape=(value)=>String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const json=(value)=>JSON.stringify(value).replace(/</g,'\\u003c')
const shell=fs.readFileSync(path.join(dist,'index.html'),'utf8')

function seoHead(route){
  const canonical=config.absolute(route.path),other=route.counterpart?config.absolute(route.counterpart):''
  const tr=route.locale==='tr'?canonical:other,en=route.locale==='en'?canonical:other
  const tags=[
    `<title>${escape(route.seo.title)}</title>`,
    `<meta name="description" content="${escape(route.seo.description)}">`,
    `<meta name="robots" content="${route.indexable===false?'noindex,nofollow':'index,follow'}">`,
    `<link rel="canonical" href="${escape(canonical)}">`,
    `<meta property="og:type" content="${route.kind==='blog-article'?'article':'website'}">`,
    '<meta property="og:site_name" content="GANU">',
    `<meta property="og:locale" content="${route.locale==='tr'?'tr_TR':'en_US'}">`,
    `<meta property="og:locale:alternate" content="${route.locale==='tr'?'en_US':'tr_TR'}">`,
    `<meta property="og:url" content="${escape(canonical)}">`,
    `<meta property="og:title" content="${escape(route.seo.title)}">`,
    `<meta property="og:description" content="${escape(route.seo.description)}">`,
    `<meta property="og:image" content="${escape(config.absolute('/og.png'))}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escape(route.seo.title)}">`,
    `<meta name="twitter:description" content="${escape(route.seo.description)}">`,
    `<meta name="twitter:image" content="${escape(config.absolute('/og.png'))}">`
  ]
  if(tr)tags.splice(4,0,`<link rel="alternate" hreflang="tr" href="${escape(tr)}">`,`<link rel="alternate" hreflang="x-default" href="${escape(tr)}">`)
  if(en)tags.splice(tr?6:4,0,`<link rel="alternate" hreflang="en" href="${escape(en)}">`)
  if(route.kind==='blog-article'){
    tags.push(`<meta property="article:published_time" content="${route.post.date}">`,`<meta property="article:modified_time" content="${route.post.updated}">`)
    const organization={'@type':'Organization',name:'GANU',url:config.absolute('/')}
    tags.push(`<script type="application/ld+json" data-ganu-jsonld="1">${json({'@context':'https://schema.org','@type':'BlogPosting',headline:route.post.title,description:route.post.description,datePublished:route.post.date,dateModified:route.post.updated,inLanguage:route.locale,url:canonical,mainEntityOfPage:canonical,image:config.absolute('/og.png'),author:organization,publisher:organization})}</script>`)
  }
  return tags.join('\n    ')
}
function page(route){
  const body=render(route.path)
  return shell.replace('<html lang="tr">',`<html lang="${route.locale}">`).replace('<title>GANU</title>',seoHead(route)).replace('<div id="root"></div>',`<div id="root" data-prerendered>${body}</div>`)
}
function outFile(routePath){
  const clean=routePath.replace(/^\//,'')
  return clean?path.join(dist,clean,'index.html'):path.join(dist,'index.html')
}
for(const route of routes){
  if(!route?.path||!route?.seo?.title)throw new Error(`prerender route geçersiz: ${route?.path}`)
  const file=outFile(route.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,page(route))
}

const privateShell=shell.replace('<title>GANU</title>','<title>GANU · Güvenli uygulama</title>\n    <meta name="robots" content="noindex,nofollow">')
if(!marketing)for(const routePath of ['/satin-al','/panel','/musteri','/ortak']){
  const file=outFile(routePath);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,privateShell)
}

const indexedRoutes=routes.filter((route)=>route.indexable!==false)
const sitemap=indexedRoutes.map((route)=>{
  const canonical=config.absolute(route.path),other=route.counterpart?config.absolute(route.counterpart):''
  const tr=route.locale==='tr'?canonical:other,en=route.locale==='en'?canonical:other
  const alternates=[['tr',tr],['en',en],['x-default',tr]].filter(([,href])=>href).map(([lang,href])=>`<xhtml:link rel="alternate" hreflang="${lang}" href="${escape(href)}"/>`).join('')
  const lastmod=route.post?`<lastmod>${route.post.updated}</lastmod>`:''
  return `  <url><loc>${escape(canonical)}</loc>${alternates}${lastmod}</url>`
}).join('\n')
fs.writeFileSync(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap}\n</urlset>\n`)
const disallow=['/panel','/musteri','/ortak','/satin-al'].flatMap((p)=>[`Disallow: ${config.path(p)}`,`Disallow: ${config.path(p)}/`]).join('\n')
fs.writeFileSync(path.join(dist,'robots.txt'),`User-agent: *\nAllow: ${config.path('/')}\n${disallow}\nSitemap: ${config.absolute('/sitemap.xml')}\n`)

const keep=config.base==='/'?0:config.base.split('/').filter(Boolean).length
fs.writeFileSync(path.join(dist,'404.html'),`<!doctype html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>GANU</title></head>
<body><script>
(function(){var l=window.location,k=${keep},parts=l.pathname.split('/'),base=parts.slice(0,1+k).join('/')+'/';
l.replace(l.protocol+'//'+l.host+base+'?/'+parts.slice(1+k).join('/').replace(/&/g,'~and~')+(l.search?'&'+l.search.slice(1).replace(/&/g,'~and~'):'')+l.hash);})();
</script><noscript><p>Bu sayfayı açmak için JavaScript gereklidir.</p></noscript></body></html>\n`)
console.log(`prerender PASS (${routes.length} prerendered / ${indexedRoutes.length} indexed + 4 ${marketing?'closed pages':'private shells'}, base ${config.base})`)
