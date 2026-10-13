import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync, realpathSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { ProjectEntry } from '../../shared/contracts';

export class ProjectRegistry {
  constructor(private file: string) {
    const saved = this.read();
    if (!Array.isArray(saved.projects) && typeof saved.root === 'string' && existsSync(saved.root)) this.register(saved.root, basename(saved.root));
  }
  read(): Record<string, any> {
    try { const value = JSON.parse(readFileSync(this.file, 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
  }
  patch(patch: object) {
    if (existsSync(this.file)) {
      try { JSON.parse(readFileSync(this.file, 'utf8')); } catch { copyFileSync(this.file, this.file + '.broken-' + Date.now()); }
    }
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify({ ...this.read(), ...patch }), { mode: 0o600 }); renameSync(temporary, this.file);
  }
  list(): ProjectEntry[] {
    const entries = this.read().projects;
    return (Array.isArray(entries) ? entries : []).filter((item): item is ProjectEntry => item && typeof item.id === 'string' && typeof item.root === 'string' && typeof item.name === 'string').map(item => {
      try { if (!statSync(item.root).isDirectory()) throw new Error(); return { ...item, error: undefined }; }
      catch { return { ...item, error: '프로젝트 폴더를 찾거나 열 수 없습니다.' }; }
    });
  }
  register(root: string, name: string): ProjectEntry {
    root = realpathSync(root);
    const entries = this.list(); const existing = entries.find(entry => entry.root === root);
    const entry = { id: existing?.id || randomUUID(), name, root, lastOpenedAt: new Date().toISOString() };
    this.patch({ projects: [...entries.filter(item => item.id !== entry.id), entry], root }); return entry;
  }
  resolve(id: string) {
    const entry = this.list().find(item => item.id === id);
    if (!entry) throw new Error('등록된 프로젝트를 찾을 수 없습니다.');
    if (entry.error) throw new Error(entry.error);
    if (realpathSync(entry.root) !== entry.root) throw new Error('프로젝트 폴더 위치가 변경되었습니다. 폴더를 다시 등록해 주세요.');
    return entry.root;
  }
  forget(id: string) {
    const entry = this.list().find(item => item.id === id);
    if (!entry) throw new Error('등록된 프로젝트를 찾을 수 없습니다.');
    this.patch({ projects: this.list().filter(item => item.id !== id), ...(this.read().root === entry.root ? { root: undefined } : {}) });
  }
}
