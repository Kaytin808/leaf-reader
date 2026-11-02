import type { Location } from 'epubjs/types/rendition';

type LocationReader = {
  reportLocation: () => Promise<unknown>;
  currentLocation: () => unknown;
};

// EPUB.js queues reportLocation, then calculates it in an animation frame.
// Listening for the next `relocated` event can pick up an older queued report.
// Wait for our report to run, then read the visible viewport directly.
export async function reportLatestLocation(reader: LocationReader) {
  await reader.reportLocation();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  // epubjs's declaration calls this DisplayedLocation, while the installed
  // implementation returns the full Location from located(). Validate it.
  const location = reader.currentLocation() as Location | undefined;
  if (!location?.start?.cfi || !location?.end?.cfi)
    throw new Error('The current page location is not ready.');
  return location;
}

type VisibleContents = {
  document: Document;
  window: Window;
  cfiFromRange: (range: Range) => string;
};

// A page's start CFI can point at the start of a paragraph that began on the
// previous page. For a resize, anchor on the first character actually on
// screen, so the new layout always shows the line the reader was looking at.
export function firstVisibleTextCfi(
  contents: Iterable<VisibleContents>,
  area: DOMRect,
) {
  for (const content of contents) {
    const frame = content.window.frameElement?.getBoundingClientRect();
    if (!frame) continue;
    const onScreen = (rect: DOMRect) =>
      rect.width > 0 &&
      frame.left + rect.left >= area.left - 1 &&
      frame.left + rect.left < area.right - 1 &&
      frame.top + rect.top >= area.top - 1 &&
      frame.top + rect.bottom <= area.bottom + 1;
    const doc = content.document;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some(onScreen)) continue;
      for (let offset = 0; offset < length; offset++) {
        if (!node.textContent[offset].trim()) continue;
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        if ([...range.getClientRects()].some(onScreen)) {
          // A position at the very start of a line is measured by the browser
          // as the end of the line before, which can be on the previous page.
          // Point one character into the line so it stays on this page.
          if (offset + 1 < length) range.setStart(node, offset + 1);
          range.collapse(true);
          try {
            return content.cfiFromRange(range);
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

type RestorableReader = LocationReader & {
  display: (target?: string) => Promise<unknown>;
  resize: (width: number, height: number, target?: string) => void;
};

// The installed engine supports the third argument; its .d.ts omits it.
export function resizeEpubAt(
  reader: Pick<RestorableReader, 'resize'>,
  width: number,
  height: number,
  target?: string,
) {
  reader.resize(width, height, target);
}

export async function restoreEpubLocation(
  reader: RestorableReader,
  target: string | undefined,
  viewport: () => { width: number; height: number },
) {
  await reader.display(target);
  await reportLatestLocation(reader);
  const { width, height } = viewport();
  if (width <= 0 || height <= 0)
    throw new Error('The reading area is not ready.');
  // EPUB.js also redisplays on resize. Give that internal display the saved
  // target too, rather than allowing its cached location to move us backward.
  resizeEpubAt(reader, width, height, target);
  await reader.display(target);
  return reportLatestLocation(reader);
}
