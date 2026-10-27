import { Controller, ForbiddenException, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ReprocessDocumentUseCase } from '../application/reprocess-document.use-case.js';
import type { Config } from '../config.js';
import type { DocumentRepository } from '../domain/ports/document-repository.port.js';
import { NotFoundError } from '../domain/errors.js';
import { CurrentAuth, type AuthContext } from './auth/session.guard.js';
import { CONFIG, DOCUMENTS, REPROCESS } from './tokens.js';
import { IdParam } from './uuid-param.js';

@Controller('documents')
export class DocumentsController {
  constructor(
    @Inject(DOCUMENTS) private readonly documents: DocumentRepository,
    @Inject(REPROCESS) private readonly reprocess: ReprocessDocumentUseCase,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Sin el texto completo: la lista es para ver estados, no para leer. */
  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    return (await this.documents.list(auth.user.id)).map(({ text, ...doc }) => ({ ...doc, textLength: text?.length ?? 0 }));
  }

  @Post(':id/reprocess')
  @HttpCode(202)
  async reprocessDocument(@CurrentAuth() auth: AuthContext, @IdParam() id: string) {
    await this.reprocess.execute(auth.user.id, id);
  }

  /** Sólo sirve archivos de la carpeta observada, aunque la base diga otra cosa. */
  @Get(':id/file')
  async file(@CurrentAuth() auth: AuthContext, @IdParam() id: string, @Res() res: Response) {
    const doc = await this.documents.findOwned(auth.user.id, id);
    if (!doc) throw new NotFoundError('el documento no existe');
    const inside = relative(resolve(this.config.watchDir), resolve(doc.path));
    if (inside.startsWith('..') || isAbsolute(inside)) throw new ForbiddenException('fuera de la carpeta observada');
    res.type(doc.mimeType).sendFile(resolve(doc.path));
  }
}
