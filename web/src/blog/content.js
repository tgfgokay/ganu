import { blogDocuments } from 'virtual:ganu-blog-content'
export const blogPosts=blogDocuments
export const blogPost=(locale,slug)=>blogPosts.find((post)=>post.locale===locale&&post.slug===slug)||null
export const blogIndexPath=(locale)=>locale==='tr'?'/blog':'/en/blog'
export const blogPostPath=(post)=>`${blogIndexPath(post.locale)}/${post.slug}`
export function blogCounterpart(post){
  return blogPosts.find((candidate)=>candidate.translationKey===post.translationKey&&candidate.locale!==post.locale)||null
}
export function blogRoute(pathname){
  const path=String(pathname||'/').replace(/\/+$/,'')||'/'
  if(path==='/blog'||path==='/en/blog'){
    const locale=path.startsWith('/en/')?'en':'tr'
    return {id:`blog-index-${locale}`,locale,path,counterpart:locale==='tr'?'/en/blog':'/blog',sections:[],seo:{
      title:locale==='tr'?'GANU Blog · Sanal Ofis ve Şirket Kuruluşu Rehberleri':'GANU Blog · Virtual Office and Company Guides',
      description:locale==='tr'?'Sanal ofis, yasal iş adresi ve Türkiye’de şirket kuruluşu hakkında resmî kaynaklara dayalı pratik rehberler.':'Official-source guides to virtual offices, registered addresses and company formation in Türkiye.'
    },kind:'blog-index'}
  }
  const match=path.match(/^\/(en\/)?blog\/([a-z0-9-]+)$/)
  if(!match)return null
  const post=blogPost(match[1]?'en':'tr',match[2])
  if(!post)return null
  const other=blogCounterpart(post)
  return {id:`blog-${post.locale}-${post.slug}`,locale:post.locale,path,counterpart:other?blogPostPath(other):'',sections:[],seo:{title:`${post.title} · GANU`,description:post.description},kind:'blog-article',post}
}
export function blogRoutes(){
  return ['/blog','/en/blog',...blogPosts.map(blogPostPath)].map(blogRoute)
}
