import type {
  EnginePosition,
  LayoutSignature,
  PositionCandidate,
  TextQuoteAnchor,
} from './types';

export function normalizeQuoteText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function createTextQuote(
  text: string,
  anchorOffset: number,
  exactLength = 96,
  contextLength = 48,
): TextQuoteAnchor {
  const normalized = normalizeQuoteText(text);
  const offset = Math.max(0, Math.min(normalized.length, anchorOffset));
  return {
    exact: normalized.slice(offset, offset + exactLength),
    prefix: normalized.slice(Math.max(0, offset - contextLength), offset),
    suffix: normalized.slice(
      offset + exactLength,
      offset + exactLength + contextLength,
    ),
  };
}

function matchingContextScore(
  text: string,
  offset: number,
  quote: TextQuoteAnchor,
) {
  const before = text.slice(Math.max(0, offset - quote.prefix.length), offset);
  const after = text.slice(
    offset + quote.exact.length,
    offset + quote.exact.length + quote.suffix.length,
  );
  let score = 0;
  if (quote.prefix && before.endsWith(quote.prefix)) score += 2;
  if (quote.suffix && after.startsWith(quote.suffix)) score += 2;
  return score;
}

export function recoverTextQuoteOffset(
  sourceText: string,
  quote: TextQuoteAnchor,
) {
  const text = normalizeQuoteText(sourceText);
  if (!quote.exact) return undefined;
  const matches: { offset: number; score: number }[] = [];
  let offset = text.indexOf(quote.exact);
  while (offset >= 0) {
    matches.push({
      offset,
      score: matchingContextScore(text, offset, quote),
    });
    offset = text.indexOf(quote.exact, offset + 1);
  }
  if (!matches.length) return undefined;
  matches.sort((a, b) => b.score - a.score || a.offset - b.offset);
  if (
    matches.length > 1 &&
    matches[0].score === matches[1].score &&
    matches[0].score === 0
  )
    return undefined;
  return matches[0].offset;
}

export class PositionAuthority {
  private issuedRevision = 0;
  private committed?: EnginePosition;

  seed(position?: EnginePosition) {
    this.committed = position ? structuredClone(position) : undefined;
    this.issuedRevision = Math.max(
      this.issuedRevision,
      position?.revision ?? 0,
    );
  }

  beginCapture() {
    return ++this.issuedRevision;
  }

  candidate(revision: number, value: PositionCandidate): EnginePosition {
    return {
      ...structuredClone(value),
      schemaVersion: 1,
      revision,
      capturedAt: new Date().toISOString(),
    };
  }

  commit(candidate: EnginePosition) {
    if (candidate.revision !== this.issuedRevision) return false;
    if ((this.committed?.revision ?? 0) > candidate.revision) return false;
    this.committed = structuredClone(candidate);
    return true;
  }

  current() {
    return this.committed ? structuredClone(this.committed) : undefined;
  }
}

export type VisibleRestore = {
  visibleText: string;
  targetOffsetPx: number | null;
  lineHeightPx: number;
  startComparison: -1 | 0 | 1;
};

export function verifyVisibleRestore(
  target: Pick<EnginePosition, 'quote'>,
  visible: VisibleRestore,
  toleranceLines = 2,
) {
  const quoteFound = Boolean(
    target.quote.exact &&
    normalizeQuoteText(visible.visibleText).includes(target.quote.exact),
  );
  const displacementLines =
    visible.targetOffsetPx === null || visible.lineHeightPx <= 0
      ? null
      : visible.targetOffsetPx / visible.lineHeightPx;
  const withinTolerance =
    quoteFound &&
    displacementLines !== null &&
    displacementLines >= 0 &&
    displacementLines <= toleranceLines;
  return {
    quoteFound,
    displacementLines,
    withinTolerance,
    boundarySnapBack: visible.startComparison < 0 && !quoteFound,
  };
}

export function layoutSignatureKey(signature: LayoutSignature) {
  return JSON.stringify([
    Math.round(signature.viewportWidth),
    Math.round(signature.viewportHeight),
    signature.fontSize,
    signature.fontFamily,
    signature.lineHeight,
    signature.margin,
    signature.flow,
  ]);
}

export class PositionLayoutCache<T> {
  private values = new Map<string, T>();

  set(signature: LayoutSignature, value: T) {
    this.values.set(layoutSignatureKey(signature), value);
  }

  get(signature: LayoutSignature) {
    return this.values.get(layoutSignatureKey(signature));
  }

  clear() {
    this.values.clear();
  }
}

export type TransitionFlags = {
  navigationPending: boolean;
  resizePending: boolean;
  focusExpansionPending: boolean;
};

export function shouldRunDeferredExpansion(flags: TransitionFlags) {
  return (
    flags.focusExpansionPending &&
    !flags.navigationPending &&
    !flags.resizePending
  );
}
