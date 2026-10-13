import { lstatSync, realpathSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
export function safePath(root: string, path: string): string {
  if (!path || isAbsolute(path)) throw new Error('프로젝트 내부 상대 경로만 허용됩니다.');
  const canonicalRoot = realpathSync(root); const target = resolve(canonicalRoot, path); const rel = relative(canonicalRoot, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('프로젝트 밖의 경로는 접근할 수 없습니다.');
  let current = canonicalRoot;
  for (const part of rel.split(sep)) { current = resolve(current, part); if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('심볼릭 링크는 프로젝트 파일로 사용할 수 없습니다.'); }
  return target;
}
export function ensureProjectDirectory(root: string, path: string): string { const target = safePath(root, path); mkdirSync(target, { recursive: true }); return target; }
export function readDocumentFile(root: string, path: string): string {
  const target = safePath(root, path); const stat = lstatSync(target);
  if (!stat.isFile() || stat.size > 2_000_000) throw new Error('2MB 이하의 Markdown 파일만 열 수 있습니다.');
  return readFileSync(target, 'utf8');
}
