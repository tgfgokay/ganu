import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { publicConfig } from './scripts/url-config.mjs'
import { blogContentPlugin } from './scripts/blog-content.mjs'
import { readLegalIdentity } from './scripts/legal-config.mjs'
import path from 'node:path'
const config=publicConfig()
const marketing=process.env.GANU_MARKETING_ONLY==='true'
const staffPanel=marketing&&process.env.GANU_STAFF_PANEL==='true'
if(marketing&&!staffPanel&&(process.env.VITE_SUPABASE_URL||process.env.VITE_SUPABASE_ANON_KEY))throw new Error('marketing-only build Supabase env kabul etmez')
if(staffPanel&&(!process.env.VITE_SUPABASE_URL||!process.env.VITE_SUPABASE_ANON_KEY))throw new Error('staff-panel build Supabase URL ve anon key gerektirir')

// GitHub Pages alt-yol dağıtımı için base env ile verilir:
//   GANU_BASE=/ganu/ npx vite build
// Yerel geliştirme ve diğer hostlarda kök '/' kalır.
export default defineConfig(({ isSsrBuild })=>({
  base: config.base,
  resolve: { alias: {
    './runtime/PrivateRoutes.jsx': path.resolve(staffPanel?'src/marketing/MarketingStaffRoutes.jsx':marketing?'src/marketing/MarketingPrivateRoutes.jsx':'src/runtime/PrivateRoutes.jsx'),
    './partnership/PartnerApply.jsx': path.resolve(marketing?'src/marketing/MarketingPartnerApply.jsx':'src/partnership/PartnerApply.jsx'),
    ...(staffPanel?{'../lib/store.js':path.resolve('src/panel/lib/operations-store.js')}:{})
  } },
  plugins: [blogContentPlugin(),react()],
  define: {
    __GANU_SITE_URL__: JSON.stringify(config.origin),
    __GANU_LEGAL_IDENTITY__: JSON.stringify(readLegalIdentity()),
    __GANU_MARKETING_ONLY__: JSON.stringify(marketing),
    __GANU_STAFF_PANEL__: JSON.stringify(staffPanel),
  },
  // SSR/prerender route-lazy chunkları korur. Yalnız browser build'inde,
  // Vite 8/Rolldown'un desteklenen codeSplitting API'siyle vendor grupları.
  build: isSsrBuild ? {} : {
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name:'react-vendor', test:/node_modules[\\\\/](?:react|react-dom|react-router|react-router-dom)[\\\\/]/, priority:50 },
            { name:'motion-vendor', test:/node_modules[\\\\/](?:framer-motion|motion-dom|motion-utils)[\\\\/]/, priority:40 },
            { name:'supabase-vendor', test:/node_modules[\\\\/](?:@supabase|iceberg-js)[\\\\/]/, priority:30 },
            { name:'vendor', test:/node_modules[\\\\/]/, maxSize:250000, priority:10 },
          ],
        },
      },
    },
  },
}))
