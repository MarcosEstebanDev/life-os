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

/** Hasta cuántos fragmentos literales puede pegar el modelo en una evidencia. */
const MAX_FRAGMENTS = 3;
const MIN_FRAGMENT_WORDS = 3;

export function evidenceAppears(evidence: string, text: string): boolean {
  const needle = normalizeText(evidence);
  if (needle.length < MIN_EVIDENCE_LENGTH) return false;
  const haystack = normalizeText(text);
  return haystack.includes(needle) || appearsAsFragments(needle.split(' '), ` ${haystack} `);
}

/**
 * Cuando la fecha y el monto están en líneas distintas, el modelo cita las dos
 * pegadas ("Fecha de vencimiento: 10/11/2026 Total a pagar: $ 312.540,85").
 * Vale si se puede partir en pocos fragmentos de varias palabras que estén
 * cada uno, tal cual, en el texto. Se toma siempre el fragmento más largo.
 */
function appearsAsFragments(words: string[], paddedText: string): boolean {
  let fragments = 0;
  for (let start = 0; start < words.length; ) {
    let end = start;
    while (end < words.length && paddedText.includes(` ${words.slice(start, end + 1).join(' ')} `)) end++;
    if (end - start < MIN_FRAGMENT_WORDS || ++fragments > MAX_FRAGMENTS) return false;
    start = end;
  }
  return true;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const UNITS: Array<[RegExp, 'months' | 'days' | 'years']> = [
  [/^(mes|meses|month|months)$/, 'months'],
  [/^(dia|dias|day|days)$/, 'days'],
  [/^(ano|anos|year|years)$/, 'years'],
];

/**
 * Un plazo relativo se calcula desde la fecha del documento, así que tiene que
 * estar escrito: "12 meses", "1 año", "30 días". Si no, el modelo convierte
 * "el día 5 de cada mes" en "1 mes y 5 días desde la emisión".
 */
export function relativeAppears(due: { months: number; days: number }, evidence: string): boolean {
  if (due.months === 0 && due.days === 0) return false;
  const words = normalizeText(evidence).split(' ');
  const periods = { months: new Set<number>(), days: new Set<number>(), years: new Set<number>() };
  words.forEach((w, i) => {
    const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w];
    const unit = UNITS.find(([re]) => re.test(words[i + 1] ?? ''))?.[1];
    if (n !== undefined && unit) periods[unit].add(n);
  });
  const monthsOk = due.months === 0 || periods.months.has(due.months) || (due.months % 12 === 0 && periods.years.has(due.months / 12));
  const daysOk = due.days === 0 || periods.days.has(due.days);
  return monthsOk && daysOk;
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
