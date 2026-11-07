import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import type { TextExtractor } from '../../domain/ports/text-extractor.port.js';

/** PDFs con capa de texto y archivos de texto plano. El OCR entra después, detrás del mismo puerto. */
export class FileTextExtractor implements TextExtractor {
  supports(ext: string): boolean {
    return ['.pdf', '.txt', '.md'].includes(ext);
  }

  async extract(path: string): Promise<string> {
    if (extname(path).toLowerCase() !== '.pdf') return readFile(path, 'utf8');
    const parser = new PDFParse({ data: await readFile(path) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
}
