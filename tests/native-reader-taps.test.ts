import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindNativeReaderTaps } from '../lib/native-reader-taps';
import { bindReaderTaps } from '../lib/reader-gestures';

test('native touch coordinates reach scaled EPUB content without overlays or duplicate DOM turns', () => {
  const dom = new JSDOM('<header>Tools</header><main><iframe></iframe></main>');
  const doc = dom.window.document;
  const area = doc.querySelector('main')!;
  const frame = doc.querySelector('iframe')!;
  const child = frame.contentDocument!;
  child.body.innerHTML =
    '<p>Book text</p><a href="#note">Footnote</a><img src="blob:map" alt="Map" />';
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
    toJSON() {},
  });
  area.getBoundingClientRect = () => rect(0, 80, 400, 600);
  // A later EPUB page, scaled 50%, whose iframe begins offscreen.
  frame.getBoundingClientRect = () => rect(-800, 80, 1600, 600);
  Object.defineProperties(frame, {
    clientWidth: { value: 3200 },
    clientHeight: { value: 1200 },
  });
  let target: Element = child.querySelector('p')!;
  let childPoint = { x: 0, y: 0 };
  doc.elementFromPoint = (_x, y) =>
    y < 80 ? doc.querySelector('header') : frame;
  child.elementFromPoint = (x, y) => {
    childPoint = { x, y };
    return target;
  };
  const turns: number[] = [];
  const images: string[] = [];
  let centers = 0;
  let enabled = true;
  const dispose = bindNativeReaderTaps(area, {
    enabled: () => enabled,
    turn: (n) => turns.push(n),
    center: () => centers++,
    image: (image) => images.push(image.src),
  });
  const disposeDOM = bindReaderTaps(child, {
    enabled: () => true,
    bounds: () => ({ left: 0, width: 400 }),
    turn: (n) => turns.push(n),
  });
  Object.assign(dom.window, { __leafNativeTapEnabled: true });
  const phase = (phase: string, x: number, y = 180) =>
    dom.window.dispatchEvent(
      new dom.window.CustomEvent('leaf-native-tap', {
        detail: { x, y, phase },
      }),
    );
  const tap = (x: number, y = 180) => {
    phase('start', x, y);
    phase('end', x, y);
  };
  try {
    tap(370);
    assert.deepEqual(turns, [1]);
    assert.deepEqual(childPoint, { x: 2340, y: 200 });
    tap(30);
    tap(200);
    assert.deepEqual(turns, [1, -1]);
    assert.equal(centers, 1);
    tap(370, 20);
    assert.deepEqual(turns, [1, -1], 'Header controls cannot turn pages');
    target = child.querySelector('a')!;
    tap(370);
    target = child.querySelector('img')!;
    tap(370);
    assert.deepEqual(images, ['blob:map']);
    target = child.querySelector('p')!;
    const range = child.createRange();
    range.selectNodeContents(target);
    child.getSelection()!.addRange(range);
    tap(370);
    child.getSelection()!.removeAllRanges();
    enabled = false;
    tap(370);
    phase('start', 370);
    enabled = true;
    phase('end', 370);
    phase('end', 370);
    phase('start', 370, 20);
    phase('end', 370, 180);
    phase('start', 370);
    phase('end', 340);
    assert.deepEqual(
      turns,
      [1, -1],
      'Links, selected text and blocked/zoomed readers stay still',
    );
    for (const name of ['pointerdown', 'pointerup']) {
      const event = new dom.window.MouseEvent(name, {
        bubbles: true,
        clientX: 370,
        clientY: 180,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    }
    assert.deepEqual(
      turns,
      [1, -1],
      'Native mode does not also run the old DOM turn handler',
    );
  } finally {
    dispose();
    disposeDOM();
    dom.window.close();
  }
});
