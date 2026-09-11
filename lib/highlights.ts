import { EpubCFI } from 'epubjs';
import type { Highlight, Position } from './library';

const MAX_HIGHLIGHT_TEXT = 1200;

export function normalizeHighlightText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_HIGHLIGHT_TEXT);
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
    color: 'yellow',
  };
}
