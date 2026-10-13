import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
test('shows measured tokens, account windows and unavailable reasons without generating on refresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-usage-e2e-')); const store = await ProjectStore.open(join(root, 'project'));
  await store.createDocument('사용량 예제', 'note', '# 사용량 예제'); store.put('message', { id: 'past', requestId: 'past', role: 'user', text: '과거 요청', createdAt: '2026-10-12T00:00:00Z' });
  const projectRoot = store.root; store.close(); await writeFile(join(root, 'settings.json'), JSON.stringify({ root: projectRoot, onboardingDone: true }));
  const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, ANTHROPIC_API_KEY: '', NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'AI 사용량', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('사용량 검증'); await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(page.getByText('실패 시 원본 보존', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'AI 사용량', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI 사용량', exact: true }); const table = dialog.getByRole('table', { name: '요청별 사용량' });
    await expect(table.getByRole('cell', { name: '150', exact: true })).toHaveCount(1);
    await expect(table.getByRole('cell', { name: '100', exact: true })).toHaveCount(1); await expect(table.getByRole('cell', { name: '40', exact: true })).toHaveCount(1);
    await expect(dialog.getByText('75%', { exact: true })).toBeVisible(); await expect(dialog.getByText('60%', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/과거 요청에는 사용량 기록이 없습니다/)).toBeVisible();
    await page.mouse.move(1100, 70); await page.screenshot({ path: 'outputs/ai-usage.png', fullPage: true });
    const reasons = [['network', '연결 실패'], ['missing', '한도 정보를 반환하지'], ['invalid', '올바르지 않은'], ['old-server', 'CLI가 한도 조회를 지원하지'], ['no-account', '로그인이 필요'], ['api-account', '현재 로그인 방식']];
    for (const [mode, text] of reasons) {
      await app.evaluate((_electron, mode) => { delete process.env.DOCFLOW_TEST_LIMITS_ERROR; delete process.env.DOCFLOW_TEST_ACCOUNT_MODE; if (['network', 'missing', 'invalid'].includes(mode)) process.env.DOCFLOW_TEST_LIMITS_ERROR = mode; else process.env.DOCFLOW_TEST_ACCOUNT_MODE = mode; }, mode);
      await dialog.getByRole('button', { name: '사용량 새로고침', exact: true }).click(); await expect(dialog.getByText(new RegExp(text))).toBeVisible();
      if (mode === 'network') { await expect(dialog.getByText('75%', { exact: true })).toBeVisible(); await expect(dialog.getByText(/마지막 확인/)).toBeVisible(); }
    }
    await dialog.getByLabel('한도 제공자').selectOption('claude'); await expect(dialog.getByText(/API 키를 연결/)).toBeVisible(); await expect(dialog.getByText('75%', { exact: true })).toHaveCount(0);
    await app.evaluate(() => {
      process.env.ANTHROPIC_API_KEY = 'fixture-only'; delete process.env.DOCFLOW_TEST_LIMITS_ERROR; delete process.env.DOCFLOW_TEST_ACCOUNT_MODE;
      globalThis.fetch = (async (url: string | URL | Request) => {
        if (String(url).includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'test-claude', display_name: 'Test Claude' }], has_more: false }));
        return new Response(JSON.stringify({ model: 'test-claude', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 }, content: [{ type: 'text', text: JSON.stringify({ message: 'Claude 사용량 응답 확인', proposals: [] }) }] }), { headers: { 'anthropic-ratelimit-tokens-limit': '40000', 'anthropic-ratelimit-tokens-remaining': '35000', 'anthropic-ratelimit-requests-limit': '50', 'anthropic-ratelimit-requests-remaining': '47' } });
      }) as typeof fetch;
    });
    await dialog.getByRole('button', { name: '사용량 새로고침', exact: true }).click(); await expect(dialog.getByText(/계정 잔액이나 실시간 한도/)).toBeVisible();
    await dialog.getByRole('button', { name: '사용량 닫기', exact: true }).click();
    await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click(); const guide = page.getByRole('dialog'); await guide.getByLabel('AI 제공자').selectOption('claude');
    await expect(guide.getByLabel('AI 모델').getByRole('option', { name: 'Test Claude' })).toHaveCount(1); await guide.getByLabel('AI 모델').selectOption('test-claude'); await guide.getByRole('button', { name: '설정 저장', exact: true }).click();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('Claude 사용량 검증'); await page.getByRole('button', { name: '요청 보내기', exact: true }).click(); await expect(page.getByText('Claude 사용량 응답 확인', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'AI 사용량', exact: true }).click(); await expect(dialog.getByText(/최근 API 응답 기준의 단기/)).toBeVisible(); await expect(dialog.getByText('35,000', { exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: '37', exact: true })).toHaveCount(1);
    const count = (await page.evaluate(() => window.workspace.current()))!.messages.length;
    await dialog.getByRole('button', { name: '사용량 새로고침', exact: true }).click(); expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(count);
    await page.mouse.move(1100, 70); await page.screenshot({ path: 'outputs/ai-usage-claude.png', fullPage: true });
  } finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())); await app.close(); await rm(root, { recursive: true, force: true }); }
});
