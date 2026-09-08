import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../app/product.css', import.meta.url),
  'utf8',
);
const nativeCss = readFileSync(
  new URL('../mobile/native.css', import.meta.url),
  'utf8',
);
const readerSource = readFileSync(
  new URL('../components/reader.tsx', import.meta.url),
  'utf8',
);

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function nativeRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nativeCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('focus expands into toolbar rows without entering the iPhone safe areas', () => {
  const reader = rule('.reader');
  assert.match(reader, /display:\s*grid/);
  assert.match(reader, /--reader-header-height/);
  assert.match(reader, /--reader-footer-height/);
  assert.match(reader, /padding-top:\s*env\(safe-area-inset-top\)/);
  assert.match(reader, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);

  const readingArea = rule('.reading-area');
  assert.match(readingArea, /position:\s*relative/);
  assert.match(readingArea, /height:\s*100%/);
  assert.match(readingArea, /min-height:\s*0/);
  assert.doesNotMatch(readingArea, /\binset:/);

  const epubArea = rule('.epub-area');
  assert.match(epubArea, /width:\s*100%/);
  assert.match(epubArea, /height:\s*100%/);
  assert.match(epubArea, /min-height:\s*0/);
  assert.match(epubArea, /margin:\s*0 auto/);

  assert.doesNotMatch(reader, /transition:\s*grid-template-rows/);
  assert.match(
    rule('.reader-focus'),
    /grid-template-rows:\s*14px\s+minmax\(0,\s*1fr\)\s+14px/,
  );
  assert.match(
    rule('.reader-focus.reader-focus-deferred'),
    /--reader-header-height/,
  );
  assert.match(
    rule('.reader-focus.reader-focus-deferred'),
    /--reader-footer-height/,
  );

  for (const selector of [
    '.reader-focus .reader-header',
    '.reader-focus .reader-bottom',
  ]) {
    const focusRule = rule(selector);
    assert.match(focusRule, /transform:\s*translateY/);
    assert.doesNotMatch(focusRule, /max-height|min-height|padding/);
  }

  assert.match(rule('.reader-header'), /position:\s*relative/);
  assert.match(rule('.reader-bottom'), /position:\s*relative/);
  assert.match(rule('.reader-header'), /grid-row:\s*1/);
  assert.match(readingArea, /grid-row:\s*2/);
  assert.match(readingArea, /overflow:\s*hidden/);
  assert.match(readingArea, /contain:\s*layout paint/);
  assert.match(rule('.reader-bottom'), /grid-row:\s*3/);

  const primaryPage = rule('.epub-primary-page');
  assert.match(primaryPage, /height:\s*100%/);
  assert.match(primaryPage, /flex:\s*0 0 100%/);
  assert.equal(rule('.reader-focus .epub-primary-page'), '');

  const focusActions = rule('.reader-focus-actions');
  assert.match(focusActions, /safe-area-inset-bottom/);
  assert.match(focusActions, /display:\s*none/);
  assert.doesNotMatch(focusActions, /\btop:/);
  assert.match(rule('.reader-focus .reader-focus-actions'), /display:\s*flex/);
});

test('native reader toolbars do not apply safe-area padding twice', () => {
  assert.match(nativeRule('.reader-header'), /padding-top:\s*10px/);
  assert.match(nativeRule('.reader-bottom'), /padding-bottom:\s*7px/);
  assert.doesNotMatch(nativeRule('.reader-header'), /safe-area-inset-top/);
  assert.doesNotMatch(nativeRule('.reader-bottom'), /safe-area-inset-bottom/);
});

test('focus keeps one visible EPUB rendition and uses an inert background paginator', () => {
  assert.equal(readerSource.match(/renderTo\(/g)?.length, 1);
  assert.equal(readerSource.match(/new EpubRendition/g)?.length, 1);
  assert.match(readerSource, /new EpubRendition\(localBook,/);
  assert.match(
    readerSource,
    /ref=\{focusCacheMount\}[\s\S]*?className="epub-focus-cache"[\s\S]*?inert/,
  );
  assert.doesNotMatch(readerSource, /epub-focus-page|epubPreviewMount/);
  assert.doesNotMatch(
    readerSource,
    /!controlsVisible\s*&&\s*\(\s*<div\s+className="reader-focus-actions"/,
  );
  assert.match(
    readerSource,
    /\{book\.format === 'epub' && \(\s*<div ref=\{epubPageMount\} className="epub-primary-page" \/>\s*\)\}/,
  );
  assert.match(
    readerSource,
    /direction > 0 \? reader\?\.next\(\) : reader\?\.prev\(\)/,
  );
});

test('focus requests made during navigation are queued and applied after saving', () => {
  assert.match(
    readerSource,
    /navigationPending\.current \|\|[\s\S]*?focusExpansionPending\.current[\s\S]*?queuedControlsVisibility\.current = visible;/,
  );
  assert.match(
    readerSource,
    /await writeQueue\.current\.catch\(\(\) => \{\}\);\s*navigationPending\.current = false;/,
  );
  assert.match(
    readerSource,
    /const queued = queuedControlsVisibility\.current;\s*if \(queued === null\) return;\s*queuedControlsVisibility\.current = null;\s*applyReaderControls\(queued\);/,
  );
  assert.doesNotMatch(
    readerSource,
    /controlsVisibleRef\.current === visible \|\| navigationPending\.current/,
  );
});

test('deferred Focus expansion is a Focus-only one-shot after a successful turn', () => {
  assert.match(
    readerSource,
    /const expandFocusAfterTurn =\s*!controlsVisibleRef\.current &&\s*focusExpansionDeferredRef\.current;/,
  );
  assert.match(
    readerSource,
    /const shouldExpandFocusAfterTurn =\s*expandFocusAfterTurn &&\s*!controlsVisibleRef\.current &&\s*focusExpansionDeferredRef\.current;/,
  );
  assert.match(
    readerSource,
    /if \(shouldExpandFocusAfterTurn\) \{[\s\S]*?focusResizeTransition\.current = 'deferred-after-turn';[\s\S]*?focusExpansionDeferredRef\.current = false;/,
  );
});

test('a completed Focus transition coalesces a duplicate observer resize', () => {
  assert.match(
    readerSource,
    /focusResizeTransition\.current === 'layout' &&\s*viewportKey === lastCompletedViewportKey/,
  );
  assert.match(
    readerSource,
    /lastCompletedViewportKey = viewportKey;[\s\S]*?focusResizeTransition\.current = 'layout';/,
  );
  assert.match(readerSource, /\[reader-focus-cfi\] duplicate viewport skipped/);
});

test('Focus re-entry preserves an exact saved CFI contained by the normal page', () => {
  assert.match(
    readerSource,
    /function locationContainsCfi\([\s\S]*?reader\.epubcfi\.compare\(location\.start\.cfi, cfi\) <= 0 &&[\s\S]*?reader\.epubcfi\.compare\(cfi, location\.end\.cfi\) <= 0/,
  );
  assert.match(
    readerSource,
    /focusPassageCfi\.current = savedCfiIsVisible\s*\? savedCfi\s*:\s*liveLocation\?\.start\?\.cfi/,
  );
  assert.match(
    readerSource,
    /const readingCfi =\s*focusPassageCfi\.current \|\|\s*\(locationContainsCfi\(r, liveLocation, savedCfi\)\s*\? savedCfi\s*:\s*liveLocation\?\.start\?\.cfi\)/,
  );
});

test('focus measures visual undershoot and defers expansion without page correction', () => {
  const pendingCheck = readerSource.indexOf(
    'if (navigationPending.current)',
    readerSource.indexOf('const schedule'),
  );
  const anchorCapture = readerSource.indexOf(
    'layoutReflow.current.begin(current.current)',
    readerSource.indexOf('const schedule'),
  );
  assert.ok(pendingCheck >= 0);
  assert.ok(anchorCapture > pendingCheck);
  assert.match(
    readerSource,
    /const liveLocation = r\.currentLocation\(\)[\s\S]*?const savedCfi = current\.current\.location;[\s\S]*?const readingCfi =\s*focusPassageCfi\.current \|\|[\s\S]*?locationContainsCfi\(r, liveLocation, savedCfi\)/,
  );
  assert.match(
    readerSource,
    /if \(!visible && isEpub\)[\s\S]*?focusPassageCfi\.current =[\s\S]*?liveLocation\?\.start\?\.cfi/,
  );
  assert.match(
    readerSource,
    /if \(!controlsVisibleRef\.current\)\s*focusPassageCfi\.current = location\.start\.cfi;/,
  );
  assert.match(
    readerSource,
    /if \(controlsVisibleRef\.current\)\s*focusPassageCfi\.current = undefined;/,
  );
  assert.match(
    readerSource,
    /await resizeEpubAt\(r,\s*area\.clientWidth,\s*area\.clientHeight,\s*resizeCfi\);\s*await r\.display\(resizeCfi\);/,
  );
  assert.match(
    readerSource,
    /await r\.display\(resizeCfi\);\s*const restoredLocation = r\.currentLocation\(\)/,
  );
  assert.match(
    readerSource,
    /r\.epubcfi\.compare\(restoredStartCfi, readingCfi\)/,
  );
  assert.match(
    readerSource,
    /measureFocusTarget\(r, readingCfi, restoredStartCfi\)/,
  );
  assert.match(
    readerSource,
    /targetOffsetPx: roundedMetric\(metrics\.targetOffsetPx\)/,
  );
  assert.match(
    readerSource,
    /undershootLines: roundedMetric\(metrics\.undershootLines\)/,
  );
  assert.match(
    readerSource,
    /focusTransition === 'entry' && !metrics\.withinTolerance/,
  );
  assert.match(readerSource, /focusResizeTransition\.current = 'rollback'/);
  assert.match(
    readerSource,
    /focusResizeTransition\.current = 'deferred-after-turn'/,
  );
  assert.doesNotMatch(readerSource, /correctionDirection/);
  assert.match(readerSource, /transition: focusTransition/);
  assert.match(readerSource, /\[reader-focus-cfi\] visual verification/);
  assert.doesNotMatch(readerSource, /const previous = anchor\.location/);
  assert.match(readerSource, /await resizeEpubAt\(/);
});

test('focus cache is refreshed after normal turns, settings, and location jumps', () => {
  assert.match(
    readerSource,
    /scheduleFocusPagination\.current\([\s\S]*?'normal-page-turn'/,
  );
  assert.match(
    readerSource,
    /invalidateFocusPagination\.current\('reading-settings-changed'\)/,
  );
  assert.match(
    readerSource,
    /scheduleFocusPagination\.current\([\s\S]*?'settings-settled'/,
  );
  assert.match(
    readerSource,
    /'settings-settled',\s*FOCUS_CACHE_IDLE_DELAY_MS,\s*!controlsVisibleRef\.current/,
  );
  assert.match(
    readerSource,
    /\(!controlsVisibleRef\.current && !allowWhileFocused\)/,
  );
  assert.match(
    readerSource,
    /invalidateFocusPagination\.current\('location-jump'\)/,
  );
  assert.match(
    readerSource,
    /scheduleFocusPagination\.current\([\s\S]*?'location-jump-settled'/,
  );
  assert.match(
    readerSource,
    /scheduleFocusPagination\.current\(resumeCfi, 'focus-exit'\)/,
  );
  assert.match(readerSource, /delayMs = FOCUS_CACHE_IDLE_DELAY_MS/);
});

test('cache hits use an exact precomputed page but still retain the visual safety gate', () => {
  assert.match(readerSource, /findFocusPage\(/);
  assert.match(
    readerSource,
    /const resizeCfi =[\s\S]*?focusDisplayCfi\.current/,
  );
  assert.match(readerSource, /displayStartComparison === 0/);
  assert.match(
    readerSource,
    /cacheVisuallyAccepted = cacheServed && metrics\.withinTolerance/,
  );
  assert.match(
    readerSource,
    /focusTransition === 'entry' && !metrics\.withinTolerance/,
  );
  assert.match(readerSource, /reason: 'fallback-deferred'/);
  assert.match(readerSource, /\[reader-focus-cache\] entry decision/);
  assert.match(readerSource, /\[reader-focus-cache\] precomputed/);
});
