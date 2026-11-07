import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountAppears, dateAppears, evidenceAppears, normalizeText, relativeAppears } from './evidence.js';

test('un monto aparece en formato argentino o internacional', () => {
  assert.equal(amountAppears('1234.56', 'Total a pagar $ 1.234,56.'), true);
  assert.equal(amountAppears('1234.56', 'Amount due: 1,234.56'), true);
  assert.equal(amountAppears('1234.00', 'pagá 1.234 pesos'), true);
});

test('un monto mal leído no aparece aunque sea un pedazo del real', () => {
  assert.equal(amountAppears('1.23', 'Total a pagar $ 1.234,56'), false);
  assert.equal(amountAppears('234.56', 'Total a pagar $ 1.234,56'), false);
  assert.equal(amountAppears('1234.00', 'Total 1234,56'), false);
});

test('una fecha aparece en dd/mm, con o sin ceros, o escrita', () => {
  assert.equal(dateAppears('2026-11-15', 'Vence el 15/11/2026'), true);
  assert.equal(dateAppears('2027-03-05', 'vence 5-3-27'), true);
  assert.equal(dateAppears('2026-10-21', 'issued on 21 October 2026'), true);
  assert.equal(dateAppears('2026-10-21', 'emitida el 21 de octubre de 2026'), true);
  assert.equal(dateAppears('2026-10-21', 'fecha 2026-10-21'), true);
});

test('una fecha leída al revés (mm/dd) o inventada no aparece', () => {
  assert.equal(dateAppears('2027-05-03', 'vence el 05/03/2027'), false);
  assert.equal(dateAppears('2026-12-20', 'Fecha de vencimiento: 15/11/2026'), false);
  assert.equal(dateAppears('2026-11-05', 'vence el 15/11/2026'), false);
});

test('normalizar quita tildes, mayúsculas y colapsa signos y espacios', () => {
  assert.equal(normalizeText('  Póliza N°  123-456, VENCE ' ), 'poliza n 123 456 vence');
});

test('la evidencia aparece aunque cambien separadores y mayúsculas', () => {
  const text = 'Condiciones...\nLa póliza VENCE  el 15-03-2027 a las 12 hs.';
  assert.equal(evidenceAppears('vence el 15/03/2027', text), true);
});

test('evidencia inventada no aparece', () => {
  assert.equal(evidenceAppears('vence el 20/04/2027', 'La póliza vence el 15/03/2027'), false);
});

test('evidencia demasiado corta no cuenta', () => {
  assert.equal(evidenceAppears('ok', 'todo ok'), false);
});

const RESUMEN = [
  'Fecha de cierre: 29/10/2026 Próximo cierre: 26/11/2026',
  'Fecha de vencimiento: 10/11/2026',
  'Detalle de consumos',
  'Saldo actual / Total a pagar: $ 312.540,85',
].join('\n');

test('la evidencia puede unir fragmentos literales de líneas distintas (fecha y monto)', () => {
  // Respuesta real del modelo: pegó la línea del vencimiento con la del total.
  assert.equal(evidenceAppears('Fecha de vencimiento: 10/11/2026 Saldo actual / Total a pagar: $ 312.540,85', RESUMEN), true);
});

test('unir fragmentos no deja pasar uno inventado ni pedacitos sueltos', () => {
  assert.equal(evidenceAppears('Fecha de vencimiento: 10/11/2026 Total a pagar con descuento: $ 300.000,00', RESUMEN), false);
  // Palabras sueltas del texto en otro orden no son evidencia.
  assert.equal(evidenceAppears('pagar cierre fecha total consumos vencimiento saldo detalle', RESUMEN), false);
});

test('un plazo relativo tiene que estar escrito en la evidencia', () => {
  assert.equal(relativeAppears({ months: 12, days: 0 }, 'must be used within 12 months of issue'), true);
  assert.equal(relativeAppears({ months: 12, days: 0 }, 'tiene una vigencia de 1 año desde la firma'), true);
  assert.equal(relativeAppears({ months: 0, days: 30 }, 'dentro de los 30 días corridos'), true);
  assert.equal(relativeAppears({ months: 2, days: 0 }, 'renovar dentro de los dos meses'), true);
  // "el día 5 de cada mes" no es "1 mes y 5 días desde la emisión".
  assert.equal(relativeAppears({ months: 1, days: 5 }, 'Premio mensual: $ 38.900,00, debitado el día 5 de cada mes.'), false);
  assert.equal(relativeAppears({ months: 0, days: 0 }, 'vence al emitirse'), false);
});
