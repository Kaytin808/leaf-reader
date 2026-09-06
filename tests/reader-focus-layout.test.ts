import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../app/product.css', import.meta.url),
  'utf8',
);

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('focus mode overlays a stable, safe-area-aware reading viewport', () => {
  const readingArea = rule('.reading-area');
  assert.match(readingArea, /position:\s*absolute/);
  assert.match(readingArea, /safe-area-inset-top/);
  assert.match(readingArea, /safe-area-inset-bottom/);

  for (const selector of [
    '.reader-focus .reader-header',
    '.reader-focus .reader-bottom',
  ]) {
    const focusRule = rule(selector);
    assert.match(focusRule, /transform:\s*translateY/);
    assert.doesNotMatch(focusRule, /max-height|min-height|padding/);
  }

  const recoveryControl = rule('.reader-show-controls');
  assert.match(recoveryControl, /safe-area-inset-bottom/);
  assert.doesNotMatch(recoveryControl, /\btop:/);
});
