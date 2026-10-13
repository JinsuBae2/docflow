import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { safePath, readDocumentFile } from './files';
import { revisionOf } from './markdown';
import type { DocumentDiscovery } from '../../shared/contracts';

const excluded = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '.workspace',
  '.superpowers',
  '.codex',
  '.agents',
  '.aws',
  'work',
  'outputs',
  'test-results',
  'playwright-report',
]);
export function checkDocumentPath(path: string) {
  if (path.split(/[\\/]/).some((part) => excluded.has(part.toLowerCase())))
    throw new Error('앱 데이터·의존성·생성물 경로는 등록할 수 없습니다.');
}
export function discoverDocuments(
  root: string,
  registered: Set<string>,
  paths?: string[],
): DocumentDiscovery {
  const result: DocumentDiscovery = { files: [], warnings: [] };
  const seen = new Set<string>();
  let visited = 0;
  let stopped = false;
  const key = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const registeredKeys = new Set([...registered].map(key));
  const visit = (path: string, collecting: boolean, depth: number) => {
    if (stopped || seen.has(key(path))) return;
    seen.add(key(path));
    if (++visited > 10_000 || result.files.length >= 500) {
      stopped = true;
      result.warnings.push('탐색 상한에 도달했습니다. 필요한 폴더를 직접 선택해 주세요.');
      return;
    }
    if (depth > 20) {
      result.warnings.push(`${path}: 폴더 깊이 상한으로 건너뛰었습니다.`);
      return;
    }
    let bytes = 0;
    try {
      checkDocumentPath(path);
      const target = safePath(root, path);
      const stat = lstatSync(target);
      bytes = stat.size;
      if (stat.isDirectory()) {
        for (const entry of readdirSync(target, { withFileTypes: true }).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          if (excluded.has(entry.name.toLowerCase())) continue;
          visit(
            join(path, entry.name),
            collecting || entry.name.toLowerCase() === 'docs',
            depth + 1,
          );
        }
        return;
      }
      if (!collecting) return;
      const relativePath = path.replace(/\\/g, '/');
      if (!stat.isFile()) throw new Error('일반 파일만 지원합니다.');
      if (!/\.(md|markdown)$/i.test(path)) throw new Error('Markdown 형식만 지원합니다.');
      if (registeredKeys.has(key(relativePath))) throw new Error('이미 등록된 문서입니다.');
      const text = readDocumentFile(root, path);
      if (text.includes('\0')) throw new Error('텍스트 Markdown 파일만 지원합니다.');
      result.files.push({ path: relativePath, bytes, revision: revisionOf(text) });
    } catch (error) {
      if (collecting)
        result.files.push({
          path: path.replace(/\\/g, '/'),
          bytes,
          reason: (error as Error).message,
        });
      else result.warnings.push(`${path}: 탐색할 수 없어 건너뛰었습니다.`);
    }
  };
  if (paths) {
    for (const path of paths) {
      checkDocumentPath(path);
      safePath(root, path);
      visit(path, true, 0);
    }
  } else visit('.', false, 0);
  return result;
}
