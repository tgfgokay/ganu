import React from 'react'

const TAGS={paragraph_open:'p',heading_open:null,bullet_list_open:'ul',ordered_list_open:'ol',list_item_open:'li',blockquote_open:'blockquote'}
const CLOSE=new Set(['paragraph_close','heading_close','bullet_list_close','ordered_list_close','list_item_close','blockquote_close'])

function inline(tokens,keyPrefix){
  const root=[],stack=[root]
  const target=()=>Array.isArray(stack.at(-1))?stack.at(-1):stack.at(-1).children
  const wrap=(tag,attrs={})=>stack.push({tag,attrs,children:[]})
  const close=()=>{
    const frame=stack.pop()
    if(frame===root||!frame?.tag)throw new Error('markdown inline nesting')
    target().push(React.createElement(frame.tag,{...frame.attrs,key:`${keyPrefix}-${target().length}`},frame.children))
  }
  for(const token of tokens||[]){
    if(token.type==='text')target().push(token.content)
    else if(token.type==='softbreak'||token.type==='hardbreak')target().push(<br key={`${keyPrefix}-br-${target().length}`}/>)
    else if(token.type==='code_inline')target().push(<code key={`${keyPrefix}-code-${target().length}`}>{token.content}</code>)
    else if(token.type==='em_open')wrap('em')
    else if(token.type==='strong_open')wrap('strong')
    else if(token.type==='link_open'){
      const href=token.attrs?.find(([name])=>name==='href')?.[1]||''
      if(!/^https:\/\//.test(href))throw new Error('blog link yalnız https olabilir')
      wrap('a',{href,target:'_blank',rel:'noopener noreferrer'})
    } else if(['em_close','strong_close','link_close'].includes(token.type))close()
    else throw new Error(`desteklenmeyen markdown inline token: ${token.type}`)
  }
  if(stack.length!==1)throw new Error('markdown inline kapanış eksik')
  return root
}
export default function Markdown({tokens}){
  const root=[],stack=[{tag:null,children:root}]
  const push=(node)=>stack.at(-1).children.push(node)
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i]
    if(token.type==='inline'){stack.at(-1).children.push(...inline(token.children,`in-${i}`));continue}
    if(token.type==='text'){push(token.content);continue}
    if(token.type==='hr'){push(<hr key={`hr-${i}`}/>);continue}
    if(token.type==='fence'||token.type==='code_block'){push(<pre key={`pre-${i}`}><code>{token.content}</code></pre>);continue}
    if(token.type.endsWith('_open')){
      const tag=token.type==='heading_open'?token.tag:TAGS[token.type]
      if(!tag)throw new Error(`desteklenmeyen markdown token: ${token.type}`)
      stack.push({tag,children:[]})
      continue
    }
    if(CLOSE.has(token.type)){
      const frame=stack.pop()
      if(!frame?.tag)throw new Error('markdown block nesting')
      push(React.createElement(frame.tag,{key:`block-${i}`},frame.children))
      continue
    }
    throw new Error(`desteklenmeyen markdown token: ${token.type}`)
  }
  if(stack.length!==1)throw new Error('markdown block kapanış eksik')
  return <>{root}</>
}
