import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { publicConfig } from './scripts/url-config.mjs'
import { blogContentPlugin } from './scripts/blog-content.mjs'
const config=publicConfig()

// GitHub Pages alt-yol dağıtımı için base env ile verilir:
//   GANU_BASE=/ganu/ npx vite build
// Yerel geliştirme ve diğer hostlarda kök '/' kalır.
export default defineConfig({
  base: config.base,
  plugins: [blogContentPlugin(),react()],
  define: { __GANU_SITE_URL__: JSON.stringify(config.origin) },
})
