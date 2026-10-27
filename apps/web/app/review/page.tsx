'use client';

import { useCallback, useState } from 'react';
import { api, KIND_LABELS, RECURRENCE_LABELS, type Obligation, type ObligationEdits } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

function Proposal({ o, original, onChange }: { o: Obligation; original?: Obligation; onChange: () => void }) {
  const [edits, setEdits] = useState<ObligationEdits>({
    title: o.title,
    kind: o.kind,
    dueDate: o.dueDate,
    recurrence: o.recurrence,
    amount: o.amount,
    currency: o.currency,
    counterparty: o.counterparty,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: ObligationEdits) => setEdits((e) => ({ ...e, ...patch }));
  const run = (action: Promise<unknown>) => action.then(onChange).catch((e: Error) => setError(e.message));

  return (
    <div className="card">
      <div className="row">
        <div className="title">{o.title}</div>
        <span className="muted">confianza {Math.round(o.confidence * 100)}%</span>
      </div>
      {o.possibleUpdateOf && (
        <p>
          <span className="badge update">posible actualización</span> de «{original?.title ?? o.possibleUpdateOf}»
        </p>
      )}
      {o.evidence.map((e, i) => (
        <blockquote key={i}>
          <mark>{e}</mark>
        </blockquote>
      ))}
      <a href={api.fileUrl(o.sourceDocumentId)} target="_blank" rel="noreferrer">
        Ver documento
      </a>
      <div className="form">
        <label>
          Título
          <input value={edits.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Vence
          <input type="date" value={edits.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
        </label>
        <label>
          Tipo
          <select value={edits.kind} onChange={(e) => set({ kind: e.target.value as Obligation['kind'] })}>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recurrencia
          <select value={edits.recurrence} onChange={(e) => set({ recurrence: e.target.value as Obligation['recurrence'] })}>
            {Object.entries(RECURRENCE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Monto
          <input inputMode="decimal" value={edits.amount ?? ''} onChange={(e) => set({ amount: e.target.value || null })} />
        </label>
        <label>
          Moneda
          <input value={edits.currency ?? ''} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() || null })} />
        </label>
        <label>
          Contraparte
          <input value={edits.counterparty ?? ''} onChange={(e) => set({ counterparty: e.target.value || null })} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={!edits.dueDate} title={edits.dueDate ? '' : 'Falta la fecha'} onClick={() => run(api.accept(o.id, edits))}>
          Aceptar
        </button>
        {o.possibleUpdateOf && <button onClick={() => run(api.merge(o.id))}>Fusionar</button>}
        <button onClick={() => run(api.dismiss(o.id))}>Descartar</button>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { data, error, reload } = useLoad(
    useCallback(async () => {
      const [proposed, active] = await Promise.all([api.obligations('PROPOSED'), api.obligations('ACTIVE')]);
      return { proposed, active };
    }, []),
  );

  if (error) return <p className="error">No pude cargar las propuestas: {error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <h1>Revisar</h1>
      <p className="muted">Nada cuenta hasta que lo aceptás. Corregí lo que el modelo haya leído mal.</p>
      {data.proposed.length === 0 && <p>No hay propuestas pendientes.</p>}
      {data.proposed.map((o) => (
        <Proposal key={o.id} o={o} original={data.active.find((a) => a.id === o.possibleUpdateOf)} onChange={reload} />
      ))}
    </>
  );
}
