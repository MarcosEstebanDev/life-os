import { formatAmount, formatDate, KIND_LABELS, RECURRENCE_LABELS, type Obligation } from '@/lib/api';

/** Una obligación en una línea: qué, cuándo, cuánto. Las acciones van por children. */
export function ObligationLine({ o, overdue, children }: { o: Obligation; overdue?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`card ${overdue ? 'overdue' : ''}`}>
      <div className="row">
        <div>
          <div className="title">{o.title}</div>
          <div className="meta">
            <span className="due">{formatDate(o.dueDate)}</span> · {KIND_LABELS[o.kind]} · {RECURRENCE_LABELS[o.recurrence]}
            {o.counterparty ? ` · ${o.counterparty}` : ''}
            {o.amount ? ` · ${formatAmount(o)}` : ''}
          </div>
        </div>
        {children && <div className="actions">{children}</div>}
      </div>
    </div>
  );
}
