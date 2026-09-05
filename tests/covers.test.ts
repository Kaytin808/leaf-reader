import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingCover, coverQuery, findOnlineCover } from '../lib/covers';

test('cover search matches title and author and rejects different books and missing art', () => {
  const title = 'Harry Potter and the Sorcerer’s Stone';
  const author = 'J. K. Rowling';
  const right = {
    title: "Harry Potter and the Sorcerer's Stone",
    author_name: ['J. K. Rowling'],
    cover_i: 123,
  };
  assert.equal(
    matchingCover(
      [
        { ...right, title: 'Harry Potter and the Chamber of Secrets' },
        { ...right, author_name: ['Another Writer'] },
        { ...right, cover_i: undefined },
        right,
      ],
      title,
      author,
    ),
    right,
  );
  assert.equal(matchingCover([right], 'An unknown book', author), undefined);
  assert.equal(matchingCover([right], title, 'Personal import'), right);
  assert.equal(coverQuery(title, author), coverQuery(right.title, author));
});

test('no cover match and missing image preserve the fallback instead of a blank image', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ docs: [] });
    assert.equal(await findOnlineCover('No match', ''), undefined);
    let calls = 0;
    globalThis.fetch = async () =>
      ++calls === 1
        ? Response.json({ docs: [{ title: 'Test book', cover_i: 123 }] })
        : new Response('', { status: 404 });
    assert.equal(await findOnlineCover('Test book', ''), undefined);
    globalThis.fetch = async () => {
      throw new TypeError('Offline');
    };
    await assert.rejects(findOnlineCover('Test book', ''), /Offline/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('edition titles find the US Sorcerer’s Stone cover rather than a mislabeled literature guide', () => {
  const result = matchingCover(
    [
      {
        title: "Harry Potter and the Philosopher's Stone",
        author_name: ['J. K. Rowling'],
        cover_i: 15155833,
        editions: {
          docs: [
            {
              title: "Harry Potter and the Sorcerer's Stone",
              cover_i: 15154728,
            },
          ],
        },
      },
      {
        title: "Harry Potter and the Sorcerer's Stone",
        author_name: ['J. K. Rowling'],
        cover_i: 276518,
        editions: { docs: [{ title: 'Literature Guide', cover_i: 276518 }] },
      },
    ],
    "Harry Potter and the Sorcerer's Stone",
    'J. K. Rowling',
  );
  assert.equal(result?.cover_i, 15154728);
});
