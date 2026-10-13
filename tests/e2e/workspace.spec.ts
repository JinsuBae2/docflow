import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
async function closeTestApp(app: ElectronApplication) {
  // Failed draft-preservation assertions must not hang on native unload confirmation.
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close();
}
test('opens documents, reviews proposals, persists decisions and displays a relationship map', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-e2e-'));
  const launch = () => electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '안내 닫기' }).click();
    await expect(page.getByRole('button', { name: '예제 프로젝트 열기' })).toBeVisible();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('누락된 예외 처리를 제안해줘');
    await page.getByRole('button', { name: '요청 보내기' }).click();
    await expect(page.getByText('실패 시 원본 보존', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '제안 수락' }).first().click();
    await page.getByRole('button', { name: '제안 거절' }).first().click();
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByText('수락됨', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('거절됨', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '새 문서', exact: true }).click();
    await page.getByLabel('문서 이름', { exact: true }).fill('개인 메모');
    await page.getByRole('button', { name: '문서 만들기' }).click();
    await expect(page.getByRole('heading', { name: '개인 메모', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown 본문' });
    await editor.fill((await editor.inputValue()) + '\n## 다음 할 일\n맥락 확인\n<script>window.pwned = true</script>');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(/맥락 확인/);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('heading', { name: '다음 할 일', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
    await page.screenshot({ path: 'outputs/authoring.png', fullPage: true });
    await page.getByRole('button', { name: '다이어그램', exact: true }).click();
    await expect(page.locator('.diagram-canvas svg')).toBeVisible();
    const fitWidth = await page.locator('.diagram-canvas svg').evaluate(el => el.getBoundingClientRect().width);
    await page.getByRole('button', { name: '확대', exact: true }).click();
    expect(await page.locator('.diagram-canvas svg').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(fitWidth);
    await page.getByRole('button', { name: '배율 초기화' }).click();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'outputs/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: 'outputs/compact.png', fullPage: true });
    await page.setViewportSize({ width: 800, height: 600 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '다이어그램', exact: true })).toBeInViewport();
    await page.screenshot({ path: 'outputs/compact-800.png', fullPage: true });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: '제안', exact: true }).click();
    await expect(page.getByText('수락됨', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('거절됨', { exact: true }).first()).toBeVisible();
  } finally { await closeTestApp(app); await rm(root, { recursive: true, force: true }); }
});

test('native imports require a project, support multi-selection and reject reused or concurrent confirmations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-native-e2e-'));
  const files = [join(root, 'first.md'), join(root, 'second.markdown')];
  await writeFile(files[0], '# 첫 파일'); await writeFile(files[1], '# 두번째 파일');
  const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '안내 닫기' }).click();
    expect(await page.evaluate(() => 'importDocument' in window.workspace)).toBe(false);
    await app.evaluate(({ dialog }, { root, files }) => {
      (dialog as any).showOpenDialog = async (_window: unknown, options: { properties: string[] }) => {
        if (options.properties.includes('openDirectory')) return { canceled: false, filePaths: [root + '/project'] };
        if (!options.properties.includes('multiSelections')) throw new Error('Expected multiSelections');
        return { canceled: false, filePaths: files };
      };
    }, { root, files });
    await page.getByRole('button', { name: 'Markdown 파일로 시작' }).click();
    const preview = page.getByRole('dialog', { name: 'Markdown 가져오기 미리보기' });
    await expect(preview.getByText('first.md')).toBeVisible();
    await expect(preview.getByText('second.markdown')).toBeVisible();
    await preview.getByRole('button', { name: '가져오기 취소', exact: true }).last().click();
    const result = await page.evaluate(async () => {
      const api = window.workspace;
      const stage = await api.previewDroppedDocuments([{ name: 'a.md', text: '# A' }, { name: 'b.md', text: '# B' }]);
      const attempts = await Promise.allSettled([api.confirmImport(stage.id), api.confirmImport(stage.id)]);
      let expired = false; try { await api.confirmImport(stage.id); } catch { expired = true; }
      let invalid = false; try { await api.previewDroppedDocuments([{ name: 'x.exe', text: '# invalid' }]); } catch { invalid = true; }
      const cancelled = await api.previewDroppedDocuments([{ name: 'c.md', text: '# C' }]); await api.cancelImport();
      let cancelledRejected = false; try { await api.confirmImport(cancelled.id); } catch { cancelledRejected = true; }
      return { successful: attempts.filter(a => a.status === 'fulfilled').length, titles: (await api.current())!.documents.map(d => d.title), expired, invalid, cancelledRejected };
    });
    expect(result).toEqual({ successful: 1, titles: ['A', 'B'], expired: true, invalid: true, cancelledRejected: true });
    expect(await page.evaluate(async () => {
      const doc = (await window.workspace.current())!.documents[0];
      const text = doc.markdown + '\n' + 'x'.repeat(160000);
      const saved = await window.workspace.saveDocument(doc.id, text, doc.revision);
      return saved.documents[0].markdown.includes('x'.repeat(160000));
    })).toBe(true);
  } finally { await closeTestApp(app); await rm(root, { recursive: true, force: true }); }
});

test('onboards, previews local imports without losing drafts, saves the CLI model and exposes accessible help', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-import-e2e-'));
  const launch = () => electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const guide = page.getByRole('dialog', { name: 'Codex 연결 설정' });
    await expect(guide).toBeVisible();
    await expect(guide.getByText('codex login', { exact: true })).toBeVisible();
    await guide.getByRole('button', { name: '연결 다시 확인' }).click();
    await expect(guide.getByRole('status')).toContainText('테스트 연결');
    const model = guide.getByLabel('AI 모델');
    await expect(model.locator('option')).toHaveCount(3);
    await expect(guide.getByRole('button', { name: '설정 저장' })).toBeEnabled();
    await page.screenshot({ path: 'outputs/connection-setup.png', fullPage: true });
    await model.selectOption('test-fast');
    await guide.getByRole('button', { name: '설정 저장' }).click();
    await expect(guide).toBeHidden();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown 본문' });
    const draft = (await editor.inputValue()) + '\n미저장 초안 보존';
    await editor.fill(draft);
    const drop = () => page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['# 가져온 기획\n## 요구사항\n로컬 내용'], 'plan.md', { type: 'text/markdown' }));
      transfer.items.add(new File(['# 가져온 흐름\n```mermaid\nflowchart LR\n A-->B\n```'], 'flow.markdown', { type: 'text/markdown' }));
      document.querySelector('.app-shell')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await drop();
    const preview = page.getByRole('dialog', { name: 'Markdown 가져오기 미리보기' });
    await expect(preview.getByText('plan.md', { exact: true })).toBeVisible();
    await expect(preview.getByText('flow.markdown', { exact: true })).toBeVisible();
    await expect(preview.getByText('다이어그램 1개', { exact: false })).toBeVisible();
    await page.screenshot({ path: 'outputs/import-preview.png', fullPage: true });
    await preview.getByRole('button', { name: '가져오기 취소' }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByRole('button', { name: 'Markdown 가져오기', exact: true })).toBeEnabled();
    expect((await page.evaluate(() => window.workspace.current()))!.documents).toHaveLength(3);
    await expect(editor).toHaveValue(draft);
    await drop();
    await preview.getByRole('button', { name: '2개 문서 가져오기' }).click();
    await expect(preview).toBeHidden();
    await expect(editor).toHaveValue(draft);
    expect((await page.evaluate(() => window.workspace.current()))!.documents).toHaveLength(5);
    const help = page.getByRole('button', { name: 'AI 연결 설정', exact: true });
    await expect(help).toBeEnabled();
    await page.evaluate(() => {
      const events: unknown[] = []; (window as any).tooltipEvents = events;
      const label = (node: EventTarget | null) => node instanceof Element ? node.tagName + ':' + (node.getAttribute('aria-label') || node.className) : String(node);
      for (const name of ['mouseover', 'mouseout', 'focusin', 'focusout', 'scroll', 'pointerdown']) document.addEventListener(name, event => {
        events.push({ type: event.type, target: label(event.target), related: label((event as MouseEvent).relatedTarget), active: label(document.activeElement), tooltip: !!document.querySelector('[role=tooltip]') });
        if (events.length > 100) events.shift();
      }, true);
    });
    await page.mouse.move(0, 0);
    await help.hover();
    try { await expect(page.getByRole('tooltip')).toContainText('모델'); }
    catch (error) {
      await test.info().attach('tooltip-events', { body: JSON.stringify(await page.evaluate(() => (window as any).tooltipEvents)), contentType: 'application/json' });
      await test.info().attach('tooltip-screen', { body: await page.screenshot(), contentType: 'image/png' });
      throw error;
    }
    await page.evaluate(() => document.querySelector('.document-scroll')!.dispatchEvent(new Event('scroll')));
    await expect(page.getByRole('tooltip')).toContainText('모델');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await help.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(await help.getAttribute('aria-describedby')).toBeTruthy();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editor).toBeHidden();
    await page.screenshot({ path: 'outputs/improved-document.png', fullPage: true });
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(5);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'outputs/improved-graph.png', fullPage: true });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
    await expect(page.getByLabel('AI 모델')).toHaveValue('test-fast');
    await expect(page.getByRole('heading', { name: '문서 관계 지도', exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(5);
    await page.getByRole('button', { name: '안내 닫기', exact: true }).click();
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
  } finally { await closeTestApp(app); await rm(root, { recursive: true, force: true }); }
});

test('selects Claude, preserves provider models and routes validated proposals without exposing credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-claude-e2e-'));
  const launch = async () => {
    const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, ANTHROPIC_API_KEY: '', NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
    await app.evaluate(() => {
      process.env.ANTHROPIC_API_KEY = 'fixture-not-a-real-key';
      globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
        const target = String(url);
        if (!target.startsWith('https://api.anthropic.com/v1/')) throw new Error('Unexpected endpoint');
        if (target.includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'test-claude', display_name: 'Test Claude' }], has_more: false }));
        const body = JSON.parse(String(options?.body)); if (body.tools || body.model !== 'test-claude') throw new Error('Invalid Claude request');
        return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ message: 'Claude 제안 검토', proposals: [{ kind: 'decision', title: 'Claude 테스트 결정', documentType: 'note', targetId: null, baseRevision: null, replacement: '검토 후 결정한다.', sourceIds: [], reason: '테스트 근거', dependencyIds: [] }] }) }] }));
      }) as typeof fetch;
    });
    return app;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const guide = page.getByRole('dialog');
    await expect(guide.getByRole('button', { name: '설정 저장' })).toBeEnabled();
    await guide.getByLabel('AI 모델').selectOption('test-fast');
    await guide.getByLabel('AI 제공자').selectOption('claude');
    await expect(page.getByRole('dialog', { name: 'Claude 연결 설정' })).toBeVisible();
    await expect(guide.getByRole('status')).toContainText('Anthropic API 연결됨');
    await expect(guide.getByLabel('Claude API 키')).toHaveValue('');
    await guide.getByLabel('AI 모델').selectOption('test-claude');
    await guide.getByRole('button', { name: '설정 저장' }).click();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    const before = await page.evaluate(() => window.workspace.current());
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('의사결정 제안');
    await page.getByRole('button', { name: '요청 보내기' }).click();
    await expect(page.getByText('Claude 테스트 결정', { exact: true })).toBeVisible();
    const pending = await page.evaluate(() => window.workspace.current());
    expect(pending!.documents).toEqual(before!.documents); expect(pending!.decisions).toEqual(before!.decisions);
    await page.getByRole('button', { name: '제안 수락' }).click();
    expect((await page.evaluate(() => window.workspace.current()))!.decisions).toHaveLength(before!.decisions.length + 1);
    expect(JSON.stringify(await page.evaluate(() => window.workspace.preferences()))).not.toContain('fixture-not-a-real-key');
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
    await expect(page.getByLabel('AI 제공자')).toHaveValue('claude');
    await expect(page.getByLabel('AI 모델')).toHaveValue('test-claude');
    await expect(page.getByRole('button', { name: '설정 저장' })).toBeEnabled();
    await page.getByLabel('AI 제공자').selectOption('codex');
    await expect(page.getByLabel('AI 모델')).toHaveValue('');
    await page.getByLabel('AI 모델').selectOption('test-fast');
    await page.getByRole('button', { name: '설정 저장' }).click();
    expect((await page.evaluate(() => window.workspace.preferences())).models.claude).toBe('test-claude');
    await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
    await page.getByLabel('AI 제공자').selectOption('claude');
    await expect(page.getByLabel('AI 모델')).toHaveValue('test-claude');
    await page.screenshot({ path: 'outputs/claude-connection.png', fullPage: true });
  } finally { await closeTestApp(app); await rm(root, { recursive: true, force: true }); }
});
