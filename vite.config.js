import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * GitHub Pages has no SPA rewrite rule: any path it can't find on disk is served as 404.html.
 * Shipping a byte-copy of index.html as 404.html is what makes deep links and hard refreshes
 * (e.g. /party-cinema/dashboard) boot the app instead of showing GitHub's 404 page.
 */
function githubPagesSpaFallback() {
  let outDir

  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  // Project site lives at https://langloisgabriel03.github.io/party-cinema/
  base: '/party-cinema/',
  plugins: [react(), tailwindcss(), githubPagesSpaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
