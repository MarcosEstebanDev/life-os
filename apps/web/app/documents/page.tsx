'use client';

import { useCallback, useState } from 'react';
import { api, type DocumentSummary } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const STATUS: Record<DocumentSummary['status'], { label: string; tone: string }> = {
  PENDING: { label: 'En cola', tone: 'working' },
  TEXT_EXTRACTED: { label: 'Leyendo', tone: 'working' },
  PROCESSED: { label: 'Leído', tone: '' },
  FAILED: { label: 'No se pudo leer', tone: 'failed' },
};

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export default function DocumentsPage() {
  const { data, error, reload } = useLoad(useCallback(() => api.documents(), []));
  const [actionError, setActionError] = useState<string | null>(null);
  const reprocess = (id: string) =>
    api
      .reprocess(id)
      .then(() => setActionError(null))
      .then(reload)
      .catch((e: Error) => setActionError(`No se pudo volver a leer: ${e.message}`));

  return (
    <>
      <header className="page-head">
        <h1>Documentos</h1>
        <p>Los archivos que entraron por la carpeta observada y qué pasó con cada uno.</p>
      </header>
      {error && <p className="notice error">No se pudo cargar la lista ({error}).</p>}
      {actionError && <p className="notice error">{actionError}</p>}
      {data?.length === 0 && (
        <p className="empty">Todavía no entró ningún documento. Copiá un PDF con texto, un .csv o un .xlsx a la carpeta observada y va a aparecer acá.</p>
      )}
      {data?.map((d) => (
        <div key={d.id} className="doc">
          <div>
            <a className="name" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer" title={d.path}>
              {fileName(d.path)}
            </a>
            <div className="detail">
              Entró el {new Date(d.createdAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            {d.error && <div className="why">{d.error}</div>}
          </div>
          <div className="side">
            <span className={`status ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
            <button className="quiet" onClick={() => reprocess(d.id)}>
              Volver a leer
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
