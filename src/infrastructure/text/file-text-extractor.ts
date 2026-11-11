import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';
import type { TextExtractor } from '../../domain/ports/text-extractor.port.js';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.csv', '.xlsx'] as const;

/**
 * PDFs con capa de texto, texto plano y planillas. El OCR entra después, detrás del mismo puerto.
 * El `.xls` viejo (binario) no está: exceljs sólo lee `.xlsx`; se guarda como `.xlsx` desde Excel.
 */
export class FileTextExtractor implements TextExtractor {
  supports(ext: string): boolean {
    return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
  }

  async extract(path: string): Promise<string> {
    const ext = extname(path).toLowerCase();
    if (ext === '.pdf') return extractPdf(path);
    if (ext === '.xlsx') return extractXlsx(path);
    return decodeText(await readFile(path));
  }
}

async function extractPdf(path: string): Promise<string> {
  const parser = new PDFParse({ data: await readFile(path) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/**
 * UTF-8 si es válido (TextDecoder ya saca el BOM que pone Excel); si no, Windows-1252,
 * que es como exportan los CSV muchos bancos y Excel en castellano.
 */
function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Una sección por hoja (`## Hoja: nombre`) y una línea por fila con las celdas separadas por ` | `.
 * Se saltean filas y hojas vacías. Las fechas salen como dd/mm/aaaa: la extracción exige que la
 * fecha aparezca escrita en la evidencia, y un serial de Excel o un ISO con hora no le sirven.
 */
async function extractXlsx(path: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      for (let i = 1; i <= row.cellCount; i++) cells.push(cellText(row.getCell(i).value));
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      if (cells.length > 0) lines.push(cells.join(' | '));
    });
    if (lines.length > 0) sections.push([`## Hoja: ${sheet.name}`, ...lines].join('\n'));
  });
  return sections.join('\n\n');
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value !== 'object') return String(value);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
  if ('text' in value) return String(value.text);
  if ('error' in value) return '';
  return '';
}

/** Excel guarda las fechas sin zona: exceljs las devuelve como medianoche UTC. */
function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}
