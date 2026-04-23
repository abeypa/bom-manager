import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
  },
})
// cache-bust: 2026-04-23_0650