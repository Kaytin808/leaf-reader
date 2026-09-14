import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PositionDiagnostics } from '../lib/reader-engine/diagnostics';
import type { EnginePosition } from '../lib/reader-engine/types';

const source = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Engine Beta has a separate app identity and both beta databases are isolated', async () => {
  const [capacitor, project, info, library, engineStorage] = await Promise.all([
    source('capacitor.config.ts'),
    source('ios/App/App.xcodeproj/project.pbxproj'),
    source('ios/App/App/Info.plist'),
    source('lib/library.ts'),
    source('lib/reader-engine/storage.ts'),
  ]);

  assert.match(capacitor, /com\.kaytin808\.leafreader\.enginebeta/);
  assert.match(project, /com\.kaytin808\.leafreader\.enginebeta/);
  assert.match(info, /Kayla’s Library Engine Beta/);
  assert.match(library, /leaf-library-engine-beta/);
  assert.match(engineStorage, /leaf-reader-engine-v2/);
  assert.doesNotMatch(library, /openDB<LibraryDB>\('leaf-library',/);
});

test('Engine V2 is lazy-mounted only behind the beta feature flag', async () => {
  const [page, flags, reader, betaReader] = await Promise.all([
    source('app/page.tsx'),
    source('lib/reader-engine/feature-flags.ts'),
    source('components/reader.tsx'),
    source('components/reader-engine-beta.tsx'),
  ]);
  assert.match(
    page,
    /lazy\(\(\) => import\('@\/components\/reader-engine-beta'\)\)/,
  );
  assert.match(page, /isEngineBetaBuild && engineEnabled/);
  assert.match(flags, /return false/);
  assert.match(
    reader,
    /engineNavigation\.current\?\.run\(request, execute\) \?\? execute\(\)/,
  );
  assert.match(
    betaReader,
    /engineNavigationController=\{prepared\.navigation\}/,
  );
  const legacyReaderBranch = page.match(
    /:\s*\(\s*<Reader[\s\S]+?\/>\s*\)/,
  )?.[0];
  assert.ok(legacyReaderBranch);
  assert.doesNotMatch(legacyReaderBranch, /engineNavigationController/);
});

test('diagnostics schema hashes book identity and quote text instead of exporting either', async () => {
  const diagnostics = await PositionDiagnostics.create('private-book-id');
  const position: EnginePosition = {
    schemaVersion: 1,
    bookId: 'private-book-id',
    cfi: 'epubcfi(/6/2!/4/2/1:4500)',
    spineHref: 'private-chapter-name.xhtml',
    quote: {
      exact: 'This is copyrighted book text that must not enter the log.',
      prefix: 'private prefix',
      suffix: 'private suffix',
    },
    progression: 0.45,
    revision: 18,
    capturedAt: new Date(0).toISOString(),
    layoutSignature: {
      viewportWidth: 390,
      viewportHeight: 664,
      fontSize: 20,
      fontFamily: 'publisher',
      lineHeight: 1.55,
      margin: 'comfortable',
      flow: 'paginated',
    },
  };
  await diagnostics.record({
    type: 'position.capture',
    operationId: 'operation-id',
    source: 'page-turn',
    position,
    result: 'success',
  });
  const exported = diagnostics.export();
  const serialized = JSON.stringify(exported);

  assert.equal(exported.schemaVersion, 1);
  assert.equal(
    exported.events[0].quote.exactLength,
    position.quote.exact.length,
  );
  assert.equal(exported.events[0].cfi, position.cfi);
  assert.doesNotMatch(serialized, /private-book-id/);
  assert.doesNotMatch(serialized, /private-chapter-name/);
  assert.doesNotMatch(serialized, /copyrighted book text/);
  assert.doesNotMatch(serialized, /private prefix|private suffix/);
});
