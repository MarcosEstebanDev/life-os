import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Por stream: un PDF grande no se carga entero en memoria para hashearlo. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}
