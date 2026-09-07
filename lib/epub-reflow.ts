import type { Location } from 'epubjs/types/rendition';
import type { Position } from './library';
import { positionForEpub, repairChapterLabel, type Chapter } from './chapters';

export function focusContinuationTarget(location: Location) {
  return location.atEnd ? undefined : location.end.cfi;
}

export function focusContinuationTrim(contentTop: number, inset = 8) {
  if (!Number.isFinite(contentTop)) return 0;
  return Math.max(0, Math.round(contentTop - Math.max(0, inset)));
}

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
): Position {
  // Repagination never changes the anchored passage or reading progress. The
  // screen-page counter is allowed to reflect the new viewport height.
  return repairChapterLabel(
    {
      ...positionForEpub(location, chapters, sections, undefined, fontSize),
      location: anchor.location,
      progress: anchor.progress,
    },
    chapters,
  );
}
