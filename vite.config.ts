import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// base './' so the static build works from any path (Netlify, Vercel, GitHub Pages, a file share).
// `npm run build:single` inlines everything into ONE html file that opens by double-click.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), ...(mode === 'single' ? [viteSingleFile()] : [])],
}))
