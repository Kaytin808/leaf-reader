import type { Location } from 'epubjs/types/rendition';

type LocationReader = {
  reportLocation: () => Promise<unknown>;
  currentLocation: () => unknown;
};

type PageTurnReader = LocationReader & {
  next: () => Promise<unknown>;
  prev: () => Promise<unknown>;
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

// Let the active rendition perform its own pagination. Calculating a CFI from
// a differently sized rendition can resolve to the same page repeatedly.
export async function turnEpubPage(
  reader: PageTurnReader,
  direction: -1 | 1,
) {
  await (direction > 0 ? reader.next() : reader.prev());
  return reportLatestLocation(reader);
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
