import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'docflow-screenshots-'));
let app;
try {
  await mkdir('docs/images', { recursive: true });
  app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, ANTHROPIC_API_KEY: '', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_FIXTURE: '' } });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '안내 닫기' }).click();
  await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
  await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/workspace.png' });
  await page.getByRole('button', { name: '관계 지도', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/relationship-map.png' });
  await page.getByRole('button', { name: '다이어그램', exact: true }).click();
  await expect(page.locator('.diagram-canvas svg')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/diagram.png' });
  await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
  await expect(page.getByLabel('AI 제공자')).toBeEnabled();
  await page.getByLabel('AI 제공자').selectOption('claude');
  await expect(page.getByRole('dialog', { name: 'Claude 연결 설정' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('API 키');
  await expect(page.getByRole('dialog', { name: 'Claude 연결 설정' })).toBeVisible();
  await page.screenshot({ path: 'docs/images/claude-setup.png' });
  console.log('Captured sample project and disconnected Claude setup; no inference requests.');
} finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
