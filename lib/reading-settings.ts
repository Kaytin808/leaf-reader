export type ReadingTheme = 'paper' | 'sepia' | 'night';
export type ReadingFont = 'book' | 'classic' | 'sans';
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
};

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  theme: 'paper',
  fontSize: 20,
  font: 'book',
  spacing: 'comfortable',
  margin: 'standard',
  alignment: 'left',
  brightness: 100,
};

export const FONT_STACKS: Record<ReadingFont, string> = {
  book: 'Georgia, serif',
  classic: 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
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
      ? (value as Partial<ReadingPreferences>)
      : {};
  return {
    theme: isOneOf(input.theme, ['paper', 'sepia', 'night'])
      ? input.theme
      : 'paper',
    fontSize:
      typeof input.fontSize === 'number' &&
      input.fontSize >= 14 &&
      input.fontSize <= 32
        ? Math.round(input.fontSize / 2) * 2
        : 20,
    font: isOneOf(input.font, ['book', 'classic', 'sans'])
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
  };
}
