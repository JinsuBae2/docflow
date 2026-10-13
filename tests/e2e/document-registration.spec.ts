import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

test('discovers originals on folder open, supports selection and manual registration, and preserves drafts after restart', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-registration-e2e-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  const existing = await store.createDocument('기존 문서', 'note');
  store.close();
  await mkdir(join(root, 'docs'));
  await mkdir(join(root, 'manual'));
  await writeFile(join(root, 'docs/a.md'), '# 원본 A\r\n내용\r\n');
  await writeFile(join(root, 'docs/b.md'), '# 원본 B');
  await writeFile(join(root, 'docs/image.png'), 'image');
  await writeFile(join(root, 'manual/c.md'), '# 직접 선택');
  await writeFile(join(root, 'README.md'), '# 파일 선택');
  await writeFile(join(data, 'settings.json'), JSON.stringify({ onboardingDone: true }));
  const launch = () =>
    electron.launch({
      args: [resolve('out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DOCFLOW_DATA_DIR: data,
        DOCFLOW_TEST_NODE: process.execPath,
        DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs'),
      },
    });
  let app = await launch();
  const close = async () => {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  };
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }, root) => {
      (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
    }, root);
    await page.getByRole('button', { name: '폴더 열기', exact: true }).click();
    const registration = () => page.getByRole('dialog', { name: '프로젝트 원본 문서 등록' });
    await expect(registration()).toBeVisible({ timeout: 3000 });
    await expect(registration().getByText('docs/a.md', { exact: true })).toBeInViewport();
    await page.screenshot({ path: 'outputs/document-registration.png', fullPage: true });
    await expect(
      registration().getByRole('checkbox', { name: 'docs/image.png', exact: true }),
    ).toBeDisabled();
    await registration().getByRole('button', { name: '문서 등록 취소', exact: true }).click();
    expect(
      await page.evaluate(() =>
        window.workspace.current().then((workspace) => workspace?.documents.length),
      ),
    ).toBe(1);
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    await page.getByRole('textbox', { name: 'Markdown 본문' }).fill('# 기존 문서 초안');
    await page.getByRole('button', { name: '프로젝트 원본 문서 추가', exact: true }).click();
    await registration().getByRole('checkbox', { name: 'docs/a.md', exact: true }).check();
    await registration().getByRole('button', { name: '1개 원본 문서 등록', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(
      '# 기존 문서 초안',
    );
    expect(await readFile(join(root, 'docs/a.md'), 'utf8')).toBe('# 원본 A\r\n내용\r\n');
    await page.getByRole('button', { name: '프로젝트 원본 문서 추가', exact: true }).click();
    await expect(
      registration().getByRole('checkbox', { name: 'docs/a.md', exact: true }),
    ).toBeDisabled();
    await app.evaluate(({ dialog }, root) => {
      (dialog as any).showOpenDialog = async (
        _window: unknown,
        options: { properties: string[] },
      ) => ({
        canceled: false,
        filePaths: [root + (options.properties.includes('openFile') ? '/README.md' : '/manual')],
      });
    }, root);
    await registration().getByRole('button', { name: '폴더 직접 선택', exact: true }).click();
    await expect(
      registration().getByRole('checkbox', { name: 'manual/c.md', exact: true }),
    ).toBeVisible();
    await registration().getByRole('button', { name: '전체 선택 / 해제', exact: true }).click();
    await registration().getByRole('button', { name: '1개 원본 문서 등록', exact: true }).click();
    await page.getByRole('button', { name: '프로젝트 원본 문서 추가', exact: true }).click();
    await registration().getByRole('button', { name: '파일 직접 선택', exact: true }).click();
    await registration().getByRole('checkbox', { name: 'README.md', exact: true }).check();
    await registration().getByRole('button', { name: '1개 원본 문서 등록', exact: true }).click();
    const result = await page.evaluate(async () => {
      const api = window.workspace;
      const preview = await api.previewProjectDocuments();
      await api.cancelDocumentRegistration(preview.id);
      const cancelled = await api.confirmDocumentRegistration(preview.id, ['docs/b.md']).then(
        () => false,
        () => true,
      );
      const current = await api.current();
      return {
        cancelled,
        count: current?.documents.length,
        ids: current?.documents.map((doc) => doc.id),
      };
    });
    expect(result.cancelled).toBe(true);
    expect(result.count).toBe(4);
    expect(result.ids).toContain(existing.id);
    await close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(
      '# 기존 문서 초안',
    );
    const loaded = await page.evaluate(() => window.workspace.current());
    expect(loaded?.documents.map((doc) => doc.id)).toEqual(result.ids);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '변경 취소', exact: true }).click();
    await page.locator('.document-nav-item').filter({ hasText: '원본 A' }).click();
    await expect(page.getByText('원본 연결 · 저장 대상: docs/a.md', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    await page.getByRole('textbox', { name: 'Markdown 본문' }).fill('# 원본 A\n명시적 수정');
    await page.getByRole('button', { name: '원본에 저장', exact: true }).click();
    expect(await readFile(join(root, 'docs/a.md'), 'utf8')).toBe('# 원본 A\n명시적 수정');
  } finally {
    await close();
    await rm(data, { recursive: true, force: true });
  }
});

test('opens a dropped project folder and expires registration when the active project changes', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-folder-drop-'));
  const root = join(data, 'dropped-project');
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs/flow.md'), '# 드롭한 프로젝트');
  await writeFile(join(data, 'settings.json'), JSON.stringify({ onboardingDone: true }));
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
    await expect(page.getByRole('button', { name: '폴더 열기', exact: true })).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
      await cdp.send('Input.dispatchDragEvent', {
        type,
        x: 400,
        y: 300,
        data: { items: [], files: [root], dragOperationsMask: 1 },
      });
    }
    const dialog = page.getByRole('dialog', { name: '프로젝트 원본 문서 등록' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'docs/flow.md', exact: true }).check();
    await dialog.getByRole('button', { name: '1개 원본 문서 등록', exact: true }).click();
    await expect(page.getByRole('heading', { name: '드롭한 프로젝트', exact: true })).toBeVisible();
    const result = await page.evaluate(async () => {
      const api = window.workspace;
      const preview = await api.previewProjectDocuments();
      await api.openExample();
      return api.confirmDocumentRegistration(preview.id, ['docs/flow.md']).then(
        () => false,
        () => true,
      );
    });
    expect(result).toBe(true);
    expect(await readFile(join(root, 'docs/flow.md'), 'utf8')).toBe('# 드롭한 프로젝트');
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
