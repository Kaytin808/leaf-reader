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

type RestorableReader = LocationReader & {
  display: (target?: string) => Promise<unknown>;
  resize: (width: number, height: number, target?: string) => void;
};

type QueuedResizableReader = Pick<RestorableReader, 'resize'> & {
  q?: {
    enqueue: (task: () => unknown) => Promise<unknown>;
  };
};

// The installed engine supports the third argument; its .d.ts omits it.
// resize() also queues an internal display(target), but returns void. Add a
// barrier behind that internal display so callers cannot accidentally start a
// second display while the resized view is still being created.
export async function resizeEpubAt(
  reader: QueuedResizableReader,
  width: number,
  height: number,
  target?: string,
) {
  reader.resize(width, height, target);
  if (reader.q) await reader.q.enqueue(() => undefined);
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
  await resizeEpubAt(reader, width, height, target);
  await reader.display(target);
  return reportLatestLocation(reader);
}
