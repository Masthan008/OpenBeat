import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The development extension's id, pinned by its manifest `key`
// (web/extension/dev-key/). Read at build time so the page can message it.
function devExtensionId(): string {
  try {
    return readFileSync(new URL('../extension/dev-key/extension-id.txt', import.meta.url), 'utf8').trim();
  } catch {
    return '';
  }
}

function ytDevProxyPlugin(): Plugin {
  return {
    name: 'api-yt-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/yt')) return next();
        try {
          const subpath = req.url.replace(/^\/api\/yt/, '') || '/';
          const isSaavn = subpath.startsWith('/saavn');
          const actualSubpath = isSaavn ? subpath.replace(/^\/saavn/, '') : subpath;
          const targetHost = isSaavn
            ? 'https://www.jiosaavn.com'
            : actualSubpath.startsWith('/s/player') || actualSubpath.startsWith('/sw.js_data')
              ? 'https://www.youtube.com'
              : 'https://music.youtube.com';

          const targetUrl = new URL(actualSubpath, targetHost);
          const headers = new Headers();
          headers.set('Origin', isSaavn ? 'https://www.jiosaavn.com' : 'https://music.youtube.com');
          headers.set('Referer', isSaavn ? 'https://www.jiosaavn.com/' : 'https://music.youtube.com/');
          headers.set(
            'User-Agent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          );

          let body: Uint8Array | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            body = new Uint8Array(Buffer.concat(chunks));
            if (req.headers['content-type']) headers.set('Content-Type', req.headers['content-type'] as string);
          }

          const response = await fetch(targetUrl.toString(), {
            method: req.method,
            headers,
            body: body as any,
          });

          res.statusCode = response.status;
          response.headers.forEach((val, key) => {
            if (key !== 'content-encoding') res.setHeader(key, val);
          });
          res.setHeader('Access-Control-Allow-Origin', '*');
          const arrayBuf = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuf));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: process.env.OPENTUNE_WEB_BASE || '/',
  plugins: [react(), tailwindcss(), ytDevProxyPlugin()],
  define: {
    DEV_EXTENSION_ID: JSON.stringify(devExtensionId()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The extension's externally_connectable and DNR rules name this origin
    // exactly, so the port must not drift to 5174 when 5173 is busy.
    port: 5173,
    strictPort: true,
  },
});
