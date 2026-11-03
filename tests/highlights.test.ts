import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHighlight,
  HIGHLIGHT_COLOR_NAMES,
  HIGHLIGHT_COLORS,
  highlightColor,
  highlightStyles,
  MAX_NOTE_LENGTH,
  withNote,
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

test('highlight colors fall back to yellow for old or unknown values', () => {
  assert.equal(highlightColor('pink'), 'pink');
  assert.equal(highlightColor(undefined), 'yellow');
  assert.equal(highlightColor('purple'), 'yellow');
  assert.deepEqual(HIGHLIGHT_COLOR_NAMES, ['yellow', 'pink', 'green', 'blue']);
  assert.equal(highlightStyles('blue').fill, HIGHLIGHT_COLORS.blue);
  assert.equal(highlightStyles('nope').fill, HIGHLIGHT_COLORS.yellow);
  const position = { location: '', progress: 0, label: 'Chapter one' };
  assert.equal(
    createHighlight(range, 'words', position, 1, 'green')?.color,
    'green',
  );
});

test('notes are trimmed, capped at 500 characters, and removed when empty', () => {
  const position = { location: '', progress: 0, label: 'Chapter one' };
  const highlight = createHighlight(range, 'words', position, 1)!;
  assert.equal(
    withNote(highlight, '  Read to mom\nlater  ').note,
    'Read to mom\nlater',
  );
  assert.equal(
    withNote(highlight, 'x'.repeat(600)).note?.length,
    MAX_NOTE_LENGTH,
  );
  const noted = withNote(highlight, 'keep');
  assert.equal('note' in withNote(noted, '   '), false);
  assert.equal(withNote(noted, '').color, 'yellow');
});
