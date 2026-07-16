import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflare Pages sert le dossier `dist`. Les Pages Functions (functions/)
// sont déployées automatiquement à côté.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
})
