import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_READING_PREFERENCES,
  normalizeReadingPreferences,
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
      keepScreenAwake: true,
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
      keepScreenAwake: true,
    },
  );
});

test('invalid or legacy reading preferences receive safe defaults', () => {
  assert.deepEqual(
    normalizeReadingPreferences({ fontSize: 200, brightness: 'dark' }),
    DEFAULT_READING_PREFERENCES,
  );
});
