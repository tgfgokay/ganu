import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Avukat from './Avukat.jsx'
import MaliMusavir from './MaliMusavir.jsx'
import IsOrtakligi from './IsOrtakligi.jsx'
import PanelApp from './panel/PanelApp.jsx'
import MusteriPortal from './panel/MusteriPortal.jsx'
import OrtakPortal from './panel/OrtakPortal.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/avukat" element={<Avukat />} />
        <Route path="/mali-musavir" element={<MaliMusavir />} />
        <Route path="/is-ortakligi" element={<IsOrtakligi />} />
        <Route path="/panel/*" element={<PanelApp />} />
        <Route path="/musteri/*" element={<MusteriPortal />} />
        <Route path="/ortak/*" element={<OrtakPortal />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
