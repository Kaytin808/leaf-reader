'use client';
/* oxlint-disable react/react-compiler -- Browser theme preferences are synchronized after hydration. */
import { createContext, useContext, useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
type AppTheme = 'light' | 'dark';
const ThemeContext = createContext<{
  theme: AppTheme;
  ready: boolean;
  setTheme: (theme: AppTheme) => void;
}>({ theme: 'light', ready: false, setTheme: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>('light');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: AppTheme = 'light';
    try {
      if (localStorage.getItem('leaf-app-theme') === 'dark') saved = 'dark';
    } catch {
      /* Preferences are optional. */
    }
    setTheme(saved);
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === 'leaf-app-theme')
        setTheme(event.newValue === 'dark' ? 'dark' : 'light');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('leaf-app-theme', theme);
    } catch {
      /* Still apply the visible theme. */
    }
  }, [theme, ready]);
  return (
    <ThemeContext.Provider value={{ theme, ready, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useAppTheme() {
  return useContext(ThemeContext);
}
export function ThemeButtons() {
  const { theme, setTheme, ready } = useAppTheme();
  return (
    <fieldset className="theme-buttons" aria-label="Appearance">
      <button
        title="Light mode"
        aria-label="Light mode"
        aria-pressed={theme === 'light'}
        disabled={!ready}
        onClick={() => setTheme('light')}
      >
        <Sun size={17} />
        <span>Light</span>
      </button>
      <button
        title="Dark mode"
        aria-label="Dark mode"
        aria-pressed={theme === 'dark'}
        disabled={!ready}
        onClick={() => setTheme('dark')}
      >
        <Moon size={17} />
        <span>Dark</span>
      </button>
    </fieldset>
  );
}
