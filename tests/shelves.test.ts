import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookShelves,
  libraryShelves,
  matchShelfName,
  MAX_SHELF_NAME,
  normalizeShelfName,
  onShelf,
  renamedShelves,
  sameShelf,
  withShelf,
} from '../lib/shelves';

test('shelf names are tidied and kept short', () => {
  assert.equal(normalizeShelfName('  Book   club '), 'Book club');
  assert.equal(normalizeShelfName('   '), '');
  assert.equal(normalizeShelfName('x'.repeat(50)).length, MAX_SHELF_NAME);
});

test('a book can join and leave shelves without repeats', () => {
  let book = { shelves: undefined as string[] | undefined };
  assert.deepEqual(bookShelves(book), []);
  book = { shelves: withShelf(book, 'Favorites', true) };
  book = { shelves: withShelf(book, 'Book club', true) };
  book = { shelves: withShelf(book, ' favorites ', true) };
  // Re-adding in other capitals keeps the original spelling.
  assert.deepEqual(book.shelves, ['Favorites', 'Book club']);
  assert.equal(
    matchShelfName(' favorites', ['Book club', 'Favorites']),
    'Favorites',
  );
  assert.equal(matchShelfName('  New   one ', ['Favorites']), 'New one');
  assert.equal(onShelf(book, 'FAVORITES'), true);
  book = { shelves: withShelf(book, 'Favorites', false) };
  assert.deepEqual(book.shelves, ['Book club']);
  assert.equal(onShelf(book, 'Favorites'), false);
  assert.deepEqual(withShelf(book, '   ', true), ['Book club']);
});

test('damaged saved shelves are cleaned when read', () => {
  const book = {
    shelves: ['Fav', '', 'fav', 7, null, '  To   read '] as unknown as string[],
  };
  assert.deepEqual(bookShelves(book), ['Fav', 'To read']);
  assert.deepEqual(bookShelves({ shelves: 'Fav' as unknown as string[] }), []);
});

test('library shelves are listed A–Z with book counts', () => {
  assert.deepEqual(
    libraryShelves([
      { shelves: ['Favorites', 'Book club'] },
      { shelves: ['favorites'] },
      {},
      { shelves: ['To read'] },
    ]),
    [
      { name: 'Book club', count: 1 },
      { name: 'Favorites', count: 2 },
      { name: 'To read', count: 1 },
    ],
  );
});

test('renaming a shelf moves its books, merges into an existing shelf, and can fix capitals', () => {
  const book = { shelves: ['Book club', 'Favorites'] };
  assert.deepEqual(renamedShelves(book, 'book club', 'Club'), [
    'Favorites',
    'Club',
  ]);
  // Renaming onto a shelf the book is already on merges them.
  assert.deepEqual(renamedShelves(book, 'Book club', 'favorites'), [
    'Favorites',
  ]);
  // Changing only the capitals.
  assert.deepEqual(renamedShelves(book, 'Book club', 'Book Club'), [
    'Favorites',
    'Book Club',
  ]);
  // Books not on the shelf are untouched.
  assert.deepEqual(
    renamedShelves({ shelves: ['To read'] }, 'Book club', 'Club'),
    ['To read'],
  );
  assert.equal(sameShelf('Favorites', ' favorites'.trim()), true);
});
