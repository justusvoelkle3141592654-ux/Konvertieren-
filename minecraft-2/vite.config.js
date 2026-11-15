import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const localAssetsDir = path.join(projectRoot, 'local-assets');

const MIME = {
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the locally extracted Minecraft assets (local-assets/, never committed)
 * during `vite dev`, and copies them into dist/ on `vite build`.
 */
function localAssetsPlugin() {
  return {
    name: 'minecraft2-local-assets',
    configureServer(server) {
      server.middlewares.use('/local-assets', (req, res) => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const target = path.resolve(localAssetsDir, '.' + path.posix.normalize('/' + urlPath));
        const inside = target === localAssetsDir || target.startsWith(localAssetsDir + path.sep);
        if (!inside || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
          // Explicit 404 so the SPA fallback never answers with index.html.
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(target).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(localAssetsDir)) return;
      const outDir = path.join(projectRoot, 'dist', 'local-assets');
      fs.cpSync(localAssetsDir, outDir, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [localAssetsPlugin()],
  base: './',
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
