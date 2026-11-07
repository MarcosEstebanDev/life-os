/** Cliente de la API local. Los tipos replican los del dominio (src/domain). */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3010/api';

export type ObligationKind = 'PAYMENT' | 'RENEWAL' | 'DEADLINE' | 'EXPIRY' | 'OTHER';
export type Recurrence = 'NONE' | 'MONTHLY' | 'YEARLY';
export type ObligationStatus = 'PROPOSED' | 'ACTIVE' | 'DONE' | 'DISMISSED';

export interface Obligation {
  id: string;
  title: string;
  kind: ObligationKind;
  dueDate: string | null;
  recurrence: Recurrence;
  amount: string | null;
  currency: string | null;
  counterparty: string | null;
  sourceDocumentId: string;
  evidence: string[];
  confidence: number;
  status: ObligationStatus;
  possibleUpdateOf: string | null;
}

export interface Brief {
  today: string;
  overdue: Obligation[];
  next7: Obligation[];
  next30: Obligation[];
  toReview: Obligation[];
}

export interface DocumentSummary {
  id: string;
  path: string;
  mimeType: string;
  status: 'PENDING' | 'TEXT_EXTRACTED' | 'PROCESSED' | 'FAILED';
  error: string | null;
  createdAt: string;
  textLength: number;
}

export type ObligationEdits = Partial<
  Pick<Obligation, 'title' | 'kind' | 'dueDate' | 'recurrence' | 'amount' | 'currency' | 'counterparty'>
>;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message ?? `error ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  brief: () => call<Brief>('/brief'),
  obligations: (status?: ObligationStatus) => call<Obligation[]>(`/obligations${status ? `?status=${status}` : ''}`),
  accept: (id: string, edits: ObligationEdits) => call<Obligation>(`/obligations/${id}/accept`, { method: 'POST', body: JSON.stringify(edits) }),
  dismiss: (id: string) => call<Obligation>(`/obligations/${id}/dismiss`, { method: 'POST' }),
  merge: (id: string) => call<Obligation>(`/obligations/${id}/merge`, { method: 'POST' }),
  complete: (id: string) => call<void>(`/obligations/${id}/complete`, { method: 'POST' }),
  documents: () => call<DocumentSummary[]>('/documents'),
  reprocess: (id: string) => call<void>(`/documents/${id}/reprocess`, { method: 'POST' }),
  fileUrl: (documentId: string) => `${API_URL}/documents/${documentId}/file`,
};

export const KIND_LABELS: Record<ObligationKind, string> = {
  PAYMENT: 'Pago',
  RENEWAL: 'Renovación',
  DEADLINE: 'Plazo',
  EXPIRY: 'Vencimiento',
  OTHER: 'Otro',
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = { NONE: 'Única', MONTHLY: 'Mensual', YEARLY: 'Anual' };

export function formatDate(d: string | null): string {
  if (!d) return 'sin fecha';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** "hoy", "mañana", "en 5 días", "hace 3 días". Fechas sin hora, comparadas en UTC. */
export function relativeDay(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  if (days === -1) return 'venció ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

/** Hoy en la zona local, igual que el reloj de la API. */
export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function longDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function formatAmount(o: Pick<Obligation, 'amount' | 'currency'>): string {
  if (!o.amount) return '';
  const n = Number(o.amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return o.currency ? `${o.currency} ${n}` : n;
}
