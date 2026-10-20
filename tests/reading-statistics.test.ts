import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addReadingActivity,
  combineReadingActivity,
  estimatedTimeRemaining,
  estimatedTimeRemainingStatus,
  formatReadingTime,
  localDayKey,
  normalizeReadingGoals,
  ReadingClock,
  readingStreak,
  readingTimeStatus,
  weeklyReading,
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

test('daily goals, weekly totals, and streaks use local calendar days', () => {
  const today = new Date(2026, 9, 20, 12);
  let first = addReadingActivity(undefined, '2026-10-19', 12 * 60_000, 8);
  first = addReadingActivity(first, '2026-10-20', 5 * 60_000, 3);
  const combined = combineReadingActivity([
    first,
    { '2026-10-20': { readingTimeMs: 7 * 60_000, pages: 5 } },
  ]);
  assert.deepEqual(combined['2026-10-20'], {
    readingTimeMs: 12 * 60_000,
    pages: 8,
  });
  assert.equal(readingStreak(combined, today), 2);
  assert.equal(weeklyReading(combined, today).at(-1)?.minutes, 12);
  assert.equal(weeklyReading(combined, today).at(-1)?.pages, 8);
  assert.equal(localDayKey(today), '2026-10-20');
  assert.deepEqual(normalizeReadingGoals({ minutes: 25.4, pages: 12.7 }), {
    minutes: 25,
    pages: 13,
  });
});

test('time remaining scales from the reader’s real pace', () => {
  assert.equal(estimatedTimeRemaining(25, 30 * 60_000), 90 * 60_000);
  assert.equal(
    estimatedTimeRemainingStatus(25, 30 * 60_000),
    'About 1 hr 30 min left',
  );
  assert.equal(estimatedTimeRemainingStatus(0, 30 * 60_000), '');
  assert.equal(estimatedTimeRemainingStatus(100, 30 * 60_000), '');
});
