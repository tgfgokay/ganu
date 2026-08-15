import fs from 'node:fs'
import path from 'node:path'
import MarkdownIt from 'markdown-it'

const md=new MarkdownIt({html:false,linkify:false,typographer:false})
const REQUIRED=['title','slug','locale','translationKey','description','date','updated','draft']
const OFFICIAL_HOSTS=['ticaret.gov.tr','mersis.ticaret.gov.tr','gib.gov.tr','www.gib.gov.tr','ptt.gov.tr','www.ptt.gov.tr','invest.gov.tr','www.invest.gov.tr']

function filesUnder(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>entry.isDirectory()?filesUnder(path.join(dir,entry.name)):entry.name.endsWith('.md')?[path.join(dir,entry.name)]:[])
}
function frontmatter(raw,file){
  if(!raw.startsWith('---\n'))throw new Error(`${file}: frontmatter başlangıcı eksik`)
  const end=raw.indexOf('\n---\n',4)
  if(end<0)throw new Error(`${file}: frontmatter sonu eksik`)
  const data={}
  for(const line of raw.slice(4,end).split('\n')){
    const at=line.indexOf(':')
    if(at<1)throw new Error(`${file}: geçersiz frontmatter satırı`)
    const key=line.slice(0,at).trim(),value=line.slice(at+1).trim()
    if(Object.hasOwn(data,key))throw new Error(`${file}: duplicate frontmatter: ${key}`)
    data[key]=value==='true'?true:value==='false'?false:value
  }
  return {data,body:raw.slice(end+5).trim()}
}
function parse(file){
  const {data,body}=frontmatter(fs.readFileSync(file,'utf8'),file)
  for(const key of REQUIRED)if(data[key]===''||data[key]===undefined)throw new Error(`${file}: ${key} eksik`)
  if(!['tr','en'].includes(data.locale))throw new Error(`${file}: locale tr/en olmalı`)
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.translationKey))throw new Error(`${file}: slug/translationKey geçersiz`)
  if(typeof data.draft!=='boolean')throw new Error(`${file}: draft boolean olmalı`)
  for(const key of ['date','updated'])if(!/^\d{4}-\d{2}-\d{2}$/.test(data[key])||Number.isNaN(Date.parse(`${data[key]}T00:00:00Z`)))throw new Error(`${file}: ${key} geçersiz`)
  if(data.updated<data.date)throw new Error(`${file}: updated date öncesinde olamaz`)
  if(/<\/?(?:script|iframe)\b/i.test(body)||/\]\(\s*javascript:/i.test(body))throw new Error(`${file}: yasak içerik`)
  if(data.locale==='tr'?!/hukuki, mali veya vergisel danışmanlık|hukuki, mali veya vergisel danışmanlık ve/i.test(body):!/not legal, tax or financial advice/i.test(body))throw new Error(`${file}: danışmanlık disclaimer eksik`)
  if(!data.draft&&(data.locale==='tr'?!/^## Resmî kaynaklar$/m.test(body):!/^## Official sources$/m.test(body)))throw new Error(`${file}: resmî kaynak bölümü eksik`)
  const links=[...body.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map((m)=>new URL(m[1]))
  if(links.filter((url)=>OFFICIAL_HOSTS.includes(url.hostname)).length<2)throw new Error(`${file}: en az iki resmî kaynak gerekli`)
  const tokens=md.parse(body,{})
  if(!tokens.some((token)=>token.type==='heading_open'&&token.tag==='h1'))throw new Error(`${file}: H1 eksik`)
  return {...data,tokens:JSON.parse(JSON.stringify(tokens))}
}
export function loadBlogContent(root=process.cwd()){
  const all=filesUnder(path.join(root,'content/blog')).map(parse)
  if(new Set(all.map((post)=>`${post.locale}:${post.slug}`)).size!==all.length)throw new Error('blog duplicate slug')
  const published=all.filter((post)=>!post.draft)
  const groups=new Map()
  for(const post of published){const group=groups.get(post.translationKey)||[];group.push(post);groups.set(post.translationKey,group)}
  for(const [key,group] of groups)if(group.map((post)=>post.locale).sort().join(',')!=='en,tr')throw new Error(`blog translation eksik/duplicate: ${key}`)
  return published.sort((a,b)=>b.updated.localeCompare(a.updated))
}
export function blogContentPlugin(){
  const id='\0virtual:ganu-blog-content'
  return {name:'ganu-blog-content',resolveId(source){if(source==='virtual:ganu-blog-content')return id},load(source){if(source===id)return `export const blogDocuments=Object.freeze(${JSON.stringify(loadBlogContent())})`}}
}
