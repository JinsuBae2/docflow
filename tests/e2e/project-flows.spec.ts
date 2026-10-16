import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../../src/main/project/store';

test('browses local diagram families and definitions, edits a basic flow and preserves complex and conflicting source', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-flow-e2e-'));
  const root = join(data, 'project');
  await mkdir(join(root, 'docs'), { recursive: true });
  const original =
    '# 프로젝트\n## 사용자\n```mermaid 로그인\nflowchart TD\nA[시작] --> B[완료]\n```\n\n```mermaid 시퀀스\nsequenceDiagram\nUser->>API: 요청\nAPI-->>User: 완료\n```\n\n```mermaid 상태\nstateDiagram-v2\n[*] --> Ready\nReady --> [*]\n```\n\n```mermaid 복잡한 흐름\nflowchart TD\nA{판단} -->|확인| B[완료]\n```\n\n```mermaid 차단 흐름\nflowchart TD\nclick A "https://example.com"\n```\n\n[파일 정의](state.mmd)';
  await writeFile(join(root, 'docs/flows.md'), original);
  await writeFile(join(root, 'docs/state.mmd'), 'stateDiagram-v2\n[*] --> FileState');
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
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '문서 다이어그램', exact: true })).toBeVisible({
      timeout: 3000,
    });
    const choose = async (title: string) =>
      page.getByRole('button', { name: new RegExp('^흐름 선택: ' + title + ' ·') }).click();
    for (const title of ['로그인', '시퀀스', '상태', 'state.mmd']) {
      await choose(title);
      await expect(page.locator('.diagram-canvas svg')).toBeVisible();
      await expect(page.locator('.diagram-canvas svg')).toContainText(
        { 로그인: '시작', 시퀀스: 'User', 상태: 'Ready', 'state.mmd': 'FileState' }[title]!,
      );
    }
    await expect(page.getByRole('button', { name: '기본 흐름 편집', exact: true })).toBeDisabled();
    await choose('차단 흐름');
    await expect(page.getByText(/실행 링크·HTML·설정 지시문/)).toBeVisible();
    await expect(page.locator('.diagram-canvas svg')).toHaveCount(0);
    await choose('복잡한 흐름');
    await expect(page.locator('.diagram-canvas svg')).toBeVisible();
    await expect(page.getByRole('button', { name: '기본 흐름 편집', exact: true })).toBeDisabled();
    expect(await readFile(join(root, 'docs/flows.md'), 'utf8')).toBe(original);
    await choose('로그인');
    await page.getByRole('button', { name: '원문 위치로 이동', exact: true }).click();
    await expect(page.locator('.flow-source-highlight')).toBeInViewport();
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await choose('로그인');
    await page.getByRole('button', { name: '기본 흐름 편집', exact: true }).click();
    await page.getByRole('textbox', { name: '단계 이름 A', exact: true }).fill('변경한 시작');
    const sourceHandle = await page
      .locator('.flow-edit-canvas .react-flow__node[data-id="B"] .source')
      .boundingBox();
    const targetHandle = await page
      .locator('.flow-edit-canvas .react-flow__node[data-id="A"] .target')
      .boundingBox();
    expect(sourceHandle).toBeTruthy();
    expect(targetHandle).toBeTruthy();
    await page.mouse.move(
      sourceHandle!.x + sourceHandle!.width / 2,
      sourceHandle!.y + sourceHandle!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetHandle!.x + targetHandle!.width / 2,
      targetHandle!.y + targetHandle!.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '연결 삭제 B A', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '새 단계 추가', exact: true }).click();
    await page.getByLabel('연결 시작 단계').selectOption('B');
    await page.getByLabel('연결 대상 단계').selectOption('Step1');
    await page.getByRole('button', { name: '단계 연결', exact: true }).click();
    await page.getByRole('button', { name: '흐름 원본에 저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '기본 흐름 편집', exact: true })).toBeVisible();
    const saved = await readFile(join(root, 'docs/flows.md'), 'utf8');
    expect(saved).toContain('A["변경한 시작"]');
    expect(saved).toContain('B --> Step1');
    expect(saved).toContain('B --> A');
    expect(saved.slice(saved.indexOf('```mermaid 시퀀스'))).toBe(
      original.slice(original.indexOf('```mermaid 시퀀스')),
    );
    await page.screenshot({ path: 'outputs/project-flows.png', fullPage: true });
    await page.getByRole('button', { name: '기본 흐름 편집', exact: true }).click();
    await page.getByRole('textbox', { name: '단계 이름 A', exact: true }).fill('충돌 초안');
    await writeFile(join(root, 'docs/flows.md'), saved + '\n외부 수정');
    await page.getByRole('button', { name: '흐름 원본에 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('변경');
    await expect(page.getByRole('textbox', { name: '단계 이름 A', exact: true })).toHaveValue(
      '충돌 초안',
    );
    await app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBoxSync = () => 0;
      BrowserWindow.getAllWindows()[0].close();
    });
    await expect(page.getByRole('textbox', { name: '단계 이름 A', exact: true })).toHaveValue(
      '충돌 초안',
    );
    expect(await readFile(join(root, 'docs/flows.md'), 'utf8')).toBe(saved + '\n외부 수정');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '흐름 편집 취소', exact: true }).click();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5 });
  }
});
