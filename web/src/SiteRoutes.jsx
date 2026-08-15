import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Avukat from './Avukat.jsx'
import MaliMusavir from './MaliMusavir.jsx'
import IsOrtakligi from './IsOrtakligi.jsx'
import SegmentPage from './SegmentPage.jsx'
import Seo from './site/Seo.jsx'
import { BlogArticle, BlogIndex } from './blog/Blog.jsx'
import { tr } from './site/locales/tr.js'
import { en } from './site/locales/en.js'
import LegalPage from './legal/LegalPage.jsx'

const SatinAl=lazy(()=>import('./SatinAl.jsx'))
const PanelApp=lazy(()=>import('./panel/PanelApp.jsx'))
const MusteriPortal=lazy(()=>import('./panel/MusteriPortal.jsx'))
const OrtakPortal=lazy(()=>import('./panel/OrtakPortal.jsx'))
const loading=<main aria-busy="true" aria-label="Uygulama yükleniyor" style={{minHeight:'55vh'}}/>

export default function SiteRoutes(){
  return <>
    <Seo/>
    <Routes>
      <Route path="/" element={<App content={tr} locale="tr"/>}/>
      <Route path="/avukat" element={<Avukat/>}/>
      <Route path="/mali-musavir" element={<MaliMusavir/>}/>
      <Route path="/is-ortakligi" element={<IsOrtakligi content={tr} locale="tr"/>}/>
      <Route path="/en" element={<App content={en} locale="en"/>}/>
      <Route path="/en/lawyers" element={<SegmentPage data={en.segments.lawyers} content={en} locale="en"/>}/>
      <Route path="/en/accountants" element={<SegmentPage data={en.segments.accountants} content={en} locale="en"/>}/>
      <Route path="/en/partnership" element={<IsOrtakligi content={en} locale="en"/>}/>
      <Route path="/blog" element={<BlogIndex locale="tr"/>}/>
      <Route path="/blog/:slug" element={<BlogArticle locale="tr"/>}/>
      <Route path="/en/blog" element={<BlogIndex locale="en"/>}/>
      <Route path="/en/blog/:slug" element={<BlogArticle locale="en"/>}/>
      <Route path="/mesafeli-satis" element={<LegalPage type="distance" locale="tr"/>}/>
      <Route path="/iptal-iade" element={<LegalPage type="returns" locale="tr"/>}/>
      <Route path="/kvkk" element={<LegalPage type="privacy" locale="tr"/>}/>
      <Route path="/cerezler" element={<LegalPage type="cookies" locale="tr"/>}/>
      <Route path="/en/privacy" element={<LegalPage type="privacy" locale="en"/>}/>
      <Route path="/en/cookies" element={<LegalPage type="cookies" locale="en"/>}/>
      <Route path="/satin-al" element={<Suspense fallback={loading}><SatinAl/></Suspense>}/>
      <Route path="/panel/*" element={<Suspense fallback={loading}><PanelApp/></Suspense>}/>
      <Route path="/musteri/*" element={<Suspense fallback={loading}><MusteriPortal/></Suspense>}/>
      <Route path="/ortak/*" element={<Suspense fallback={loading}><OrtakPortal/></Suspense>}/>
    </Routes>
  </>
}
