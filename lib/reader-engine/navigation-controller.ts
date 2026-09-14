import { PositionDiagnostics } from './diagnostics';
import {
  SingleNavigationQueue,
  type EngineNavigationQueueEvent,
  type EngineNavigationRequest,
} from './navigation-queue';
import { EnginePositionController } from './controller';

export class EngineNavigationController {
  private readonly queue: SingleNavigationQueue;
  private readonly positions: EnginePositionController;
  private readonly diagnostics: PositionDiagnostics;

  constructor(
    positions: EnginePositionController,
    diagnostics: PositionDiagnostics,
  ) {
    this.positions = positions;
    this.diagnostics = diagnostics;
    this.queue = new SingleNavigationQueue((event) => this.record(event));
  }

  get pending() {
    return this.queue.pending;
  }

  run<T>(request: EngineNavigationRequest, execute: () => Promise<T>) {
    return this.queue.enqueue(request, async () => {
      const result = await execute();
      // A navigation operation is not complete until the position it produced
      // has either become authoritative and persisted or been rejected stale.
      await this.positions.settle();
      return result;
    });
  }

  async flush() {
    await this.queue.flush();
    await this.positions.flush();
  }

  private async record(event: EngineNavigationQueueEvent) {
    const position = this.positions.current();
    // A brand-new book has no trustworthy CFI until initial restoration has
    // completed. The completion event will be recorded after capture settles.
    if (!position) return;
    const type = `navigation.${event.phase}` as const;
    await this.diagnostics.record({
      type,
      operationId: event.operationId,
      source:
        event.kind === 'font-reflow'
          ? 'font-change'
          : event.kind === 'viewport-reflow'
            ? 'viewport'
            : event.kind === 'restore'
              ? 'open'
              : event.kind === 'close'
                ? 'close'
                : 'page-turn',
      position,
      result:
        event.phase === 'enqueue'
          ? 'queued'
          : event.phase === 'start'
            ? 'started'
            : event.phase === 'complete'
              ? 'success'
              : 'failed',
      reason: event.phase === 'fail' ? 'operation-failed' : undefined,
      navigation: {
        kind: event.kind,
        direction: event.direction ?? null,
        sequence: event.sequence,
        queueDepthAtEnqueue: event.queueDepthAtEnqueue,
        waitMs: event.waitMs,
        operationDurationMs: event.operationDurationMs,
      },
    });
  }
}
