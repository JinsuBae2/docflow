import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

test('switches project sections and restores unsaved Markdown and chat input after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-projects-e2e-'));
  const entries = [];
  for (const name of ['Alpha', 'Beta']) {
    const store = await ProjectStore.open(join(root, name));
    store.updateProject(name, '', '');
    await store.createDocument(name + ' 문서', 'note', '# ' + name);
    entries.push({ id: name, name, root: store.root, lastOpenedAt: new Date().toISOString() });
    store.close();
  }
  await writeFile(
    join(root, 'settings.json'),
    JSON.stringify({ root: entries[0].root, projects: entries, onboardingDone: true }),
  );
  const launch = () =>
    electron.launch({
      args: [resolve('out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DOCFLOW_DATA_DIR: root,
        DOCFLOW_TEST_NODE: process.execPath,
        DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs'),
        DOCFLOW_TEST_DELAY_MS: '1000',
      },
    });
  let app = await launch();
  const close = async () => {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  };
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '프로젝트 전환: Beta', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '프로젝트 펼치기: Beta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '프로젝트 전환: Beta', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Beta', exact: true })).toBeVisible();
    await page.evaluate(() => window.workspace.createDocument('Beta 새 문서', 'note'));
    await page.getByRole('button', { name: '프로젝트 전환: Alpha', exact: true }).click();
    await expect(
      page
        .locator('.inactive-project-docs')
        .getByRole('button', { name: 'Beta 새 문서', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Markdown 본문' })
      .fill('# Alpha 초안\n저장하지 않은 작업');
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('Alpha 대화 입력');
    await page.getByRole('button', { name: 'Beta', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Beta', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'AI에게 요청' })).toHaveValue('');
    await page.getByRole('button', { name: '프로젝트 전환: Alpha', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(/Alpha 초안/);
    await expect(page.getByRole('textbox', { name: 'AI에게 요청' })).toHaveValue('Alpha 대화 입력');
    await expect(
      page.getByRole('button', { name: '프로젝트 접기: Alpha', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '프로젝트 접기: Alpha', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '프로젝트 펼치기: Alpha', exact: true }),
    ).toBeVisible();
    await page.mouse.move(1100, 70);
    await page.screenshot({ path: 'outputs/project-sections.png', fullPage: true });
    await close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(
      /저장하지 않은 작업/,
    );
    await expect(page.getByRole('textbox', { name: 'AI에게 요청' })).toHaveValue('Alpha 대화 입력');
    await expect(
      page.getByRole('button', { name: '프로젝트 펼치기: Alpha', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();
    const ws = await page.evaluate(() => window.workspace.current());
    const doc = ws!.documents[0];
    await writeFile(join(ws!.root, doc.relativePath), doc.markdown + '\n외부 변경');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /변경/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(
      /저장하지 않은 작업/,
    );
    const error = await page.evaluate(async () => {
      try {
        await window.workspace.saveSession(
          { selectedId: '', view: 'document', prompt: 'wrong owner', collapsed: false },
          '/other-project',
        );
        return '';
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toContain('프로젝트가 바뀌어');
    await page.getByRole('button', { name: '프로젝트 전환: Beta', exact: true }).click();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('요청 중 프로젝트 전환 방지');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '프로젝트 전환: Alpha', exact: true }),
    ).toBeDisabled();
    const blocked = await page.evaluate(async () => {
      try {
        await window.workspace.activateProject('Alpha');
        return '';
      } catch (e) {
        return String(e);
      }
    });
    expect(blocked).toContain('AI 요청');
    await page.getByRole('button', { name: '요청 취소', exact: true }).click();
  } finally {
    await close();
    await rm(root, { recursive: true, force: true });
  }
});
