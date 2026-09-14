import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000/',
});
for (const key of [
  'window',
  'document',
  'DOMParser',
  'XMLSerializer',
  'Node',
  'NodeFilter',
  'Element',
  'XPathResult',
] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === 'window' ? dom.window : dom.window[key],
    configurable: true,
  });
}

async function fixture() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">engine-anchor</dc:identifier><dc:title>Anchor fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-13T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
  );
  zip.file(
    'OEBPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1 id="chapter-heading">CHAPTER</h1><p id="passage">Before the lantern dimmed, the navigator recorded this exact sentence for recovery and then continued onward.</p></body></html>',
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

test('real EPUB CFI captures and recovers the same text-quote anchor', async () => {
  const [{ Book }, { prepareEpub }, anchors] = await Promise.all([
    import('epubjs'),
    import('../lib/book-files'),
    import('../lib/reader-engine/epub-text-anchor'),
  ]);
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(await prepareEpub(await fixture()), 'binary');
    await book.ready;
    const section = book.section(0);
    await Promise.resolve(section.load(book.load.bind(book)));
    const text = section.document.querySelector('#passage')!.firstChild!;
    const range = section.document.createRange();
    // A CFI can legally point at the whitespace just before a word. Capture
    // must advance to readable text so the quote remains searchable.
    range.setStart(text, 30);
    range.collapse(true);
    const cfi = section.cfiFromRange(range);

    const captured = await anchors.captureEpubTextAnchor(book, cfi);
    assert.match(captured.quote.exact, /^navigator recorded/);
    assert.equal(
      await anchors.verifyEpubTextAnchor(book, cfi, captured.quote),
      true,
    );

    const recovered = await anchors.recoverEpubCfi(
      book,
      captured.spineHref,
      captured.quote,
    );
    assert.ok(recovered?.startsWith('epubcfi('));
    assert.equal(
      await anchors.verifyEpubTextAnchor(book, recovered!, captured.quote),
      true,
    );
  } finally {
    book.destroy();
  }
});

test('chapter-boundary CFI skips a short heading and captures readable text', async () => {
  const [{ Book }, { prepareEpub }, anchors] = await Promise.all([
    import('epubjs'),
    import('../lib/book-files'),
    import('../lib/reader-engine/epub-text-anchor'),
  ]);
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(await prepareEpub(await fixture()), 'binary');
    await book.ready;
    const section = book.section(0);
    await Promise.resolve(section.load(book.load.bind(book)));
    const heading = section.document.querySelector('#chapter-heading')!;
    const range = section.document.createRange();
    range.setStart(heading, 0);
    range.collapse(true);
    const cfi = section.cfiFromRange(range);

    const captured = await anchors.captureEpubTextAnchor(book, cfi);
    assert.match(captured.quote.exact, /^Before the lantern dimmed/);
    assert.equal(
      await anchors.verifyEpubTextAnchor(book, cfi, captured.quote),
      true,
    );
  } finally {
    book.destroy();
  }
});
