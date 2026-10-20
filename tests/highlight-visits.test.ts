import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginHighlightVisit,
  finishHighlightVisit,
  moveHighlightVisit,
} from '../lib/highlight-visits';
import type { Highlight, Position } from '../lib/library';

const saved: Position = {
  location: 'epubcfi(/6/20!/4/18/1:40)',
  label: 'Chapter five',
  progress: 42,
  epubPage: { page: 18, total: 41, section: 7, sections: 22 },
};
const quote: Highlight = {
  id: 'quote-1',
  createdAt: 1,
  cfiRange: 'epubcfi(/6/8!,/4/2/1:0,/4/2/1:12)',
  text: 'A remembered sentence',
  color: 'yellow',
  location: 'epubcfi(/6/8!/4/2/1:0)',
  label: 'Chapter two',
  progress: 12,
};

test('visiting and browsing from a highlight never mutates the saved return position', () => {
  const visit = beginHighlightVisit(saved, quote);
  const moved = moveHighlightVisit(visit, {
    location: 'epubcfi(/6/8!/4/8/1:0)',
    label: 'Chapter two',
    progress: 14,
  });

  assert.deepEqual(finishHighlightVisit(moved, 'return'), saved);
  assert.equal(moved.returnTo.location, saved.location);
  assert.equal(saved.epubPage?.page, 18);
});

test('continuing from a quote is an explicit choice of the temporary location', () => {
  const moved = moveHighlightVisit(beginHighlightVisit(saved, quote), {
    location: 'epubcfi(/6/8!/4/8/1:0)',
    label: 'Chapter two',
    progress: 14,
  });

  assert.equal(
    finishHighlightVisit(moved, 'continue').location,
    'epubcfi(/6/8!/4/8/1:0)',
  );
  assert.equal(finishHighlightVisit(moved, 'return').location, saved.location);
});
