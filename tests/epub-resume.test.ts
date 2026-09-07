import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type { Location } from 'epubjs/types/rendition';
import {
  reportLatestLocation,
  restoreEpubLocation,
} from '../lib/epub-location';
import { positionForEpub } from '../lib/chapters';
import { addBook, updateBook, listBooks, deleteBook } from '../lib/library';
import {
  EpubReflow,
  focusContinuationTarget,
  focusContinuationTrim,
  positionAfterReflow,
} from '../lib/epub-reflow';

const cfi = (page: number) => `epubcfi(/6/2!/4/2/1:${page * 100})`;
function at(page: number): Location {
  const start = {
    index: 0,
    href: 'chapter.xhtml',
    cfi: cfi(page),
    location: 0,
    percentage: 0,
    displayed: { page, total: 100 },
  };
  return {
    start,
    end: { ...start, cfi: cfi(page + 1) },
    atStart: false,
    atEnd: false,
  };
}

test('repeated viewport reflows update page counters without moving the saved passage', async () => {
  const id = 'focus-resume-cycle';
  let position = positionForEpub(at(45), [], 1);
  const original = structuredClone(position);
  await addBook(
    {
      id,
      title: 'Focus test',
      author: 'Test',
      filename: 'focus.epub',
      format: 'epub',
      size: 0,
      addedAt: 1,
      lastRead: 1,
      position,
      bookmarks: [],
    },
    new Blob(),
  );
  try {
    const transition = new EpubReflow();
    for (let i = 0; i < 10; i++) {
      for (const page of [31, 45]) {
        transition.begin(position);
        const first = transition.snapshot()!;
        // The animation briefly reports a different page; a newer viewport
        // must supersede the old resize without adopting that interim anchor.
        transition.begin(positionForEpub(at(37), [], 1));
        assert.equal(transition.finish(first.revision), false);
        const settled = transition.snapshot()!;
        assert.equal(settled.anchor.location, original.location);
        position = positionAfterReflow(at(page), settled.anchor, [], 1, 20);
        assert.equal(transition.finish(settled.revision), true);
        await updateBook(id, { position });
        const saved = (await listBooks()).find((book) => book.id === id)!;
        assert.equal(saved.position.location, original.location);
        assert.equal(saved.position.progress, original.progress);
        assert.equal(saved.position.epubPage?.page, page);
      }
    }
  } finally {
    await deleteBook(id);
  }
});

test('reading ahead after a viewport reflow becomes the next anchor', () => {
  const transition = new EpubReflow();
  const normal = positionForEpub(at(45), [], 1);
  transition.begin(normal);
  const focus = transition.snapshot()!;
  positionAfterReflow(at(31), focus.anchor, [], 1, 20);
  transition.finish(focus.revision);
  const advanced = positionForEpub(at(49), [], 1);
  transition.begin(advanced);
  const returning = transition.snapshot()!;
  const restored = positionAfterReflow(at(51), returning.anchor, [], 1, 20);
  assert.equal(restored.location, advanced.location);
  assert.equal(restored.epubPage?.page, 51);
  assert.notEqual(restored.location, normal.location);
});

test('focus continuation begins exactly where the fixed current page ends', () => {
  assert.equal(focusContinuationTarget(at(40)), cfi(41));
  assert.equal(focusContinuationTarget({ ...at(40), atEnd: true }), undefined);
});

test('focus continuation aligns its first visible line without clipping text', () => {
  assert.equal(focusContinuationTrim(72), 64);
  assert.equal(focusContinuationTrim(5), 0);
  assert.equal(focusContinuationTrim(Number.NaN), 0);
});

test('fitting more text onto the final page does not mark the book complete', () => {
  const anchor = positionForEpub(at(98), [], 1);
  const fitted = positionAfterReflow(
    { ...at(65), atEnd: true },
    anchor,
    [],
    1,
    20,
  );
  assert.equal(fitted.location, anchor.location);
  assert.equal(fitted.progress, anchor.progress);
  assert.ok(fitted.progress < 100);
});

test('location capture waits for its queued report instead of accepting an older relocation', async () => {
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  let release!: () => void;
  let visible = at(37);
  const queued = new Promise<void>((resolve) => {
    release = resolve;
  });
  let resolved = false;
  const reading = reportLatestLocation({
    reportLocation: () => queued,
    currentLocation: () => visible,
  }).then((value) => {
    resolved = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(
    resolved,
    false,
    'An older page must not be returned while navigation is queued',
  );
  visible = at(45);
  release();
  await Promise.resolve();
  assert.equal(resolved, false, 'Wait for the animation-frame report');
  frames.shift()!(0);
  assert.equal((await reading).start.displayed.page, 45);
});

test('save 45 after 37, reopen from storage, and resize to the latest saved passage', async () => {
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 1;
  };
  const id = 'resume-cycle';
  await addBook(
    {
      id,
      title: 'Resume test',
      author: 'Test',
      filename: 'test.epub',
      format: 'epub',
      size: 0,
      addedAt: 1,
      lastRead: 1,
      position: positionForEpub(at(37), [], 1),
      bookmarks: [],
    },
    new Blob(),
  );
  try {
    await updateBook(id, { position: positionForEpub(at(45), [], 1) });
    const saved = (await listBooks()).find((book) => book.id === id)!;
    let visible = at(37);
    const targets: Array<string | undefined> = [];
    const restored = await restoreEpubLocation(
      {
        display: async (target) => {
          targets.push(target);
          visible = target === cfi(45) ? at(45) : at(37);
        },
        reportLocation: async () => {},
        currentLocation: () => visible,
        resize: (_width, _height, target) => {
          targets.push(target);
          visible = target === cfi(45) ? at(45) : at(37);
        },
      },
      saved.position.location,
      () => ({ width: 390, height: 600 }),
    );
    assert.deepEqual(targets, [cfi(45), cfi(45), cfi(45)]);
    assert.equal(restored.start.displayed.page, 45);
    await updateBook(id, {
      position: positionForEpub(restored, [], 1, saved.position.location),
    });
    assert.equal(
      (await listBooks()).find((book) => book.id === id)?.position.location,
      cfi(45),
    );
  } finally {
    await deleteBook(id);
  }
});

test('failed restoration does not fall back to the first page', async () => {
  const targets: Array<string | undefined> = [];
  await assert.rejects(
    restoreEpubLocation(
      {
        display: async (target) => {
          targets.push(target);
          throw new Error('Unable to restore');
        },
        reportLocation: async () => {},
        currentLocation: () => at(1),
        resize: () => {},
      },
      cfi(45),
      () => ({ width: 390, height: 600 }),
    ),
    /Unable to restore/,
  );
  assert.deepEqual(targets, [cfi(45)]);
});
