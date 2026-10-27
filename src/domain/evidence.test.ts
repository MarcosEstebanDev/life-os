import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceAppears, normalizeText } from './evidence.js';

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
