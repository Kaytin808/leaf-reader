import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../capacitor.config.ts';

const root = new URL('../www/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
assert.match(html, /viewport-fit=cover/);
assert.doesNotMatch(html, /localhost:3000|@vite\/client|\/main\.tsx/);
const files = await readdir(root, { recursive: true });
for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  assert.ok(
    (await stat(new URL('.' + url, root))).size > 0,
    'Missing app asset: ' + url,
  );
}
assert.ok(files.some((path) => /reader-engine-beta.*\.js$/.test(path)));
assert.equal(config.appId, 'com.kaytin808.leafreader.enginebeta');
assert.equal(config.appName, 'Kayla’s Library Engine Beta');

const [info, project, library, engineStorage, page, diagnostics] =
  await Promise.all([
    readFile(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8'),
    readFile(
      new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../lib/library.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('../lib/reader-engine/storage.ts', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../lib/reader-engine/diagnostics.ts', import.meta.url),
      'utf8',
    ),
  ]);
assert.match(info, /Kayla’s Library Engine Beta/);
assert.match(project, /com\.kaytin808\.leafreader\.enginebeta/);
assert.match(library, /leaf-library-engine-beta/);
assert.match(engineStorage, /leaf-reader-engine-v2/);
assert.match(page, /isEngineBetaBuild && engineEnabled/);
assert.match(diagnostics, /exactHash|prefixHash|suffixHash/);
assert.doesNotMatch(diagnostics, /title|author|filename/);

console.log('Verified isolated Engine Beta assets:', fileURLToPath(root));
