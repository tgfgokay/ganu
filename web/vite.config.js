import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages alt-yol dağıtımı için base env ile verilir:
//   GANU_BASE=/ganu/ npx vite build
// Yerel geliştirme ve diğer hostlarda kök '/' kalır.
export default defineConfig({
  base: process.env.GANU_BASE || '/',
  plugins: [react()],
})
