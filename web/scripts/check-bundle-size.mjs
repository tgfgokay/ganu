import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const assets=path.resolve('dist/assets')
const files=fs.readdirSync(assets).filter((name)=>name.endsWith('.js'))
const limit=500*1024
const oversized=files.map((name)=>({name,size:fs.statSync(path.join(assets,name)).size})).filter(({size})=>size>limit)
if(oversized.length)throw new Error(`500 KiB üstü browser chunk: ${oversized.map(({name,size})=>`${name}=${size}`).join(', ')}`)
for(const prefix of ['react-vendor-','motion-vendor-','PanelApp-','SatinAl-','MusteriPortal-','OrtakPortal-']){
  if(!files.some((name)=>name.startsWith(prefix)))throw new Error(`beklenen güvenli chunk yok: ${prefix}`)
}
if(process.env.VITE_SUPABASE_URL&&!files.some((name)=>name.startsWith('supabase-vendor-')))throw new Error('Supabase env açıkken deferred supabase-vendor chunk yok')

const html=fs.readFileSync(path.resolve('dist/index.html'),'utf8')
const assetName=(url)=>path.basename(url)
const entry=[...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m)=>assetName(m[1]))
const preload=[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m)=>assetName(m[1]))
const initial=new Set([...entry,...preload]),queue=[...initial]
while(queue.length){
  const name=queue.pop(),source=fs.readFileSync(path.join(assets,name),'utf8')
  for(const match of source.matchAll(/(?:\bfrom|\bimport)["']\.\/([^"']+\.js)["']/g)){
    if(!initial.has(match[1])){initial.add(match[1]);queue.push(match[1])}
  }
}
const privatePattern=/^(?:PanelApp|SatinAl|MusteriPortal|OrtakPortal|panel|supabase-vendor)-/
if([...initial].some((name)=>privatePattern.test(name)))throw new Error(`public initial graph private chunk içeriyor: ${[...initial].join(', ')}`)
const initialStyles=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m)=>assetName(m[1]))
if(initialStyles.some((name)=>/^panel-/.test(name)))throw new Error('public entry panel CSS preload ediyor')
const initialGzip=[...initial].reduce((sum,name)=>sum+zlib.gzipSync(fs.readFileSync(path.join(assets,name))).length,0)
if(initialGzip>180*1024)throw new Error(`public initial JS gzip bütçesi aşıldı: ${initialGzip}`)
console.log(`bundle-size PASS (${files.length} JS chunk; max ${Math.max(...files.map((name)=>fs.statSync(path.join(assets,name)).size))} byte; public initial gzip ${initialGzip} byte; private preload yok)`)
