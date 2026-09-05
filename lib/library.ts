import { openDB, type DBSchema } from 'idb';

export type Format = 'epub' | 'pdf' | 'txt';
export type Position = {
  location: string;
  progress: number;
  label: string;
  chapterHref?: string;
  chapterCfi?: string;
};
export type Bookmark = Position & { id: string; createdAt: number };
export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  filename: string;
  format: Format;
  size: number;
  addedAt: number;
  lastRead: number;
  cover?: string;
  metadataVersion?: number;
  metadataEdited?: boolean;
  chapterHistoryVersion?: number;
  coverSource?: 'embedded' | 'web' | 'custom' | 'default';
  coverLookup?: { query: string; checkedAt: number };
  position: Position;
  bookmarks: Bookmark[];
};
interface LibraryDB extends DBSchema {
  books: { key: string; value: LibraryBook };
  files: { key: string; value: Blob };
}
const db = () =>
  openDB<LibraryDB>('leaf-library', 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' });
      database.createObjectStore('files');
    },
  });
export async function listBooks() {
  return (await db()).getAll('books');
}
export async function getFile(id: string) {
  const file = await (await db()).get('files', id);
  if (!file)
    throw new Error(
      'The saved file is missing. Please import the original book again.',
    );
  return file;
}
export async function addBook(book: LibraryBook, file: Blob) {
  const database = await db();
  const tx = database.transaction(['books', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').put(book),
    tx.objectStore('files').put(file, book.id),
    tx.done,
  ]);
}
export async function updateBook(
  id: string,
  changes: Partial<LibraryBook> | ((book: LibraryBook) => Partial<LibraryBook>),
) {
  const database = await db();
  const tx = database.transaction('books', 'readwrite');
  const book = await tx.store.get(id);
  if (!book) throw new Error('This book is no longer in your library.');
  const next = {
    ...book,
    ...(typeof changes === 'function' ? changes(book) : changes),
    id,
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}
export async function deleteBook(id: string) {
  const database = await db();
  const tx = database.transaction(['books', 'files'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('files').delete(id),
    tx.done,
  ]);
}
export function formatBytes(bytes: number) {
  return bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return 'This browser is out of storage. Remove a book or free up space, then try again.';
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
export async function fileId(bytes: ArrayBuffer) {
  if (globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  // LAN previews may run without a secure context. Deterministic content fingerprint.
  let a = 2166136261,
    b = 5381;
  for (const byte of new Uint8Array(bytes)) {
    a = Math.imul(a ^ byte, 16777619);
    b = Math.imul(b, 33) ^ byte;
  }
  return `${bytes.byteLength}-${a >>> 0}-${b >>> 0}`;
}
