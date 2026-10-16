import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

test('previews a large project, excludes private documents and reuses completed analysis', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-analysis-e2e-'));
  const root = join(data, 'project');
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs/large.md'), '# 분석 대상\n' + '분석 대상입니다.\n'.repeat(6500));
  await writeFile(join(root, 'docs/private.md'), '# 비공개\n전송하면 안 되는 내용');
  const store = await ProjectStore.open(root);
  store.linkDocuments(store.discoverDocuments().files.filter((file) => !file.reason));
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DOCFLOW_DATA_DIR: data,
      DOCFLOW_TEST_NODE: process.execPath,
      DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs'),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '프로젝트 전체 분석', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로젝트 전체 분석' });
    await dialog
      .getByRole('textbox', { name: '분석 요청', exact: true })
      .fill('대형 프로젝트 범위 검증');
    await dialog
      .locator('.context-source')
      .filter({ hasText: '비공개' })
      .getByRole('checkbox')
      .uncheck();
    await dialog.getByRole('button', { name: '분석 계획 확인', exact: true }).click();
    await expect(dialog.getByText('포함 1개 · 제외 1개', { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: '분석 시작', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '분석 취소', exact: true })).toBeVisible();
    await expect(dialog.locator('strong').filter({ hasText: /^완료 ·/ })).toBeVisible({
      timeout: 25000,
    });
    const first = await page.evaluate(async () => ({
      plans: await window.workspace.listAnalyses(),
      usage: await window.workspace.usageSummary(),
    }));
    expect(first.plans[0].total).toBeGreaterThan(1);
    expect(first.plans[0].completed).toBe(first.plans[0].total);
    expect(new Set(first.plans[0].evidence?.map((s) => s.documentId)).size).toBe(1);
    await dialog.getByRole('button', { name: '분석 계획 확인', exact: true }).click();
    await expect(dialog.locator('strong').filter({ hasText: /^준비 ·/ })).toBeVisible();
    await dialog.getByRole('button', { name: '분석 시작', exact: true }).click();
    await expect(dialog.locator('strong').filter({ hasText: /^완료 ·/ })).toBeVisible({
      timeout: 25000,
    });
    const second = await page.evaluate(async () => ({
      plans: await window.workspace.listAnalyses(),
      usage: await window.workspace.usageSummary(),
    }));
    expect(second.plans[1].cached).toBe(second.plans[1].total);
    expect(second.usage).toEqual(first.usage);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5 });
  }
});
