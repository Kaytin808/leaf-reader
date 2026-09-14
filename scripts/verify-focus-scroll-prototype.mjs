import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const [config, reader, prototype, css, assets] = await Promise.all([
  readFile(join(root, 'capacitor.config.ts'), 'utf8'),
  readFile(join(root, 'components/reader.tsx'), 'utf8'),
  readFile(join(root, 'lib/focus-scroll-prototype.ts'), 'utf8'),
  readFile(join(root, 'app/product.css'), 'utf8'),
  readdir(join(root, 'www/assets')),
]);

assert.match(config, /com\.kaytin808\.leafreader\.focusscrollprototype/);
assert.match(config, /Kayla’s Focus Scroll/);
assert.match(prototype, /THROWAWAY PROTOTYPE/);
assert.match(prototype, /scrolled-doc/);
assert.match(prototype, /paginated/);
assert.match(reader, /switchFocusScrollPrototype/);
assert.match(reader, /reader-focus-scroll-prototype/);
assert.match(css, /grid-template-rows:\s*0 minmax\(0, 1fr\) 0/);

const javascript = assets.filter((name) => name.endsWith('.js'));
const bundles = await Promise.all(
  javascript.map((name) => readFile(join(root, 'www/assets', name), 'utf8')),
);
assert.ok(bundles.some((source) => source.includes('focus-scroll-prototype')));
console.log('Verified isolated Focus Scroll throwaway prototype assets.');
