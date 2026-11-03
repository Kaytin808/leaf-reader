import { EpubCFI } from 'epubjs';
import type { Highlight, HighlightColor, Position } from './library';

const MAX_HIGHLIGHT_TEXT = 1200;
export const MAX_NOTE_LENGTH = 500;
const COLOR_KEY = 'leaf-highlight-color';

// Fills bright enough to show on dark pages while the words stay readable.
export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#f6c453',
  pink: '#f28ab2',
  green: '#7fd48a',
  blue: '#6fb2f2',
};
export const HIGHLIGHT_COLOR_NAMES = Object.keys(
  HIGHLIGHT_COLORS,
) as HighlightColor[];

export function highlightColor(color: unknown): HighlightColor {
  return HIGHLIGHT_COLOR_NAMES.includes(color as HighlightColor)
    ? (color as HighlightColor)
    : 'yellow';
}

export function highlightStyles(color: unknown) {
  return {
    fill: HIGHLIGHT_COLORS[highlightColor(color)],
    'fill-opacity': '0.42',
  };
}

export function lastHighlightColor(): HighlightColor {
  try {
    return highlightColor(localStorage.getItem(COLOR_KEY));
  } catch {
    return 'yellow';
  }
}

export function rememberHighlightColor(color: HighlightColor) {
  try {
    localStorage.setItem(COLOR_KEY, color);
  } catch {
    /* Only a convenience: highlights still save without it. */
  }
}

export function normalizeHighlightText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_HIGHLIGHT_TEXT);
}

// Notes keep their line breaks; an empty note is no note.
export function normalizeNote(note: string) {
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}

export function withNote(highlight: Highlight, note: string): Highlight {
  const { note: _old, ...rest } = highlight;
  const text = normalizeNote(note);
  return text ? { ...rest, note: text } : rest;
}

export function highlightStartCfi(cfiRange: string) {
  try {
    const cfi = new EpubCFI(cfiRange);
    cfi.collapse(true);
    return cfi.toString();
  } catch {
    return '';
  }
}

export function createHighlight(
  cfiRange: string,
  selectedText: string,
  position: Position,
  now = Date.now(),
  color: HighlightColor = 'yellow',
): Highlight | null {
  const text = normalizeHighlightText(selectedText);
  const location = highlightStartCfi(cfiRange);
  if (!text || !location) return null;
  return {
    ...position,
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    cfiRange,
    location,
    text,
    color,
  };
}
