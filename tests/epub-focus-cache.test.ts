import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findFocusPage,
  focusLayoutKey,
  uniqueFocusPages,
  type FocusPageCache,
} from '../lib/epub-focus-cache';

const compare = (left: string, right: string) => left.localeCompare(right);
const key = focusLayoutKey({
  width: 390,
  height: 766,
  fontSize: 20,
  font: 'serif',
  spacing: 'relaxed',
  margin: 'medium',
  alignment: 'left',
  reflowable: true,
});
const cache: FocusPageCache = {
  layoutKey: key,
  generatedAt: 1,
  sourceCfi: 'c',
  pages: [
    { startCfi: 'a', endCfi: 'c', sectionIndex: 4 },
    { startCfi: 'c', endCfi: 'e', sectionIndex: 4 },
  ],
};

test('focus cache prefers an exact page start over the preceding range end', () => {
  assert.deepEqual(findFocusPage(cache, 'c', key, compare), {
    page: cache.pages[1],
    reason: 'exact-start',
  });
});

test('focus cache finds a containing range and rejects stale or distant data', () => {
  assert.equal(findFocusPage(cache, 'b', key, compare).page, cache.pages[0]);
  assert.equal(
    findFocusPage(cache, 'b', `${key}|changed`, compare).reason,
    'stale-layout',
  );
  assert.equal(
    findFocusPage(cache, 'z', key, compare).reason,
    'outside-buffer',
  );
});

test('focus cache deduplicates and orders buffered page boundaries', () => {
  assert.deepEqual(
    uniqueFocusPages(
      [cache.pages[1], cache.pages[0], cache.pages[1]],
      compare,
    ).map((page) => page.startCfi),
    ['a', 'c'],
  );
});
