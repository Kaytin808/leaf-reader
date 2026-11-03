// App themes. Each one sets the colors of the library, toolbars and menus,
// and the reading page when "Page color" is Match theme. The colors are
// applied as CSS variables, and the reader also reads them directly because
// EPUB pages render inside their own frame.
export type AppThemeId =
  | 'midnight'
  | 'forest'
  | 'plum'
  | 'espresso'
  | 'black'
  | 'classic';

export type AppThemeDefinition = {
  id: AppThemeId;
  name: string;
  description: string;
  dark: boolean;
  colors: {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    // Raised panels such as "Continue reading".
    panel: string;
    page: string;
    pageText: string;
  };
  fonts: {
    display: string;
    ui: string;
  };
};

// iPhone system fonts only, so themes look right without a connection.
const SYSTEM_UI =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const ROUNDED_UI =
  'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", ' + SYSTEM_UI;
const ELEGANT_SERIF = '"Bodoni 72", Didot, "Playfair Display", Georgia, serif';
const BOOK_SERIF = '"Iowan Old Style", Palatino, Georgia, serif';

export const DEFAULT_APP_THEME: AppThemeId = 'midnight';

export const APP_THEMES: AppThemeDefinition[] = [
  {
    id: 'midnight',
    name: 'Midnight library',
    description: 'Deep navy and gold',
    dark: true,
    colors: {
      background: '#121821',
      foreground: '#ede6d6',
      primary: '#d4af6a',
      primaryForeground: '#1a1408',
      muted: '#1b2330',
      mutedForeground: '#9a917f',
      border: '#2c3646',
      panel: '#1b2330',
      page: '#0f141c',
      pageText: '#ddd5c3',
    },
    fonts: { display: ELEGANT_SERIF, ui: SYSTEM_UI },
  },
  {
    id: 'forest',
    name: 'Forest night',
    description: 'Dark green and soft mint',
    dark: true,
    colors: {
      background: '#111a16',
      foreground: '#e4ede3',
      primary: '#8cc49a',
      primaryForeground: '#0e1a12',
      muted: '#18241e',
      mutedForeground: '#8fa394',
      border: '#24342b',
      panel: '#18241e',
      page: '#0f1713',
      pageText: '#d6e2d5',
    },
    fonts: { display: ROUNDED_UI, ui: ROUNDED_UI },
  },
  {
    id: 'plum',
    name: 'Plum and rose',
    description: 'Dark plum and dusty pink',
    dark: true,
    colors: {
      background: '#1a1320',
      foreground: '#f1e6ee',
      primary: '#e8a0b4',
      primaryForeground: '#2a1220',
      muted: '#241a2c',
      mutedForeground: '#a894a6',
      border: '#33263d',
      panel: '#241a2c',
      page: '#16101b',
      pageText: '#e6dae3',
    },
    fonts: { display: ELEGANT_SERIF, ui: SYSTEM_UI },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    description: 'Coffee brown and amber, least blue light',
    dark: true,
    colors: {
      background: '#1b1512',
      foreground: '#f0e3d2',
      primary: '#e0a35a',
      primaryForeground: '#24170a',
      muted: '#251d18',
      mutedForeground: '#a8957f',
      border: '#352a22',
      panel: '#251d18',
      page: '#18120f',
      pageText: '#e8d9c4',
    },
    fonts: { display: BOOK_SERIF, ui: SYSTEM_UI },
  },
  {
    id: 'black',
    name: 'True black',
    description: 'Pure black, saves battery',
    dark: true,
    colors: {
      background: '#000000',
      foreground: '#e8e8ea',
      primary: '#9db8ff',
      primaryForeground: '#0a1230',
      muted: '#121214',
      mutedForeground: '#8a8a90',
      border: '#26262b',
      panel: '#121214',
      page: '#000000',
      pageText: '#cfcfd4',
    },
    fonts: { display: SYSTEM_UI, ui: SYSTEM_UI },
  },
  {
    // The original look, kept as a backup.
    id: 'classic',
    name: 'Classic light',
    description: 'The original white and blue',
    dark: false,
    colors: {
      background: '#fbfcfe',
      foreground: '#172a40',
      primary: '#235bb2',
      primaryForeground: '#ffffff',
      muted: '#eaf0f7',
      mutedForeground: '#657285',
      border: '#dce3ec',
      panel: '#183b64',
      page: '#ffffff',
      pageText: '#243349',
    },
    fonts: { display: 'Georgia, serif', ui: 'Arial, Helvetica, sans-serif' },
  },
];

export function appTheme(id: unknown): AppThemeDefinition {
  return (
    APP_THEMES.find((theme) => theme.id === id) ??
    APP_THEMES.find((theme) => theme.id === DEFAULT_APP_THEME)!
  );
}

// Older versions saved only "light" or "dark"; everyone starts on the new
// default theme.
export function normalizeAppTheme(value: unknown): AppThemeId {
  return appTheme(value).id;
}

export function themeVariables(theme: AppThemeDefinition) {
  const { colors, fonts } = theme;
  return {
    '--background': colors.background,
    '--foreground': colors.foreground,
    '--primary': colors.primary,
    '--primary-foreground': colors.primaryForeground,
    '--secondary': colors.muted,
    '--muted': colors.muted,
    '--muted-foreground': colors.mutedForeground,
    '--border': colors.border,
    '--panel': colors.panel,
    '--page-bg': colors.page,
    '--page-fg': colors.pageText,
    '--font-display': fonts.display,
    '--font-ui': fonts.ui,
  };
}
