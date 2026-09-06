import { imageFromTarget } from './reader-gestures';

// Walk into the actual book document, including scaled fixed-layout EPUBs.
// Points start in the top window's CSS coordinates, not an iframe's columns.
export function bookElementAt(
  area: HTMLElement,
  x: number,
  y: number,
): Element | null {
  let doc = area.ownerDocument;
  let hit = doc.elementFromPoint(x, y);
  if (!hit || !area.contains(hit)) return null;
  for (
    let depth = 0;
    depth < 8 && hit?.tagName.toLowerCase() === 'iframe';
    depth++
  ) {
    const frame = hit as HTMLIFrameElement;
    const bounds = frame.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    try {
      const child = frame.contentDocument;
      if (!child) return null;
      x = (x - bounds.left) * (frame.clientWidth / bounds.width);
      y = (y - bounds.top) * (frame.clientHeight / bounds.height);
      doc = child;
      hit = doc.elementFromPoint(x, y);
    } catch {
      return null;
    }
  }
  return hit;
}

export function bindNativeReaderTaps(
  area: HTMLElement,
  options: {
    enabled: () => boolean;
    turn: (direction: -1 | 1) => void;
    canTurn?: () => boolean;
    center?: () => void;
    image: (image: { src: string; alt: string }) => void;
  },
) {
  const win = area.ownerDocument.defaultView;
  let started: { hit: Element; x: number; y: number } | null = null;
  const handle = (event: Event) => {
    const point = (
      event as CustomEvent<{ x: number; y: number; phase: string }>
    ).detail;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      return;
    if (point.phase === 'start') {
      const hit = options.enabled()
        ? bookElementAt(area, point.x, point.y)
        : null;
      started = hit ? { hit, x: point.x, y: point.y } : null;
      return;
    }
    const original = started;
    started = null;
    if (
      point.phase !== 'end' ||
      !original ||
      !options.enabled() ||
      !original.hit.isConnected ||
      Math.hypot(point.x - original.x, point.y - original.y) > 12
    )
      return;
    // Keep the original target: closing a dialog must not tap the book beneath it.
    const hit = original.hit;
    if (
      !hit ||
      hit.closest(
        'a[href], button, input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="button"]',
      ) ||
      hit.ownerDocument.getSelection()?.toString()
    )
      return;
    const image = imageFromTarget(hit);
    if (image) {
      options.image(image);
      return;
    }
    const bounds = area.getBoundingClientRect();
    const fraction = (point.x - bounds.left) / bounds.width;
    if (fraction >= 0 && fraction < 0.4) {
      if (options.canTurn?.() ?? true) options.turn(-1);
    } else if (fraction > 0.6 && fraction <= 1) {
      if (options.canTurn?.() ?? true) options.turn(1);
    } else if (fraction >= 0.4 && fraction <= 0.6) options.center?.();
  };
  win?.addEventListener('leaf-native-tap', handle);
  return () => win?.removeEventListener('leaf-native-tap', handle);
}
