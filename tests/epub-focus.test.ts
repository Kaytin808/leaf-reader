import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFocusRestore,
  FOCUS_UNDERSHOOT_TOLERANCE_LINES,
} from '../lib/epub-focus';

test('focus restore accepts a target no more than two rendered lines down', () => {
  assert.equal(FOCUS_UNDERSHOOT_TOLERANCE_LINES, 2);
  assert.deepEqual(
    evaluateFocusRestore({
      startComparison: -1,
      endComparison: 1,
      targetOffsetPx: 48,
      lineHeightPx: 24,
    }),
    {
      targetOffsetPx: 48,
      lineHeightPx: 24,
      undershootLines: 2,
      withinTolerance: true,
    },
  );
});

test('focus restore defers when a contained target is over two lines down', () => {
  const result = evaluateFocusRestore({
    startComparison: -1,
    endComparison: 1,
    targetOffsetPx: 50,
    lineHeightPx: 24,
  });
  assert.equal(result.withinTolerance, false);
  assert.ok((result.undershootLines ?? 0) > 2);
});

test('an exact page-start CFI is accepted even if range geometry is unavailable', () => {
  assert.equal(
    evaluateFocusRestore({ startComparison: 0, endComparison: 1 })
      .withinTolerance,
    true,
  );
});

test('overshoots and targets outside the restored page are rejected', () => {
  assert.equal(
    evaluateFocusRestore({
      startComparison: 1,
      endComparison: 1,
      targetOffsetPx: 0,
      lineHeightPx: 24,
    }).withinTolerance,
    false,
  );
  assert.equal(
    evaluateFocusRestore({
      startComparison: -1,
      endComparison: -1,
      targetOffsetPx: 0,
      lineHeightPx: 24,
    }).withinTolerance,
    false,
  );
});
