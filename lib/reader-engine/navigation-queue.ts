export type EngineNavigationKind =
  | 'restore'
  | 'turn'
  | 'jump'
  | 'font-reflow'
  | 'viewport-reflow'
  | 'close';

export type EngineNavigationRequest = {
  kind: EngineNavigationKind;
  direction?: -1 | 1;
};

export type EngineNavigationQueueEvent = EngineNavigationRequest & {
  phase: 'enqueue' | 'start' | 'complete' | 'fail';
  operationId: string;
  sequence: number;
  queueDepthAtEnqueue: number;
  waitMs: number;
  operationDurationMs: number;
};

type EventSink = (event: EngineNavigationQueueEvent) => void | Promise<void>;

export class SingleNavigationQueue {
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private sequence = 0;
  private readonly eventSink?: EventSink;

  constructor(eventSink?: EventSink) {
    this.eventSink = eventSink;
  }

  get pending() {
    return this.queued > 0;
  }

  enqueue<T>(
    request: EngineNavigationRequest,
    execute: () => Promise<T>,
  ): Promise<T> {
    const operationId = crypto.randomUUID();
    const sequence = ++this.sequence;
    const queuedAt = performance.now();
    const queueDepthAtEnqueue = ++this.queued;
    const base = { ...request, operationId, sequence, queueDepthAtEnqueue };
    const operation = this.tail.then(async () => {
      await this.emit({
        ...base,
        phase: 'enqueue',
        waitMs: 0,
        operationDurationMs: 0,
      });
      const startedAt = performance.now();
      const waitMs = Math.max(0, Math.round(startedAt - queuedAt));
      await this.emit({
        ...base,
        phase: 'start',
        waitMs,
        operationDurationMs: 0,
      });
      try {
        const result = await execute();
        await this.emit({
          ...base,
          phase: 'complete',
          waitMs,
          operationDurationMs: Math.max(
            0,
            Math.round(performance.now() - startedAt),
          ),
        });
        return result;
      } catch (cause) {
        await this.emit({
          ...base,
          phase: 'fail',
          waitMs,
          operationDurationMs: Math.max(
            0,
            Math.round(performance.now() - startedAt),
          ),
        });
        throw cause;
      } finally {
        this.queued--;
      }
    });

    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async flush() {
    await this.tail;
  }

  private async emit(event: EngineNavigationQueueEvent) {
    try {
      await this.eventSink?.(event);
    } catch {
      // Diagnostics must never block or fail reading navigation.
    }
  }
}
