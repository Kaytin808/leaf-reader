export const FOCUS_CACHE_IDLE_DELAY_MS = 700;
export const FOCUS_CACHE_PAGE_RADIUS = 2;

export type FocusPageBoundary = {
  startCfi: string;
  endCfi: string;
  sectionIndex: number;
};

export type FocusPageCache = {
  layoutKey: string;
  pages: FocusPageBoundary[];
  generatedAt: number;
  sourceCfi: string;
};

export function focusLayoutKey({
  width,
  height,
  fontSize,
  font,
  spacing,
  margin,
  alignment,
  reflowable,
}: {
  width: number;
  height: number;
  fontSize: number;
  font: string;
  spacing: string;
  margin: string;
  alignment: string;
  reflowable: boolean;
}) {
  return [
    Math.round(width),
    Math.round(height),
    fontSize,
    font,
    spacing,
    margin,
    alignment,
    reflowable ? 'reflowable' : 'fixed',
  ].join('|');
}

export function findFocusPage(
  cache: FocusPageCache | undefined,
  targetCfi: string,
  layoutKey: string,
  compare: (left: string, right: string) => number,
) {
  if (!cache) return { page: undefined, reason: 'not-ready' as const };
  if (cache.layoutKey !== layoutKey)
    return { page: undefined, reason: 'stale-layout' as const };

  const exact = cache.pages.find(
    (page) => compare(page.startCfi, targetCfi) === 0,
  );
  if (exact) return { page: exact, reason: 'exact-start' as const };

  const containing = cache.pages.find(
    (page) =>
      compare(page.startCfi, targetCfi) <= 0 &&
      compare(page.endCfi, targetCfi) >= 0,
  );
  if (containing)
    return { page: containing, reason: 'containing-range' as const };
  return { page: undefined, reason: 'outside-buffer' as const };
}

export function uniqueFocusPages(
  pages: FocusPageBoundary[],
  compare: (left: string, right: string) => number,
) {
  const unique = new Map(pages.map((page) => [page.startCfi, page]));
  return [...unique.values()].sort((a, b) => compare(a.startCfi, b.startCfi));
}
