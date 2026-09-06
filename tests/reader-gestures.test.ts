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
  let enabled = true;
  const dispose = bindReaderTaps(doc, {
    enabled: () => enabled,
    bounds: () => ({ left: iframeOffset, width: 400 }),
    turn: (direction) => turns.push(direction),
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
  return {
    doc,
    turns,
    images,
    pointer,
    tap,
    disable: () => {
      enabled = false;
    },
    dispose: () => {
      dispose();
      dom.window.close();
    },
  };
}

test('side taps turn left/right, center is quiet, and paginated iframe coordinates stay correct', () => {
  for (const offset of [0, 1200]) {
    const h = harness(offset);
    h.tap(offset + 30);
    h.tap(offset + 370);
    h.tap(offset + 200);
    assert.deepEqual(h.turns, [-1, 1]);
    h.dispose();
  }
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
