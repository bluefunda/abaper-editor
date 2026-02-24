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
      // LOCAL: through KrakenD (8083) — user authenticates via Keycloak, JWT is validated by gateway
      // NOAUTH: bypass everything, go directly to abaper-ts (8085)
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
      // AI routes: Agent + LLM chat streaming
      // In LOCAL mode: /ai/agent + /ai/chats/* → BFF (8084) → abaper-mcp / cai-llm-router
      // In production: everything → abaper.bluefunda.com/ai/* → abaper-gw → abaper-bff
      '/ai/agent/github': {
        target: isLocal || noAuth ? 'http://localhost:8020' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: isLocal || noAuth ? (p) => p.replace(/^\/ai\/agent\/github/, '') : undefined,
      },
      // In LOCAL mode: /ai/agent and /ai/chats/* route through BFF (8084), no rewrite needed
      // BFF handles routing to abaper-mcp and cai-llm-router internally
      '/ai/agent': {
        target: isLocal ? 'http://localhost:8084' : noAuth ? 'http://localhost:8015' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal && !noAuth,
        rewrite: noAuth ? (p) => p.replace(/^\/ai\/agent/, '') : undefined,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/ai': {
        target: isLocal ? 'http://localhost:8084' : 'https://abaper.bluefunda.com',
        changeOrigin: true,
        secure: !isLocal,
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
