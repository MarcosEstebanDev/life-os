'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const LINKS = [
  { href: '/brief', label: 'Hoy', badge: 'late' },
  { href: '/review', label: 'Revisar', badge: 'review' },
  { href: '/obligations', label: 'Obligaciones' },
  { href: '/documents', label: 'Documentos' },
] as const;

/** Los contadores se refrescan al cambiar de pantalla: así se ven bajar al revisar. */
export function Sidebar() {
  const path = usePathname();
  const [counts, setCounts] = useState<{ late: number; review: number } | null>(null);

  useEffect(() => {
    api
      .brief()
      .then((b) => setCounts({ late: b.overdue.length, review: b.toReview.length }))
      .catch(() => setCounts(null));
  }, [path]);

  return (
    <aside className="sidebar">
      <Link href="/brief" className="brand">
        life-os
      </Link>
      <nav className="nav" aria-label="Secciones">
        {LINKS.map((link) => {
          const n = 'badge' in link && counts ? counts[link.badge] : 0;
          return (
            <Link key={link.href} href={link.href} aria-current={path.startsWith(link.href) ? 'page' : undefined}>
              {link.label}
              {n > 0 && <span className={`pill ${'badge' in link ? link.badge : ''}`}>{n}</span>}
            </Link>
          );
        })}
      </nav>
      <p className="sidebar-foot">Dejá tus PDFs en la carpeta observada y revisá lo que encuentre.</p>
    </aside>
  );
}
