'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

/** Las pantallas de acceso van sin barra lateral: no hay nada que navegar todavía. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith('/login') || path.startsWith('/register')) {
    return <main className="auth-page">{children}</main>;
  }
  return (
    <div className="shell">
      <Sidebar />
      <main className="page">{children}</main>
    </div>
  );
}
