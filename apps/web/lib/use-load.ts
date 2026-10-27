'use client';

import { useCallback, useEffect, useState } from 'react';

/** Carga + recarga después de cada acción. La API es local: no hace falta caché. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [load]);

  useEffect(reload, [reload]);
  return { data, error, reload };
}
