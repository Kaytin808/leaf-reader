import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SingleNavigationQueue,
  type EngineNavigationQueueEvent,
} from '../lib/reader-engine/navigation-queue';
import { EngineNavigationController } from '../lib/reader-engine/navigation-controller';
import type { EnginePosition } from '../lib/reader-engine/types';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('single navigation queue executes every operation serially in FIFO order', async () => {
  const order: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const queue = new SingleNavigationQueue();
  const operations = [
    'turn',
    'jump',
    'font-reflow',
    'viewport-reflow',
  ] as const;

  await Promise.all(
    operations.map((kind, index) =>
      queue.enqueue({ kind }, async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        order.push(`start-${index}`);
        await new Promise((resolve) => setTimeout(resolve, 2));
        order.push(`end-${index}`);
        active--;
      }),
    ),
  );

  assert.equal(maximumActive, 1);
  assert.deepEqual(order, [
    'start-0',
    'end-0',
    'start-1',
    'end-1',
    'start-2',
    'end-2',
    'start-3',
    'end-3',
  ]);
  assert.equal(queue.pending, false);
});

test('position settlement completes before the next navigation starts', async () => {
  const positionWrite = deferred();
  const order: string[] = [];
  const queue = new SingleNavigationQueue();
  const first = queue.enqueue({ kind: 'turn', direction: 1 }, async () => {
    order.push('next');
    await positionWrite.promise;
    order.push('position-persisted');
  });
  const second = queue.enqueue({ kind: 'turn', direction: 1 }, async () => {
    order.push('second-next');
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(order, ['next']);
  positionWrite.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['next', 'position-persisted', 'second-next']);
});

test('a failed operation does not poison later navigation', async () => {
  const queue = new SingleNavigationQueue();
  const failed = queue.enqueue({ kind: 'jump' }, async () => {
    throw new Error('fixture failure');
  });
  const next = queue.enqueue({ kind: 'turn', direction: 1 }, async () => 42);

  await assert.rejects(failed, /fixture failure/);
  assert.equal(await next, 42);
  await queue.flush();
  assert.equal(queue.pending, false);
});

test('a diagnostics failure never blocks reading navigation', async () => {
  const queue = new SingleNavigationQueue(async () => {
    throw new Error('diagnostics unavailable');
  });

  assert.equal(
    await queue.enqueue({ kind: 'turn', direction: 1 }, async () => 'advanced'),
    'advanced',
  );
  assert.equal(queue.pending, false);
});

test('queue diagnostics use one sequence for mixed normal and Focus turns', async () => {
  const events: EngineNavigationQueueEvent[] = [];
  const queue = new SingleNavigationQueue((event) => {
    events.push(event);
  });
  await queue.enqueue({ kind: 'turn', direction: 1 }, async () => {});
  await queue.enqueue({ kind: 'turn', direction: -1 }, async () => {});

  assert.deepEqual(
    events.map(({ phase, sequence, kind, direction }) => ({
      phase,
      sequence,
      kind,
      direction,
    })),
    [
      { phase: 'enqueue', sequence: 1, kind: 'turn', direction: 1 },
      { phase: 'start', sequence: 1, kind: 'turn', direction: 1 },
      { phase: 'complete', sequence: 1, kind: 'turn', direction: 1 },
      { phase: 'enqueue', sequence: 2, kind: 'turn', direction: -1 },
      { phase: 'start', sequence: 2, kind: 'turn', direction: -1 },
      { phase: 'complete', sequence: 2, kind: 'turn', direction: -1 },
    ],
  );
});

test('navigation controller holds the queue until authoritative position settlement', async () => {
  const gate = deferred();
  const calls: string[] = [];
  const position: EnginePosition = {
    schemaVersion: 1,
    bookId: 'fixture',
    cfi: 'epubcfi(/6/2!/4/2/1:0)',
    spineHref: 'chapter.xhtml',
    quote: { exact: 'opening words', prefix: '', suffix: '' },
    progression: 0.1,
    revision: 1,
    capturedAt: new Date(0).toISOString(),
    layoutSignature: {
      viewportWidth: 390,
      viewportHeight: 664,
      fontSize: 20,
      fontFamily: 'book',
      lineHeight: 1.7,
      margin: 'standard',
      flow: 'paginated',
    },
  };
  const positions = {
    current: () => position,
    settle: async () => {
      calls.push('settle-start');
      await gate.promise;
      calls.push('settle-end');
    },
    flush: async () => {},
  };
  const diagnostics = {
    record: async ({ type }: { type: string }) => {
      calls.push(type);
    },
  };
  const controller = new EngineNavigationController(
    positions as never,
    diagnostics as never,
  );

  const first = controller.run({ kind: 'turn', direction: 1 }, async () => {
    calls.push('first-turn');
  });
  const second = controller.run({ kind: 'turn', direction: 1 }, async () => {
    calls.push('second-turn');
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(calls.includes('first-turn'));
  assert.ok(calls.includes('settle-start'));
  assert.equal(calls.includes('second-turn'), false);

  gate.resolve();
  await Promise.all([first, second]);
  assert.ok(calls.indexOf('settle-end') < calls.indexOf('second-turn'));
});
