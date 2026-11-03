import { isBookFinished, type LibraryBook } from './library';

export type LibrarySort = 'recent' | 'title' | 'author' | 'added' | 'progress';

export const LIBRARY_SORT_KEY = 'leaf-library-sort';
export const DEFAULT_LIBRARY_SORT: LibrarySort = 'recent';
export const LIBRARY_SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'recent', label: 'Recently read' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'author', label: 'Author A–Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'progress', label: 'Progress' },
];

export function normalizeLibrarySort(value: unknown): LibrarySort {
  return LIBRARY_SORTS.some((sort) => sort.value === value)
    ? (value as LibrarySort)
    : DEFAULT_LIBRARY_SORT;
}

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

// "The Hobbit" files under H; leading quotes and punctuation are ignored.
export function titleSortKey(title: string) {
  return title
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

const NAME_SUFFIXES = /^(jr|sr|ii|iii|iv|phd|md)\.?$/i;

// First listed author, by last name: "Jane Austen" → "Austen Jane".
// Names already written "Austen, Jane" keep their order.
export function authorSortKey(author: string) {
  const first = author.split(/\s*(?:;|&|\band\b)\s*/i)[0]?.trim() ?? '';
  if (!first || /^unknown author$/i.test(first)) return '';
  if (first.includes(',')) return first.replace(/\s*,\s*/, ' ');
  const words = first.split(/\s+/);
  let last = words.length - 1;
  if (last > 0 && NAME_SUFFIXES.test(words[last])) last--;
  return [words[last], ...words.slice(0, last), ...words.slice(last + 1)].join(
    ' ',
  );
}

const byTitle = (a: LibraryBook, b: LibraryBook) =>
  collator.compare(titleSortKey(a.title), titleSortKey(b.title));
const recent = (book: LibraryBook) => book.lastRead || book.addedAt;

// Progress: furthest along first, then books not started, finished last.
function progressRank(book: LibraryBook) {
  if (isBookFinished(book)) return -1;
  return book.position.progress || 0;
}

export function sortBooks(books: LibraryBook[], sort: LibrarySort) {
  const compare = (a: LibraryBook, b: LibraryBook) => {
    switch (sort) {
      case 'title':
        return byTitle(a, b);
      case 'author': {
        const ak = authorSortKey(a.author);
        const bk = authorSortKey(b.author);
        // Books without an author go last.
        if (!ak !== !bk) return ak ? -1 : 1;
        return collator.compare(ak, bk) || byTitle(a, b);
      }
      case 'added':
        return b.addedAt - a.addedAt || byTitle(a, b);
      case 'progress':
        return progressRank(b) - progressRank(a) || recent(b) - recent(a);
      default:
        return recent(b) - recent(a);
    }
  };
  return [...books].sort(compare);
}
