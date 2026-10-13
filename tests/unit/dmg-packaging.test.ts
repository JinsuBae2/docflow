import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { state } = vi.hoisted(() => ({ state: { source: '', destination: '', stage: '' } }));
vi.mock('node:child_process', () => ({
  execFileSync: (_command: string, args: string[]) => {
    state.stage = args[args.indexOf('-srcfolder') + 1];
  },
}));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    cpSync: (_source: string, _destination: string, options: object) =>
      fs.cpSync(state.source, state.destination, options),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  if (state.stage) rmSync(state.stage, { recursive: true, force: true });
});

it.skipIf(process.platform !== 'darwin')(
  'keeps framework links relative so a DMG app works after moving and removing its build source',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'docflow-dmg-test-'));
    try {
      state.source = join(root, 'source.app');
      state.destination = join(root, 'installed.app');
      mkdirSync(join(state.source, 'Versions', 'A', 'Resources'), { recursive: true });
      writeFileSync(join(state.source, 'Versions', 'A', 'Resources', 'icudtl.dat'), 'icu-data');
      symlinkSync('A', join(state.source, 'Versions', 'Current'));
      symlinkSync('Versions/Current/Resources', join(state.source, 'Resources'));
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      await import(/* @vite-ignore */ new URL('../../scripts/make-dmg.mjs', import.meta.url).href);
      rmSync(state.source, { recursive: true });
      expect(readlinkSync(join(state.destination, 'Resources'))).toBe('Versions/Current/Resources');
      expect(readFileSync(join(state.destination, 'Resources', 'icudtl.dat'), 'utf8')).toBe(
        'icu-data',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
