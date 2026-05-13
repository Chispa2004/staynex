import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata = {
  title: 'Staynex Dashboard',
  description: 'Minimal operations dashboard for Staynex tickets'
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
