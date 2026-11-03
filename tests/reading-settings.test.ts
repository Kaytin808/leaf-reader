import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_READING_PREFERENCES,
  normalizeReadingPreferences,
  pageTurnFrames,
} from '../lib/reading-settings';

test('reading preferences accept valid saved controls and normalize numeric values', () => {
  assert.deepEqual(
    normalizeReadingPreferences({
      theme: 'sepia',
      fontSize: 39,
      font: 'accessible',
      spacing: 'airy',
      margin: 'wide',
      alignment: 'justify',
      brightness: 83,
      pageTurnsLocked: true,
      pageTurn: 'fade',
      haptics: false,
    }),
    {
      theme: 'sepia',
      fontSize: 40,
      font: 'accessible',
      spacing: 'airy',
      margin: 'wide',
      alignment: 'justify',
      brightness: 85,
      pageTurnsLocked: true,
      pageTurn: 'fade',
      haptics: false,
    },
  );
});

test('haptic feedback starts on and keeps a saved choice', () => {
  assert.equal(normalizeReadingPreferences({}).haptics, true);
  assert.equal(normalizeReadingPreferences({ haptics: 'no' }).haptics, true);
  assert.equal(normalizeReadingPreferences({ haptics: false }).haptics, false);
});

test('page turns slide by default and slide toward the turn direction', () => {
  assert.equal(normalizeReadingPreferences({}).pageTurn, 'slide');
  assert.equal(
    normalizeReadingPreferences({ pageTurn: 'spin' }).pageTurn,
    'slide',
  );
  assert.equal(
    normalizeReadingPreferences({ pageTurn: 'none' }).pageTurn,
    'none',
  );
  assert.equal(pageTurnFrames('none', 1), null);
  assert.equal(pageTurnFrames('slide', 1)?.[0].transform, 'translateX(28px)');
  assert.equal(pageTurnFrames('slide', -1)?.[0].transform, 'translateX(-28px)');
  assert.equal(pageTurnFrames('fade', 1)?.[1].opacity, 1);
});

test('invalid or legacy reading preferences receive safe defaults', () => {
  assert.deepEqual(
    normalizeReadingPreferences({ fontSize: 200, brightness: 'dark' }),
    DEFAULT_READING_PREFERENCES,
  );
});
