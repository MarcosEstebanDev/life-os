import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-bricolage' });
const body = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-instrument' });

export const metadata: Metadata = { title: 'life-os', description: 'Mis obligaciones y el brief del día' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
