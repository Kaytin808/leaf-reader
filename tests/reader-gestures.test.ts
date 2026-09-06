import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  anchoredScroll,
  bindReaderTaps,
  clampZoom,
  imageFromTarget,
  zoomLayout,
} from '../lib/reader-gestures';

function harness(iframeOffset = 0) {
  const dom = new JSDOM(
    '<main><p>Reading text</p><a href="#chapter">Chapter link</a><img src="blob:local-map" alt="Map" /></main>',
  );
  const doc = dom.window.document;
  const turns: number[] = [];
  const images: string[] = [];
  const centers: number[] = [];
  let enabled = true;
  const dispose = bindReaderTaps(doc, {
    enabled: () => enabled,
    bounds: () => ({ left: iframeOffset, width: 400 }),
    turn: (direction) => turns.push(direction),
    center: () => centers.push(1),
    image: (image) => images.push(image.src),
  });
  const pointer = (
    name: string,
    x: number,
    {
      id = 1,
      y = 100,
      time = 1,
      target = doc.querySelector('p')! as Element,
      button = 0,
    } = {},
  ) => {
    const event = new dom.window.MouseEvent(name, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      timeStamp: { value: time },
    });
    target.dispatchEvent(event);
  };
  const tap = (x: number, target?: Element) => {
    pointer('pointerdown', x, { target });
    pointer('pointerup', x, { time: 100, target });
  };
  const touch = (
    name: string,
    points: { identifier: number; clientX: number; clientY: number }[],
    changed = points,
    time = 1,
    target: Element = doc.querySelector('p')!,
  ) => {
    const event = new dom.window.Event(name, { bubbles: true });
    Object.defineProperties(event, {
      touches: { value: points },
      changedTouches: { value: changed },
      timeStamp: { value: time },
    });
    target.dispatchEvent(event);
  };
  const touchTap = (x: number, target?: Element) => {
    const point = { identifier: 10, clientX: x, clientY: 100 };
    touch('touchstart', [point], [point], 1, target);
    touch('touchend', [], [point], 380, target);
  };
  return {
    doc,
    turns,
    images,
    centers,
    pointer,
    tap,
    touch,
    touchTap,
    disable: () => {
      enabled = false;
    },
    dispose: () => {
      dispose();
      dom.window.close();
    },
  };
}

test('side taps turn pages, center toggles controls, and iframe coordinates stay correct', () => {
  for (const offset of [0, 1200]) {
    const h = harness(offset);
    h.tap(offset + 30);
    h.tap(offset + 370);
    h.tap(offset + 200);
    assert.deepEqual(h.turns, [-1, 1]);
    assert.equal(h.centers.length, 1);
    h.dispose();
  }
});
test('center taps still work while page turns are disabled for a zoomed page', () => {
  const dom = new JSDOM('<main><p>PDF page</p></main>');
  const area = dom.window.document.querySelector('main')!;
  const turns: number[] = [];
  let centers = 0;
  const dispose = bindReaderTaps(area, {
    enabled: () => true,
    canTurn: () => false,
    bounds: () => ({ left: 0, width: 400 }),
    turn: (direction) => turns.push(direction),
    center: () => centers++,
  });
  const tap = (x: number) => {
    for (const [name, time] of [
      ['pointerdown', 1],
      ['pointerup', 100],
    ] as const) {
      const event = new dom.window.MouseEvent(name, {
        bubbles: true,
        clientX: x,
        clientY: 100,
        button: 0,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        timeStamp: { value: time },
      });
      area.querySelector('p')!.dispatchEvent(event);
    }
  };
  tap(370);
  tap(200);
  assert.deepEqual(turns, []);
  assert.equal(centers, 1);
  dispose();
  dom.window.close();
});
test('touch-only iPhone events turn both ways even without pointer events, and do not double-turn', () => {
  const h = harness(1200);
  h.touchTap(1570);
  h.tap(1570); // Compatibility pointer stream must be ignored.
  h.touchTap(1230);
  h.touchTap(1400);
  assert.deepEqual(h.turns, [1, -1]);
  h.touchTap(1570, h.doc.querySelector('img')!);
  assert.deepEqual(h.images, ['blob:local-map']);
  h.dispose();
});
test('touch-only drags, long presses, pinches, links and cancellations do not turn', () => {
  const h = harness();
  const a = { identifier: 10, clientX: 370, clientY: 100 };
  const b = { identifier: 20, clientX: 30, clientY: 100 };
  h.touch('touchstart', [a]);
  h.touch('touchmove', [{ ...a, clientY: 130 }]);
  h.touch('touchend', [], [a], 100);
  h.touch('touchstart', [a]);
  h.touch('touchend', [], [a], 700);
  h.touch('touchstart', [a]);
  h.touch('touchstart', [a, b]);
  h.touch('touchend', [a], [b], 100);
  h.touch('touchend', [], [a], 200);
  h.touch('touchstart', [a]);
  h.touch('touchcancel', [], [a]);
  h.touch('touchend', [], [a], 100);
  h.touchTap(370, h.doc.querySelector('a')!);
  assert.deepEqual(h.turns, []);
  h.touchTap(370);
  assert.deepEqual(
    h.turns,
    [1],
    'Next clean touch recovers after cancellation',
  );
  h.dispose();
});
test('explicitly noneditable EPUB text accepts taps while actual editable content does not', () => {
  const h = harness();
  const p = h.doc.querySelector('p')!;
  p.setAttribute('contenteditable', 'false');
  h.touchTap(370);
  p.setAttribute('contenteditable', 'true');
  h.touchTap(370);
  assert.deepEqual(h.turns, [1]);
  h.dispose();
});
test('dragging, scrolling, long-press, cancel, and multi-touch never turn pages', () => {
  const h = harness();
  h.pointer('pointerdown', 370);
  h.pointer('pointermove', 340);
  h.pointer('pointerup', 370);
  h.pointer('pointerdown', 370);
  h.doc.dispatchEvent(new h.doc.defaultView!.Event('scroll'));
  h.pointer('pointerup', 370);
  h.pointer('pointerdown', 370);
  h.pointer('pointerup', 370, { time: 600 });
  h.pointer('pointerdown', 370);
  h.pointer('pointercancel', 370);
  h.pointer('pointerup', 370);
  h.pointer('pointerdown', 370);
  h.pointer('pointerdown', 30, { id: 2 });
  h.pointer('pointerup', 30, { id: 2 });
  h.pointer('pointerup', 370);
  assert.deepEqual(h.turns, []);
  h.tap(370);
  assert.deepEqual(h.turns, [1]);
  h.dispose();
});
test('links, selected text, disabled readers and secondary buttons do not navigate; image taps enlarge instead', () => {
  const h = harness();
  h.tap(370, h.doc.querySelector('a')!);
  h.tap(370, h.doc.querySelector('img')!);
  assert.deepEqual(h.images, ['blob:local-map']);
  const range = h.doc.createRange();
  range.selectNodeContents(h.doc.querySelector('p')!);
  h.doc.getSelection()!.addRange(range);
  h.tap(370);
  h.doc.getSelection()!.removeAllRanges();
  h.pointer('pointerdown', 370, { button: 2 });
  h.pointer('pointerup', 370, { button: 2 });
  h.disable();
  h.tap(370);
  assert.deepEqual(h.turns, []);
  h.dispose();
});
test('zoom layout keeps every edge reachable, fits wide/tall pages, and clamps zoom', () => {
  for (const [width, height] of [
    [600, 800],
    [1600, 500],
    [500, 2400],
  ]) {
    for (const zoom of [1, 2, 4]) {
      const layout = zoomLayout(width, height, 390, 600, zoom);
      assert.ok(layout.left >= 16 - 0.001);
      assert.ok(layout.stageWidth >= layout.left + layout.width + 16 - 0.001);
      assert.ok(layout.stageHeight >= layout.top + layout.height + 16 - 0.001);
      assert.ok(
        Math.abs(layout.width / layout.height - width / height) < 0.0001,
      );
    }
    const fitted = zoomLayout(width, height, 390, 600, 1, true);
    assert.ok(fitted.width <= 358.001 && fitted.height <= 568.001);
  }
  assert.equal(clampZoom(0.1), 1);
  assert.equal(clampZoom(10), 4);
});
test('zoom focal point remains in place instead of jumping to the page edge', () => {
  const anchor = { x: 0.6, y: 0.3, clientX: 200, clientY: 240 };
  const layout = zoomLayout(600, 800, 390, 600, 3);
  const scroll = anchoredScroll(anchor, layout);
  assert.equal(
    layout.left + anchor.x * layout.width - scroll.left,
    anchor.clientX,
  );
  assert.equal(
    layout.top + anchor.y * layout.height - scroll.top,
    anchor.clientY,
  );
});
test('image magnifier supports embedded SVG image references and rejects remote resources', () => {
  const dom = new JSDOM(
    '<svg><image href="blob:map" /></svg><img src="https://example.com/track.png" />',
  );
  assert.equal(
    imageFromTarget(dom.window.document.querySelector('image')!)?.src,
    'blob:map',
  );
  assert.equal(
    imageFromTarget(dom.window.document.querySelector('img')!),
    null,
  );
  dom.window.close();
});
