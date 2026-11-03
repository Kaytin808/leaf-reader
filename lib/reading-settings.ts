// Match theme follows the app theme's page colors; Paper and Sepia are fixed.
export type ReadingTheme = 'match' | 'paper' | 'sepia';
export type ReadingFont = 'book' | 'classic' | 'sans' | 'accessible';
export type ReadingSpacing = 'compact' | 'comfortable' | 'airy';
export type ReadingMargin = 'narrow' | 'standard' | 'wide';
export type ReadingAlignment = 'left' | 'justify';

export type ReadingPreferences = {
  theme: ReadingTheme;
  fontSize: number;
  font: ReadingFont;
  spacing: ReadingSpacing;
  margin: ReadingMargin;
  alignment: ReadingAlignment;
  brightness: number;
  pageTurnsLocked: boolean;
};

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  theme: 'match',
  fontSize: 20,
  font: 'book',
  spacing: 'comfortable',
  margin: 'standard',
  alignment: 'left',
  brightness: 100,
  pageTurnsLocked: false,
};

// Saved with the settings. Before version 2, Paper and Night just mirrored the
// app's light or dark mode, so those start on Match theme; Sepia was a real
// choice and is kept.
export const READING_PREFERENCES_VERSION = 2;

export const FONT_STACKS: Record<ReadingFont, string> = {
  book: 'Georgia, serif',
  classic: 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
  accessible: 'Verdana, Arial, Tahoma, sans-serif',
};
export const LETTER_SPACING: Record<ReadingFont, string> = {
  book: 'normal',
  classic: 'normal',
  sans: 'normal',
  accessible: '0.025em',
};
export const LINE_HEIGHTS: Record<ReadingSpacing, number> = {
  compact: 1.45,
  comfortable: 1.7,
  airy: 1.95,
};
export const PAGE_MARGINS: Record<ReadingMargin, number> = {
  narrow: 18,
  standard: 34,
  wide: 50,
};

const isOneOf = <T extends string>(
  value: unknown,
  values: readonly T[],
): value is T => typeof value === 'string' && values.includes(value as T);

export function normalizeReadingPreferences(
  value: unknown,
): ReadingPreferences {
  const input =
    value && typeof value === 'object'
      ? (value as Partial<ReadingPreferences> & { version?: unknown })
      : {};
  const current = input.version === READING_PREFERENCES_VERSION;
  return {
    theme:
      input.theme === 'sepia' ||
      (current && isOneOf(input.theme, ['match', 'paper']))
        ? input.theme
        : 'match',
    fontSize:
      typeof input.fontSize === 'number' &&
      input.fontSize >= 14 &&
      input.fontSize <= 40
        ? Math.round(input.fontSize / 2) * 2
        : 20,
    font: isOneOf(input.font, ['book', 'classic', 'sans', 'accessible'])
      ? input.font
      : 'book',
    spacing: isOneOf(input.spacing, ['compact', 'comfortable', 'airy'])
      ? input.spacing
      : 'comfortable',
    margin: isOneOf(input.margin, ['narrow', 'standard', 'wide'])
      ? input.margin
      : 'standard',
    alignment: isOneOf(input.alignment, ['left', 'justify'])
      ? input.alignment
      : 'left',
    brightness:
      typeof input.brightness === 'number'
        ? Math.max(50, Math.min(100, Math.round(input.brightness / 5) * 5))
        : 100,
    pageTurnsLocked:
      typeof input.pageTurnsLocked === 'boolean'
        ? input.pageTurnsLocked
        : false,
  };
}
