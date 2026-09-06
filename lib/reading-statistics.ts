export const READING_IDLE_MS = 5 * 60 * 1000;

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
