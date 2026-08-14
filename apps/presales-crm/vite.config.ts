import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function jarvisDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'jarvis-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/jarvis-dev')) {
          next();
          return;
        }

        const baseUrl = env.JARVIS_DEV_API_BASE_URL?.trim();
        const apiKey = env.JARVIS_DEV_INTERNAL_API_KEY?.trim();
        if (!baseUrl || !apiKey) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: {
                code: 'JARVIS_DEV_NOT_CONFIGURED',
                message: 'Jarvis dev proxy is not configured',
              },
            }),
          );
          return;
        }

        const targetPath = url.replace(/^\/jarvis-dev/, '/internal/v1');
        const targetUrl = new URL(targetPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (!value || key.toLowerCase() === 'host') continue;
            if (Array.isArray(value)) {
              for (const item of value) headers.append(key, item);
            } else {
              headers.set(key, value);
            }
          }
          headers.set('Authorization', `Bearer ${apiKey}`);

          const method = req.method ?? 'GET';
          const body =
            method === 'GET' || method === 'HEAD'
              ? undefined
              : await new Promise<Buffer>((resolve, reject) => {
                  const chunks: Buffer[] = [];
                  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                  req.on('end', () => resolve(Buffer.concat(chunks)));
                  req.on('error', reject);
                });

          const upstream = await fetch(targetUrl, { method, headers, body });
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'transfer-encoding') return;
            res.setHeader(key, value);
          });
          const responseBody = Buffer.from(await upstream.arrayBuffer());
          res.end(responseBody);
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: {
                code: 'JARVIS_DEV_PROXY_FAILED',
                message: 'Jarvis dev proxy request failed',
              },
            }),
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  return {
    base: './',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@calc': path.resolve(rootDir, '../measurer'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    plugins: mode === 'development' ? [jarvisDevProxy(env)] : [],
  };
});
