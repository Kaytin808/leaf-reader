import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PositionAuthority,
  PositionLayoutCache,
  createTextQuote,
  recoverTextQuoteOffset,
  shouldRunDeferredExpansion,
  verifyVisibleRestore,
} from '../lib/reader-engine/position-model';
import type {
  EnginePosition,
  LayoutSignature,
  PositionCandidate,
} from '../lib/reader-engine/types';

const layout = (fontSize = 20): LayoutSignature => ({
  viewportWidth: 390,
  viewportHeight: 664,
  fontSize,
  fontFamily: 'publisher',
  lineHeight: 1.55,
  margin: 'comfortable',
  flow: 'paginated',
});

const candidate = (page: number): PositionCandidate => ({
  bookId: 'fixture-book',
  cfi: `epubcfi(/6/2!/4/2/1:${page * 100})`,
  spineHref: 'chapter.xhtml',
  quote: {
    exact: `words starting on page ${page}`,
    prefix: 'before',
    suffix: 'after',
  },
  progression: page / 100,
  layoutSignature: layout(),
});

function target(quote: string): EnginePosition {
  return {
    ...candidate(45),
    quote: { exact: quote, prefix: 'before', suffix: 'after' },
    schemaVersion: 1,
    revision: 1,
    capturedAt: new Date(0).toISOString(),
  };
}

test('regression: stale resize anchor cannot replace a later page-turn position', () => {
  const authority = new PositionAuthority();
  const page37Revision = authority.beginCapture();
  const page45Revision = authority.beginCapture();
  const page45 = authority.candidate(page45Revision, candidate(45));
  const stalePage37 = authority.candidate(page37Revision, candidate(37));

  assert.equal(authority.commit(page45), true);
  assert.equal(authority.commit(stalePage37), false);
  assert.equal(authority.current()?.cfi, page45.cfi);
});

test('regression: a CFI boundary landing one page back fails text verification', () => {
  const restored = verifyVisibleRestore(
    target('The target page begins here.'),
    {
      visibleText: 'The previous page ends immediately before the target.',
      targetOffsetPx: null,
      lineHeightPx: 28,
      startComparison: -1,
    },
  );

  assert.equal(restored.quoteFound, false);
  assert.equal(restored.boundarySnapBack, true);
  assert.equal(restored.withinTolerance, false);
});

test('regression: Focus entry rejects undershoot or overshoot beyond two lines', () => {
  const position = target('The sentence I was actually reading.');
  const undershoot = verifyVisibleRestore(position, {
    visibleText: `Earlier paragraph. ${position.quote.exact} More text.`,
    targetOffsetPx: 84,
    lineHeightPx: 28,
    startComparison: -1,
  });
  const overshoot = verifyVisibleRestore(position, {
    visibleText: 'Text after the intended sentence.',
    targetOffsetPx: -28,
    lineHeightPx: 28,
    startComparison: 1,
  });
  const accepted = verifyVisibleRestore(position, {
    visibleText: `${position.quote.exact} More text.`,
    targetOffsetPx: 42,
    lineHeightPx: 28,
    startComparison: -1,
  });

  assert.equal(undershoot.displacementLines, 3);
  assert.equal(undershoot.withinTolerance, false);
  assert.equal(overshoot.withinTolerance, false);
  assert.equal(accepted.withinTolerance, true);
});

test('regression: font-size changes cannot reuse a stale pagination cache entry', () => {
  const cache = new PositionLayoutCache<string>();
  cache.set(layout(20), 'page-at-20px');

  assert.equal(cache.get(layout(20)), 'page-at-20px');
  assert.equal(cache.get(layout(22)), undefined);
});

test('regression: deferred reflow guard cannot conflate navigation flags', () => {
  assert.equal(
    shouldRunDeferredExpansion({
      navigationPending: false,
      resizePending: false,
      focusExpansionPending: false,
    }),
    false,
  );
  assert.equal(
    shouldRunDeferredExpansion({
      navigationPending: false,
      resizePending: false,
      focusExpansionPending: true,
    }),
    true,
  );
  assert.equal(
    shouldRunDeferredExpansion({
      navigationPending: true,
      resizePending: false,
      focusExpansionPending: true,
    }),
    false,
  );
});

test('text-quote recovery uses prefix and suffix to disambiguate repeated text', () => {
  const source =
    'First speaker said repeated phrase after lunch. Later the second speaker said repeated phrase before dusk.';
  const second = source.lastIndexOf('repeated phrase');
  const quote = createTextQuote(source, second, 'repeated phrase'.length, 24);

  assert.equal(recoverTextQuoteOffset(source, quote), second);
});
