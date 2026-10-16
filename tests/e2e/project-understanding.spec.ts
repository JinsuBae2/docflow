import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../../src/main/project/store';

test('briefs 24 documents without AI, reviews budgeted original evidence and blocks empty document requests', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-understanding-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  store.updateProject('24개 문서 프로젝트', '문서에서 흐름을 이해하기', '');
  const overview = await store.createDocument(
    '01. 프로젝트 개요',
    'overview',
    '# 프로젝트 개요\n핵심 목표\n```mermaid\nflowchart LR\nA --> B\n```',
  );
  const large = await store.createDocument(
    '02. 로그인 상세',
    'prd',
    '# 배경\n' +
      '상세 배경 '.repeat(15000) +
      '\n## 로그인 오류\n로그인 실패 시 다시 시도하도록 안내합니다.\n## 별도 설정\n' +
      '설정 설명 '.repeat(15000),
  );
  for (let i = 3; i <= 24; i++)
    await store.createDocument(
      `${String(i).padStart(2, '0')}. 참고 문서`,
      'note',
      '# 참고\n일반 설명',
    );
  store.addRelation(overview.id, large.id, '구체화');
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
    await expect(
      page.getByRole('heading', { name: '24개 문서 프로젝트', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.briefing-stats')).toContainText('문서 24개');
    await expect(page.locator('.briefing-stats')).toContainText('연결된 문서 2개');
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
    await page.screenshot({ path: 'outputs/project-briefing.png', fullPage: true });
    await page
      .locator('.briefing-card')
      .getByRole('button', { name: '유저플로우 열기', exact: true })
      .click();
    await expect(page.getByRole('tab', { name: '유저플로우', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: '프로젝트 브리핑', exact: true }).click();
    await page
      .locator('.briefing-card')
      .getByRole('button', { name: /문서 다이어그램 1개/ })
      .click();
    await expect(page.getByRole('heading', { name: '문서 다이어그램', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '프로젝트 브리핑', exact: true }).click();
    await page
      .locator('.briefing-card')
      .getByRole('button', { name: new RegExp(large.title) })
      .click();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('로그인 오류 발췌 확인만 해줘');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    const selection = page.getByRole('region', { name: '원문 발췌 선택 결과' });
    await expect(selection).toContainText('예산 내 원문 발췌');
    await expect(selection).toContainText('로그인 오류');
    await expect(selection.getByText(/revision/).first()).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
    await page.screenshot({ path: 'outputs/context-excerpts.png', fullPage: true });
    await page.getByRole('button', { name: '검토한 근거로 요청', exact: true }).click();
    await expect(page.getByText('검토했습니다.', { exact: true })).toBeVisible();
    const after = (await page.evaluate(() => window.workspace.current()))!;
    expect(after.documents.find((d) => d.id === large.id)!.revision).toBe(large.revision);
    expect(after.proposals).toHaveLength(0);
    const blocked = await page.evaluate(async (id) => {
      const ws = (await window.workspace.current())!;
      try {
        await window.workspace.startRequest({
          instruction: '빈 근거 검토',
          selectedIds: [id],
          excludedIds: ws.documents.map((d) => d.id),
          mode: 'documents',
        });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    }, large.id);
    expect(blocked).toContain('원문 근거');
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(
      after.messages.length,
    );
    await page.getByLabel('문서 없이 아이디어 상담', { exact: true }).check();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('새 기획 아이디어');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.workspace.current()))!.messages.length)
      .toBe(after.messages.length + 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('starts a planning conversation directly from a blank project', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-empty-understanding-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
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
    await expect(page.getByRole('button', { name: '프로젝트 브리핑', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('새로운 기획');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByText('어떤 사용자의 어떤 문제를 해결하고 싶나요?', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '아이디어에서 프로젝트로' })).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(2);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
