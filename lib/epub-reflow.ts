import type { Location } from 'epubjs/types/rendition';
import type { Position } from './library';
import { positionForEpub, repairChapterLabel, type Chapter } from './chapters';

// One anchor spans the whole animation, including rapid reversals. Each new
// viewport invalidates an older asynchronous resize result.
export class EpubReflow {
  private anchor?: Position;
  private revision = 0;

  get pending() {
    return !!this.anchor;
  }

  begin(position: Position) {
    this.anchor ??= structuredClone(position);
    return ++this.revision;
  }

  snapshot() {
    return this.anchor
      ? { anchor: this.anchor, revision: this.revision }
      : undefined;
  }

  finish(revision: number) {
    if (!this.anchor || revision !== this.revision) return false;
    this.anchor = undefined;
    return true;
  }
}

export function positionAfterReflow(
  location: Location,
  anchor: Position,
  chapters: Chapter[],
  sections: number,
  fontSize: number,
  preservePageNumber = false,
): Position {
  // Repagination never changes the anchored passage or reading progress. A
  // focus-only reflow can also retain the reader-facing page counter so merely
  // showing or hiding controls cannot appear to move the reader backward.
  const fitted = repairChapterLabel(
    {
      ...positionForEpub(location, chapters, sections, undefined, fontSize),
      location: anchor.location,
      progress: anchor.progress,
    },
    chapters,
  );
  return preservePageNumber && anchor.epubPage
    ? { ...fitted, epubPage: structuredClone(anchor.epubPage) }
    : fitted;
}
