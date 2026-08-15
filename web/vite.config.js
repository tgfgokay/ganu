import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { publicConfig } from './scripts/url-config.mjs'
import { blogContentPlugin } from './scripts/blog-content.mjs'
import { readLegalIdentity } from './scripts/legal-config.mjs'
const config=publicConfig()

// GitHub Pages alt-yol dağıtımı için base env ile verilir:
//   GANU_BASE=/ganu/ npx vite build
// Yerel geliştirme ve diğer hostlarda kök '/' kalır.
export default defineConfig(({ isSsrBuild })=>({
  base: config.base,
  plugins: [blogContentPlugin(),react()],
  define: {
    __GANU_SITE_URL__: JSON.stringify(config.origin),
    __GANU_LEGAL_IDENTITY__: JSON.stringify(readLegalIdentity()),
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
