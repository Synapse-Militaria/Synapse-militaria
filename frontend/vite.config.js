import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Redirige /api al backend local en preview, para que npm run preview funcione igual que en Vercel.
  // Las variables VITE_* se inyectan en build time y son públicas; nunca poner secretos aquí.
  preview: { proxy: { '/api': 'http://localhost:3000' } },
})
