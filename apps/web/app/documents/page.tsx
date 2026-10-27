'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const STATUS_LABELS = {
  PENDING: 'en cola',
  TEXT_EXTRACTED: 'leyendo con IA',
  PROCESSED: 'procesado',
  FAILED: 'falló',
} as const;

export default function DocumentsPage() {
  const { data, error, reload } = useLoad(useCallback(() => api.documents(), []));

  return (
    <>
      <h1>Documentos</h1>
      <p className="muted">Lo que entró por la carpeta observada.</p>
      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p>Todavía no hay documentos. Dejá un PDF en la carpeta.</p>}
      {data?.map((d) => (
        <div key={d.id} className="card">
          <div className="row">
            <div>
              <a className="path" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer">
                {d.path}
              </a>
              <div className="meta">
                {new Date(d.createdAt).toLocaleString('es-AR')} · {d.textLength} caracteres de texto
              </div>
              {d.error && <p className="error">{d.error}</p>}
            </div>
            <div className="actions">
              <span className={`badge ${d.status === 'FAILED' ? 'failed' : ''}`}>{STATUS_LABELS[d.status]}</span>
              <button onClick={() => api.reprocess(d.id).then(reload)}>Reprocesar</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
