import { formatAmount, KIND_LABELS, RECURRENCE_LABELS, relativeDay, type Obligation } from '@/lib/api';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El taco de calendario: el día grande, el mes arriba, el año sólo si no es el actual. */
export function DateBlock({ date, today, late }: { date: string | null; today: string; late?: boolean }) {
  if (!date) {
    return (
      <div className="date none" aria-label="sin fecha">
        <span className="day">?</span>
      </div>
    );
  }
  const [y, m, d] = date.split('-');
  return (
    <div className={`date ${late ? 'late' : ''}`}>
      <span className="month">{MONTHS[Number(m) - 1]}</span>
      <span className="day">{Number(d)}</span>
      {y !== today.slice(0, 4) && <span className="year">{y}</span>}
    </div>
  );
}

/** Una obligación como renglón de agenda. Las acciones van por children. */
export function ObligationLine({
  o,
  today,
  late,
  children,
}: {
  o: Obligation;
  today: string;
  late?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`row ${late ? 'late' : ''}`}>
      <DateBlock date={o.dueDate} today={today} late={late} />
      <div className="what">
        <div className="title">{o.title}</div>
        <div className="detail">
          {o.dueDate && <span className="when">{relativeDay(o.dueDate, today)}</span>}
          {o.counterparty && <span>{o.counterparty}</span>}
          <span>{KIND_LABELS[o.kind]}</span>
          {o.recurrence !== 'NONE' && <span>{RECURRENCE_LABELS[o.recurrence].toLowerCase()}</span>}
        </div>
      </div>
      <div className="side">
        {o.amount && <span className="amount">{formatAmount(o)}</span>}
        {children}
      </div>
    </div>
  );
}
