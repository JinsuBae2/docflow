import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
import { ProposalService } from '../../src/main/project/proposals';
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'docflow-rejection-e2e-')); const store = await ProjectStore.open(join(root, 'project'));
  const doc = await store.createDocument('거절 검토 예제', 'note', '# 거절 검토 예제');
  const snapshot = await buildContext({ instruction: '제안', selectedIds: [doc.id], excludedIds: [] }, store);
  await new ProposalService(store).register(snapshot.id, { message: '제안', proposals: ['첫 제안', '둘째 제안'].map(title => ({ kind: 'create', title, documentType: 'note', targetId: null, baseRevision: null, replacement: '# 새 문서', sourceIds: [doc.id], reason: '검토 근거', dependencyIds: [] })) });
  const projectRoot = store.root; store.close(); await writeFile(join(root, 'settings.json'), JSON.stringify({ root: projectRoot, onboardingDone: true }));
  const launch = () => electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: root, DOCFLOW_TEST_NODE: process.execPath, DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs') } });
  return { root, launch };
}
async function close(app: ElectronApplication) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())); await app.close(); }
test('opens rejection input, cancels without changes, sends an empty reason without AI, then continues in chat', async () => {
  const f = await setup(); const app = await f.launch();
  try {
    const page = await app.firstWindow(); await page.getByRole('button', { name: '제안', exact: true }).click();
    const before = await page.evaluate(() => window.workspace.current());
    await page.getByRole('button', { name: '제안 거절' }).first().click();
    await expect(page.getByRole('textbox', { name: '거절 이유', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.proposals).toEqual(before!.proposals);
    await page.getByRole('button', { name: '거절 취소', exact: true }).click();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toEqual(before!.messages);
    await page.getByRole('button', { name: '제안 거절' }).first().click(); await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByText('거절됨', { exact: true })).toHaveCount(1);
    const empty = (await page.evaluate(() => window.workspace.current()))!; expect(empty.messages).toHaveLength(0); expect(empty.feedbacks?.[0].requestId).toBeUndefined();
    await page.getByRole('button', { name: '제안 거절' }).click(); await page.getByRole('textbox', { name: '거절 이유' }).fill('범위를 줄여 주세요');
    await page.screenshot({ path: 'outputs/rejection-input.png', fullPage: true });
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByText('거절 이유를 검토했습니다.', { exact: true })).toBeVisible();
    const after = (await page.evaluate(() => window.workspace.current()))!;
    expect(after.documents).toEqual(before!.documents); expect(after.messages.filter(m => m.role === 'user')).toHaveLength(1);
    expect(after.proposals.filter(p => p.status === 'rejected')).toHaveLength(2); expect(after.proposals.filter(p => p.status === 'pending')).toHaveLength(1);
    await page.screenshot({ path: 'outputs/rejection-chat.png', fullPage: true });
  } finally { await close(app); await rm(f.root, { recursive: true, force: true }); }
});
test('preserves failed feedback after restart, retries once and blocks duplicate, oversized and cross-project requests', async () => {
  const f = await setup(); let app = await f.launch();
  try {
    let page = await app.firstWindow();
    const input = { instruction: '후속 검토', selectedIds: [] as string[], excludedIds: [] as string[] };
    expect(await page.evaluate(async input => {
      const ws = (await window.workspace.current())!;
      const attempts = await Promise.allSettled([
        window.workspace.sendRejection(ws.proposals[0].id, '이유', 'wrong-root', input, '/not-this-project'),
        window.workspace.sendRejection(ws.proposals[0].id, 'x'.repeat(3001), 'long-reason', input, ws.root)
      ]);
      return { rejected: attempts.every(r => r.status === 'rejected'), statuses: (await window.workspace.current())!.proposals.map(p => p.status) };
    }, input)).toEqual({ rejected: true, statuses: ['pending', 'pending'] });
    await app.evaluate(() => { process.env.DOCFLOW_TEST_FEEDBACK_FAILURE = '1'; process.env.DOCFLOW_TEST_DELAY_MS = '500'; });
    const blocked = await page.evaluate(async input => {
      const ws = (await window.workspace.current())!; input.selectedIds = [ws.documents[0].id];
      await window.workspace.sendRejection(ws.proposals[0].id, '다시 판단해 주세요', 'retry-feedback', input, ws.root);
      const attempts = await Promise.allSettled([window.workspace.sendRejection(ws.proposals[0].id, '다시 판단해 주세요', 'retry-feedback', input, ws.root), window.workspace.startRequest(input)]);
      return attempts.every(r => r.status === 'rejected');
    }, input); expect(blocked).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => window.workspace.current()))!.feedbacks?.[0].status).toBe('failed');
    await close(app); app = await f.launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: '제안', exact: true }).click();
    await page.getByRole('button', { name: '첫 제안', exact: true }).click();
    await expect(page.getByText('다시 판단해 주세요', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '후속 답변 다시 요청', exact: true }).click();
    await expect(page.getByText('거절 이유를 검토했습니다.', { exact: true })).toBeVisible();
    const ws = (await page.evaluate(() => window.workspace.current()))!;
    expect(ws.messages.filter(m => m.role === 'user')).toHaveLength(1); expect(ws.messages.filter(m => m.role === 'assistant')).toHaveLength(1);
    expect(ws.feedbacks?.[0].status).toBe('completed'); expect(ws.proposals[0].status).toBe('rejected');
    await page.evaluate(async input => { const ws = (await window.workspace.current())!; await window.workspace.sendRejection(ws.proposals[0].id, '다시 판단해 주세요', 'retry-feedback', input, ws.root); }, input);
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(2);
  } finally { await close(app); await rm(f.root, { recursive: true, force: true }); }
});
