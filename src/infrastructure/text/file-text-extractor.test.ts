import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { FileTextExtractor } from './file-text-extractor.js';

const extractor = new FileTextExtractor();

test('lee el texto de un PDF', async () => {
  const text = await extractor.extract(join(import.meta.dirname, '../../../test/fixtures/sample.pdf'));
  assert.match(text, /Vence el 15\/11\/2026/);
});

test('lee .txt y .md como utf-8', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-'));
  const file = join(dir, 'nota.md');
  await writeFile(file, 'Renovación póliza: 15/03/2027', 'utf8');
  assert.equal(await extractor.extract(file), 'Renovación póliza: 15/03/2027');
});

test('soporta pdf, txt, md, csv y xlsx (no el .xls viejo)', () => {
  assert.deepEqual(
    ['.pdf', '.txt', '.md', '.csv', '.xlsx', '.xls', '.docx', '.png'].map((e) => extractor.supports(e)),
    [true, true, true, true, true, false, false, false],
  );
});

test('lee un .csv utf-8 y le quita el BOM que pone Excel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-'));
  const file = join(dir, 'gastos.csv');
  await writeFile(file, '﻿concepto;vence;monto\nExpensas;10/12/2026;85000', 'utf8');
  assert.equal(await extractor.extract(file), 'concepto;vence;monto\nExpensas;10/12/2026;85000');
});

test('un .csv en Windows-1252 (exportes de bancos) se lee sin romper los acentos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-'));
  const file = join(dir, 'banco.csv');
  await writeFile(file, Buffer.from('Cuota préstamo;15/01/2027', 'latin1'));
  assert.equal(await extractor.extract(file), 'Cuota préstamo;15/01/2027');
});

test('un .xlsx sale como texto: una sección por hoja, celdas separadas y fechas dd/mm/aaaa', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-'));
  const file = join(dir, 'obligaciones.xlsx');
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Seguros');
  hoja.addRow(['Póliza', 'Vence', 'Prima']);
  hoja.addRow([]);
  hoja.addRow(['Auto', new Date(Date.UTC(2027, 2, 15)), 42000]);
  hoja.addRow(['Total', null, { formula: 'C3*2', result: 84000 }]);
  wb.addWorksheet('Vacía');
  wb.addWorksheet('Impuestos').addRow(['ABL', '10/02/2027']);
  await wb.xlsx.writeFile(file);

  assert.equal(
    await extractor.extract(file),
    [
      '## Hoja: Seguros',
      'Póliza | Vence | Prima',
      'Auto | 15/03/2027 | 42000',
      'Total |  | 84000',
      '',
      '## Hoja: Impuestos',
      'ABL | 10/02/2027',
    ].join('\n'),
  );
});
