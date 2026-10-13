import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectRegistry } from '../../src/main/project/registry';

it('migrates the last root, preserves settings, deduplicates paths and forgets without deleting files', () => {
  const root = mkdtempSync(join(tmpdir(), 'docflow-registry-'));
  try {
    const project = join(root, 'project'); mkdirSync(project); writeFileSync(join(project, 'keep.md'), '# Keep');
    const file = join(root, 'settings.json'); writeFileSync(file, JSON.stringify({ root: project, provider: 'claude', models: { claude: 'chosen' } }));
    const registry = new ProjectRegistry(file);
    const first = registry.list()[0]; expect(first.root).toBe(realpathSync(project));
    expect(registry.register(join(project, '.'), 'Renamed').id).toBe(first.id);
    expect(registry.list()).toHaveLength(1); expect(registry.list()[0].name).toBe('Renamed');
    registry.patch({ onboardingDone: true }); expect(registry.read().models).toEqual({ claude: 'chosen' });
    registry.forget(first.id); expect(registry.list()).toHaveLength(0);
    expect(readFileSync(join(project, 'keep.md'), 'utf8')).toBe('# Keep');
    expect(() => registry.resolve(first.id)).toThrow(/등록/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('keeps corrupt settings for recovery and reports a missing registered folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'docflow-registry-'));
  try {
    const file = join(root, 'settings.json'); writeFileSync(file, '{broken');
    const registry = new ProjectRegistry(file); expect(registry.list()).toEqual([]);
    const folder = join(root, 'project'); mkdirSync(folder); const entry = registry.register(folder, 'Project');
    expect(readdirSync(root).some(name => name.startsWith('settings.json.broken-'))).toBe(true);
    rmSync(folder, { recursive: true }); expect(registry.list()[0].error).toMatch(/폴더/);
    expect(() => registry.resolve(entry.id)).toThrow(/폴더/);
    expect(JSON.parse(readFileSync(file, 'utf8')).projects).toHaveLength(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
