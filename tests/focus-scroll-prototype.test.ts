import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { switchFocusScrollPrototype } from '../lib/focus-scroll-prototype';

globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
  callback(0);
  return 1;
}) as typeof requestAnimationFrame;

function fakeReader(cfi: string) {
  const calls: string[] = [];
  return {
    calls,
    reader: {
      currentLocation: () => ({ start: { cfi }, end: { cfi } }),
      reportLocation: async () => undefined,
      flow: (value: string) => calls.push(`flow:${value}`),
      display: async (target: string) => {
        calls.push(`display:${target}`);
      },
    },
  };
}

test('throwaway Focus entry switches the same rendition to scrolled flow at its raw CFI', async () => {
  const cfi = 'epubcfi(/6/8!/4/12/1:24)';
  const { reader, calls } = fakeReader(cfi);
  const result = await switchFocusScrollPrototype(reader as never, {
    focus: true,
    applyContainerLayout: async () => {
      calls.push('layout:focus');
    },
    viewport: () => ({ width: 390, height: 760 }),
  });

  assert.deepEqual(calls, [
    'layout:focus',
    'flow:scrolled-doc',
    `display:${cfi}`,
  ]);
  assert.equal(result.beforeCfi, cfi);
  assert.equal(result.afterCfi, cfi);
  assert.equal(result.exactStartMatch, true);
  assert.equal(result.targetContained, true);
  assert.equal(result.restoreAttempts, 1);
});

test('throwaway Focus exit restores paginated flow at the scrolled raw CFI', async () => {
  const cfi = 'epubcfi(/6/8!/4/28/1:6)';
  const { reader, calls } = fakeReader(cfi);
  const result = await switchFocusScrollPrototype(reader as never, {
    focus: false,
    applyContainerLayout: async () => {
      calls.push('layout:normal');
    },
    viewport: () => ({ width: 390, height: 596 }),
  });

  assert.deepEqual(calls, [
    'layout:normal',
    'flow:paginated',
    `display:${cfi}`,
  ]);
  assert.equal(result.transition, 'exit');
  assert.equal(result.exactStartMatch, true);
  assert.equal(result.targetContained, true);
});

test('prototype retries the same raw CFI after epub.js rebuilds its flow', async () => {
  const target = 'epubcfi(/6/8!/4/28/1:6)';
  let reads = 0;
  const displays: string[] = [];
  const reader = {
    currentLocation: () => {
      reads++;
      if (reads === 1)
        return { start: { cfi: target }, end: { cfi: target } };
      if (reads === 2)
        return {
          start: { cfi: 'epubcfi(/6/8!/4/12/1:0)' },
          end: { cfi: 'epubcfi(/6/8!/4/20/1:0)' },
        };
      return {
        start: { cfi: 'epubcfi(/6/8!/4/28/1:0)' },
        end: { cfi: 'epubcfi(/6/8!/4/30/1:0)' },
      };
    },
    reportLocation: async () => undefined,
    flow: () => undefined,
    display: async (cfi: string) => {
      displays.push(cfi);
    },
  };

  const result = await switchFocusScrollPrototype(reader as never, {
    focus: true,
    applyContainerLayout: async () => undefined,
    viewport: () => ({ width: 390, height: 760 }),
  });

  assert.deepEqual(displays, [target, target]);
  assert.equal(result.targetContained, true);
  assert.equal(result.restoreAttempts, 2);
});

test('prototype rejects a layout that cannot restore the raw target CFI', async () => {
  const target = 'epubcfi(/6/8!/4/28/1:6)';
  let reads = 0;
  const reader = {
    currentLocation: () => {
      reads++;
      if (reads === 1)
        return { start: { cfi: target }, end: { cfi: target } };
      return {
        start: { cfi: 'epubcfi(/6/8!/4/12/1:0)' },
        end: { cfi: 'epubcfi(/6/8!/4/20/1:0)' },
      };
    },
    reportLocation: async () => undefined,
    flow: () => undefined,
    display: async () => undefined,
  };

  await assert.rejects(
    switchFocusScrollPrototype(reader as never, {
      focus: true,
      applyContainerLayout: async () => undefined,
      viewport: () => ({ width: 390, height: 760 }),
    }),
    /focus-scroll-cfi-restore-missed/,
  );
});

test('prototype stays isolated from Engine V2 and is visibly marked throwaway', () => {
  const source = readFileSync(
    new URL('../lib/focus-scroll-prototype.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /THROWAWAY PROTOTYPE/);
  assert.doesNotMatch(
    source,
    /from ['"][^'"]*(reader-engine|navigation-controller|epub-reflow)/,
  );
});
