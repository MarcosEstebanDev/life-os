import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'life-os', description: 'Mis obligaciones y el brief del día' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="top">
          <strong>life-os</strong>
          <nav>
            <Link href="/brief">Brief</Link>
            <Link href="/review">Revisar</Link>
            <Link href="/obligations">Obligaciones</Link>
            <Link href="/documents">Documentos</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
