import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

test('reviews document evidence from diagram entry points even in idea mode and blocks empty evidence', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-diagram-context-'));
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
    await page.getByRole('button', { name: '안내 닫기' }).click();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    const idea = page.getByRole('checkbox', { name: '문서 없이 아이디어 상담' });
    await idea.check();
    await page.getByRole('button', { name: '사용자 흐름 정리', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '전달할 문서' })).toBeVisible();
    await expect(idea).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '검토한 근거로 요청' })).toBeEnabled();
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await idea.check();
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await page.getByRole('button', { name: 'AI로 생성', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '전달할 문서' })).toBeVisible();
    await expect(idea).not.toBeChecked();
    for (const checkbox of await dialog.locator('.context-source input').all())
      await checkbox.uncheck();
    await expect(dialog.getByRole('button', { name: '검토한 근거로 요청' })).toBeDisabled();
    await expect(dialog).toContainText('원문');
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('renders ERD and gives diagrams responsive space while preserving selection, zoom and drafts', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-diagram-space-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  await store.createDocument(
    '다이어그램 예제',
    'flow',
    '# 다이어그램\n## 데이터 관계\n```mermaid\nerDiagram\nUSER ||--o{ EVENT : reviews\n```\n## 사용자 여정\n```mermaid\nflowchart TD\n' +
      Array.from(
        { length: 12 },
        (_, i) => `Step${i}[단계 ${i}] --> Step${i + 1}[단계 ${i + 1}]`,
      ).join('\n') +
      '\n```',
  );
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: data },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await expect(page.locator('.diagram-canvas svg')).toContainText('USER');
    await expect(page.getByRole('button', { name: '기본 흐름 편집', exact: true })).toBeDisabled();
    await expect(page.locator('.flow-readonly-hint')).toContainText('미리보기만');
    await page.getByRole('button', { name: /^흐름 선택: 사용자 여정/ }).click();
    await expect(page.locator('.diagram-canvas svg')).toContainText('단계 12');
    await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
    const fitted = (await page.locator('.diagram-canvas svg').boundingBox())!;
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await expect
      .poll(async () => (await page.locator('.diagram-canvas svg').boundingBox())!.height)
      .toBeGreaterThan(fitted.height);
    const before = await page.locator('.diagram-canvas').getAttribute('style');
    await page.getByRole('button', { name: '다이어그램 확대 보기', exact: true }).click();
    await expect(page.getByRole('button', { name: '확대 보기 종료' })).toBeVisible();
    await expect(page.locator('.flow-inventory')).toBeHidden();
    await page.getByRole('button', { name: '원문 위치로 이동', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.flow-source-code summary')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow-source-code')).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '확대 보기 종료' }).focus();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: '다이어그램 확대 보기', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.diagram-toolbar strong')).toHaveText('사용자 여정');
    await expect(page.locator('.diagram-canvas')).toHaveAttribute('style', before!);
    for (const [width, height] of [
      [800, 700],
      [1280, 800],
      [1600, 1050],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await page.locator('.diagram-scroll').boundingBox())!.height)
        .toBeGreaterThan(height * 0.3);
      if (width === 800) await expect(page.locator('.flow-inventory')).toBeHidden();
      await page.getByRole('button', { name: '다이어그램 확대 보기', exact: true }).click();
      await expect
        .poll(async () => (await page.locator('.diagram-scroll').boundingBox())!.height)
        .toBeGreaterThan(height * 0.6);
      await expect
        .poll(async () => (await page.locator('.diagram-scroll').boundingBox())!.width)
        .toBeGreaterThan(width * 0.85);
      if (width === 1600) {
        await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
        await page.mouse.move(10, 10);
        await page.screenshot({ path: 'outputs/diagram-workspace-expanded.png' });
      }
      await page.getByRole('button', { name: '확대 보기 종료' }).click();
    }
    await page.getByRole('button', { name: '기본 흐름 편집', exact: true }).click();
    const input = page.getByRole('textbox', { name: '단계 이름 Step0', exact: true });
    await input.fill('저장 전 수정');
    await page.getByRole('button', { name: '다이어그램 확대 보기', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('저장 전 수정');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
