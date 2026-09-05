import JSZip from 'jszip';
import DOMPurify from 'dompurify';
import { fileId, type Format, type LibraryBook } from './library';

const LIMIT = 100 * 1024 * 1024;
export const METADATA_VERSION = 2;
export function splitText(text: string, length = 1600) {
  const pages: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(text.length, offset + length);
    if (end < text.length) {
      const segment = text.slice(offset, end);
      const boundary = Math.max(
        segment.lastIndexOf('\n'),
        segment.lastIndexOf(' '),
      );
      if (boundary > length / 2) end = offset + boundary + 1;
      // Do not split a UTF-16 surrogate pair.
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    pages.push(text.slice(offset, end));
    offset = end;
  }
  return pages.length ? pages : [''];
}
export async function inspectFile(file: File): Promise<LibraryBook> {
  const format = file.name.split('.').pop()?.toLowerCase() as Format;
  if (!['epub', 'pdf', 'txt'].includes(format))
    throw new Error(
      'Please choose an EPUB, PDF, or TXT file. MOBI, AZW, and DRM-protected books need to be converted to an unprotected EPUB or PDF first.',
    );
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > LIMIT)
    throw new Error('For this prototype, choose a book smaller than 100 MB.');
  const bytes = await file.arrayBuffer();
  const book: LibraryBook = {
    id: await fileId(bytes),
    filename: file.name,
    format,
    size: file.size,
    title: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
    author: 'Personal import',
    addedAt: Date.now(),
    lastRead: 0,
    position: { location: '', progress: 0, label: 'Not started' },
    bookmarks: [],
    metadataVersion: METADATA_VERSION,
  };
  if (format === 'pdf') {
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
      throw new Error('This file does not appear to be a valid PDF.');
    await readPdfMetadata(bytes, book);
  }
  if (format === 'txt' && new Uint8Array(bytes.slice(0, 4096)).includes(0))
    throw new Error(
      'Please save this text file using UTF-8 encoding, then import it again.',
    );
  if (format === 'epub') {
    const zip = await openZip(bytes);
    const container = parseXml(
      await zip.file('META-INF/container.xml')!.async('text'),
    );
    const opfPath = container
      .getElementsByTagName('rootfile')[0]
      ?.getAttribute('full-path');
    if (!opfPath || !zip.file(opfPath))
      throw new Error('This EPUB is missing its book manifest.');
    const opf = parseXml(await zip.file(opfPath)!.async('text'));
    book.title =
      opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ||
      book.title;
    book.author =
      opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() ||
      'Unknown author';
    const items = Array.from(opf.getElementsByTagNameNS('*', 'item'));
    const coverId = Array.from(opf.getElementsByTagNameNS('*', 'meta'))
      .find((m) => m.getAttribute('name') === 'cover')
      ?.getAttribute('content');
    let cover =
      items.find((i) =>
        i.getAttribute('properties')?.split(' ').includes('cover-image'),
      ) || items.find((i) => i.getAttribute('id') === coverId);
    if (!cover) {
      const guideHref = Array.from(opf.getElementsByTagNameNS('*', 'reference'))
        .find((reference) =>
          ['cover', 'title-page'].includes(
            (reference.getAttribute('type') || '').toLowerCase(),
          ),
        )
        ?.getAttribute('href');
      const coverPage =
        (guideHref &&
          items.find(
            (item) =>
              item.getAttribute('href')?.split('#')[0] ===
              guideHref.split('#')[0],
          )) ||
        items.find((item) =>
          /(?:^|[-_.])cover(?:[-_.]|$)/i.test(item.getAttribute('id') || ''),
        );
      const pageHref = coverPage?.getAttribute('href') || guideHref;
      if (pageHref && !/^(?:[a-z]+:|\/\/)/i.test(pageHref)) {
        const pagePath = new URL(
          pageHref.split('#')[0],
          'https://epub.local/' + opfPath,
        ).pathname.slice(1);
        const pageEntry = zip.file(decodeURIComponent(pagePath));
        if (pageEntry && /\.(?:xhtml|html|htm)$/i.test(pagePath)) {
          const page = parseXml(await pageEntry.async('text'));
          const imageHref =
            page
              .getElementsByTagNameNS('*', 'image')[0]
              ?.getAttribute('href') ||
            page
              .getElementsByTagNameNS('*', 'image')[0]
              ?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
            page.getElementsByTagNameNS('*', 'img')[0]?.getAttribute('src');
          if (imageHref && !/^(?:[a-z]+:|\/\/)/i.test(imageHref)) {
            const imagePath = new URL(
              imageHref,
              'https://epub.local/' + pagePath,
            ).pathname.slice(1);
            cover = items.find(
              (item) =>
                new URL(
                  item.getAttribute('href') || '',
                  'https://epub.local/' + opfPath,
                ).pathname.slice(1) === imagePath,
            );
          }
        }
      }
    }
    if (!cover) {
      cover = items.find(
        (item) =>
          ['image/jpeg', 'image/png', 'image/webp'].includes(
            item.getAttribute('media-type') || '',
          ) &&
          /(?:^|[-_./])cover(?:[-_.]|$)/i.test(item.getAttribute('href') || ''),
      );
    }
    const href = cover?.getAttribute('href');
    const mime = cover?.getAttribute('media-type');
    if (
      href &&
      mime &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(mime) &&
      !/^(?:[a-z]+:|\/\/)/i.test(href)
    ) {
      const path = new URL(
        href,
        `https://epub.local/${opfPath}`,
      ).pathname.slice(1);
      const entry = zip.file(decodeURIComponent(path));
      if (entry) {
        const image = await entry.async('uint8array');
        if (image.length < 5 * 1024 * 1024)
          book.cover = `data:${mime};base64,${await entry.async('base64')}`;
      }
    }
  }
  return book;
}
async function readPdfMetadata(bytes: ArrayBuffer, book: LibraryBook) {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    navigator.userAgent.toLowerCase().includes('jsdom')
  )
    return;
  let task: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    task = pdfjs.getDocument({
      data: bytes.slice(0),
      cMapUrl: '/pdf-assets/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdf-assets/standard_fonts/',
      wasmUrl: '/pdf-assets/wasm/',
    });
    const pdf = await task.promise;
    const metadata = await pdf.getMetadata();
    const info = metadata.info as { Title?: string; Author?: string };
    if (info.Title?.trim()) book.title = info.Title.trim();
    if (info.Author?.trim()) book.author = info.Author.trim();
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(1.5, 360 / base.width),
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvas, viewport }).promise;
    book.cover = canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    // The reader can still open a valid PDF when optional metadata is unusual.
  } finally {
    if (task) await task.destroy().catch(() => {});
  }
}
function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new Error('The EPUB contains an unreadable XML document.');
  return doc;
}
async function openZip(bytes: ArrayBuffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error(
      'This EPUB could not be opened. It may be damaged or encrypted.',
    );
  }
  if (!zip.file('META-INF/container.xml'))
    throw new Error('This file is not a valid EPUB.');
  const entries = Object.values(zip.files);
  if (entries.length > 6000)
    throw new Error('This EPUB is too complex for the prototype.');
  let total = 0;
  for (const entry of entries) {
    const size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize || 0;
    total += size;
    if (size > 40 * 1024 * 1024 || total > 250 * 1024 * 1024)
      throw new Error('This EPUB expands beyond the prototype’s memory limit.');
  }
  const encryption = zip.file('META-INF/encryption.xml');
  if (encryption) {
    const xml = parseXml(await encryption.async('text'));
    const methods = Array.from(
      xml.getElementsByTagNameNS('*', 'EncryptionMethod'),
    );
    if (
      methods.some(
        (m) =>
          ![
            'http://www.idpf.org/2008/embedding',
            'http://ns.adobe.com/pdf/enc#RC',
          ].includes(m.getAttribute('Algorithm') || ''),
      )
    )
      throw new Error(
        'This EPUB is DRM-protected. Please import an unprotected copy.',
      );
  }
  return zip;
}
// Sanitize before any chapter is loaded into an iframe. Keep scripts disabled in EPUB.js too.
export async function prepareEpub(bytes: ArrayBuffer) {
  const zip = await openZip(bytes);
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name)) {
      const clean = DOMPurify.sanitize(await entry.async('text'), {
        WHOLE_DOCUMENT: true,
        ADD_TAGS: ['link'],
        ADD_ATTR: ['epub:type'],
        FORBID_TAGS: [
          'script',
          'iframe',
          'object',
          'embed',
          'form',
          'input',
          'button',
          'audio',
          'video',
          'base',
        ],
        FORBID_ATTR: ['srcdoc'],
      });
      const doc = new DOMParser().parseFromString(clean, 'text/html');
      doc.querySelectorAll('meta[http-equiv]').forEach((n) => n.remove());
      doc.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) a.removeAttribute('href');
      });
      const policy = doc.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content =
        "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; base-uri 'none'; form-action 'none'";
      doc.head.insertBefore(policy, doc.head.firstChild);
      // XMLSerializer supplies the XHTML namespace. A plain xmlns attribute duplicates it.
      doc.documentElement.removeAttribute('xmlns');
      doc.documentElement.setAttributeNS(
        'http://www.w3.org/2000/xmlns/',
        'xmlns:epub',
        'http://www.idpf.org/2007/ops',
      );
      zip.file(entry.name, new XMLSerializer().serializeToString(doc));
    }
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}
export const SAMPLE_TEXT = `A small guide to slowing down\n\nA Leaf reading sample\n\nThis short, original sample is here to help you try your new reading space. Turn a page, adjust the type, and leave a bookmark. When you return, your place will be waiting.\n\n1. Make a little room\n\nA good reading habit does not need a perfect chair, a silent house, or a whole afternoon. Sometimes it begins with ten quiet minutes and the decision to leave your phone just out of reach. The important thing is to give those minutes to yourself.\n\nNotice the light. Find a position that feels easy on your shoulders. Let the first paragraph be an invitation rather than another task on a list. You do not have to finish a chapter. You only have to begin.\n\n2. Follow your attention\n\nSome books invite you to race ahead. Others reward a slower pace. Read at the speed that lets you notice what matters: a surprising image, an unfamiliar idea, the little change in a character’s voice.\n\nIf your attention wanders, there is no need to start a debate with yourself. Return to the sentence. Read it once more. Books are remarkably patient company.\n\n3. Leave a way back\n\nA bookmark is a small promise to return. Save a passage when it catches your attention, or simply keep your place for tomorrow. You can find your saved places through the bookmark button above.\n\nYour reading position is saved automatically, too. Close the reader, return to your library, and choose Continue reading. The story starts again right where you left it.\n\n4. Bring your own shelf\n\nLeaf opens EPUB, PDF, and plain text files. EPUB books adapt to the screen and the font size you choose. PDFs preserve the original page. Text files keep things simple.\n\nUse Import books to choose files from your device. Your library is saved in this browser; it is not sent to a server. Keep the original files somewhere safe, since clearing browser data also clears this shelf.\n\n5. One more page\n\nThere is no score for how quickly you finish. A page read with attention can stay with you longer than an entire book read in a hurry.\n\nClose this sample whenever you like. Your next book is waiting.\n\nThe end.\n`;
