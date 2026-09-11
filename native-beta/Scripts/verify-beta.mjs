import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [project, info, reader, session] = await Promise.all([
  read('project.yml'),
  read('Supporting/Info.plist'),
  read('Sources/ReaderView.swift'),
  read('Sources/ReaderSession.swift'),
]);

assert.match(project, /exactVersion: 3\.11\.0/, 'Readium must stay pinned for repeatable builds');
assert.match(project, /com\.kaytin808\.kaylaslibrary\.readiumbeta/, 'beta bundle ID must be isolated');
assert.match(info, /Kayla’s Library Beta/, 'beta must be visibly distinct from stable');
assert.match(reader, /safeAreaInset\(edge: \.top/, 'normal controls must reserve top space');
assert.match(reader, /safeAreaInset\(edge: \.bottom/, 'normal controls must reserve bottom space');
assert.match(reader, /statusBarHidden\(false\)/, 'Focus Mode must retain the iOS status area');
assert.doesNotMatch(reader, /ignoresSafeArea/, 'reader content must never extend under iOS unsafe areas');
assert.match(session, /let anchor = navigator\.currentLocation/, 'Focus resize must capture a stable Readium locator');
assert.match(session, /navigator\.go\(to: anchor/, 'Focus resize must restore that locator');
assert.match(session, /navigatorContentInset/, 'Readium must not add the device safe area twice');

console.log('Readium beta isolation and Focus safe-area checks passed.');
