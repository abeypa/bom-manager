import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

// Get git hash for version display
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch (e) {
    return 'unknown'
  }
}

const getGitCommitDate = () => {
  try {
    return execSync('git log -1 --date=short --pretty=format:%cd').toString().trim()
  } catch (e) {
    return new Date().toISOString().slice(0, 10)
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/openrouter': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor';
            if (id.includes('@supabase/supabase-js')) return 'supabase';
            if (id.includes('lucide-react') || id.includes('@dnd-kit/core') || id.includes('@dnd-kit/sortable')) return 'ui';
          }
        }
      }
    }
  },
  define: {
    // Forces a unique build hash every time — prevents Cloudflare build cache reuse
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __CACHE_BUST__: JSON.stringify('v3.2_2026-04-23_0649'),
    __GIT_HASH__: JSON.stringify(getGitHash()),
    __GIT_COMMIT_DATE__: JSON.stringify(getGitCommitDate()),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
// cache-bust: 2026-04-23_0650
