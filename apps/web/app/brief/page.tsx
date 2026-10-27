'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { ObligationLine } from '@/components/obligation-line';
import { api, formatDate, type Obligation } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

function Section({ title, items, overdue, onDone }: { title: string; items: Obligation[]; overdue?: boolean; onDone: (id: string) => void }) {
  return (
    <section>
      <h2>
        {title} <span className="count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="muted">Nada por acá.</p>
      ) : (
        items.map((o) => (
          <ObligationLine key={o.id} o={o} overdue={overdue}>
            <button onClick={() => onDone(o.id)}>Hecha</button>
          </ObligationLine>
        ))
      )}
    </section>
  );
}

export default function BriefPage() {
  const { data, error, reload } = useLoad(useCallback(() => api.brief(), []));
  const done = (id: string) => api.complete(id).then(reload);

  if (error) return <p className="error">No pude cargar el brief: {error}. ¿Está corriendo la API?</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <h1>Brief del {formatDate(data.today)}</h1>
      {data.toReview.length > 0 && (
        <p>
          Tenés <Link href="/review">{data.toReview.length} propuesta(s) para revisar</Link>.
        </p>
      )}
      <Section title="Atrasadas" items={data.overdue} overdue onDone={done} />
      <Section title="Próximos 7 días" items={data.next7} onDone={done} />
      <Section title="Próximos 30 días" items={data.next30} onDone={done} />
    </>
  );
}
