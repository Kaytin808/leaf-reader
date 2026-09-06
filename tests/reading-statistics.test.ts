import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReadingTime,
  ReadingClock,
  readingTimeStatus,
} from '../lib/reading-statistics';

test('reading clock counts visible activity, pauses, and caps abandoned pages at the idle limit', () => {
  const clock = new ReadingClock(2_000);
  clock.start(10_000);
  assert.equal(clock.capture(40_000), 32_000);
  assert.equal(clock.capture(700_000), 302_000);
  clock.activity(700_000);
  assert.equal(clock.capture(730_000), 332_000);
  clock.pause(740_000);
  assert.equal(clock.capture(900_000), 342_000);
});

test('reading time labels distinguish books in progress, completed books, and legacy finishes', () => {
  assert.equal(formatReadingTime(20_000), 'less than 1 min');
  assert.equal(formatReadingTime(82 * 60_000), '1 hr 22 min');
  assert.equal(readingTimeStatus(false, 12 * 60_000), 'Time read 12 min');
  assert.equal(readingTimeStatus(true, 82 * 60_000), 'Finished in 1 hr 22 min');
  assert.equal(
    readingTimeStatus(true, undefined),
    'Finished · time not tracked',
  );
});
