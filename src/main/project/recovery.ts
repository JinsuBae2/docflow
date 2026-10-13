import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { safePath, ensureProjectDirectory } from './files';
export interface RecoveryOperation { id: string; path: string; before: string | null; after: string; record: unknown; proposalId?: string }
export function commitFile(root: string, operation: Omit<RecoveryOperation, 'id'>, persist: (op: RecoveryOperation) => void, failAt?: 'prepared' | 'replaced') {
  const dir = ensureProjectDirectory(root, '.workspace/operations');
  const op = { ...operation, id: randomUUID() }; const journal = join(dir, op.id + '.json');
  writeFileSync(journal, JSON.stringify(op), { mode: 0o600 });
  if (failAt === 'prepared') throw new Error('Injected interruption: prepared');
  const target = safePath(root, op.path); const temp = target + '.pending-' + op.id;
  writeFileSync(temp, op.after, 'utf8'); renameSync(temp, target);
  if (failAt === 'replaced') throw new Error('Injected interruption: replaced');
  persist(op); unlinkSync(journal);
}
export function recoverPendingOperations(root: string, persist: (op: RecoveryOperation) => void): string[] {
  const dir = ensureProjectDirectory(root, '.workspace/operations'); const recovered: string[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const journal = safePath(root, '.workspace/operations/' + file);
    const op = JSON.parse(readFileSync(journal, 'utf8')) as RecoveryOperation;
    if (typeof op.path !== 'string' || typeof op.after !== 'string') throw new Error('복구 기록이 올바르지 않습니다.');
    const target = safePath(root, op.path); const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current !== op.after && current !== op.before) throw new Error('복구 중 외부 변경이 발견되었습니다. 원본을 보존했습니다.');
    if (current === op.after) persist(op);
    const temp = safePath(root, op.path + '.pending-' + op.id); if (existsSync(temp)) unlinkSync(temp);
    unlinkSync(journal); recovered.push(op.id);
  }
  return recovered;
}
