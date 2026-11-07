'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ObligationLine } from '@/components/obligation-line';
import { api, longDate, type Obligation } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

function Agenda({
  title,
  items,
  today,
  late,
  empty,
  onDone,
}: {
  title: string;
  items: Obligation[];
  today: string;
  late?: boolean;
  empty: string;
  onDone: (id: string) => void;
}) {
  if (late && items.length === 0) return null;
  return (
    <section className={`agenda ${late ? 'late' : ''}`}>
      <h2>
        {title} <span className="count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        items.map((o) => (
          <ObligationLine key={o.id} o={o} today={today} late={late}>
            <button className="quiet" onClick={() => onDone(o.id)}>
              Marcar hecha
            </button>
          </ObligationLine>
        ))
      )}
    </section>
  );
}

export default function BriefPage() {
  const { data, error, reload } = useLoad(useCallback(() => api.brief(), []));
  const [actionError, setActionError] = useState<string | null>(null);
  const done = (id: string) =>
    api
      .complete(id)
      .then(() => setActionError(null))
      .then(reload)
      .catch((e: Error) => setActionError(`No se pudo marcar como hecha: ${e.message}`));

  if (error) return <p className="notice error">No se pudo cargar el brief ({error}). Revisá que la API esté corriendo: npm run dev.</p>;
  if (!data) return null;

  const nothing = data.overdue.length + data.next7.length + data.next30.length === 0;

  return (
    <>
      <header className="page-head">
        <h1>{longDate(data.today)}</h1>
        <p>{nothing ? 'No vence nada en los próximos 30 días.' : 'Lo que vence en el próximo mes, empezando por lo atrasado.'}</p>
      </header>
      {data.toReview.length > 0 && (
        <p className="notice review">
          El sistema encontró {data.toReview.length === 1 ? 'una obligación nueva' : `${data.toReview.length} obligaciones nuevas`}.{' '}
          <Link href="/review">Revisalas</Link> para que cuenten.
        </p>
      )}
      {actionError && <p className="notice error">{actionError}</p>}
      <Agenda title="Atrasadas" items={data.overdue} today={data.today} late empty="" onDone={done} />
      <Agenda title="Esta semana" items={data.next7} today={data.today} empty="Nada vence en los próximos 7 días." onDone={done} />
      <Agenda title="Este mes" items={data.next30} today={data.today} empty="Nada más hasta dentro de 30 días." onDone={done} />
    </>
  );
}
