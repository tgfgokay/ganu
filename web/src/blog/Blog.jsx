import { useParams } from 'react-router-dom'
import GanuMark from '../GanuMark.jsx'
import { withBase } from '../base.js'
import Markdown from './Markdown.jsx'
import { blogCounterpart, blogIndexPath, blogPost, blogPostPath, blogPosts } from './content.js'
import LegalLinks from '../legal/LegalLinks.jsx'

const copy={
  tr:{label:'Bilgi Merkezi',title:'Sanal ofis ve şirket kuruluşu rehberleri',lead:'Resmî kaynaklara dayalı, ihtiyatlı ve uygulamaya dönük yazılar.',read:'Yazıyı oku',updated:'Güncellendi',back:'Tüm yazılar',lang:'Read in English',contact:'Sorunuz için bize yazın'},
  en:{label:'Knowledge centre',title:'Virtual office and company-formation guides',lead:'Practical, cautious guidance based on official sources.',read:'Read article',updated:'Updated',back:'All articles',lang:'Türkçe okuyun',contact:'Contact us with your question'}
}
function Header({locale,languageHref}){
  const c=copy[locale]
  return <header className="blog-mast"><a href={withBase(locale==='tr'?'/':'/en')} aria-label="GANU"><GanuMark/></a><nav><a href={withBase(blogIndexPath(locale))}>{c.back}</a>{languageHref&&<a className="lang-switch" href={withBase(languageHref)}>{locale==='tr'?'EN':'TR'}</a>}</nav></header>
}
function Footer({locale}){return <footer className="blog-footer"><span>© {new Date().getFullYear()} GANU</span><LegalLinks locale={locale} compact/><a href="mailto:info@ganu.com.tr">{copy[locale].contact}</a></footer>}
export function BlogIndex({locale}){
  const c=copy[locale],posts=blogPosts.filter((post)=>post.locale===locale)
  return <div className="blog-shell"><Header locale={locale} languageHref={blogIndexPath(locale==='tr'?'en':'tr')}/><main><section className="blog-hero"><span>{c.label}</span><h1>{c.title}</h1><p>{c.lead}</p></section><div className="blog-grid">{posts.map((post)=><article className="blog-card" key={post.slug}><time dateTime={post.updated}>{c.updated}: {post.updated}</time><h2><a href={withBase(blogPostPath(post))}>{post.title}</a></h2><p>{post.description}</p><a href={withBase(blogPostPath(post))}>{c.read} →</a></article>)}</div></main><Footer locale={locale}/></div>
}
export function BlogArticle({locale}){
  const {slug}=useParams(),post=blogPost(locale,slug)
  if(!post)return <div className="blog-shell"><Header locale={locale}/><main className="blog-missing"><h1>{locale==='tr'?'Yazı bulunamadı':'Article not found'}</h1></main><Footer locale={locale}/></div>
  const other=blogCounterpart(post),c=copy[locale]
  return <div className="blog-shell"><Header locale={locale} languageHref={other?blogPostPath(other):''}/><main><article className="blog-article"><div className="blog-article-meta"><a href={withBase(blogIndexPath(locale))}>← {c.back}</a><time dateTime={post.updated}>{c.updated}: {post.updated}</time></div><Markdown tokens={post.tokens}/></article></main><Footer locale={locale}/></div>
}
