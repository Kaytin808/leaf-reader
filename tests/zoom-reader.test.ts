import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ImagePage, PdfPage, ZoomControls } from '../components/zoom-reader';

test('PDF view renders, zooms around the viewport, handles pinch, resets fit, and suppresses zoomed page taps', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const prototype = dom.window.HTMLElement.prototype;
  Object.defineProperties(prototype, {
    clientWidth: {
      configurable: true,
      get() {
        return this.classList.contains('zoom-viewport')
          ? 390
          : parseFloat(this.style.width) || 0;
      },
    },
    clientHeight: {
      configurable: true,
      get() {
        return this.classList.contains('zoom-viewport')
          ? 600
          : parseFloat(this.style.height) || 0;
      },
    },
  });
  prototype.scrollTo = function (
    left: number | ScrollToOptions = 0,
    top?: number,
  ) {
    this.scrollLeft = typeof left === 'number' ? left : left.left || 0;
    this.scrollTop = typeof left === 'number' ? top || 0 : left.top || 0;
  };
  prototype.getBoundingClientRect = function () {
    const viewport = dom.window.document.querySelector('.zoom-viewport');
    const left =
      (parseFloat(this.style.left) || 0) -
      (this.classList.contains('zoom-sheet') ? viewport?.scrollLeft || 0 : 0);
    const top =
      (parseFloat(this.style.top) || 0) -
      (this.classList.contains('zoom-sheet') ? viewport?.scrollTop || 0 : 0);
    return {
      left,
      top,
      width: this.clientWidth,
      height: this.clientHeight,
      x: left,
      y: top,
      right: left + this.clientWidth,
      bottom: top + this.clientHeight,
      toJSON: () => ({}),
    };
  };
  let renders = 0;
  const turns: number[] = [];
  const errors: string[] = [];
  const onError = (message: string) => errors.push(message);
  const pdf = {
    numPages: 2,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: () => {
        renders++;
        return { promise: Promise.resolve(), cancel() {} };
      },
    }),
  } as unknown as PDFDocumentProxy;
  function Harness() {
    const [zoom, setZoom] = useState(1);
    const [resetKey, setReset] = useState(0);
    return createElement(
      'div',
      null,
      createElement(ZoomControls, {
        zoom,
        onChange: (value) => {
          setZoom(value);
          if (value === 1) setReset((n) => n + 1);
        },
      }),
      createElement(PdfPage, {
        document: pdf,
        page: 1,
        zoom,
        resetKey,
        onZoom: setZoom,
        onTurn: (n) => turns.push(n),
        onError,
      }),
    );
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    assert.ok(
      dom.window.document.querySelector('canvas[aria-label="Page 1 of 2"]'),
    );
    assert.ok(renders > 0);
    const viewport = dom.window.document.querySelector(
      '.zoom-viewport',
    ) as HTMLElement;
    const controls = dom.window.document.querySelector('.zoom-controls')!;
    const fit = Array.from(controls.querySelectorAll('button')).find(
      (button) => button.textContent === 'Fit width',
    )!;
    viewport.scrollTop = 90;
    await act(async () => fit.click());
    assert.equal(
      viewport.scrollTop,
      0,
      'Fit width also resets an already-fitted scrolled page',
    );
    await act(async () =>
      (controls.querySelector('[aria-label="Zoom in"]') as HTMLElement).click(),
    );
    assert.equal(controls.querySelector('output')!.textContent, '125%');
    assert.ok(viewport.scrollLeft > 0, 'Button zoom stays centered');
    const pointer = (name: string) => {
      const event = new dom.window.MouseEvent(name, {
        clientX: 370,
        clientY: 100,
        bubbles: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      viewport.dispatchEvent(event);
    };
    await act(async () => {
      pointer('pointerdown');
      pointer('pointerup');
    });
    assert.deepEqual(turns, [], 'No page turns while zoomed');
    const touch = (name: string, distance: number) => {
      const event = new dom.window.Event(name, {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'touches', {
        value:
          name === 'touchend'
            ? []
            : [
                { identifier: 1, clientX: 195 - distance / 2, clientY: 240 },
                { identifier: 2, clientX: 195 + distance / 2, clientY: 240 },
              ],
      });
      Object.defineProperty(event, 'changedTouches', {
        value: [
          { identifier: 1, clientX: 195, clientY: 240 },
          { identifier: 2, clientX: 195, clientY: 240 },
        ],
      });
      viewport.dispatchEvent(event);
      return event;
    };
    await act(async () => {
      touch('touchstart', 100);
      assert.equal(touch('touchmove', 200).defaultPrevented, true);
    });
    assert.equal(controls.querySelector('output')!.textContent, '250%');
    await act(async () => {
      touch('touchend', 0);
      fit.click();
    });
    assert.equal(viewport.scrollLeft, 0);
    assert.equal(viewport.scrollTop, 0);
    assert.equal(controls.querySelector('output')!.textContent, '100%');
    await act(async () => {
      const point = { identifier: 3, clientX: 370, clientY: 100 };
      for (const name of ['touchstart', 'touchend']) {
        const event = new dom.window.Event(name, { bubbles: true });
        Object.defineProperties(event, {
          touches: { value: name === 'touchstart' ? [point] : [] },
          changedTouches: { value: [point] },
        });
        viewport.dispatchEvent(event);
      }
    });
    assert.deepEqual(turns, [1]);
    assert.deepEqual(errors, []);
    Object.assign(globalThis, {
      Image: class {
        naturalWidth = 1200;
        naturalHeight = 800;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    });
    await act(async () =>
      root.render(
        createElement(ImagePage, { src: 'blob:embedded-map', alt: 'Area map' }),
      ),
    );
    assert.ok(dom.window.document.querySelector('img[alt="Area map"]'));
    await act(async () =>
      (
        dom.window.document.querySelector(
          '[aria-label="Zoom in"]',
        ) as HTMLElement
      ).click(),
    );
    assert.equal(
      dom.window.document.querySelector('.zoom-controls output')!.textContent,
      '125%',
    );
    const fitImage = Array.from(
      dom.window.document.querySelectorAll('button'),
    ).find((button) => button.textContent === 'Fit image')!;
    await act(async () => fitImage.click());
    assert.equal(
      dom.window.document.querySelector('.zoom-controls output')!.textContent,
      '100%',
    );
    assert.deepEqual(turns, [1], 'Image zoom never calls page navigation');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
