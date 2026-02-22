import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// LOCAL=1 npm run dev → proxy to local stack (gateway + MCP)
// npm run dev          → proxy through production
const isLocal = !!process.env.LOCAL;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: isLocal ? 'http://localhost:8083' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
        rewrite: isLocal ? (p) => `/abaper${p}` : undefined,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[proxy] ${req.method} ${req.url} → ${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[proxy] ${req.url} ← ${proxyRes.statusCode}`);
          });
          proxy.on('error', (err, req) => {
            console.error(`[proxy] ERROR ${req.url}: ${err.message}`);
          });
        },
      },
      '/health': {
        target: isLocal ? 'http://localhost:8083' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
        rewrite: isLocal ? (p) => `/abaper${p}` : undefined,
      },
      '/mcp/abaper': {
        target: isLocal ? 'http://localhost:8015' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
        rewrite: isLocal ? (p) => p.replace(/^\/mcp\/abaper/, '') : undefined,
        // SSE needs these to avoid buffering
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/mcp/github': {
        target: isLocal ? 'http://localhost:8020' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
        rewrite: isLocal ? (p) => p.replace(/^\/mcp\/github/, '') : undefined,
      },
    },
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          abaplint: ['@abaplint/core'],
          transpiler: ['@abaplint/transpiler'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
