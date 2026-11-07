import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { startFolderWatcher } from './folder-watcher.js';

/** Junta los archivos que ve el watcher durante `ms` después de que está listo. */
async function seen(dir: string, write: () => Promise<void>, ms = 6_000): Promise<string[]> {
  const files: string[] = [];
  const watcher = startFolderWatcher(dir, async (path) => {
    files.push(basename(path));
  });
  await new Promise<void>((resolve) => watcher.on('ready', () => resolve()));
  await write();
  await new Promise((r) => setTimeout(r, ms));
  await watcher.close();
  return files.sort();
}

test('mira la carpeta aunque esté dentro de una carpeta oculta (.local/inbox)', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'life-os-watch-'));
  const dir = join(root, '.local', 'inbox');
  await mkdir(dir, { recursive: true });
  try {
    const files = await seen(dir, async () => {
      await writeFile(join(dir, 'factura.pdf'), 'x');
    });
    assert.deepEqual(files, ['factura.pdf']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dentro de la carpeta ignora ocultos y temporales de Office', { timeout: 20_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'life-os-watch-'));
  try {
    const files = await seen(dir, async () => {
      await writeFile(join(dir, 'contrato.pdf'), 'x');
      await writeFile(join(dir, '.oculto.pdf'), 'x');
      await writeFile(join(dir, '~$contrato.docx'), 'x');
      await mkdir(join(dir, '.git'));
      await writeFile(join(dir, '.git', 'dentro.pdf'), 'x');
    });
    assert.deepEqual(files, ['contrato.pdf']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
