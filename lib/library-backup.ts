import JSZip from 'jszip';
import {
  getFile,
  listBooks,
  replaceLibrary,
  type Format,
  type LibraryBook,
} from './library';

export const LIBRARY_BACKUP_FORMAT = 'kaylas-library-backup';
export const LIBRARY_BACKUP_VERSION = 1;
export const BACKUP_SETTING_KEYS = [
  'leaf-app-theme',
  'leaf-reading-settings',
  'leaf-reading-goals',
  'leaf-library-sort',
] as const;

type BackupBook = {
  book: LibraryBook;
  file: string;
  type: string;
};

export type LibraryBackupManifest = {
  format: typeof LIBRARY_BACKUP_FORMAT;
  version: typeof LIBRARY_BACKUP_VERSION;
  createdAt: number;
  appVersion: string;
  settings: Record<string, string>;
  books: BackupBook[];
};

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

function validBook(value: unknown): value is LibraryBook {
  if (!value || typeof value !== 'object') return false;
  const book = value as Partial<LibraryBook>;
  return (
    typeof book.id === 'string' &&
    book.id.length > 0 &&
    typeof book.title === 'string' &&
    typeof book.author === 'string' &&
    typeof book.filename === 'string' &&
    ['epub', 'pdf', 'txt'].includes(book.format as Format) &&
    typeof book.position?.location === 'string' &&
    typeof book.position?.progress === 'number' &&
    Array.isArray(book.bookmarks)
  );
}

function validManifest(value: unknown): value is LibraryBackupManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<LibraryBackupManifest>;
  return (
    manifest.format === LIBRARY_BACKUP_FORMAT &&
    manifest.version === LIBRARY_BACKUP_VERSION &&
    Array.isArray(manifest.books) &&
    manifest.books.every(
      (entry) =>
        entry &&
        typeof entry.file === 'string' &&
        typeof entry.type === 'string' &&
        validBook(entry.book),
    ) &&
    !!manifest.settings &&
    typeof manifest.settings === 'object'
  );
}

export async function createLibraryBackup(
  appVersion: string,
  settings: Record<string, string>,
) {
  const archive = new JSZip();
  const books = await listBooks();
  const manifest: LibraryBackupManifest = {
    format: LIBRARY_BACKUP_FORMAT,
    version: LIBRARY_BACKUP_VERSION,
    createdAt: Date.now(),
    appVersion,
    settings,
    books: [],
  };
  for (const book of books) {
    const file = await getFile(book.id);
    const path = `books/${safeId(book.id)}`;
    archive.file(path, await file.arrayBuffer());
    manifest.books.push({
      book,
      file: path,
      type: file.type || 'application/octet-stream',
    });
  }
  archive.file('manifest.json', JSON.stringify(manifest, null, 2));
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function inspectLibraryBackup(file: Blob) {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('This is not a valid Kayla’s Library backup.');
  }
  const manifestFile = archive.file('manifest.json');
  if (!manifestFile)
    throw new Error('This backup is missing its library manifest.');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await manifestFile.async('text'));
  } catch {
    throw new Error('This backup has a damaged library manifest.');
  }
  if (!validManifest(manifest))
    throw new Error('This backup version is unsupported or damaged.');
  const seen = new Set<string>();
  const entries: Array<{ book: LibraryBook; file: Blob }> = [];
  for (const entry of manifest.books) {
    if (seen.has(entry.book.id))
      throw new Error('This backup contains duplicate book records.');
    seen.add(entry.book.id);
    const archivedFile = archive.file(entry.file);
    if (!archivedFile)
      throw new Error(`The backup is missing “${entry.book.filename}”.`);
    const bytes = await archivedFile.async('uint8array');
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    entries.push({
      book: entry.book,
      file: new Blob([copy.buffer], { type: entry.type }),
    });
  }
  return { manifest, entries };
}

export async function restoreLibraryBackup(file: Blob) {
  const inspected = await inspectLibraryBackup(file);
  await replaceLibrary(inspected.entries);
  return inspected.manifest;
}
