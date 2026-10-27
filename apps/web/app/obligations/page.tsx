'use client';

import { useCallback, useState } from 'react';
import { ObligationLine } from '@/components/obligation-line';
import { api, KIND_LABELS, type ObligationKind, type ObligationStatus } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const STATUS_LABELS: Record<ObligationStatus, string> = {
  ACTIVE: 'Activas',
  PROPOSED: 'Propuestas',
  DONE: 'Hechas',
  DISMISSED: 'Descartadas',
};

export default function ObligationsPage() {
  const [status, setStatus] = useState<ObligationStatus>('ACTIVE');
  const [kind, setKind] = useState<ObligationKind | ''>('');
  const { data, error, reload } = useLoad(useCallback(() => api.obligations(status), [status]));

  const items = (data ?? []).filter((o) => !kind || o.kind === kind);

  return (
    <>
      <h1>Obligaciones</h1>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value as ObligationStatus)}>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as ObligationKind | '')}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {data && items.length === 0 && <p className="muted">No hay obligaciones con ese filtro.</p>}
      {items.map((o) => (
        <ObligationLine key={o.id} o={o}>
          {o.status === 'ACTIVE' && <button onClick={() => api.complete(o.id).then(reload)}>Hecha</button>}
        </ObligationLine>
      ))}
    </>
  );
}
