import { updateBook, type LibraryBook } from './library';

type CoverCandidate = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  editions?: { docs?: CoverCandidate[] };
};
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const knownAuthor = (author: string) =>
  normalize(author).length > 2 &&
  !['unknown author', 'personal import', 'unknown', 'anonymous'].includes(
    normalize(author),
  );
export const coverQuery = (title: string, author: string) =>
  JSON.stringify([
    2,
    normalize(title),
    knownAuthor(author) ? normalize(author) : '',
  ]);

export function matchingCover(
  docs: CoverCandidate[],
  title: string,
  author: string,
) {
  const wanted = normalize(title);
  const authorWords = normalize(author)
    .split(' ')
    .filter((word) => word.length > 1);
  const candidates = docs.flatMap((work) =>
    work.editions?.docs?.length
      ? work.editions.docs.map((edition) => ({
          ...edition,
          author_name: work.author_name,
          cover_i: edition.cover_i || work.cover_i,
        }))
      : [work],
  );
  return candidates.find((doc) => {
    if (
      !Number.isSafeInteger(doc.cover_i) ||
      (doc.cover_i || 0) <= 0 ||
      typeof doc.title !== 'string'
    )
      return false;
    // A subtitle is acceptable; a different volume or a study guide is not.
    const found = normalize(doc.title.split(':')[0]);
    if (found !== wanted && normalize(doc.title) !== wanted) return false;
    return (
      !knownAuthor(author) ||
      (doc.author_name || []).some((name) =>
        authorWords.every((word) => normalize(name).split(' ').includes(word)),
      )
    );
  });
}

export async function findOnlineCover(
  title: string,
  author: string,
): Promise<string | undefined> {
  if (!title.trim()) return;
  const url = new URL('https://openlibrary.org/search.json');
  url.search = new URLSearchParams({
    q: title.trim(),
    fields:
      'title,author_name,cover_i,editions,editions.title,editions.cover_i',
    limit: '10',
  }).toString();
  if (knownAuthor(author)) url.searchParams.set('author', author.trim());
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new Error(
      'Online cover search is unavailable. Your current cover has been kept.',
    );
  const result = (await response.json()) as { docs?: CoverCandidate[] };
  const match = matchingCover(
    Array.isArray(result.docs) ? result.docs : [],
    title,
    author,
  );
  if (!match) return;
  const image = await fetch(
    `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false`,
    {
      signal: AbortSignal.timeout(15000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    },
  );
  if (!image.ok) return;
  const blob = await image.blob();
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ||
    blob.size < 100 ||
    blob.size > 5 * 1024 * 1024
  )
    return;
  // Cache the image with the book so a successful lookup also works offline.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read the cover image.'));
    reader.onerror = () => reject(new Error('Could not read the cover image.'));
    reader.readAsDataURL(blob);
  });
}

const pending = new Map<string, Promise<LibraryBook>>();
let queue: Promise<unknown> = Promise.resolve();
export function needsOnlineCover(book: LibraryBook) {
  if (
    book.coverSource === 'custom' ||
    book.coverSource === 'default' ||
    (!book.coverSource && book.metadataEdited && book.cover)
  )
    return false;
  const query = coverQuery(book.title, book.author);
  return (
    book.coverLookup?.query !== query ||
    Date.now() - book.coverLookup.checkedAt > 7 * 86400000
  );
}
export function enrichCover(book: LibraryBook): Promise<LibraryBook> {
  const query = coverQuery(book.title, book.author);
  const key = book.id + query;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = queue
    .catch(() => {})
    .then(async () => {
      let cover: string | undefined;
      try {
        cover = await findOnlineCover(book.title, book.author);
      } catch {
        /* Leave the existing cover in place on network failure. */
      }
      const updated = await updateBook(book.id, (latest) => {
        if (
          coverQuery(latest.title, latest.author) !== query ||
          latest.coverSource === 'custom' ||
          latest.coverSource === 'default' ||
          latest.cover !== book.cover
        )
          return {};
        return {
          coverLookup: { query, checkedAt: Date.now() },
          ...(cover ? { cover, coverSource: 'web' as const } : {}),
        };
      });
      return updated;
    });
  // Serialize lookups and leave a second between books to respect the public API.
  queue = task
    .catch(() => {})
    .then(() => new Promise((resolve) => setTimeout(resolve, 1100)));
  pending.set(key, task);
  void task.finally(() => pending.delete(key)).catch(() => {});
  return task;
}
