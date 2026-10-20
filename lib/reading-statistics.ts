export const READING_IDLE_MS = 5 * 60 * 1000;

export type DailyReadingActivity = {
  readingTimeMs: number;
  pages: number;
};

export type ReadingActivity = Record<string, DailyReadingActivity>;

export type ReadingGoals = {
  minutes: number;
  pages: number;
};

export const DEFAULT_READING_GOALS: ReadingGoals = {
  minutes: 20,
  pages: 10,
};

export function localDayKey(value: Date | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeReadingGoals(value: unknown): ReadingGoals {
  const input =
    value && typeof value === 'object' ? (value as Partial<ReadingGoals>) : {};
  const number = (candidate: unknown, fallback: number, maximum: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.max(0, Math.min(maximum, Math.round(candidate)))
      : fallback;
  return {
    minutes: number(input.minutes, DEFAULT_READING_GOALS.minutes, 1440),
    pages: number(input.pages, DEFAULT_READING_GOALS.pages, 1000),
  };
}

export function addReadingActivity(
  activity: ReadingActivity | undefined,
  day: string,
  readingTimeMs = 0,
  pages = 0,
): ReadingActivity {
  const previous = activity?.[day] ?? { readingTimeMs: 0, pages: 0 };
  return {
    ...activity,
    [day]: {
      readingTimeMs:
        Math.max(0, previous.readingTimeMs) + Math.max(0, readingTimeMs),
      pages: Math.max(0, previous.pages) + Math.max(0, Math.round(pages)),
    },
  };
}

export function combineReadingActivity(
  activities: Array<ReadingActivity | undefined>,
) {
  let combined: ReadingActivity = {};
  for (const activity of activities)
    for (const [day, value] of Object.entries(activity || {}))
      combined = addReadingActivity(
        combined,
        day,
        value.readingTimeMs,
        value.pages,
      );
  return combined;
}

function dayAtOffset(today: Date, offset: number) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  date.setDate(date.getDate() + offset);
  return date;
}

export function weeklyReading(activity: ReadingActivity, today = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = dayAtOffset(today, index - 6);
    const key = localDayKey(date);
    const value = activity[key] ?? { readingTimeMs: 0, pages: 0 };
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
        date,
      ),
      readingTimeMs: value.readingTimeMs,
      minutes: Math.floor(value.readingTimeMs / 60_000),
      pages: value.pages,
    };
  });
}

export function readingStreak(activity: ReadingActivity, today = new Date()) {
  let streak = 0;
  // A streak remains alive until the current day ends, so yesterday can be the
  // first counted day when the reader has not opened a book yet today.
  const todayValue = activity[localDayKey(today)];
  let offset = todayValue?.readingTimeMs || todayValue?.pages ? 0 : -1;
  while (true) {
    const value = activity[localDayKey(dayAtOffset(today, offset))];
    if (!value || (value.readingTimeMs <= 0 && value.pages <= 0)) break;
    streak++;
    offset--;
  }
  return streak;
}

export function estimatedTimeRemaining(
  progress: number,
  readingTimeMs: number | undefined,
) {
  if (
    !readingTimeMs ||
    readingTimeMs < 60_000 ||
    progress <= 0 ||
    progress >= 100
  )
    return undefined;
  return Math.max(
    60_000,
    Math.round((readingTimeMs / progress) * (100 - progress)),
  );
}

export function estimatedTimeRemainingStatus(
  progress: number,
  readingTimeMs: number | undefined,
) {
  const estimate = estimatedTimeRemaining(progress, readingTimeMs);
  return estimate ? `About ${formatReadingTime(estimate)} left` : '';
}

export class ReadingClock {
  private lastTick: number | null = null;
  private lastActivity: number | null = null;
  private running = false;

  constructor(public totalMs = 0) {}

  start(now: number) {
    this.lastTick = now;
    this.lastActivity = now;
    this.running = true;
  }

  activity(now: number) {
    this.capture(now);
    this.lastTick = now;
    this.lastActivity = now;
    this.running = true;
  }

  pause(now: number) {
    this.capture(now);
    this.lastTick = now;
    this.running = false;
  }

  capture(now: number) {
    if (!this.running || this.lastTick === null || this.lastActivity === null) {
      this.lastTick = now;
      return this.totalMs;
    }
    const activeUntil = this.lastActivity + READING_IDLE_MS;
    const end = Math.min(now, activeUntil);
    this.totalMs += Math.max(0, end - this.lastTick);
    this.lastTick = now;
    if (now >= activeUntil) this.running = false;
    return this.totalMs;
  }
}

export function formatReadingTime(milliseconds: number) {
  if (milliseconds < 60_000) return 'less than 1 min';
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`;
}

export function readingTimeStatus(
  finished: boolean,
  milliseconds: number | undefined,
) {
  if (finished)
    return milliseconds === undefined
      ? 'Finished · time not tracked'
      : `Finished in ${formatReadingTime(milliseconds)}`;
  return `Time read ${formatReadingTime(milliseconds ?? 0)}`;
}
