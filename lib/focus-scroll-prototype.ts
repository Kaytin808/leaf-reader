import { EpubCFI, type Rendition } from 'epubjs';
import { reportLatestLocation } from './epub-location';

// THROWAWAY PROTOTYPE: this is deliberately separate from the production
// reflow controller. Do not connect it to Engine V2 navigation, position, or
// layout-cache code unless scrolling Focus Mode is formally adopted.
export const FOCUS_SCROLL_PROTOTYPE = true;

type PrototypeOptions = {
  focus: boolean;
  applyContainerLayout: () => Promise<void>;
  viewport: () => { width: number; height: number };
};

export async function switchFocusScrollPrototype(
  reader: Rendition,
  options: PrototypeOptions,
) {
  // Force epub.js to flush its debounced scroll/page report before taking the
  // raw handoff anchor. This is still the same rendition and the same CFI; it
  // does not involve Engine V2 or the persisted Position model.
  const beforeCfi = (await reportLatestLocation(reader)).start.cfi;
  if (!beforeCfi) throw new Error('focus-scroll-cfi-not-ready');

  await options.applyContainerLayout();
  const { width, height } = options.viewport();
  if (width <= 0 || height <= 0)
    throw new Error('focus-scroll-viewport-not-ready');

  const flow = options.focus ? 'scrolled-doc' : 'paginated';
  reader.flow(flow);
  // flow() asks epub.js to redisplay internally. This explicit display is
  // intentionally last so the raw pre-switch CFI wins that internal queue.
  await reader.display(beforeCfi);
  let after = await reportLatestLocation(reader);
  const comparator = new EpubCFI();
  let targetContained =
    comparator.compare(after.start.cfi, beforeCfi) <= 0 &&
    comparator.compare(after.end.cfi, beforeCfi) >= 0;
  let restoreAttempts = 1;
  // The flow() call clears and rebuilds epub.js's view. A second display can
  // be necessary after that rebuild settles; it is the same raw CFI, never a
  // synthetic page turn or a Position-model conversion.
  if (!targetContained) {
    await reader.display(beforeCfi);
    after = await reportLatestLocation(reader);
    restoreAttempts++;
    targetContained =
      comparator.compare(after.start.cfi, beforeCfi) <= 0 &&
      comparator.compare(after.end.cfi, beforeCfi) >= 0;
  }
  const afterCfi = after.start.cfi;
  if (!afterCfi) throw new Error('focus-scroll-restore-not-ready');
  if (!targetContained) throw new Error('focus-scroll-cfi-restore-missed');

  return {
    transition: options.focus ? ('entry' as const) : ('exit' as const),
    flow,
    beforeCfi,
    afterCfi,
    afterEndCfi: after.end.cfi,
    exactStartMatch: beforeCfi === afterCfi,
    targetContained,
    restoreAttempts,
    width,
    height,
  };
}
