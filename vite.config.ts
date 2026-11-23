import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dipublikasikan di https://<user>.github.io/cafe-stock/ (GitHub Pages)
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/cafe-stock/' : '/',
}))
