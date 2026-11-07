'use client';

import { useCallback, useState } from 'react';
import {
  api,
  formatAmount,
  formatDate,
  KIND_LABELS,
  RECURRENCE_LABELS,
  type Obligation,
  type ObligationEdits,
} from '@/lib/api';
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
    <article className="proposal">
      <div>
        <h2>{o.title}</h2>
        <div className="source">
          <a href={api.fileUrl(o.sourceDocumentId)} target="_blank" rel="noreferrer">
            Abrir el documento
          </a>
          <span>Confianza del modelo: {Math.round(o.confidence * 100)}%</span>
        </div>
        {original && (
          <p className="update">
            Parece una actualización de «{original.title}», que hoy vence el {formatDate(original.dueDate)}
            {original.amount ? ` por ${formatAmount(original)}` : ''}.
          </p>
        )}
        {o.evidence.map((e, i) => (
          <blockquote key={i} className="clipping">
            <mark>{e}</mark>
          </blockquote>
        ))}
      </div>

      <div>
        <div className="fields">
          <label className="wide">
            Qué hay que hacer
            <input value={edits.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className={edits.dueDate ? '' : 'missing'}>
            Vence
            <input type="date" value={edits.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
          </label>
          <label>
            Se repite
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
            <input inputMode="decimal" placeholder="1234.56" value={edits.amount ?? ''} onChange={(e) => set({ amount: e.target.value || null })} />
          </label>
          <label>
            Moneda
            <input placeholder="ARS" value={edits.currency ?? ''} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() || null })} />
          </label>
          <label>
            Con quién
            <input value={edits.counterparty ?? ''} onChange={(e) => set({ counterparty: e.target.value || null })} />
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
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="primary" disabled={!edits.dueDate} onClick={() => run(api.accept(o.id, edits))}>
            {edits.dueDate ? 'Aceptar' : 'Falta la fecha para aceptar'}
          </button>
          {original && <button onClick={() => run(api.merge(o.id))}>Actualizar la original</button>}
          <button className="quiet" onClick={() => run(api.dismiss(o.id))}>
            Descartar
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ReviewPage() {
  const { data, error, reload } = useLoad(
    useCallback(async () => {
      const [proposed, active] = await Promise.all([api.obligations('PROPOSED'), api.obligations('ACTIVE')]);
      return { proposed, active };
    }, []),
  );

  if (error) return <p className="notice error">No se pudieron cargar las propuestas ({error}).</p>;
  if (!data) return null;

  return (
    <>
      <header className="page-head">
        <h1>Revisar</h1>
        <p>
          {data.proposed.length === 0
            ? 'No hay nada para revisar. Cuando el sistema lea un documento nuevo, sus obligaciones aparecen acá.'
            : 'Nada cuenta hasta que lo aceptás. Compará con el recorte del documento y corregí lo que el modelo haya leído mal.'}
        </p>
      </header>
      {data.proposed.map((o) => (
        <Proposal key={o.id} o={o} original={data.active.find((a) => a.id === o.possibleUpdateOf)} onChange={reload} />
      ))}
    </>
  );
}
