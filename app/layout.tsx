import type { Metadata } from 'next';
import './globals.css';
import './product.css';
import './appearance.css';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Leaf — Your personal library',
  description:
    'Read your EPUB, PDF, and text books. Keep your library, bookmarks, and reading position on your device.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
