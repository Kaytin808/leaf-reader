import type { Highlight, Position } from './library';

export type HighlightVisit = {
  highlightId: string;
  quote: string;
  returnTo: Position;
  current: Position;
};

function copyPosition(position: Position): Position {
  return {
    ...position,
    ...(position.epubPage ? { epubPage: { ...position.epubPage } } : {}),
  };
}

export function beginHighlightVisit(
  returnTo: Position,
  highlight: Highlight,
): HighlightVisit {
  return {
    highlightId: highlight.id,
    quote: highlight.text,
    returnTo: copyPosition(returnTo),
    current: copyPosition(highlight),
  };
}

export function moveHighlightVisit(
  visit: HighlightVisit,
  current: Position,
): HighlightVisit {
  return { ...visit, current: copyPosition(current) };
}

export function finishHighlightVisit(
  visit: HighlightVisit,
  choice: 'return' | 'continue',
) {
  return copyPosition(choice === 'return' ? visit.returnTo : visit.current);
}
