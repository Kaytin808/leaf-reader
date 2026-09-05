import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['First page', 'Second page'].map((text) => {
      const content = 'BT /F1 18 Tf 30 340 Td (' + text + ') Tj ET';
      return (
        '<< /Length ' +
        content.length +
        ' >>\nstream\n' +
        content +
        '\nendstream'
      );
    }),
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(text));
    text += i + 1 + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = Buffer.byteLength(text);
  text +=
    'xref\n0 ' +
    (objects.length + 1) +
    '\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
      .join('');
  text +=
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xref +
    '\n%%EOF';
  return new Uint8Array(Buffer.from(text));
}
test('PDF engine reads both pages and renders actual page pixels', async () => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: pdfFixture(),
    standardFontDataUrl: fileURLToPath(
      new URL('../public/pdf-assets/standard_fonts/', import.meta.url),
    ).replaceAll('\\', '/'),
  });
  try {
    const doc = await task.promise;
    assert.equal(doc.numPages, 2);
    const page = await doc.getPage(2);
    const content = await page.getTextContent();
    assert.ok(
      content.items.some((item) => 'str' in item && item.str === 'Second page'),
    );
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    const pixels = canvas.getContext('2d').getImageData(0, 0, 300, 400).data;
    assert.ok(
      pixels.some((byte, i) => i % 4 !== 3 && byte < 100),
      'Rendered page contains dark text pixels',
    );
  } finally {
    await task.destroy();
  }
});
