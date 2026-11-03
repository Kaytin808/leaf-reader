import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  appTheme,
  normalizeAppTheme,
  themeVariables,
} from '../lib/themes';
import { normalizeReadingPreferences } from '../lib/reading-settings';

test('Midnight library is the default, including for older light/dark saves', () => {
  assert.equal(DEFAULT_APP_THEME, 'midnight');
  for (const saved of [null, undefined, '', 'light', 'dark', 'unknown'])
    assert.equal(normalizeAppTheme(saved), 'midnight');
  for (const theme of APP_THEMES)
    assert.equal(normalizeAppTheme(theme.id), theme.id);
});

test('every theme sets every color and font variable', () => {
  const names = Object.keys(themeVariables(appTheme('midnight')));
  for (const theme of APP_THEMES) {
    const variables = themeVariables(theme);
    assert.deepEqual(Object.keys(variables), names);
    for (const value of Object.values(variables)) assert.ok(value.length > 0);
  }
});

test('the original light look is kept as the only light backup theme', () => {
  const light = APP_THEMES.filter((theme) => !theme.dark);
  assert.deepEqual(
    light.map((theme) => theme.id),
    ['classic'],
  );
  assert.equal(appTheme('classic').colors.primary, '#235bb2');
});

test('the reading page follows the theme by default', () => {
  assert.equal(normalizeReadingPreferences({}).theme, 'match');
  // Before version 2, Paper and Night only mirrored light or dark mode.
  assert.equal(normalizeReadingPreferences({ theme: 'paper' }).theme, 'match');
  assert.equal(normalizeReadingPreferences({ theme: 'night' }).theme, 'match');
  assert.equal(normalizeReadingPreferences({ theme: 'sepia' }).theme, 'sepia');
  // Once saved by this version, every choice is kept.
  for (const theme of ['match', 'paper', 'sepia'])
    assert.equal(
      normalizeReadingPreferences({ version: 2, theme }).theme,
      theme,
    );
  assert.equal(
    normalizeReadingPreferences({ version: 2, theme: 'night' }).theme,
    'match',
  );
});
