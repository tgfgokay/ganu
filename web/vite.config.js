import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const site = process.env.GANU_SITE_URL || 'https://ganu.com.tr'
const parsed = new URL(site)
if (!/^https?:$/.test(parsed.protocol) || (parsed.protocol!=='https:' && parsed.hostname!=='localhost') || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) {
  throw new Error('GANU_SITE_URL mutlak ve credentials/query/hash içermeyen http(s) URL olmalı')
}

// GitHub Pages alt-yol dağıtımı için base env ile verilir:
//   GANU_BASE=/ganu/ npx vite build
// Yerel geliştirme ve diğer hostlarda kök '/' kalır.
export default defineConfig({
  base: process.env.GANU_BASE || '/',
  plugins: [react()],
  define: { __GANU_SITE_URL__: JSON.stringify(parsed.origin) },
})
