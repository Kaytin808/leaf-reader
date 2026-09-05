import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

const projectPath = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: projectPath('./mobile/'),
  publicDir: projectPath('./public/'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: projectPath('./mobile/link.tsx') },
      { find: /^next\/image$/, replacement: projectPath('./mobile/image.tsx') },
      // The legacy PDF bundle includes compatibility support for older WebKit.
      {
        find: /^pdfjs-dist$/,
        replacement: projectPath(
          './node_modules/pdfjs-dist/legacy/build/pdf.mjs',
        ),
      },
      {
        find: 'pdfjs-dist/build/pdf.worker.min.mjs',
        replacement: projectPath(
          './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        ),
      },
      { find: '@', replacement: projectPath('./') },
    ],
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: projectPath('./www/'),
    emptyOutDir: true,
    target: 'safari17',
    sourcemap: false,
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
