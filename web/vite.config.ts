import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlJsWasm = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.js');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    root: __dirname,
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // sql-wasm-browser.js tidak punya ESM default export → blank page
        'sql.js': sqlJsWasm,
      },
    },
    optimizeDeps: {
      exclude: ['jeep-sqlite'],
      include: ['sql.js'],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    assetsInclude: ['**/*.wasm'],
    server: {
      port: Number(env.PORT) || 5180,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
