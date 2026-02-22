import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// LOCAL=1 npm run dev   → proxy to local stack (gateway + MCP)
// NOAUTH=1 npm run dev  → proxy SAP endpoints directly to abaper-ts, GitHub through production
// npm run dev            → proxy through production
const isLocal = !!process.env.LOCAL;
const noAuth = !!process.env.NOAUTH;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // GitHub API routes → local Go backend in dev, production otherwise
      '/api/v1/github': {
        target: isLocal || noAuth ? 'http://localhost:8086' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
      },
      // SAP/ADT API routes
      '/api': {
        target: noAuth ? 'http://localhost:8085' : isLocal ? 'http://localhost:8083' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: isLocal && !noAuth ? (p) => `/abaper${p}` : undefined,
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
        target: noAuth ? 'http://localhost:8085' : isLocal ? 'http://localhost:8083' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: isLocal && !noAuth ? (p) => `/abaper${p}` : undefined,
      },
      // AI (Convo AI) streaming → local ai-gw or production via abaper.bluefunda.com/ai
      '/ai': {
        target: isLocal ? 'http://localhost:8081' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
        rewrite: isLocal
          ? (p: string) => p.replace(/^\/ai/, '')
          : undefined,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[ai-proxy] ${req.method} ${req.url} → ${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[ai-proxy] ${req.url} ← ${proxyRes.statusCode}`);
            if (proxyRes.headers['content-type']?.includes('text/event-stream') ||
                proxyRes.headers['content-type']?.includes('application/x-ndjson')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/mcp/abaper': {
        target: isLocal || noAuth ? 'http://localhost:8015' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: isLocal || noAuth ? (p) => p.replace(/^\/mcp\/abaper/, '') : undefined,
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
        target: isLocal || noAuth ? 'http://localhost:8020' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: isLocal || noAuth ? (p) => p.replace(/^\/mcp\/github/, '') : undefined,
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
          markdown: ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
        },
      },
    },
  },
});
