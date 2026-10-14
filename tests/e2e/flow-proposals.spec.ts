import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('reviews generated and modified flow diffs, accepts atomically and rejects without changing the source', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-flow-ai-'));
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
    await page.getByRole('button', { name: '다이어그램', exact: true }).click();
    await page.getByRole('tab', { name: '유저플로우', exact: true }).click();
    await page.getByRole('button', { name: 'AI로 플로우 생성', exact: true }).click();
    await expect(page.getByText(/예상 입력/)).toBeVisible();
    await page.getByRole('button', { name: '검토한 맥락으로 플로우 요청' }).click();
    await page.getByRole('button', { name: '캔버스 Diff 검토', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '유저플로우 Diff 검토' });
    await expect(dialog.locator('.user-flow-card[data-diff="added"]')).toHaveCount(3);
    await expect(dialog.locator('.react-flow__edge.flow-edge-added')).toHaveCount(2);
    expect((await page.evaluate(() => window.workspace.current()))!.userFlows).toHaveLength(0);
    await dialog.getByRole('button', { name: '플로우 수락', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const workspace = (await page.evaluate(() => window.workspace.current()))!;
    const saved = workspace.userFlows![0];
    expect(saved.nodes.every((node) => !!node.position)).toBe(true);
    const path = join(workspace.root, `.workspace/flows/${saved.id}.json`);
    const original = await readFile(path, 'utf8');
    await page.getByRole('button', { name: 'AI로 흐름 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '플로우 요청 내용' }).fill('완료 상태 저장을 추가해줘');
    await page.getByRole('button', { name: '검토한 맥락으로 플로우 요청' }).click();
    await page.getByRole('button', { name: '캔버스 Diff 검토', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '유저플로우 Diff 검토' });
    await expect(dialog.locator('.user-flow-card[data-diff="added"]')).toHaveCount(1);
    await expect(dialog.locator('.user-flow-card[data-diff="modified"]')).toHaveCount(1);
    await expect(dialog.locator('.user-flow-card[data-diff="deleted"]')).toHaveCount(1);
    await expect(dialog.locator('.react-flow__edge.flow-edge-deleted')).toHaveCount(1);
    await expect(dialog.getByText(/data.label:/)).toBeVisible();
    expect(await readFile(path, 'utf8')).toBe(original);
    await page.screenshot({ path: test.info().outputPath('flow-proposal-diff.png') });
    await dialog.getByRole('button', { name: '플로우 거절', exact: true }).click();
    await dialog
      .getByRole('textbox', { name: '플로우 거절 이유' })
      .fill('완료 상태를 유지하고 간단히 정리해줘');
    await dialog.getByRole('button', { name: '거절 확정', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await readFile(path, 'utf8')).toBe(original);
    expect(
      (await page.evaluate(() => window.workspace.current()))!.proposals.some(
        (p) => p.kind === 'flow' && p.status === 'rejected',
      ),
    ).toBe(true);
    await expect(page.getByText('거절 이유를 검토했습니다.', { exact: true })).toBeVisible();
    await page.locator('.assistant-tabs').getByRole('button', { name: /제안/ }).click();
    await page.getByRole('button', { name: '캔버스 Diff 검토', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '유저플로우 Diff 검토' });
    await expect(dialog.locator('.user-flow-card[data-diff="added"]')).toHaveCount(1);
    const added = (await dialog.locator('.user-flow-card[data-diff="added"]').boundingBox())!;
    const removed = (await dialog.locator('.user-flow-card[data-diff="deleted"]').boundingBox())!;
    expect(
      added.x >= removed.x + removed.width ||
        removed.x >= added.x + added.width ||
        added.y >= removed.y + removed.height ||
        removed.y >= added.y + added.height,
    ).toBe(true);
    await dialog.getByRole('button', { name: '플로우 수락', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const modified = (await page.evaluate(() => window.workspace.current()))!.userFlows![0];
    expect(modified.nodes.some((node) => node.id === 'finish')).toBe(true);
    expect(modified.nodes.some((node) => node.id === 'end')).toBe(false);
    for (const node of saved.nodes.filter((node) => node.id !== 'end'))
      expect(modified.nodes.find((next) => next.id === node.id)!.position).toEqual(node.position);
    expect(await readFile(path, 'utf8')).not.toBe(original);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
