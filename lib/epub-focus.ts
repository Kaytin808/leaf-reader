export const FOCUS_UNDERSHOOT_TOLERANCE_LINES = 2;

export type FocusRestoreMetrics = {
  targetOffsetPx?: number;
  lineHeightPx?: number;
  undershootLines?: number;
  withinTolerance: boolean;
};

export function evaluateFocusRestore({
  startComparison,
  endComparison,
  targetOffsetPx,
  lineHeightPx,
  toleranceLines = FOCUS_UNDERSHOOT_TOLERANCE_LINES,
}: {
  startComparison?: number;
  endComparison?: number;
  targetOffsetPx?: number;
  lineHeightPx?: number;
  toleranceLines?: number;
}): FocusRestoreMetrics {
  const measurable =
    Number.isFinite(targetOffsetPx) &&
    Number.isFinite(lineHeightPx) &&
    (lineHeightPx ?? 0) > 0;
  const undershootLines = measurable
    ? Math.max(0, targetOffsetPx ?? 0) / (lineHeightPx ?? 1)
    : undefined;
  const targetStartsPage = startComparison === 0;
  const targetIsOnPage =
    startComparison !== undefined &&
    endComparison !== undefined &&
    startComparison <= 0 &&
    endComparison >= 0;

  return {
    targetOffsetPx,
    lineHeightPx,
    undershootLines,
    withinTolerance:
      targetStartsPage ||
      (targetIsOnPage &&
        undershootLines !== undefined &&
        undershootLines <= toleranceLines),
  };
}
