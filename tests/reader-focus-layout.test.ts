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

test('focus hides controls without resizing or repaginating the reading viewport', () => {
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
  assert.doesNotMatch(rule('.reader-focus'), /grid-template-rows/);

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

  const recoveryControl = rule('.reader-focus-actions');
  assert.match(recoveryControl, /safe-area-inset-bottom/);
  assert.match(recoveryControl, /display:\s*none/);
  assert.doesNotMatch(recoveryControl, /\btop:/);
  assert.match(rule('.reader-focus .reader-focus-actions'), /display:\s*flex/);
});

test('native reader toolbars do not apply safe-area padding twice', () => {
  assert.match(nativeRule('.reader-header'), /padding-top:\s*10px/);
  assert.match(nativeRule('.reader-bottom'), /padding-bottom:\s*7px/);
  assert.doesNotMatch(nativeRule('.reader-header'), /safe-area-inset-top/);
  assert.doesNotMatch(nativeRule('.reader-bottom'), /safe-area-inset-bottom/);
});

test('page-turn lock stays beside Focus and blocks every navigation input', () => {
  assert.match(readerSource, /aria-label="Focus reading tools"/);
  assert.match(readerSource, /reader-focus-lock/);
  assert.match(readerSource, /pageTurnsLockedRef\.current/);
  assert.match(readerSource, /canTurn:\s*\(\) => !pageTurnsLockedRef\.current/);
  assert.match(
    readerSource,
    /disabled=\{loading \|\| atEnd \|\| pageTurnsLocked\}/,
  );
});

test('EPUB selection is stored as a reusable annotation and saved-location link', () => {
  assert.match(readerSource, /r\.on\('selected'/);
  assert.match(readerSource, /doc\.addEventListener\('selectionchange'/);
  assert.match(readerSource, /doc\.addEventListener\('touchend'/);
  assert.match(
    readerSource,
    /contents\.cfiFromRange\(selection\.getRangeAt\(0\)\)/,
  );
  assert.match(readerSource, /createHighlight\(/);
  assert.match(readerSource, /annotations\.add\(/);
  assert.match(readerSource, /annotations\.remove\(highlight\.cfiRange/);
  assert.match(readerSource, /goTo\(highlight\.location\)/);
  assert.doesNotMatch(readerSource, /'mix-blend-mode': 'multiply'/);
});
