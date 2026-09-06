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
