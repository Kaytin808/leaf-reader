import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Location } from 'epubjs/types/rendition';
import { positionForEpub, repairChapterLabel } from '../lib/chapters';
import { epubPageLabel, positionLabel } from '../lib/library';

const cfi = (offset: number) => `epubcfi(/6/2!/4/2/1:${offset})`;
function location(page: number, total: number, offset = 0): Location {
  const point = {
    index: 0,
    href: 'book.xhtml',
    cfi: cfi(offset),
    location: 0,
    percentage: 0,
    displayed: { page, total },
  };
  return {
    start: point,
    end: { ...point, cfi: cfi(offset + 100) },
    atStart: false,
    atEnd: false,
  };
}
test('EPUBs without a table of contents still record real screen page numbers', () => {
  const position = positionForEpub(location(3, 28), [], 1, undefined, 20);
  assert.equal(position.label, 'Section 1');
  assert.equal(epubPageLabel(position), 'Page 3 of 28');
  assert.equal(positionLabel(position), 'Section 1 · Page 3 of 28');
  assert.deepEqual(position.epubPage, {
    page: 3,
    total: 28,
    section: 1,
    sections: 1,
    fontSize: 20,
  });
});
test('larger text changes screen pages but a bookmark remains at the exact passage', () => {
  const passage = cfi(24);
  const before = positionForEpub(location(3, 28), [], 4, passage, 20);
  const after = positionForEpub(location(6, 55), [], 4, before.location, 32);
  assert.equal(before.location, passage);
  assert.equal(after.location, passage);
  assert.equal(epubPageLabel(after), 'Page 6 of 55 · section 1 of 4');
  assert.equal(
    before.epubPage?.total,
    28,
    'Saved bookmark snapshot is not changed by reflow',
  );
  assert.equal(after.epubPage?.fontSize, 32);
});
test('chapter repair preserves page metadata and legacy bookmarks remain readable', () => {
  const position = positionForEpub(location(3, 28), [], 1, undefined, 20);
  assert.deepEqual(
    repairChapterLabel(position, []).epubPage,
    position.epubPage,
  );
  assert.equal(
    positionLabel({ location: cfi(1), label: 'Chapter one', progress: 10 }),
    'Chapter one',
  );
  assert.equal(
    epubPageLabel({ location: cfi(1), label: 'Chapter one', progress: 10 }),
    '',
  );
});

test('a newly viewed EPUB page replaces the old resume location', () => {
  const oldResume = positionForEpub(location(37, 120, 370), [], 1);
  const latest = positionForEpub(location(45, 120, 450), [], 1);

  assert.equal(oldResume.location, cfi(370));
  assert.equal(latest.location, cfi(450));
  assert.equal(latest.epubPage?.page, 45);
  assert.notEqual(latest.location, oldResume.location);
});
