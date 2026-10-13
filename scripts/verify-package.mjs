import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const executablePath = process.argv[2];
if (!executablePath) throw new Error('Pass the packaged application executable path.');
const root = await mkdtemp(join(tmpdir(), 'docflow-package-check-'));
let app;
try {
  app = await electron.launch({ executablePath: resolve(executablePath), env: { ...process.env, DOCFLOW_DATA_DIR: root } });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '안내 닫기' }).click();
  await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
  await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '관계 지도', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.screenshot({ path: 'outputs/packaged.png', fullPage: true });
  console.log('PACKAGED_APP_OK: native Electron, SQLite, preload and graph verified.');
} finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
