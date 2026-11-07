'use client';

import { useCallback, useState } from 'react';
import { ObligationLine } from '@/components/obligation-line';
import { api, KIND_LABELS, localToday, type ObligationKind, type ObligationStatus } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const STATUS_LABELS: Record<ObligationStatus, string> = {
  ACTIVE: 'Pendientes',
  DONE: 'Hechas',
  PROPOSED: 'Sin revisar',
  DISMISSED: 'Descartadas',
};

export default function ObligationsPage() {
  const [status, setStatus] = useState<ObligationStatus>('ACTIVE');
  const [kind, setKind] = useState<ObligationKind | ''>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, reload } = useLoad(useCallback(() => api.obligations(status), [status]));
  const today = localToday();

  const items = (data ?? []).filter((o) => !kind || o.kind === kind);
  const done = (id: string) =>
    api
      .complete(id)
      .then(() => setActionError(null))
      .then(reload)
      .catch((e: Error) => setActionError(`No se pudo marcar como hecha: ${e.message}`));

  return (
    <>
      <header className="page-head">
        <h1>Obligaciones</h1>
        <p>Todo lo que aceptaste, lo que ya hiciste y lo que descartaste.</p>
      </header>
      <div className="filters" role="group" aria-label="Estado">
        {(Object.keys(STATUS_LABELS) as ObligationStatus[]).map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <select value={kind} aria-label="Tipo" onChange={(e) => setKind(e.target.value as ObligationKind | '')}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="notice error">No se pudo cargar la lista ({error}).</p>}
      {actionError && <p className="notice error">{actionError}</p>}
      <section className="agenda">
        {data && items.length === 0 && <p className="empty">No hay obligaciones {STATUS_LABELS[status].toLowerCase()}{kind ? ` de tipo ${KIND_LABELS[kind].toLowerCase()}` : ''}.</p>}
        {items.map((o) => (
          <ObligationLine key={o.id} o={o} today={today} late={o.status === 'ACTIVE' && !!o.dueDate && o.dueDate < today}>
            {o.status === 'ACTIVE' && (
              <button className="quiet" onClick={() => done(o.id)}>
                Marcar hecha
              </button>
            )}
          </ObligationLine>
        ))}
      </section>
    </>
  );
}
