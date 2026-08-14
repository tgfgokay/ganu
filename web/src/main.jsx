import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Avukat from './Avukat.jsx'
import MaliMusavir from './MaliMusavir.jsx'
import IsOrtakligi from './IsOrtakligi.jsx'
import SatinAl from './SatinAl.jsx'
import PanelApp from './panel/PanelApp.jsx'
import MusteriPortal from './panel/MusteriPortal.jsx'
import OrtakPortal from './panel/OrtakPortal.jsx'
import { loadCatalog } from './panel/lib/store.js'
import SegmentPage from './SegmentPage.jsx'
import Seo from './site/Seo.jsx'
import { tr } from './site/locales/tr.js'
import { en } from './site/locales/en.js'
import './index.css'

// P0.2/#7: Supabase bağlıysa fiyat kataloğunu tek gerçek kaynaktan yükle.
// Bileşenler onCatalog ile yüklenince güncellenir. (Yerel modda no-op.)
loadCatalog()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <Seo />
      <Routes>
        <Route path="/" element={<App content={tr} locale="tr"/>} />
        <Route path="/avukat" element={<Avukat />} />
        <Route path="/mali-musavir" element={<MaliMusavir />} />
        <Route path="/is-ortakligi" element={<IsOrtakligi content={tr} locale="tr"/>} />
        <Route path="/en" element={<App content={en} locale="en"/>} />
        <Route path="/en/lawyers" element={<SegmentPage data={en.segments.lawyers} content={en} locale="en"/>} />
        <Route path="/en/accountants" element={<SegmentPage data={en.segments.accountants} content={en} locale="en"/>} />
        <Route path="/en/partnership" element={<IsOrtakligi content={en} locale="en"/>} />
        <Route path="/satin-al" element={<SatinAl />} />
        <Route path="/panel/*" element={<PanelApp />} />
        <Route path="/musteri/*" element={<MusteriPortal />} />
        <Route path="/ortak/*" element={<OrtakPortal />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
