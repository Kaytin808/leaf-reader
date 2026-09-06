export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export function zoomLayout(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  fitHeight = false,
) {
  const fit = Math.min(
    Math.max(1, viewportWidth - 32) / width,
    920 / width,
    fitHeight ? Math.max(1, viewportHeight - 32) / height : Infinity,
  );
  const pageWidth = width * fit * clampZoom(zoom);
  const pageHeight = height * fit * clampZoom(zoom);
  const stageWidth = Math.max(viewportWidth, pageWidth + 32);
  const stageHeight = Math.max(viewportHeight, pageHeight + 32);
  return {
    width: pageWidth,
    height: pageHeight,
    stageWidth,
    stageHeight,
    left: (stageWidth - pageWidth) / 2,
    top: fitHeight ? (stageHeight - pageHeight) / 2 : 16,
  };
}

export function anchoredScroll(
  anchor: { x: number; y: number; clientX: number; clientY: number },
  layout: ReturnType<typeof zoomLayout>,
) {
  return {
    left: Math.max(0, layout.left + anchor.x * layout.width - anchor.clientX),
    top: Math.max(0, layout.top + anchor.y * layout.height - anchor.clientY),
  };
}

// Use DOM shape checks instead of instanceof: EPUB targets belong to another window.
export function eventElement(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  return node?.nodeType === 1
    ? (node as Element)
    : (node?.parentElement ?? null);
}

export function imageFromTarget(
  target: Element,
): { src: string; alt: string } | null {
  const image = target.closest('img, image');
  if (!image) return null;
  const src =
    (image as HTMLImageElement).currentSrc ||
    image.getAttribute('src') ||
    image.getAttribute('href') ||
    image.getAttribute('xlink:href') ||
    '';
  // Reader archives already resolve local resources; never fetch arbitrary book URLs.
  if (!/^(blob:|data:image\/)/i.test(src)) return null;
  return {
    src,
    alt:
      image.getAttribute('alt') ||
      image.getAttribute('aria-label') ||
      'Book illustration',
  };
}

export function bindReaderTaps(
  target: HTMLElement | Document,
  options: {
    enabled: () => boolean;
    bounds: () => { left: number; width: number };
    turn: (direction: -1 | 1) => void;
    image?: (image: { src: string; alt: string }) => void;
  },
) {
  const doc =
    target.nodeType === 9 ? (target as Document) : target.ownerDocument!;
  const enabled = () => {
    try {
      if (
        (
          doc.defaultView?.top as
            | (Window & { __leafNativeTapEnabled?: boolean })
            | null
        )?.__leafNativeTapEnabled
      )
        return false;
    } catch {
      /* Standalone web reading still uses browser touches. */
    }
    return options.enabled();
  };
  const active = new Set<number>();
  let lastTouch = -Infinity;
  type Tap = {
    id: number;
    x: number;
    y: number;
    time: number;
    element: Element;
  };
  let start: Tap | null = null;
  let touchStart: Tap | null = null;
  function activate(tap: Tap, x: number, y: number, time: number) {
    if (
      !enabled() ||
      time - tap.time > 450 ||
      Math.hypot(x - tap.x, y - tap.y) > 12 ||
      doc.getSelection()?.toString()
    )
      return;
    const picture = imageFromTarget(tap.element);
    if (picture && options.image) {
      options.image(picture);
      return;
    }
    const bounds = options.bounds();
    const fraction = (x - bounds.left) / bounds.width;
    if (fraction >= 0 && fraction < 0.4) options.turn(-1);
    else if (fraction > 0.6 && fraction <= 1) options.turn(1);
  }
  function eligible(raw: EventTarget | null) {
    const element = eventElement(raw);
    return element &&
      !element.closest(
        'a, button, input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="button"]',
      )
      ? element
      : null;
  }
  const down = (raw: Event) => {
    const event = raw as PointerEvent;
    if (Date.now() - lastTouch < 800) return;
    // A pointer released outside the surface must not poison the next gesture.
    if (event.isPrimary) active.clear();
    active.add(event.pointerId);
    const element = eligible(event.target);
    if (active.size !== 1 || event.button !== 0 || !enabled() || !element) {
      start = null;
      return;
    }
    start = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      element,
    };
  };
  const move = (raw: Event) => {
    const event = raw as PointerEvent;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    )
      start = null;
  };
  const up = (raw: Event) => {
    const event = raw as PointerEvent;
    const tap = start;
    start = null;
    active.delete(event.pointerId);
    if (
      !tap ||
      tap.id !== event.pointerId ||
      active.size ||
      Date.now() - lastTouch < 800
    )
      return;
    activate(tap, event.clientX, event.clientY, event.timeStamp);
  };
  // iOS WebViews can deliver touch events without a complete pointer sequence.
  // Touch owns the gesture once it begins; compatibility pointer/mouse events
  // are ignored, including after opening a new section or an image dialog.
  const touchDown = (raw: Event) => {
    const event = raw as TouchEvent;
    lastTouch = Date.now();
    start = null;
    active.clear();
    const element = eligible(event.target);
    const touch = event.touches[0];
    touchStart =
      event.touches.length === 1 && touch && element && enabled()
        ? {
            id: touch.identifier,
            x: touch.clientX,
            y: touch.clientY,
            time: event.timeStamp,
            element,
          }
        : null;
  };
  const touchMove = (raw: Event) => {
    const event = raw as TouchEvent;
    const touch = Array.from(event.touches).find(
      (point) => point.identifier === touchStart?.id,
    );
    if (
      event.touches.length !== 1 ||
      !touch ||
      (touchStart &&
        Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) >
          12)
    )
      touchStart = null;
  };
  const touchUp = (raw: Event) => {
    const event = raw as TouchEvent;
    const tap = touchStart;
    touchStart = null;
    lastTouch = Date.now();
    const touch = Array.from(event.changedTouches).find(
      (point) => point.identifier === tap?.id,
    );
    if (tap && touch && event.touches.length === 0)
      activate(tap, touch.clientX, touch.clientY, event.timeStamp);
  };
  const touchCancel = () => {
    touchStart = null;
    lastTouch = Date.now();
  };
  const cancel = (raw: Event) => {
    active.delete((raw as PointerEvent).pointerId);
    start = null;
  };
  const scroll = () => {
    start = null;
    touchStart = null;
  };
  const listeners = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    touchstart: touchDown,
    touchmove: touchMove,
    touchend: touchUp,
    touchcancel: touchCancel,
    scroll,
  };
  for (const [name, handler] of Object.entries(listeners))
    target.addEventListener(name, handler, { capture: true, passive: true });
  return () => {
    for (const [name, handler] of Object.entries(listeners))
      target.removeEventListener(name, handler, true);
    active.clear();
    start = null;
    touchStart = null;
  };
}
