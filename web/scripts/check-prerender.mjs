import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { publicConfig } from './url-config.mjs'

const config=publicConfig(),dist=path.resolve('dist')
const {render,prerenderRoutes}=await import(`${pathToFileURL(path.resolve('dist-ssr/entry-server.js')).href}?check=${Date.now()}`)
const routes=prerenderRoutes(),expected=new Set(routes.filter((route)=>route.indexable!==false).map((route)=>config.absolute(route.path)))
const seenTitles=new Set(),seenDescriptions=new Set(),seenCanonicals=new Set()
const one=(html,re,label)=>{const matches=[...html.matchAll(re)];if(matches.length!==1)throw new Error(`${label}: ${matches.length}`);return matches[0][1]}
const attr=(tag,name)=>new RegExp(`<[^>]+\\b${name}="${tag}"[^>]+href="([^"]+)"[^>]*>`,'g')
const fileFor=(routePath)=>routePath==='/'?path.join(dist,'index.html'):path.join(dist,routePath.slice(1),'index.html')
const rootBody=(html)=>{
  const marker='<div id="root"',at=html.indexOf(marker),start=html.indexOf('>',at)+1,end=html.lastIndexOf('</div>\n  </body>')
  if(at<0||start<1||end<start)throw new Error('root sınırı bulunamadı')
  return html.slice(start,end)
}
for(const route of routes){
  const html=fs.readFileSync(fileFor(route.path),'utf8')
  const head=html.slice(0,html.indexOf('</head>'))
  const root=rootBody(html)
  if(!html.includes('<div id="root" data-prerendered>'))throw new Error(`${route.path}: JS-off görünürlük kapısı eksik`)
  if(!/<h1[ >]/.test(root)||root.length<800)throw new Error(`${route.path}: JS-off H1/body eksik`)
  if(/<\/?(?:script|iframe)\b/i.test(root)||/dangerouslySetInnerHTML/.test(root))throw new Error(`${route.path}: body tehlikeli içerik`)
  if(config.base!=='/'&&[...root.matchAll(/href="(\/[^"]*)"/g)].some((m)=>!m[1].startsWith(config.baseNoSlash+'/')))throw new Error(`${route.path}: base dışı internal link`)
  for(const [,value] of head.matchAll(/\b(?:href|src)="([^"]+)"/g)){
    if(/^(?:https?:|mailto:|tel:|data:|#)/.test(value))continue
    if(!value.startsWith(config.base))throw new Error(`${route.path}: head base dışı internal asset ${value}`)
  }
  const title=one(head,/<title>([^<]+)<\/title>/g,`${route.path} title`)
  if(seenTitles.has(title))throw new Error(`${route.path}: duplicate title`);seenTitles.add(title)
  const description=one(head,/<meta name="description" content="([^"]+)">/g,`${route.path} description`)
  if(seenDescriptions.has(description))throw new Error(`${route.path}: duplicate description`);seenDescriptions.add(description)
  const canonical=one(head,/<link rel="canonical" href="([^"]+)">/g,`${route.path} canonical`)
  if(canonical!==config.absolute(route.path)||seenCanonicals.has(canonical))throw new Error(`${route.path}: canonical`);seenCanonicals.add(canonical)
  const robots=one(head,/<meta name="robots" content="([^"]+)">/g,`${route.path} robots`)
  if(robots!==(route.indexable===false?'noindex,nofollow':'index,follow'))throw new Error(`${route.path}: robots/index status`)
  const alternate=(lang)=>[...head.matchAll(new RegExp(`<link rel="alternate" hreflang="${lang}" href="([^"]+)">`,'g'))].map((m)=>m[1])
  const tr=alternate('tr'),en=alternate('en'),xd=alternate('x-default')
  if(route.counterpart){
    const other=routes.find((candidate)=>candidate.path===route.counterpart),trUrl=route.locale==='tr'?canonical:config.absolute(other?.path),enUrl=route.locale==='en'?canonical:config.absolute(other?.path)
    if(!other||other.counterpart!==route.path||tr.length!==1||en.length!==1||xd.length!==1||tr[0]!==trUrl||en[0]!==enUrl||xd[0]!==trUrl)throw new Error(`${route.path}: hreflang reciprocal`)
  }else if(tr.length!==1||tr[0]!==canonical||xd.length!==1||xd[0]!==canonical||en.length!==0)throw new Error(`${route.path}: tek-dil hreflang`)
  const schemas=[...head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m)=>JSON.parse(m[1]))
  if(route.kind==='blog-article'){
    const schema=schemas[0],organization={'@type':'Organization',name:'GANU',url:config.absolute('/')}
    if(schemas.length!==1||schema['@type']!=='BlogPosting'||schema.url!==canonical||schema.mainEntityOfPage!==canonical||schema.datePublished!==route.post.date||schema.dateModified!==route.post.updated||schema.inLanguage!==route.locale||schema.image!==config.absolute('/og.png')||JSON.stringify(schema.author)!==JSON.stringify(organization)||JSON.stringify(schema.publisher)!==JSON.stringify(organization))throw new Error(`${route.path}: BlogPosting JSON-LD exact alanlar`)
  }else if(schemas.length!==0)throw new Error(`${route.path}: beklenmeyen JSON-LD`)
  if(render(route.path)!==root)throw new Error(`${route.path}: SSR determinism/body mismatch`)
}
const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8')
if(!sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'))throw new Error('sitemap xhtml namespace')
const actual=new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m)=>m[1]))
if(actual.size!==expected.size||[...expected].some((url)=>!actual.has(url)))throw new Error('sitemap exact route set başarısız')
const urlBlocks=[...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m)=>m[1])
if(urlBlocks.length!==expected.size)throw new Error('sitemap url block sayısı')
for(const route of routes.filter((item)=>item.indexable!==false)){
  const canonical=config.absolute(route.path),block=urlBlocks.find((value)=>value.includes(`<loc>${canonical}</loc>`))
  if(!block)throw new Error(`${route.path}: sitemap block yok`)
  const other=route.counterpart?config.absolute(route.counterpart):'',tr=route.locale==='tr'?canonical:other,en=route.locale==='en'?canonical:other
  const alternates=[...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((m)=>[m[1],m[2]])
  const wanted=[['tr',tr],['en',en],['x-default',tr]].filter(([,href])=>href)
  if(JSON.stringify(alternates)!==JSON.stringify(wanted))throw new Error(`${route.path}: sitemap reciprocal alternates`)
  const lastmods=[...block.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m)=>m[1])
  if(route.kind==='blog-article'?(lastmods.length!==1||lastmods[0]!==route.post.updated):lastmods.length!==0)throw new Error(`${route.path}: sitemap lastmod`)
}
for(const forbidden of ['/panel','/musteri','/ortak','/satin-al'])if([...actual].some((url)=>url.endsWith(forbidden)))throw new Error('private route sitemapte')
for(const route of routes.filter((item)=>item.indexable===false))if(actual.has(config.absolute(route.path)))throw new Error(`${route.path}: draft legal sitemapte`)
for(const routePath of ['/panel','/musteri','/ortak','/satin-al']){
  const html=fs.readFileSync(fileFor(routePath),'utf8')
  if(!html.includes('noindex,nofollow')||!html.includes('<div id="root"></div>'))throw new Error(`${routePath}: private shell`)
}
const robots=fs.readFileSync(path.join(dist,'robots.txt'),'utf8')
if(!robots.includes(`Sitemap: ${config.absolute('/sitemap.xml')}`))throw new Error('robots sitemap')
const robotsLines=new Set(robots.trim().split('\n'))
for(const routePath of ['/panel','/musteri','/ortak','/satin-al'])for(const suffix of ['', '/'])if(!robotsLines.has(`Disallow: ${config.path(routePath)}${suffix}`))throw new Error(`robots disallow ${routePath}${suffix}`)
const fallback=fs.readFileSync(path.join(dist,'404.html'),'utf8'),keep=config.base==='/'?0:config.base.split('/').filter(Boolean).length
if(!fallback.includes(`k=${keep}`)||!fallback.includes('noindex,nofollow'))throw new Error('base-aware 404')
const output=routes.map((route)=>fs.readFileSync(fileFor(route.path),'utf8')).join('\n')
if(/\b[1-9]\d{10}\b|\bTR\d{24}\b/.test(output))throw new Error('PII benzeri değer prerender çıktısında')
const builtOutput=fs.readdirSync(path.join(dist,'assets')).filter((name)=>name.endsWith('.js')).map((name)=>fs.readFileSync(path.join(dist,'assets',name),'utf8')).join('\n')+output+sitemap
if(/SUPABASE_SERVICE_ROLE|PAYTR_(?:MERCHANT_KEY|MERCHANT_SALT)|PURCHASE_FLOW_SECRET|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(builtOutput))throw new Error('secret outputta')
if(builtOutput.includes('DRAFT_DO_NOT_PUBLISH_8F31')||builtOutput.includes('internal-preview'))throw new Error('draft yayın çıktısında')
for(const file of ['src/blog/Blog.jsx','src/blog/Markdown.jsx'])if(fs.readFileSync(file,'utf8').includes('dangerouslySetInnerHTML'))throw new Error('blog source tehlikeli HTML renderı')
console.log(`prerender hard checks PASS (${routes.length} routes, base ${config.base})`)
