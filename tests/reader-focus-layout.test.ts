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
  const focusedPage = rule('.reader-focus .epub-primary-page');
  assert.match(focusedPage, /--reader-page-height/);
  const focusPage = rule('.epub-focus-page');
  assert.match(focusPage, /position:\s*absolute/);
  assert.match(focusPage, /inset:\s*0/);
  assert.match(focusPage, /overflow:\s*hidden/);
  assert.match(focusPage, /pointer-events:\s*none/);
  const preview = rule('.epub-preview-page');
  assert.match(preview, /height:\s*100%/);

  const focusActions = rule('.reader-focus-actions');
  assert.match(focusActions, /safe-area-inset-bottom/);
  assert.match(focusActions, /display:\s*flex/);
  assert.doesNotMatch(focusActions, /\btop:/);
});

test('native reader toolbars do not apply safe-area padding twice', () => {
  assert.match(nativeRule('.reader-header'), /padding-top:\s*10px/);
  assert.match(nativeRule('.reader-bottom'), /padding-bottom:\s*7px/);
  assert.doesNotMatch(nativeRule('.reader-header'), /safe-area-inset-top/);
  assert.doesNotMatch(nativeRule('.reader-bottom'), /safe-area-inset-bottom/);
});

test('focus uses one continuous viewport and advances beyond all visible text', () => {
  assert.match(readerSource, /flow:\s*'scrolled-doc'/);
  assert.match(readerSource, /nextEpubTextCfi\(/);
  assert.match(readerSource, /focusHistory\.current\.push/);
  assert.doesNotMatch(readerSource, /epub-focus-continuation/);
});
