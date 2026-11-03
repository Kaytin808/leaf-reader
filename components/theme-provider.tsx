'use client';
/* oxlint-disable react/react-compiler -- Browser theme preferences are synchronized after hydration. */
import { createContext, useContext, useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  appTheme,
  normalizeAppTheme,
  themeVariables,
  type AppThemeDefinition,
  type AppThemeId,
} from '@/lib/themes';

const STORAGE_KEY = 'leaf-app-theme';
const ThemeContext = createContext<{
  theme: AppThemeId;
  definition: AppThemeDefinition;
  ready: boolean;
  setTheme: (theme: AppThemeId) => void;
}>({
  theme: DEFAULT_APP_THEME,
  definition: appTheme(DEFAULT_APP_THEME),
  ready: false,
  setTheme: () => {},
});
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: AppThemeId = DEFAULT_APP_THEME;
    try {
      saved = normalizeAppTheme(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* Preferences are optional. */
    }
    setTheme(saved);
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY)
        setTheme(normalizeAppTheme(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const definition = appTheme(theme);
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.toggle('dark', definition.dark);
    root.dataset.theme = definition.id;
    root.style.colorScheme = definition.dark ? 'dark' : 'light';
    for (const [name, value] of Object.entries(themeVariables(definition)))
      root.style.setProperty(name, value);
    try {
      localStorage.setItem(STORAGE_KEY, definition.id);
    } catch {
      /* Still apply the visible theme. */
    }
  }, [definition, ready]);
  return (
    <ThemeContext.Provider value={{ theme, definition, ready, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useAppTheme() {
  return useContext(ThemeContext);
}
export function ThemeList() {
  const { theme, setTheme } = useAppTheme();
  return (
    <div className="theme-list" aria-label="Themes">
      {APP_THEMES.map((option) => (
        <button
          key={option.id}
          aria-pressed={option.id === theme}
          className="theme-option"
          onClick={() => setTheme(option.id)}
        >
          <span
            className="theme-swatch"
            aria-hidden="true"
            style={{
              background: option.colors.background,
              borderColor: option.colors.border,
            }}
          >
            <span
              style={{
                background: option.colors.panel,
                color: option.colors.foreground,
                fontFamily: option.fonts.display,
              }}
            >
              Aa
            </span>
            <span style={{ background: option.colors.primary }} />
          </span>
          <span className="theme-option-text">
            <strong>{option.name}</strong>
            <small>{option.description}</small>
          </span>
          {option.id === theme && <Check size={18} />}
        </button>
      ))}
    </div>
  );
}
export function ThemePicker() {
  const { definition, ready } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="theme-picker-button"
        title="Change theme"
        aria-label={`Theme: ${definition.name}. Change theme`}
        disabled={!ready}
        onClick={() => setOpen(true)}
      >
        <Palette size={18} />
        <span>Theme</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="theme-dialog">
          <DialogTitle>Choose a theme</DialogTitle>
          <DialogDescription>
            Changes the library, menus, and the reading page.
          </DialogDescription>
          <ThemeList />
        </DialogContent>
      </Dialog>
    </>
  );
}
