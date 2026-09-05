import { cp, mkdir } from 'node:fs/promises';
const target = new URL('../public/pdf-assets/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(
    new URL('../node_modules/pdfjs-dist/' + name, import.meta.url),
    new URL(name, target),
    { recursive: true },
  );
}
