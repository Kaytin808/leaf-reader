import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import Home from '@/app/page';
import { ThemeProvider, useAppTheme } from '@/components/theme-provider';
import '@/app/globals.css';
import '@/app/product.css';
import '@/app/appearance.css';
import './native.css';

function NativeAppearance() {
  const { theme, ready } = useAppTheme();
  useEffect(() => {
    if (!ready || !Capacitor.isNativePlatform()) return;
    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        StatusBar.setStyle({
          style: theme === 'dark' ? Style.Dark : Style.Light,
        }),
      )
      .catch(() => {});
  }, [theme, ready]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <NativeAppearance />
    <Home />
  </ThemeProvider>,
);
