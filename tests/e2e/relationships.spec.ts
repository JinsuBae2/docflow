import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('previews AI relationship evidence, applies only reviewed links and edits custom types', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-relationships-e2e-'));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DOCFLOW_DATA_DIR: root,
      DOCFLOW_TEST_NODE: process.execPath,
      DOCFLOW_TEST_FIXTURE: resolve('tests/fixtures/fake-codex.cjs'),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '안내 닫기' }).click();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await page.getByRole('button', { name: 'Markdown 편집', exact: true }).click();
    const original = await page.getByRole('textbox', { name: 'Markdown 본문' }).inputValue();
    await page.getByRole('textbox', { name: 'Markdown 본문' }).fill(original + '\n보존된 초안');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    await page.getByRole('button', { name: 'AI로 연결 검토', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /초안.*저장/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const draftWorkspace = (await page.evaluate(() => window.workspace.current()))!;
    await page.locator('.context-chip').click();
    await page
      .getByRole('dialog')
      .locator('.context-source')
      .filter({ hasText: draftWorkspace.documents[0].title })
      .getByRole('checkbox')
      .uncheck();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: 'AI로 연결 검토', exact: true }).click();
    const restoredSource = page
      .getByRole('dialog')
      .locator('.context-source')
      .filter({ hasText: draftWorkspace.documents[0].title })
      .getByRole('checkbox');
    await restoredSource.click();
    await expect(restoredSource).toBeChecked();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /초안.*저장/ })).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
    await page.getByRole('button', { name: '문서', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown 본문' })).toHaveValue(/보존된 초안/);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();

    await page.getByRole('button', { name: 'AI로 연결 검토', exact: true }).click();
    const before = (await page.evaluate(() => window.workspace.current()))!;
    const dialog = page.getByRole('dialog');
    await dialog
      .locator('.context-source')
      .filter({ hasText: before.documents[0].title })
      .getByRole('checkbox')
      .uncheck();
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(page.getByRole('button', { name: 'AI 연결 제안', exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__edge-proposal [data-routing]')).toHaveAttribute(
      'data-routing',
      'routed',
    );
    await expect(
      page
        .locator('.react-flow__edge-proposal .react-flow__edge-textwrapper')
        .filter({ hasText: 'AI 제안 · 2개 연결' }),
    ).toBeVisible();
    const existingLabel = await page
      .locator('.react-flow__edge-text')
      .filter({ hasText: '사용자 흐름' })
      .boundingBox();
    const proposedLabel = await page
      .locator('.react-flow__edge-proposal .react-flow__edge-textwrapper')
      .filter({ hasText: 'AI 제안 · 2개 연결' })
      .boundingBox();
    expect(
      existingLabel &&
        proposedLabel &&
        existingLabel.x < proposedLabel.x + proposedLabel.width &&
        existingLabel.x + existingLabel.width > proposedLabel.x &&
        existingLabel.y < proposedLabel.y + proposedLabel.height &&
        existingLabel.y + existingLabel.height > proposedLabel.y,
    ).toBe(false);
    await page
      .locator('.react-flow__edge-proposal .react-flow__edge-textwrapper')
      .filter({ hasText: 'AI 제안 · 2개 연결' })
      .click();
    await expect(page.locator('.pending-relation-detail')).toHaveCount(2);
    await expect(page.locator('.pending-relation-detail').first()).toContainText(
      '선택한 두 문서에서 연결 근거를 찾았습니다.',
    );
    await expect(page.locator('.pending-relation-detail').first()).toContainText('→');
    await expect(page.locator('.react-flow__edge-proposal')).toHaveCount(2);
    const pending = (await page.evaluate(() => window.workspace.current()))!;
    expect(pending.relations).toHaveLength(before.relations.length);
    expect(pending.proposals[0].sourceIds).not.toContain(before.documents[0].id);
    await page.mouse.move(1100, 70);
    await page.screenshot({ path: 'outputs/ai-relationship-review.png', fullPage: true });
    await page.getByRole('button', { name: '제안 수락', exact: true }).first().click();
    await page.getByRole('button', { name: '제안 거절', exact: true }).first().click();
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByText('거절됨', { exact: true }).first()).toBeVisible();
    const accepted = (await page.evaluate(() => window.workspace.current()))!;
    expect(accepted.relations).toHaveLength(before.relations.length + 1);
    const added = accepted.relations.find((r) => !before.relations.some((old) => old.id === r.id))!;
    await page.getByRole('button', { name: '모든 연결 보기', exact: true }).click();
    const row = page.locator(`[data-relation-id="${added.id}"]`);
    await row.getByRole('button', { name: '관계 유형 수정', exact: true }).click();
    await row.getByRole('textbox', { name: '관계 유형', exact: true }).fill('테스트 커스텀 근거');
    await row.getByRole('button', { name: '유형 저장', exact: true }).click();
    await expect(row).toContainText('테스트 커스텀 근거');
    await row.getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'AI로 연결 검토', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(page.getByRole('button', { name: '제안 수락', exact: true })).toHaveCount(2);
    const latest = (await page.evaluate(() => window.workspace.current()))!;
    const source = latest.documents[1];
    await writeFile(join(latest.root, source.relativePath), source.markdown + '\n문서 내용 변경');
    await page.getByRole('button', { name: '제안 수락', exact: true }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: /관계.*다시 검토/ })).toBeVisible();
    await expect(page.getByText('재검토 필요', { exact: true }).first()).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.relations).toHaveLength(
      before.relations.length,
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
