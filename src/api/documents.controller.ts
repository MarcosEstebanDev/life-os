import { Controller, ForbiddenException, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ReprocessDocumentUseCase } from '../application/reprocess-document.use-case.js';
import type { Config } from '../config.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import { CONFIG, DOCUMENTS, REPROCESS } from './tokens.js';

@Controller('documents')
export class DocumentsController {
  constructor(
    @Inject(DOCUMENTS) private readonly documents: DocumentRepository,
    @Inject(REPROCESS) private readonly reprocess: ReprocessDocumentUseCase,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Sin el texto completo: la lista es para ver estados, no para leer. */
  @Get()
  async list() {
    return (await this.documents.list()).map(({ text, ...doc }) => ({ ...doc, textLength: text?.length ?? 0 }));
  }

  @Post(':id/reprocess')
  @HttpCode(202)
  async reprocessDocument(@Param('id') id: string) {
    await this.reprocess.execute(id);
  }

  /** Sólo sirve archivos de la carpeta observada, aunque la base diga otra cosa. */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.documents.get(id);
    const inside = relative(resolve(this.config.watchDir), resolve(doc.path));
    if (inside.startsWith('..') || isAbsolute(inside)) throw new ForbiddenException('fuera de la carpeta observada');
    res.type(doc.mimeType).sendFile(resolve(doc.path));
  }
}
