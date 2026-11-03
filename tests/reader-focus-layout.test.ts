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
const locationSource = readFileSync(
  new URL('../lib/epub-location.ts', import.meta.url),
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

test('normal reading keeps the page between toolbars; Focus gives EPUB and TXT the full height', () => {
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
  // Toolbars never shrink the page by animating rows; Focus switches rows once.
  assert.doesNotMatch(css, /\n\.reader-focus \{[^}]*grid-template-rows/);

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

  // Normal reading: no page-wide rule, so text sits between the toolbars.
  assert.doesNotMatch(css, /\n\.reader-full-page \{/);
  // Focus (EPUB and TXT only): the page fills the screen and the hidden
  // toolbars stack over it while they slide away.
  assert.match(
    css,
    /\n\.reader-full-page\.reader-focus \{\s*grid-template-rows:\s*minmax\(0, 1fr\);/,
  );
  const stacked = css.match(
    /\.reader-full-page\.reader-focus > \.reader-header,\s*\.reader-full-page\.reader-focus > \.reading-area,\s*\.reader-full-page\.reader-focus > \.reader-bottom\s*\{([^}]*)\}/,
  )?.[1];
  assert.match(stacked ?? '', /grid-row:\s*1/);
  assert.match(
    css,
    /\n\.reader-full-page\.reader-focus > \.reader-header \{\s*align-self:\s*start;/,
  );
  assert.match(
    css,
    /\n\.reader-full-page\.reader-focus > \.reader-bottom \{\s*align-self:\s*end;/,
  );
  assert.match(
    readerSource,
    /book\.format === 'pdf' \? '' : 'reader-full-page'/,
  );
  // Resizes, Focus switches and text-size changes keep the first line on
  // screen visible, and only forget that line when the reader moves on.
  assert.match(readerSource, /screenAnchor\.current = firstVisibleTextCfi\(/);
  assert.match(
    readerSource,
    /screenAnchor\.current \?\?= area\s*\?\s*firstVisibleTextCfi\(/,
  );
  assert.equal(
    (
      readerSource.match(/const target = screenAnchor\.current \?\? previous;/g) ||
      []
    ).length,
    2,
  );
  assert.equal(
    (
      readerSource.match(
        /await displayAtLine\(\s*r,\s*target,\s*epubContents\.current,\s*reflowableEpub\.current && screenAnchor\.current === target,\s*\);/g,
      ) || []
    ).length,
    2,
  );
  assert.ok(
    (readerSource.match(/screenAnchor\.current = undefined;/g) || []).length >= 3,
  );
  // A highlight visit remembers the line on screen; Back to reading spot shows
  // that line through the same settle-and-align path (a chapter re-renders).
  assert.match(
    readerSource,
    /visitReturnLine\.current =\s*screenAnchor\.current \?\?\s*\(area \? firstVisibleTextCfi\(epubContents\.current, area\) : undefined\);/,
  );
  assert.match(
    readerSource,
    /const line = visitReturnLine\.current \?\? destination\.location;[\s\S]*?await displayAtLine\(\s*reader,\s*line,/,
  );
  // The shared helper aims again once new columns settle, then starts the page
  // at the line: first by an invisible gap, otherwise by sliding that one page
  // up. Page turns and jumps undo the slide; any new layout clears both.
  assert.match(
    locationSource,
    /await reader\.display\(target\);\s*await new Promise\(\(resolve\) => requestAnimationFrame\(resolve\)\);\s*await reader\.display\(target\);/,
  );
  assert.match(
    locationSource,
    /const aligned = alignTargetToPageTop\(contents, target\);\s*await reader\.display\(target\);\s*if \(!aligned\) slidePageToTarget\(contents, target\);/,
  );
  assert.ok(
    (readerSource.match(/clearPageSlide\(epubContents\.current\);/g) || [])
      .length >= 3,
  );
  assert.ok(
    (readerSource.match(/clearPageShift\(epubContents\.current\);/g) || [])
      .length >= 2,
  );
  assert.match(readerSource, /shiftStyle\.textContent = PAGE_SHIFT_CSS;/);

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
  assert.match(readerSource, /setInterval\(captureSelection, 400\)/);
  assert.match(
    readerSource,
    /contents\.cfiFromRange\(selection\.getRangeAt\(0\)\)/,
  );
  assert.match(readerSource, /createHighlight\(/);
  assert.match(readerSource, /annotations\.add\(/);
  assert.match(readerSource, /annotations\.remove\(highlight\.cfiRange/);
  assert.match(readerSource, /visitHighlight\(highlight\)/);
  assert.match(readerSource, /Viewing a highlight\. Your reading place is/);
  assert.match(readerSource, /Back to reading spot/);
  assert.match(readerSource, /Continue from here/);
  assert.match(readerSource, /if \(highlightVisitRef\.current\) return;/);
  assert.match(
    readerSource,
    /await writeQueue\.current\.catch\(\(\) => \{\}\)/,
  );
  assert.match(
    readerSource,
    /onPointerDown=\{\(\) => void captureCurrentEpubSelection\(\)\}/,
  );
  assert.match(readerSource, /onClick=\{highlightOrOpenSaved\}/);
  assert.doesNotMatch(readerSource, /'mix-blend-mode': 'multiply'/);
});
