import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata = {
  title: 'Staynex Dashboard',
  description: 'Staynex hotel operations system',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/staynex-logo.svg'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
