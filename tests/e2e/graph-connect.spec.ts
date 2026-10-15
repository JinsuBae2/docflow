import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function drag(page: Page, from: string, to: string, handle = '[data-handleid="left"]') {
  // A preceding connection gesture can pan the viewport near its boundary.
  await page.locator('.react-flow__controls-fitview').click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const start = await page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.map-document') })
    .filter({ hasText: from })
    .locator('[data-handleid="right"]')
    .boundingBox();
  const end = await page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.map-document') })
    .filter({ hasText: to })
    .locator(handle)
    .boundingBox();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 12 });
  const currentEnd = await page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.map-document') })
    .filter({ hasText: to })
    .locator(handle)
    .boundingBox();
  await page.mouse.move(
    currentEnd!.x + currentEnd!.width / 2,
    currentEnd!.y + currentEnd!.height / 2,
  );
  await page.mouse.up();
}

test('connects documents by dragging, blocks invalid targets, edits and keeps AI proposals pending after restart', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-graph-connect-e2e-'));
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
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: '안내 닫기' }).click();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();

    // Leave an AI proposal pending; drag connections must not accept or drop it.
    await page.getByRole('button', { name: 'AI로 연결 검토', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '제안 수락', exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    await expect(page.locator('.react-flow__edge-proposal').first()).toBeVisible();
    const before = (await page.evaluate(() => window.workspace.current()))!;
    const pendingIds = before.proposals.filter((p) => p.status === 'pending').map((p) => p.id);
    expect(pendingIds.length).toBeGreaterThan(0);

    // Dropping on itself opens nothing.
    await drag(page, '프로젝트 개요', '프로젝트 개요');
    await expect(page.getByRole('dialog', { name: '문서 연결' })).toHaveCount(0);

    await drag(page, '프로젝트 개요', '사용자 흐름');
    const dialog = page.getByRole('dialog', { name: '문서 연결' });
    await expect(dialog).toBeVisible();
    const overview = before.documents.find((d) => d.title === '프로젝트 개요')!;
    const flow = before.documents.find((d) => d.title === '사용자 흐름')!;
    await expect(dialog.getByRole('combobox', { name: '기준 문서' })).toHaveValue(overview.id);
    await expect(dialog.getByRole('combobox', { name: '연결할 문서' })).toHaveValue(flow.id);
    await dialog.getByRole('combobox', { name: '관계', exact: true }).fill('드래그 연결');
    await dialog.getByRole('button', { name: '연결 저장', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const after = (await page.evaluate(() => window.workspace.current()))!;
    const added = after.relations.find((r) => r.type === '드래그 연결')!;
    expect(added).toMatchObject({ fromId: overview.id, toId: flow.id, origin: 'manual' });
    expect(after.proposals.filter((p) => p.status === 'pending').map((p) => p.id)).toEqual(
      pendingIds,
    );

    // The overview → flow line skips the PRD card, so it must go around every card and stay clickable.
    const skipEdge = page.locator(`.react-flow__edge[data-id="${added.id}"]`);
    const skipLabel = skipEdge.locator('.react-flow__edge-textwrapper');
    await expect(skipLabel).toBeVisible();
    await expect(skipEdge.locator('[data-routing]')).toHaveAttribute('data-routing', 'routed');
    const overlaps = await page.evaluate((id) => {
      const cards = [...document.querySelectorAll('.react-flow__node')].map((n) =>
        n.getBoundingClientRect(),
      );
      const inside = (x: number, y: number) =>
        cards.some((c) => x > c.left && x < c.right && y > c.top && y < c.bottom);
      const edge = document.querySelector(`.react-flow__edge[data-id="${id}"]`)!;
      const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path')!;
      const matrix = path.getScreenCTM()!;
      const length = path.getTotalLength();
      let line = 0;
      // Skip the ends, which sit on the cards' handles.
      for (let at = 8; at <= length - 8; at += 4) {
        const p = path.getPointAtLength(at).matrixTransform(matrix);
        if (inside(p.x, p.y)) line++;
      }
      const l = edge.querySelector('.react-flow__edge-textwrapper')!.getBoundingClientRect();
      const label = cards.some(
        (c) => l.left < c.right && l.right > c.left && l.top < c.bottom && l.bottom > c.top,
      );
      return { line, label };
    }, added.id);
    expect(overlaps).toEqual({ line: 0, label: false });
    await skipLabel.click();
    await expect(page.locator(`[data-relation-id="${added.id}"]`)).toHaveClass(/selected/);
    await expect(skipEdge).toHaveClass(/selected/);
    await expect(page.getByRole('heading', { name: '문서 구조' })).toBeVisible();

    // The same link again is rejected by the main process.
    await drag(page, '프로젝트 개요', '사용자 흐름');
    await dialog.getByRole('combobox', { name: '관계', exact: true }).fill('드래그 연결');
    await dialog.getByRole('button', { name: '연결 저장', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '이미 있습니다' })).toBeVisible();
    await dialog.getByRole('button', { name: '닫기' }).click();

    await page.getByRole('button', { name: '모든 연결 보기', exact: true }).click();
    // Keyboard path: choose both ends in the dialog.
    await page.getByRole('button', { name: '연결 추가', exact: true }).click();
    await dialog.getByRole('combobox', { name: '기준 문서' }).selectOption(flow.id);
    await expect(dialog.getByRole('combobox', { name: '연결할 문서' })).not.toHaveValue(flow.id);
    await dialog.getByRole('combobox', { name: '연결할 문서' }).selectOption(overview.id);
    await dialog.getByRole('combobox', { name: '관계', exact: true }).fill('키보드 연결');
    await dialog.getByRole('button', { name: '연결 저장', exact: true }).click();
    await expect(page.locator('.relation-row').filter({ hasText: '키보드 연결' })).toBeVisible();

    // Selecting a line highlights its row; the edited relation is the dragged one.
    const refined = after.relations.find((r) => r.type === '구체화')!;
    await page.locator('.react-flow__edge-textwrapper').filter({ hasText: '구체화' }).click();
    await expect(page.locator(`[data-relation-id="${refined.id}"]`)).toHaveClass(/selected/);
    await expect(page.locator(`.react-flow__edge[data-id="${refined.id}"]`)).toHaveClass(
      /selected/,
    );
    await page.getByRole('button', { name: '모든 연결 보기', exact: true }).click();
    const row = page.locator(`[data-relation-id="${added.id}"]`);
    await row.getByRole('button', { name: '관계 유형 수정', exact: true }).click();
    await row.getByRole('textbox', { name: '관계 유형', exact: true }).fill('수정한 연결');
    await row.getByRole('button', { name: '유형 저장', exact: true }).click();
    await expect(row).toContainText('수정한 연결');

    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    const restored = (await page.evaluate(() => window.workspace.current()))!;
    expect(restored.relations.find((r) => r.id === added.id)?.type).toBe('수정한 연결');
    expect(restored.proposals.filter((p) => p.status === 'pending').map((p) => p.id)).toEqual(
      pendingIds,
    );
    await expect(page.locator('.react-flow__edge-proposal').first()).toBeVisible();
    await page.locator('.relations-list summary').click();
    const restoredRow = page.locator(`[data-relation-id="${added.id}"]`);
    await restoredRow.getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(restoredRow).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
    await rm(data, { recursive: true, force: true });
  }
});
