import React from 'react'

const TOKEN = /(<br\s*\/?>|<em>|<\/em>|<span class="dot">\.<\/span>)/gi

// Yalnız tasarım sisteminin dört sabit işaretini React düğümüne çevirir.
// Bilinmeyen HTML benzeri metin React tarafından düz metin olarak escape edilir.
export default function RichTitle({ value, dot=false }) {
  const nodes=[]
  let emphasized=null
  for(const part of String(value || '').split(TOKEN).filter(Boolean)){
    if(/^<br\s*\/?>$/i.test(part)){(emphasized || nodes).push(<br key={`br-${nodes.length}-${emphasized?.length||0}`}/>);continue}
    if(part.toLowerCase()==='<em>'){if(emphasized===null)emphasized=[];else emphasized.push(part);continue}
    if(part.toLowerCase()==='</em>'){
      if(emphasized!==null){nodes.push(<em key={`em-${nodes.length}`}>{emphasized}</em>);emphasized=null}else nodes.push(part)
      continue
    }
    if(part.toLowerCase()==='<span class="dot">.</span>'){(emphasized || nodes).push(<span className="dot" key={`dot-${nodes.length}`}>.</span>);continue}
    ;(emphasized || nodes).push(part)
  }
  if(emphasized!==null)nodes.push('<em>',...emphasized)
  if(dot)nodes.push(<span className="dot" key="dot-final">.</span>)
  return <>{nodes}</>
}
