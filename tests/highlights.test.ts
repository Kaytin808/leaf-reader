import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHighlight,
  highlightStartCfi,
  normalizeHighlightText,
} from '../lib/highlights';

const range = 'epubcfi(/6/2!/4/2,/1:0,/1:5)';

test('EPUB highlight text is cleaned and its range keeps an exact start CFI', () => {
  assert.equal(
    normalizeHighlightText('  A\n highlighted   phrase  '),
    'A highlighted phrase',
  );
  assert.equal(highlightStartCfi(range), 'epubcfi(/6/2!/4/2/1:0)');
  const highlight = createHighlight(
    range,
    ' A highlighted phrase ',
    { location: 'epubcfi(/6/2!/4/2/1:20)', progress: 12, label: 'Chapter one' },
    1234,
  );
  assert.equal(highlight?.location, 'epubcfi(/6/2!/4/2/1:0)');
  assert.equal(highlight?.text, 'A highlighted phrase');
  assert.equal(highlight?.label, 'Chapter one');
  assert.equal(highlight?.color, 'yellow');
  assert.ok(highlight?.id.startsWith('1234-'));
});

test('empty text and invalid ranges are not saved as highlights', () => {
  const position = { location: '', progress: 0, label: 'Not started' };
  assert.equal(createHighlight(range, '   ', position), null);
  assert.equal(createHighlight('not-a-cfi', 'words', position), null);
});
