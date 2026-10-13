import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

test('navigates original inline/reference anchors, registers linked files and keeps relation origins after refresh', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-links-e2e-'));
  const root = join(data, 'project');
  await mkdir(join(root, 'docs'), { recursive: true });
  const source =
    '# 링크 시작\n[내부 이동](#아래)\n\n## 아래\n[인라인 이동](b.md#기능-1)\n[참조 이동][next]\n[미등록 추가](new.md)\n[없는 링크](missing.md)\n[외부 문서](https://example.com/guide)\n[위험 링크](javascript:alert%281%29)\n\n[next]: b.md#기능';
  await writeFile(join(root, 'docs/a.md'), source);
  await writeFile(join(root, 'docs/b.md'), '# 링크 대상\n## 기능\n처음\n## 기능\n두 번째');
  const store = await ProjectStore.open(root);
  const [a, b] = store.linkDocuments(store.discoverDocuments().files);
  const manual = store.addRelation(a.id, b.id, '직접 보존');
  store.close();
  await writeFile(join(root, 'docs/new.md'), '# 추가한 링크 문서');
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
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
    const body = () => page.locator('.document-surface .prose');
    await expect(body().getByRole('button', { name: '내부 이동', exact: true })).toBeVisible({
      timeout: 3000,
    });
    await body().getByRole('button', { name: '내부 이동', exact: true }).click();
    await expect(page.locator('.section-active')).toHaveText('아래');
    await body().getByRole('button', { name: '인라인 이동', exact: true }).click();
    await expect(body().getByRole('heading', { name: '링크 대상', exact: true })).toBeVisible();
    const targetSection = (await page.evaluate(() => window.workspace.current()))!.documents.find(
      (doc) => doc.id === b.id,
    )!.sections[2].id;
    await expect(page.locator(`[id="${targetSection}"]`)).toBeInViewport();
    await page.locator('.document-nav-item').filter({ hasText: '링크 시작' }).click();
    await body().getByRole('button', { name: '참조 이동', exact: true }).click();
    await expect(body().getByRole('heading', { name: '링크 대상', exact: true })).toBeVisible();
    await page.locator('.document-nav-item').filter({ hasText: '링크 시작' }).click();
    await body().getByRole('button', { name: '미등록 추가', exact: true }).click();
    const registration = page.getByRole('dialog', { name: '프로젝트 원본 문서 등록' });
    await registration.getByRole('checkbox', { name: 'docs/new.md', exact: true }).check();
    await registration.getByRole('button', { name: '1개 원본 문서 등록', exact: true }).click();
    await body().getByRole('button', { name: '미등록 추가', exact: true }).click();
    await expect(
      body().getByRole('heading', { name: '추가한 링크 문서', exact: true }),
    ).toBeVisible();
    await page.locator('.document-nav-item').filter({ hasText: '링크 시작' }).click();
    await body().getByRole('button', { name: '없는 링크', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('대상 파일이 없습니다');
    await body().getByRole('button', { name: '위험 링크', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('허용되지 않은');
    await app.evaluate(({ shell }) => {
      (globalThis as any).openedLinks = [];
      shell.openExternal = async (url: string) => {
        (globalThis as any).openedLinks.push(url);
      };
    });
    await body().getByRole('button', { name: '외부 문서', exact: true }).click();
    const external = page.getByRole('dialog', { name: '외부 URL 열기' });
    expect(await app.evaluate(() => (globalThis as any).openedLinks)).toEqual([]);
    await external.getByRole('button', { name: '외부 URL 취소', exact: true }).click();
    await body().getByRole('button', { name: '외부 문서', exact: true }).click();
    await external.getByRole('button', { name: '브라우저에서 열기', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as any).openedLinks)).toEqual([
      'https://example.com/guide',
    ]);
    const rejected = await page.evaluate(async () => {
      const ws = (await window.workspace.current())!;
      const link = ws.documentLinks.find((link) => link.status === 'blocked')!;
      return Promise.all([
        window.workspace
          .openExternalDocumentLink(link.documentId, link.id, link.revision, ws.root)
          .then(
            () => false,
            () => true,
          ),
        window.workspace
          .resolveDocumentLink(link.documentId, link.id, link.revision, 'wrong-root')
          .then(
            () => false,
            () => true,
          ),
      ]);
    });
    expect(rejected).toEqual([true, true]);
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    const parsed = page.locator('.relation-row[data-origin="markdown"]');
    await expect(parsed).toHaveCount(3);
    await expect(parsed.getByRole('button', { name: '연결 해제', exact: true })).toHaveCount(0);
    await expect(page.locator(`[data-relation-id="${manual.id}"]`)).toContainText('직접 연결');
    await page.screenshot({ path: 'outputs/markdown-link-relations.png', fullPage: true });
    await writeFile(join(root, 'docs/a.md'), '# 링크 시작\n원문 링크 제거');
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await page.getByRole('button', { name: '링크 새로고침', exact: true }).click();
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    await expect(parsed).toHaveCount(0);
    expect(
      (await page.evaluate(() => window.workspace.current()))!.relations.map(
        (relation) => relation.id,
      ),
    ).toEqual([manual.id]);
    await close();
    app = await launch();
    page = await app.firstWindow();
    expect(
      (await page.evaluate(() => window.workspace.current()))!.relations.map(
        (relation) => relation.id,
      ),
    ).toEqual([manual.id]);
    expect(await readFile(join(root, 'docs/new.md'), 'utf8')).toBe('# 추가한 링크 문서');
  } finally {
    await close();
    await rm(data, { recursive: true, force: true });
  }
});
