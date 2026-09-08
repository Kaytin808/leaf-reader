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

test('focus reuses the single EPUB rendition instead of mounting a preview', () => {
  assert.equal(readerSource.match(/renderTo\(/g)?.length, 1);
  assert.doesNotMatch(readerSource, /new EpubRendition|previewRendition/);
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
    /if \(navigationPending\.current\) \{\s*queuedControlsVisibility\.current = visible;/,
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

test('focus captures its resize anchor only after navigation has settled', () => {
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
    /const liveLocation = r\.currentLocation\(\)[\s\S]*?const resizeCfi = focusPassageCfi\.current \|\| liveLocation\?\.start\?\.cfi;/,
  );
  assert.match(
    readerSource,
    /if \(!visible && initial\.current\.format === 'epub'\)[\s\S]*?focusPassageCfi\.current =[\s\S]*?liveLocation\?\.start\?\.cfi/,
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
    /await resizeEpubAt\([\s\S]*?area\.clientHeight,\s*resizeCfi,\s*\);\s*await r\.display\(resizeCfi\);/,
  );
  assert.match(
    readerSource,
    /await r\.display\(resizeCfi\);\s*let restoredLocation = r\.currentLocation\(\)/,
  );
  assert.match(
    readerSource,
    /r\.epubcfi\.compare\(restoredStartCfi, resizeCfi\)/,
  );
  assert.match(
    readerSource,
    /startComparison < 0 &&\s*endComparison <= 0;[\s\S]*?if \(correctionTriggered\) \{\s*await r\.next\(\);/,
  );
  assert.match(readerSource, /\[reader-focus-cfi\] restore verification/);
  assert.match(readerSource, /\[reader-focus-cfi\] correction verification/);
  assert.doesNotMatch(readerSource, /const previous = anchor\.location/);
  assert.match(readerSource, /await resizeEpubAt\(/);
});
