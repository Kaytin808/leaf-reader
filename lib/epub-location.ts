import { EpubCFI } from 'epubjs';
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

// Old renders of a chapter can linger after it is replaced on screen, either
// in a removed frame or as an earlier document of a frame that was reused.
function isOnScreen(content: { document: Document; window: Window }) {
  return (
    !!content.window.frameElement?.isConnected &&
    content.window.document === content.document
  );
}

// A page's start CFI can point at the start of a paragraph that began on the
// previous page. For a resize, anchor on the first character actually on
// screen, so the new layout always shows the line the reader was looking at.
export function firstVisibleTextCfi(
  contents: Iterable<VisibleContents>,
  area: DOMRect,
) {
  for (const content of contents) {
    if (!isOnScreen(content)) continue;
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

// Pages are columns cut from the start of each chapter, so the reader's line
// can land anywhere on a page. To start a page exactly at that line, add an
// invisible gap just above it: the text slides down until the line no longer
// fits and moves to the top of the next page, while the line before it stays
// behind on the page already read. Mid-paragraph, the gap goes at the top of
// the line's paragraph; for a paragraph's first line it goes at the bottom of
// the block before, so the page breaks between the two. Only attributes and
// styles change (no new nodes), so saved places, bookmarks and highlights are
// unaffected.
const GAP_ATTRIBUTE = 'data-leaf-page-gap';
const BREAKS_ATTRIBUTE = 'data-leaf-free-breaks';
const GAP_PROPERTY = '--leaf-page-gap';
// The block's own bottom margin, kept underneath the added gap.
const BASE_PROPERTY = '--leaf-page-gap-base';
// While aligning, let a page break fall between any two lines, so the browser
// never carries the line before along to keep two lines together.
export const PAGE_SHIFT_CSS = `[${GAP_ATTRIBUTE}='top']{padding-top:var(${GAP_PROPERTY}) !important;}[${GAP_ATTRIBUTE}='bottom']{margin-bottom:calc(var(${BASE_PROPERTY}) + var(${GAP_PROPERTY})) !important;}body[${BREAKS_ATTRIBUTE}],body[${BREAKS_ATTRIBUTE}] *{orphans:1 !important;widows:1 !important;}`;

type ShiftableContents = {
  document: Document;
  window: Window;
  sectionIndex: number;
  range: (cfi: string) => Range;
};

function setPageGap(
  block: HTMLElement,
  gap: number,
  side: 'top' | 'bottom' = 'top',
) {
  if (gap > 0) {
    if (side === 'bottom' && !block.hasAttribute(GAP_ATTRIBUTE))
      block.style.setProperty(
        BASE_PROPERTY,
        block.ownerDocument.defaultView?.getComputedStyle(block).marginBottom ||
          '0px',
      );
    block.setAttribute(GAP_ATTRIBUTE, side);
    block.style.setProperty(GAP_PROPERTY, `${gap}px`);
  } else {
    block.removeAttribute(GAP_ATTRIBUTE);
    block.style.removeProperty(GAP_PROPERTY);
    block.style.removeProperty(BASE_PROPERTY);
  }
}

export function clearPageShift(
  contents: Iterable<{ document: Document; window: Window }>,
) {
  clearPageSlide(contents);
  for (const { document: doc } of contents) {
    for (const block of doc.querySelectorAll<HTMLElement>(`[${GAP_ATTRIBUTE}]`))
      setPageGap(block, 0);
    doc.body?.removeAttribute(BREAKS_ATTRIBUTE);
  }
}

// The page's frame and its highlight layer share one wrapper element.
const pageView = (content: { window: Window }) =>
  (content.window.frameElement?.parentElement as HTMLElement | null) ?? null;

// Fallback when no gap can make the line start a page (a long paragraph that
// began on an earlier page, on a short screen): slide this one page up so the
// line sits at the top, leaving blank space at the bottom. The next page still
// continues right after the last line shown. Any page turn undoes it.
export function slidePageToTarget(
  contents: Iterable<ShiftableContents>,
  target: string,
) {
  const section = new EpubCFI(target).spinePos;
  const content = [...contents].find(
    (item) => item.sectionIndex === section && isOnScreen(item),
  );
  const view = content && pageView(content);
  if (!content || !view) return false;
  try {
    const range = content.range(target);
    const node = range.startContainer;
    if (
      range.collapsed &&
      node.nodeType === Node.TEXT_NODE &&
      range.startOffset < (node.textContent?.length ?? 0)
    )
      range.setEnd(node, range.startOffset + 1);
    const line = [...range.getClientRects()].find((rect) => rect.height > 0);
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    if (!line || !element) return false;
    const body = content.document.body;
    const style = content.window.getComputedStyle(body);
    // Letters sit below the top of their line box by half the extra line
    // spacing; slide so the whole line box starts where the page's text does.
    const lineHeight = parseFloat(
      content.window.getComputedStyle(element).lineHeight,
    );
    const leading =
      lineHeight > line.height ? (lineHeight - line.height) / 2 : 0;
    const offset =
      line.top -
      body.getBoundingClientRect().top -
      parseFloat(style.paddingTop) -
      leading;
    if (offset < 1) return false;
    view.style.transform = `translateY(${-Math.round(offset)}px)`;
    return true;
  } catch {
    return false;
  }
}

export function clearPageSlide(contents: Iterable<{ window: Window }>) {
  for (const content of contents) {
    const view = pageView(content);
    if (view?.style.transform) view.style.transform = '';
  }
}

const BLOCKS =
  'p,div,li,blockquote,h1,h2,h3,h4,h5,h6,pre,dd,dt,figure,figcaption,td,th,section,article,aside';

// Returns true when the target line now begins a page. Callers display the
// target afterwards so the reader sees that page.
export function alignTargetToPageTop(
  contents: Iterable<ShiftableContents>,
  target: string,
) {
  const section = new EpubCFI(target).spinePos;
  const content = [...contents].find(
    (item) => item.sectionIndex === section && isOnScreen(item),
  );
  if (!content) return false;
  const doc = content.document;
  const style = content.window.getComputedStyle(doc.body);
  // One page is the width of the chapter's body (its columns overflow to the
  // right); the column settings alone can disagree with the laid-out width.
  const stride = doc.body.getBoundingClientRect().width;
  const columnHeight =
    doc.body.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);
  if (!(stride > 0) || !(columnHeight > 0)) return false;
  let block: HTMLElement | null = null;
  try {
    const start = content.range(target).startContainer;
    const element =
      start.nodeType === Node.ELEMENT_NODE
        ? (start as HTMLElement)
        : start.parentElement;
    block = element?.closest<HTMLElement>(BLOCKS) ?? null;
  } catch {
    return false;
  }
  if (!block || block === doc.body) return false;
  // Turn the free line breaks on before measuring anything: on their own
  // they reflow earlier pages and can move the line, so every measurement
  // below must share that layout.
  doc.body.setAttribute(BREAKS_ATTRIBUTE, '');
  const lineOf = (range: Range) => {
    const node = range.startContainer;
    if (
      range.collapsed &&
      node.nodeType === Node.TEXT_NODE &&
      range.startOffset < (node.textContent?.length ?? 0)
    )
      range.setEnd(node, range.startOffset + 1);
    return [...range.getClientRects()].find((rect) => rect.height > 0);
  };
  // Is the target on the paragraph's first line? Then the gap belongs at the
  // bottom of the block before it (the nearest earlier block in the chapter).
  const first = doc.createRange();
  first.selectNodeContents(block);
  const firstLine = [...first.getClientRects()].find((rect) => rect.height > 0);
  const targetLine = lineOf(content.range(target));
  const startsBlock =
    !!firstLine &&
    !!targetLine &&
    Math.abs(firstLine.top - targetLine.top) < 1 &&
    Math.abs(firstLine.left - targetLine.left) < stride / 2;
  // Earlier blocks, nearest first, whose bottom can hold the gap.
  const earlier: HTMLElement[] = [];
  for (let node: Element | null = block; earlier.length < 3 && node; ) {
    while (node && node !== doc.body && !node.previousElementSibling)
      node = node.parentElement;
    if (!node || node === doc.body) break;
    // The element lives in the book's frame, so check its shape rather than
    // this window's HTMLElement class.
    node = node.previousElementSibling;
    if ((node as HTMLElement | null)?.style) earlier.push(node as HTMLElement);
  }
  // Mid-paragraph, first try a gap at the top of the paragraph. A long
  // paragraph that began on an earlier page can jump in one piece, so then
  // try the bottoms of the blocks before it, which move text in smaller steps.
  const holders: Array<[HTMLElement, 'top' | 'bottom']> = [
    ...(startsBlock ? [] : [[block, 'top'] as [HTMLElement, 'top']]),
    ...earlier.map((item) => [item, 'bottom'] as [HTMLElement, 'bottom']),
  ];
  for (const [holder, side] of holders) {
    // Where the target line sits for a given gap. Reading layout is
    // synchronous, so no frames are needed between measurements.
    const measure = (gap: number) => {
      setPageGap(holder, gap, side);
      const line = lineOf(content.range(target));
      if (!line) return undefined;
      const body = doc.body.getBoundingClientRect();
      return {
        page: Math.floor((line.left - body.left) / stride),
        height: line.height,
        // Letters sit a little below the top of their line box, so the first
        // line of a page measures a few pixels down; a whole line above it
        // would measure at least one line height.
        atTop:
          line.top - body.top - parseFloat(style.paddingTop) < line.height,
      };
    };
    try {
      const found = measure(0);
      if (!found) break;
      if (found.atTop) return true;
      // Grow the gap half a line at a time until the line first moves to the
      // next page (a gap taller than a page can stop pushing text, so search
      // upward from zero), then narrow down the exact size.
      const step = Math.max(4, found.height / 2);
      let low = 0;
      let high = 0;
      for (let gap = step; gap <= columnHeight && !high; gap += step) {
        if ((measure(gap)?.page ?? found.page) > found.page) high = gap;
        else low = gap;
      }
      if (!high) throw new Error('The line never moved to the next page.');
      while (high - low > 0.5) {
        const middle = (low + high) / 2;
        if ((measure(middle)?.page ?? found.page) > found.page) high = middle;
        else low = middle;
      }
      // At the smallest such gap the line before still fits on the page
      // already read, so the reader's line starts the new page.
      if (measure(high + 0.5)?.atTop) return true;
    } catch {
      /* Try the next place for the gap. */
    }
    setPageGap(holder, 0);
  }
  doc.body.removeAttribute(BREAKS_ATTRIBUTE);
  return false;
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
