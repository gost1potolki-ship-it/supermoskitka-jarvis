import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api/yandex-gpt': {
        target: 'https://llm.api.cloud.yandex.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/yandex-gpt/, ''),
      },
      '/api/yandex-stt': {
        target: 'https://stt.api.cloud.yandex.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/yandex-stt/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('[YandexSTT Proxy] →', req.method, proxyReq.path);
            const outAuth = proxyReq.getHeader('authorization') || proxyReq.getHeader('Authorization');
            console.log('[YandexSTT Proxy] Outgoing Auth header:', outAuth ? String(outAuth).slice(0, 12) + '***' + String(outAuth).slice(-6) : 'MISSING!');
            console.log('[YandexSTT Proxy] Content-Length:', req.headers['content-length'] || 'unknown');
          });
          proxy.on('proxyRes', (proxyRes) => {
            console.log('[YandexSTT Proxy] ←', proxyRes.statusCode, proxyRes.statusMessage);
            if (proxyRes.statusCode !== 200) {
              let body = '';
              proxyRes.on('data', (chunk: Buffer) => { body += chunk.toString(); });
              proxyRes.on('end', () => {
                console.log('[YandexSTT Proxy] Error body:', body.slice(0, 500));
              });
            }
          });
          proxy.on('error', (err) => {
            console.error('[YandexSTT Proxy] ERROR:', err.message);
          });
        }
      },
      '/api/tochka': {
        target: 'https://enter.tochka.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tochka/, ''),
      }
    }
  }
});