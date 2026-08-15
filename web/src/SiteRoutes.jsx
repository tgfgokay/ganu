import { Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Avukat from './Avukat.jsx'
import MaliMusavir from './MaliMusavir.jsx'
import IsOrtakligi from './IsOrtakligi.jsx'
import SatinAl from './SatinAl.jsx'
import PanelApp from './panel/PanelApp.jsx'
import MusteriPortal from './panel/MusteriPortal.jsx'
import OrtakPortal from './panel/OrtakPortal.jsx'
import SegmentPage from './SegmentPage.jsx'
import Seo from './site/Seo.jsx'
import { BlogArticle, BlogIndex } from './blog/Blog.jsx'
import { tr } from './site/locales/tr.js'
import { en } from './site/locales/en.js'

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
      <Route path="/satin-al" element={<SatinAl/>}/>
      <Route path="/panel/*" element={<PanelApp/>}/>
      <Route path="/musteri/*" element={<MusteriPortal/>}/>
      <Route path="/ortak/*" element={<OrtakPortal/>}/>
    </Routes>
  </>
}
