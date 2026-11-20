const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5180';
/** Port tetap agar origin (localStorage + sync Turso) tidak berubah tiap buka app. */
const STATIC_PORT = Number(process.env.ELECTRON_STATIC_PORT) || 5188;

/** @type {import('http').Server | null} */
let staticServer = null;

function createStaticServer(distDir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json',
          '.wasm': 'application/wasm',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.sqlite': 'application/octet-stream',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        // Port terpakai (instance lama): coba port berikutnya agar app tetap bisa dibuka.
        const next = port + 1;
        if (next > port + 20) {
          reject(err);
          return;
        }
        server.close(() => {
          createStaticServer(distDir, next).then(resolve, reject);
        });
        return;
      }
      reject(err);
    });
  });
}

function waitForDevServer(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let left = attempts;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        left -= 1;
        if (left <= 0) {
          reject(new Error(`Dev server belum siap di ${url}. Jalankan npm run dev.`));
          return;
        }
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'AsramaPersonal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Persist partition antar jendela; origin tetap ditentukan host+port.
      partition: 'persist:asramapersonal',
    },
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await waitForDevServer(DEV_URL);
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const distDir = path.join(__dirname, '..', 'web', 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      throw new Error('web/dist belum ada. Jalankan npm run build dulu.');
    }
    const { server, port } = await createStaticServer(distDir, STATIC_PORT);
    staticServer = server;
    await win.loadURL(`http://127.0.0.1:${port}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) {
      if (wins[0].isMinimized()) wins[0].restore();
      wins[0].focus();
    }
  });

  app.whenReady().then(() => {
    void createWindow().catch((err) => {
      console.error(err);
      app.quit();
    });
    setupAutoUpdate();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });
}

function setupAutoUpdate() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update tersedia',
        message: `Versi ${info.version} sudah diunduh.`,
        detail: 'Restart aplikasi sekarang untuk menginstal update?',
        buttons: ['Restart sekarang', 'Nanti'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err);
  });
  void autoUpdater.checkForUpdates();
}

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
