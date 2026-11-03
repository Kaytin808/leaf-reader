import type { LibraryBook } from './library';

// Shelves are names saved on each book, so backups keep them and a book can
// be on several. A shelf exists while at least one book is on it.
export const MAX_SHELF_NAME = 30;

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});
export const sameShelf = (a: string, b: string) => collator.compare(a, b) === 0;
const same = sameShelf;

export function normalizeShelfName(name: string) {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_SHELF_NAME).trim();
}

// Saved shelves, cleaned: no blanks, no repeats (ignoring case).
export function bookShelves(book: Pick<LibraryBook, 'shelves'>) {
  const shelves: string[] = [];
  for (const raw of Array.isArray(book.shelves) ? book.shelves : []) {
    const name = typeof raw === 'string' ? normalizeShelfName(raw) : '';
    if (name && !shelves.some((shelf) => same(shelf, name))) shelves.push(name);
  }
  return shelves;
}

export function onShelf(book: Pick<LibraryBook, 'shelves'>, name: string) {
  return bookShelves(book).some((shelf) => same(shelf, name));
}

export function withShelf(
  book: Pick<LibraryBook, 'shelves'>,
  name: string,
  on: boolean,
) {
  const clean = normalizeShelfName(name);
  const current = bookShelves(book);
  // Already on it: keep the shelf's spelling as it is.
  if (on && current.some((shelf) => same(shelf, clean))) return current;
  const rest = current.filter((shelf) => !same(shelf, clean));
  return on && clean ? [...rest, clean] : rest;
}

// A typed name that matches an existing shelf (ignoring case) uses that
// shelf's spelling, so "favorites" ticks "Favorites" instead of renaming it.
export function matchShelfName(name: string, existing: string[]) {
  const clean = normalizeShelfName(name);
  return existing.find((shelf) => same(shelf, clean)) ?? clean;
}

// Renaming moves the book from one shelf name to another. If the new name is
// already one of its shelves, the two simply merge.
export function renamedShelves(
  book: Pick<LibraryBook, 'shelves'>,
  from: string,
  to: string,
) {
  if (!onShelf(book, from)) return bookShelves(book);
  return withShelf({ shelves: withShelf(book, from, false) }, to, true);
}

// Every shelf in the library, A–Z, with how many books are on it.
export function libraryShelves(books: Array<Pick<LibraryBook, 'shelves'>>) {
  const counts: Array<{ name: string; count: number }> = [];
  for (const book of books)
    for (const name of bookShelves(book)) {
      const found = counts.find((shelf) => same(shelf.name, name));
      if (found) found.count++;
      else counts.push({ name, count: 1 });
    }
  return counts.sort((a, b) => collator.compare(a.name, b.name));
}
