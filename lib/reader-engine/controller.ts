import type { Book } from 'epubjs';
import type { Position } from '@/lib/library';
import { captureEpubTextAnchor } from './epub-text-anchor';
import { PositionDiagnostics } from './diagnostics';
import { PositionAuthority } from './position-model';
import { putEnginePosition } from './storage';
import type { EnginePositionSource, LayoutSignature } from './types';

export type EnginePositionObservation = {
  position: Position;
  epub: Book;
  source: EnginePositionSource;
  layoutSignature: LayoutSignature;
};

export class EnginePositionController {
  private readonly authority = new PositionAuthority();
  private readonly bookId: string;
  private readonly diagnostics: PositionDiagnostics;
  private readonly captures = new Set<Promise<void>>();
  private persistence: Promise<void> = Promise.resolve();

  constructor(bookId: string, diagnostics: PositionDiagnostics) {
    this.bookId = bookId;
    this.diagnostics = diagnostics;
  }

  seed(position: Parameters<PositionAuthority['seed']>[0]) {
    this.authority.seed(position);
  }

  observe(observation: EnginePositionObservation) {
    const revision = this.authority.beginCapture();
    const operationId = crypto.randomUUID();
    const startedAt = performance.now();
    const task = (async () => {
      try {
        const { quote, spineHref } = await captureEpubTextAnchor(
          observation.epub,
          observation.position.location,
        );
        const candidate = this.authority.candidate(revision, {
          bookId: this.bookId,
          cfi: observation.position.location,
          spineHref,
          quote,
          progression: Math.max(
            0,
            Math.min(1, observation.position.progress / 100),
          ),
          layoutSignature: observation.layoutSignature,
        });
        await this.diagnostics.record({
          type: 'position.capture',
          operationId,
          source: observation.source,
          position: candidate,
          result: 'success',
          startedAt,
        });
        if (!this.authority.commit(candidate)) {
          await this.diagnostics.record({
            type: 'restore.reject',
            operationId,
            source: observation.source,
            position: candidate,
            result: 'rejected',
            reason: 'stale-revision',
            startedAt,
          });
          return;
        }
        // Serialize writes and re-check the authoritative revision immediately
        // before persistence. A slow, older IndexedDB write can therefore never
        // finish after and overwrite a newer observed position.
        this.persistence = this.persistence.then(async () => {
          const committed = this.authority.current();
          if (!committed || committed.revision !== revision) {
            await this.diagnostics.record({
              type: 'restore.reject',
              operationId,
              source: observation.source,
              position: candidate,
              result: 'rejected',
              reason: 'superseded-before-persist',
              startedAt,
            });
            return;
          }
          await putEnginePosition(committed);
          await this.diagnostics.record({
            type: 'position.persist',
            operationId,
            source: observation.source,
            position: committed,
            result: 'success',
            startedAt,
          });
        });
      } catch {
        // A provisional or image-only CFI must never replace a verified place.
      }
    })();
    this.captures.add(task);
    void task.finally(() => this.captures.delete(task));
  }

  async flush() {
    await Promise.allSettled(this.captures);
    await this.persistence;
    this.diagnostics.export();
  }
}
