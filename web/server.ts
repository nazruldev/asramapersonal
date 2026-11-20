/**
 * Dev/production static host for the web app.
 * Business data lives in client SQLite (jeep-sqlite / Capacitor) + Turso sync — not here.
 */
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const PORT = Number(process.env.PORT) || 5180;
const publicDir = path.resolve(__dirname, 'public');
const app = express();
const isProduction =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

/** Jangan SPA-fallback untuk aset berkekstensi (wasm/js/css/…). */
function isAssetPath(urlPath: string): boolean {
  return /\.[a-z0-9]+$/i.test(urlPath.split('?')[0] ?? '');
}

async function setupServer() {
  // Serve public/ dulu agar /sql-wasm.wasm tidak ketimpa index.html
  app.use(
    express.static(publicDir, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        }
      },
    })
  );

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error('Production build missing. Run: npm run build');
      process.exit(1);
    }
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
        },
      })
    );
    app.get(/.*/, (req, res, next) => {
      if (isAssetPath(req.path)) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Production server on http://0.0.0.0:${PORT}`);
    });
    return;
  }

  const httpServer = createServer(app);
  const vite = await createViteServer({
    root: __dirname,
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    if (isAssetPath(req.path)) return next();
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Dev server on http://0.0.0.0:${PORT}`);
  });
}

void setupServer();
