import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, symlinkSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('DMG creation requires macOS.');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const app = resolve(`dist/Docflow-darwin-${process.arch}/Docflow.app`);
const staging = mkdtempSync(join(tmpdir(), 'docflow-dmg-'));
const destination = resolve(`dist/make/Docflow-${version}-${process.arch}.dmg`);
try {
  cpSync(app, join(staging, 'Docflow.app'), { recursive: true, verbatimSymlinks: true });
  symlinkSync('/Applications', join(staging, 'Applications'));
  mkdirSync(resolve('dist/make'), { recursive: true });
  execFileSync(
    'hdiutil',
    ['create', '-ov', '-volname', 'Docflow', '-srcfolder', staging, '-format', 'UDZO', destination],
    { stdio: 'inherit' },
  );
  console.log(destination);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
