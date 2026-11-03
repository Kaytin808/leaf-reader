import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryBook } from '../lib/library';
import {
  authorSortKey,
  normalizeLibrarySort,
  sortBooks,
  titleSortKey,
} from '../lib/library-sort';

let n = 0;
function book(
  title: string,
  author: string,
  extra: Partial<LibraryBook> & { progress?: number } = {},
): LibraryBook {
  const { progress = 0, ...rest } = extra;
  n++;
  return {
    id: `b${n}`,
    title,
    author,
    filename: `${title}.epub`,
    format: 'epub',
    size: 1,
    addedAt: n,
    lastRead: 0,
    position: { location: '', progress, label: '' },
    bookmarks: [],
    ...rest,
  };
}
const titles = (books: LibraryBook[]) => books.map((b) => b.title);

test('titles sort without a leading The, A, An or punctuation', () => {
  assert.equal(titleSortKey('The Hobbit'), 'Hobbit');
  assert.equal(titleSortKey('A Tale of Two Cities'), 'Tale of Two Cities');
  assert.equal(titleSortKey('“An Ember in the Ashes”'), 'Ember in the Ashes”');
  assert.equal(titleSortKey('Theo of Golden'), 'Theo of Golden');
  const books = [
    book('The Hobbit', 'x'),
    book('anne of Green Gables', 'x'),
    book('Book 10', 'x'),
    book('Book 9', 'x'),
    book('A Wrinkle in Time', 'x'),
  ];
  assert.deepEqual(titles(sortBooks(books, 'title')), [
    'anne of Green Gables',
    'Book 9',
    'Book 10',
    'The Hobbit',
    'A Wrinkle in Time',
  ]);
});

test('authors sort by last name; unknown authors go last', () => {
  assert.equal(authorSortKey('Jane Austen'), 'Austen Jane');
  assert.equal(authorSortKey('Austen, Jane'), 'Austen Jane');
  assert.equal(
    authorSortKey('Martin Luther King Jr.'),
    'King Martin Luther Jr.',
  );
  assert.equal(authorSortKey('Neil Gaiman & Terry Pratchett'), 'Gaiman Neil');
  assert.equal(authorSortKey('Plato'), 'Plato');
  assert.equal(authorSortKey('Unknown author'), '');
  const books = [
    book('Jane Eyre', 'Charlotte Brontë'),
    book('Mystery', 'Unknown author'),
    book('Emma', 'Jane Austen'),
    book('Persuasion', 'Jane Austen'),
    book('The Moonstone', 'Wilkie Collins'),
  ];
  assert.deepEqual(titles(sortBooks(books, 'author')), [
    'Emma',
    'Persuasion',
    'Jane Eyre',
    'The Moonstone',
    'Mystery',
  ]);
});

test('recently read, recently added and progress orders', () => {
  // Unopened books count from when they were added.
  const old = book('Old', 'x', { addedAt: 1, lastRead: 5 });
  const fresh = book('Fresh', 'x', { addedAt: 2, lastRead: 50 });
  const unopened = book('Unopened', 'x', { addedAt: 20, lastRead: 0 });
  assert.deepEqual(titles(sortBooks([old, unopened, fresh], 'recent')), [
    'Fresh',
    'Unopened',
    'Old',
  ]);
  assert.deepEqual(titles(sortBooks([old, fresh, unopened], 'added')), [
    'Unopened',
    'Fresh',
    'Old',
  ]);
  const half = book('Half', 'x', { progress: 50, lastRead: 1 });
  const most = book('Most', 'x', { progress: 90, lastRead: 1 });
  const done = book('Done', 'x', { progress: 100, lastRead: 9 });
  const none = book('None', 'x');
  assert.deepEqual(titles(sortBooks([done, none, half, most], 'progress')), [
    'Most',
    'Half',
    'None',
    'Done',
  ]);
});

test('sorting never changes the list it was given, and bad saved sorts reset', () => {
  const list = [book('B', 'x'), book('A', 'x')];
  sortBooks(list, 'title');
  assert.deepEqual(titles(list), ['B', 'A']);
  assert.equal(normalizeLibrarySort('title'), 'title');
  assert.equal(normalizeLibrarySort('nope'), 'recent');
  assert.equal(normalizeLibrarySort(null), 'recent');
});
