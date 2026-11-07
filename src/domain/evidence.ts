/**
 * Barrera contra alucinaciones: una obligación sólo vale si su evidencia
 * aparece en el texto del documento. La comparación es normalizada, no byte
 * a byte, porque el modelo cambia separadores ("15-03" vs "15/03") al citar.
 */
const MIN_EVIDENCE_LENGTH = 8;

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function evidenceAppears(evidence: string, text: string): boolean {
  const needle = normalizeText(evidence);
  if (needle.length < MIN_EVIDENCE_LENGTH) return false;
  return normalizeText(text).includes(needle);
}

/**
 * Que la evidencia exista no alcanza: el modelo puede citar bien y leer mal
 * el número ("$ 1.234,56" → 1.234). Monto y fecha también tienen que estar
 * escritos en el texto, sin ser un pedazo de otro número.
 */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function appearsAsNumber(candidates: string[], text: string): boolean {
  return candidates.some((c) => new RegExp(`(?<!\\d[.,]?)${escapeRegex(c)}(?![.,]?\\d)`).test(text));
}

const group = (int: string, sep: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** `amount` es el decimal del dominio ("1234.56"). */
export function amountAppears(amount: string, text: string): boolean {
  const [int, cents = '00'] = amount.split('.');
  const candidates = [`${group(int, '.')},${cents}`, `${int},${cents}`, `${group(int, ',')}.${cents}`, `${int}.${cents}`];
  if (cents === '00') candidates.push(group(int, '.'), group(int, ','), int);
  return appearsAsNumber(candidates, text);
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Día/mes en orden argentino (o escrito, en castellano o inglés). Un mm/dd no pasa. */
export function dateAppears(iso: string, text: string): boolean {
  const [y, m, d] = iso.split('-');
  const days = [d, String(Number(d))];
  const months = [m, String(Number(m))];
  const years = [y, y.slice(2)];
  const numeric = [iso];
  for (const dd of days) for (const mm of months) for (const yy of years) for (const sep of ['/', '-', '.']) {
    numeric.push(`${dd}${sep}${mm}${sep}${yy}`);
  }
  if (appearsAsNumber(numeric, text)) return true;

  const day = Number(d);
  const es = MONTHS_ES[Number(m) - 1];
  const en = MONTHS_EN[Number(m) - 1];
  const written = [`${day} de ${es} de ${y}`, `${day} de ${es} ${y}`, `${day} ${en} ${y}`, `${en} ${day} ${y}`];
  const normalized = ` ${normalizeText(text)} `;
  return written.some((w) => normalized.includes(` ${w} `));
}
