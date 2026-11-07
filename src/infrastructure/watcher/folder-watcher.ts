import { relative } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';

const HIDDEN_OR_TEMP = /(^|[/\\])(\.|~\$)/;

/**
 * `awaitWriteFinish`: OneDrive escribe los archivos de a pedazos mientras
 * sincroniza; se espera a que el tamaño deje de cambiar 3 s. Se ignoran los
 * ocultos y los temporales de Office (`~$`), mirando sólo la parte de la ruta
 * que está dentro de la carpeta: si no, una carpeta observada bajo `.local/`
 * (o cualquier directorio oculto) se ignoraba entera, sin avisar.
 */
export function startFolderWatcher(dir: string, onFile: (path: string) => Promise<void>): FSWatcher {
  const watcher = watch(dir, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 3_000, pollInterval: 500 },
    ignored: (path) => HIDDEN_OR_TEMP.test(relative(dir, path)),
  });
  const handle = (path: string) => {
    onFile(path).catch((e) => console.error(`[watcher] ${path}: ${(e as Error).message}`));
  };
  return watcher.on('add', handle).on('change', handle);
}
