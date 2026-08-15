export function publicConfig(env=process.env){
  const rawSite=env.GANU_SITE_URL||'https://ganu.com.tr'
  const parsed=new URL(rawSite)
  if(!/^https?:$/.test(parsed.protocol)||(parsed.protocol!=='https:'&&parsed.hostname!=='localhost')||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname)){
    throw new Error('GANU_SITE_URL mutlak ve credentials/query/hash/path içermeyen güvenli http(s) origin olmalı')
  }
  const base=env.GANU_BASE||'/'
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)||base.includes('//'))throw new Error('GANU_BASE / veya /alt-yol/ biçiminde olmalı')
  const baseNoSlash=base==='/'?'':base.slice(0,-1)
  const path=(pathname='/')=>{
    const clean=`/${String(pathname).replace(/^\/+|\/+$/g,'')}`
    return clean==='/'?`${baseNoSlash}/`:`${baseNoSlash}${clean}`
  }
  const absolute=(pathname='/')=>new URL(path(pathname),parsed.origin).href
  return Object.freeze({origin:parsed.origin,base,baseNoSlash,path,absolute})
}
