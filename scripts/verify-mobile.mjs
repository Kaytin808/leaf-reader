import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../capacitor.config.ts';

const root = new URL('../www/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
assert.match(html, /viewport-fit=cover/);
assert.doesNotMatch(
  html,
  /localhost:3000|@vite\/client|\/main\.tsx|_next\/image/,
);
const files = await readdir(root, { recursive: true });
assert.ok(
  files.some((path) => /pdf\.worker.*\.mjs$/.test(path)),
  'Missing offline PDF worker',
);
assert.ok(
  files.some((path) => path.includes('pdf-assets') && path.endsWith('.bcmap')),
  'Missing PDF character maps',
);
for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  assert.ok(
    (await stat(new URL('.' + url, root))).size > 0,
    'Missing app asset: ' + url,
  );
}
assert.equal(config.appId, 'com.kaytin808.leafreader');
assert.equal(config.appName, 'Kayla’s Library');
assert.equal(config.webDir, 'www');
const info = await readFile(
  new URL('../ios/App/App/Info.plist', import.meta.url),
  'utf8',
);
assert.match(
  info,
  /<key>CFBundleDisplayName<\/key>\s*<string>Kayla’s Library<\/string>/,
  'The iPhone home-screen name must match the reader name',
);
const scene = await readFile(
  new URL('../ios/App/App/SceneDelegate.swift', import.meta.url),
  'utf8',
);
assert.match(
  scene,
  /rootViewController\s*=\s*LeafBridgeViewController\(\)/,
  'The real scene entry point must install the native touch controller',
);
const project = await readFile(
  new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
  'utf8',
);
assert.match(
  project,
  /LeafBridgeViewController\.swift in Sources/,
  'Native touch controller must be compiled into the IPA',
);
assert.equal(
  config.server?.url,
  undefined,
  'Native app must not depend on a development server',
);
console.log('Verified standalone reader assets:', fileURLToPath(root));
