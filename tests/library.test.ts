import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});
for (const key of [
  'window',
  'document',
  'DOMParser',
  'XMLSerializer',
  'Node',
  'NodeFilter',
  'Element',
  'HTMLElement',
  'XPathResult',
] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === 'window' ? dom.window : dom.window[key],
    configurable: true,
  });
}
const { inspectFile, prepareEpub, splitText } =
  await import('../lib/book-files');
const {
  addBook,
  listBooks,
  getFile,
  updateBook,
  deleteBook,
  fileId,
  replaceLibrary,
} = await import('../lib/library');
const { createLibraryBackup, inspectLibraryBackup, restoreLibraryBackup } =
  await import('../lib/library-backup');
const {
  chapterIndex,
  chapterReadingStatus,
  positionForEpub,
  repairChapterLabel,
} = await import('../lib/chapters');

async function epubFixture(hostile = false) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">leaf-test</dc:identifier><dc:title>Fixture Book</dc:title><dc:creator>Leaf Tests</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-05T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="chapter-two" href="chapter-2.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/><itemref idref="chapter-two"/></spine></package>',
  );
  zip.file(
    'OEBPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml#start">Chapter one</a></li><li><a href="chapter-2.xhtml#second">Chapter two</a></li></ol></nav></body></html>',
  );
  zip.file(
    'OEBPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter one</title></head><body><h1 id="start">Chapter one</h1><p>Hello, reader. This text must be preserved.</p>' +
      (hostile
        ? '<script>alert(1)</script><iframe src="https://example.invalid"></iframe><img src="x" onerror="alert(2)"/><a href="https://example.invalid">Outside</a><a href="#start">Inside</a><form><input/></form>'
        : '') +
      '</body></html>',
  );
  zip.file(
    'OEBPS/chapter-2.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter two</title></head><body><h1 id="second">Chapter two</h1><p>The story continues on a new spine item.</p></body></html>',
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

test('imports EPUB metadata and rejects unsupported, malformed, empty and oversized files', async () => {
  const fixture = await epubFixture();
  const book = await inspectFile(new File([fixture], 'test.epub'));
  assert.equal(book.title, 'Fixture Book');
  assert.equal(book.author, 'Leaf Tests');
  assert.equal(book.format, 'epub');
  assert.equal(book.id, await fileId(fixture));
  await assert.rejects(
    inspectFile(new File(['abc'], 'book.mobi')),
    /EPUB, PDF, or TXT/,
  );
  await assert.rejects(
    inspectFile(new File(['abc'], 'broken.epub')),
    /damaged or encrypted/,
  );
  await assert.rejects(inspectFile(new File(['abc'], 'fake.pdf')), /valid PDF/);
  await assert.rejects(inspectFile(new File([], 'empty.txt')), /empty/);
  const large = new File(['x'], 'large.pdf');
  Object.defineProperty(large, 'size', { value: 101 * 1024 * 1024 });
  await assert.rejects(inspectFile(large), /100 MB/);
  const protectedZip = await JSZip.loadAsync(fixture);
  protectedZip.file(
    'META-INF/encryption.xml',
    '<encryption><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/></encryption>',
  );
  await assert.rejects(
    inspectFile(
      new File(
        [await protectedZip.generateAsync({ type: 'arraybuffer' })],
        'protected.epub',
      ),
    ),
    /DRM/,
  );
});

test('EPUB sanitation keeps text and internal links, strips active content, and blocks remote resources', async () => {
  const sanitized = await prepareEpub(await epubFixture(true));
  const zip = await JSZip.loadAsync(sanitized);
  const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
  const parsed = new dom.window.DOMParser().parseFromString(
    chapter,
    'application/xhtml+xml',
  );
  assert.equal(parsed.querySelector('parsererror'), null, chapter);
  assert.equal(
    parsed.querySelector('script,iframe,form,input,[onerror]'),
    null,
  );
  assert.ok(parsed.body.textContent?.includes('This text must be preserved.'));
  assert.equal(parsed.querySelector('a[href="https://example.invalid"]'), null);
  assert.ok(parsed.querySelector('a[href="#start"]'));
  assert.ok(
    parsed
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
      ?.includes("default-src 'none'"),
  );
});

test('EPUB engine opens a sanitized archive and generates stable CFI locations', async () => {
  const { Book } = await import('epubjs');
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(await prepareEpub(await epubFixture()), 'binary');
    await book.ready;
    assert.equal(book.packaging.metadata.title, 'Fixture Book');
    assert.equal(book.navigation.toc[0].label, 'Chapter one');
    const locations = await book.locations.generate(50);
    assert.ok(locations.length > 0);
    assert.ok(locations[0].startsWith('epubcfi('));
    const text = await book.section(0).load(book.load.bind(book));
    assert.ok(String(text.textContent).includes('Hello, reader.'));
  } finally {
    book.destroy();
  }
});

test('EPUB progress records the real table-of-contents chapter after a chapter change', async () => {
  const { Book } = await import('epubjs');
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(await prepareEpub(await epubFixture()), 'binary');
    await book.ready;
    const chapters = await chapterIndex(book);
    assert.deepEqual(
      chapters.map(({ label, spineIndex }) => ({ label, spineIndex })),
      [
        { label: 'Chapter one', spineIndex: 0 },
        { label: 'Chapter two', spineIndex: 1 },
      ],
    );
    const cfi = chapters[1].cfi;
    const position = positionForEpub(
      {
        start: {
          index: 1,
          href: 'chapter-2.xhtml',
          cfi,
          location: 10,
          percentage: 0.5,
          displayed: { page: 1, total: 2 },
        },
        end: {
          index: 1,
          href: 'chapter-2.xhtml',
          cfi,
          location: 11,
          percentage: 0.55,
          displayed: { page: 1, total: 2 },
        },
        atStart: false,
        atEnd: false,
      },
      chapters,
      2,
      cfi,
    );
    assert.equal(position.label, 'Chapter two');
    assert.equal(position.chapterHref, 'chapter-2.xhtml#second');
    // A mapper can start at body whitespace before chapter two's first text.
    const beforeHeading = 'epubcfi(' + book.section(1).cfiBase + '!/4)';
    assert.equal(
      repairChapterLabel(
        { location: beforeHeading, progress: 50, label: 'Chapter one' },
        chapters,
      ).label,
      'Chapter two',
    );
  } finally {
    book.destroy();
  }
});

test('chapter status exposes previous, next, and progress within the chapter', () => {
  const chapters = [
    {
      label: 'One',
      href: 'one',
      depth: 0,
      spineIndex: 0,
      cfi: 'epubcfi(/6/2)',
    },
    {
      label: 'Two',
      href: 'two',
      depth: 0,
      spineIndex: 2,
      cfi: 'epubcfi(/6/6)',
    },
    {
      label: 'Three',
      href: 'three',
      depth: 0,
      spineIndex: 4,
      cfi: 'epubcfi(/6/10)',
    },
  ];
  const status = chapterReadingStatus(chapters, {
    location: 'epubcfi(/6/6)',
    progress: 50,
    label: 'Two',
    chapterCfi: 'epubcfi(/6/6)',
    epubPage: { page: 2, total: 4, section: 4, sections: 6 },
  });
  assert.equal(status.index, 2);
  assert.equal(status.total, 3);
  assert.equal(status.previous?.label, 'One');
  assert.equal(status.next?.label, 'Three');
  assert.equal(status.progress, 63);
});

test('chapter status remains available when converted chapters share one file', () => {
  const sameSection = [
    {
      label: 'One',
      href: 'story.xhtml#one',
      depth: 0,
      spineIndex: 0,
      cfi: 'epubcfi(/6/2!/4/2:0)',
    },
    {
      label: 'Two',
      href: 'story.xhtml#two',
      depth: 0,
      spineIndex: 0,
      cfi: 'epubcfi(/6/2!/4/8:0)',
    },
  ];
  const status = chapterReadingStatus(sameSection, {
    location: 'epubcfi(/6/2!/4/10:0)',
    label: 'Two',
    progress: 20,
    epubPage: { page: 6, total: 10, section: 1, sections: 1 },
  });
  assert.equal(status.index, 2);
  assert.equal(status.progress, 50);
  const first = chapterReadingStatus(sameSection, {
    location: 'epubcfi(/6/2!/4/4:0)',
    label: 'One',
    progress: 10,
    epubPage: { page: 4, total: 10, section: 1, sections: 1 },
  });
  assert.equal(first.progress, 30);
});

test('EPUB chapter headings are detected when navigation is missing', async () => {
  const fixture = await JSZip.loadAsync(await epubFixture());
  const opf = await fixture.file('OEBPS/content.opf')!.async('text');
  fixture.file('OEBPS/content.opf', opf.replace(/<item id="nav"[^>]*\/>/, ''));
  fixture.remove('OEBPS/nav.xhtml');
  const { Book } = await import('epubjs');
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(
      await prepareEpub(await fixture.generateAsync({ type: 'arraybuffer' })),
      'binary',
    );
    await book.ready;
    const chapters = await chapterIndex(book);
    assert.deepEqual(
      chapters.map(({ label, spineIndex }) => ({ label, spineIndex })),
      [
        { label: 'Chapter one', spineIndex: 0 },
        { label: 'Chapter two', spineIndex: 1 },
      ],
    );
  } finally {
    book.destroy();
  }
});

test('converted EPUBs with three chapters sharing the same wrapper navigate to distinct text positions', async () => {
  const zip = await JSZip.loadAsync(await epubFixture());
  zip.file(
    'OEBPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Story</title></head><body><nav><p><a href="#wrapper">Chapter one</a></p><p><a href="#wrapper">Chapter two</a></p><p><a href="#wrapper">Chapter three</a></p></nav><div id="wrapper"><h1>Chapter one</h1><p>First chapter text.</p><h1>Chapter two</h1><p>Second chapter text.</p><h1>Chapter three</h1><p>Third chapter text.</p></div></body></html>',
  );
  zip.file(
    'OEBPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml#wrapper">Chapter one</a></li><li><a href="chapter.xhtml#wrapper">Chapter two</a></li><li><a href="chapter.xhtml#wrapper">Chapter three</a></li></ol></nav></body></html>',
  );
  const { Book } = await import('epubjs');
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(
      await prepareEpub(await zip.generateAsync({ type: 'arraybuffer' })),
      'binary',
    );
    await book.ready;
    const chapters = await chapterIndex(book);
    assert.equal(new Set(chapters.map((chapter) => chapter.cfi)).size, 3);
    for (const chapter of chapters) {
      const range = await book.getRange(chapter.cfi);
      assert.equal(range.startContainer.textContent, chapter.label);
      assert.equal(
        range.startContainer.parentElement?.tagName.toLowerCase(),
        'h1',
      );
      const restored = repairChapterLabel(
        { location: chapter.cfi, progress: 21, label: 'Chapter one' },
        chapters,
      );
      assert.equal(restored.label, chapter.label);
      assert.equal(restored.location, chapter.cfi);
      assert.equal(restored.progress, 21);
    }
    // A page can include the end of chapter one and the start of chapter two.
    // Explicit chapter navigation must keep its target, including after reopening.
    const point = (cfi: string) => ({
      index: 0,
      href: 'chapter.xhtml',
      cfi,
      location: 0,
      percentage: 0,
      displayed: { page: 2, total: 8 },
    });
    const sharedPage = {
      start: point(chapters[0].cfi),
      end: point(chapters[2].cfi),
      atStart: false,
      atEnd: false,
    };
    const second = positionForEpub(sharedPage, chapters, 2, chapters[1].cfi);
    assert.equal(second.label, 'Chapter two');
    assert.equal(repairChapterLabel(second, chapters).label, 'Chapter two');
    // Turning back clears the explicit target and uses the new visible page.
    assert.equal(positionForEpub(sharedPage, chapters, 2).label, 'Chapter one');
  } finally {
    book.destroy();
  }
});

test('a chapter spanning multiple spine files keeps its name until the next chapter', async () => {
  const zip = await JSZip.loadAsync(await epubFixture());
  zip.file(
    'OEBPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml#start">Chapter one</a></li></ol></nav></body></html>',
  );
  zip.file(
    'OEBPS/chapter-2.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Story continues</title></head><body><p>The same chapter continues on a new spine item.</p></body></html>',
  );
  const { Book } = await import('epubjs');
  const book = new Book({ replacements: 'blobUrl' });
  try {
    await book.open(
      await prepareEpub(await zip.generateAsync({ type: 'arraybuffer' })),
      'binary',
    );
    await book.ready;
    const chapters = await chapterIndex(book);
    const section = book.section(1);
    await section.load(book.load.bind(book));
    const location = section.cfiFromElement(
      section.document.querySelector('p')!,
    );
    assert.equal(
      repairChapterLabel({ location, label: '', progress: 50 }, chapters).label,
      'Chapter one',
    );
  } finally {
    book.destroy();
  }
});

test('stored file, progress and bookmarks survive new database connections, concurrent updates, and deletion', async () => {
  const file = new File(['An original test book.'], 'storage.txt', {
    type: 'text/plain',
  });
  const book = await inspectFile(file);
  await addBook(book, file);
  assert.equal(await (await getFile(book.id)).text(), await file.text());
  const position = { location: '2', progress: 50, label: 'Page 2 of 4' };
  const bookmark = { ...position, id: 'saved-place', createdAt: 1 };
  await Promise.all([
    updateBook(book.id, { position, lastRead: 2 }),
    updateBook(book.id, { bookmarks: [bookmark] }),
  ]);
  const stored = (await listBooks()).find((b) => b.id === book.id)!;
  assert.deepEqual(stored.position, position);
  assert.equal(stored.bookmarks[0].id, 'saved-place');
  assert.equal((await inspectFile(file)).id, book.id);
  await deleteBook(book.id);
  assert.equal(
    (await listBooks()).some((b) => b.id === book.id),
    false,
  );
  await assert.rejects(getFile(book.id), /missing/);
  await assert.rejects(
    updateBook(book.id, { title: 'No resurrection' }),
    /no longer/,
  );
});

test('full-library backup restores files, positions, highlights, statistics, covers, and settings', async () => {
  await replaceLibrary([]);
  const file = new File(['A backup test book.'], 'backup.txt', {
    type: 'text/plain',
  });
  const inspected = await inspectFile(file);
  const book = {
    ...inspected,
    cover: 'data:image/png;base64,AA==',
    readingTimeMs: 90_000,
    readingActivity: {
      '2026-10-20': { readingTimeMs: 90_000, pages: 4 },
    },
    position: { location: '2', progress: 50, label: 'Page 2 of 4' },
    bookmarks: [
      {
        location: '2',
        progress: 50,
        label: 'Page 2 of 4',
        id: 'bookmark',
        createdAt: 1,
      },
    ],
    highlights: [
      {
        location: '2',
        progress: 50,
        label: 'Chapter one',
        id: 'highlight',
        createdAt: 2,
        cfiRange: 'epubcfi(/6/2!/4/2,/1:0,/1:4)',
        text: 'test',
        color: 'yellow' as const,
      },
      {
        location: '3',
        progress: 75,
        label: 'Chapter two',
        id: 'noted',
        createdAt: 3,
        cfiRange: 'epubcfi(/6/4!/4/2,/1:0,/1:6)',
        text: 'noted',
        color: 'pink' as const,
        note: 'Read this to mom\nsecond line',
      },
    ],
    shelves: ['Book club', 'Favorites'],
  };
  await addBook(book, file);
  const { BACKUP_SETTING_KEYS } = await import('../lib/library-backup');
  assert.ok(BACKUP_SETTING_KEYS.includes('leaf-library-sort'));
  const backup = await createLibraryBackup('0.1.14', {
    'leaf-app-theme': 'dark',
    'leaf-reading-goals': '{"minutes":25,"pages":12}',
    'leaf-library-sort': 'author',
  });
  const parsed = await inspectLibraryBackup(backup);
  assert.equal(parsed.manifest.books.length, 1);
  assert.equal(parsed.manifest.settings['leaf-app-theme'], 'dark');
  assert.equal(parsed.manifest.settings['leaf-library-sort'], 'author');
  assert.equal(await parsed.entries[0].file.text(), 'A backup test book.');
  await replaceLibrary([]);
  assert.equal((await listBooks()).length, 0);
  const manifest = await restoreLibraryBackup(backup);
  const restored = (await listBooks())[0];
  assert.equal(manifest.appVersion, '0.1.14');
  assert.equal(restored.position.location, '2');
  assert.equal(restored.bookmarks[0].id, 'bookmark');
  assert.equal(restored.highlights?.[0].id, 'highlight');
  // Highlight colors and notes come back exactly.
  assert.deepEqual(restored.highlights, book.highlights);
  assert.deepEqual(restored.shelves, ['Book club', 'Favorites']);
  assert.equal(restored.readingActivity?.['2026-10-20'].pages, 4);
  assert.equal(restored.cover, book.cover);
  assert.equal(await (await getFile(restored.id)).text(), await file.text());
  await replaceLibrary([]);
});

test('text pagination preserves every character, long words, whitespace and emoji', () => {
  for (const text of [
    'a'.repeat(5500),
    ('An example.\n\n' + '🌿'.repeat(800) + ' ').repeat(4),
    '',
    ' \n'.repeat(4000),
  ]) {
    const pages = splitText(text);
    assert.equal(pages.join(''), text);
    assert.ok(pages.every((p) => p.length <= 1600));
    assert.ok(pages.every((p) => !p || !/[\uD800-\uDBFF]$/.test(p)));
  }
});
