import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('shows root/documents/sections, persists dragged cards, folds sections and fixes the legend to the viewport', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-project-map-'));
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
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    await expect(page.locator('.map-root')).toHaveCount(1);
    await expect(page.locator('.map-document')).toHaveCount(3);
    expect(await page.locator('.map-section').count()).toBeGreaterThan(3);
    const legend = page.getByRole('region', { name: '지도 범례' });
    await expect(legend).toContainText('실선');
    await expect(legend).toContainText('점선');
    const node = page
      .locator('.react-flow__node')
      .filter({ has: page.locator('.map-document') })
      .first();
    const id = await node.getAttribute('data-id');
    await expect(page.locator('.react-flow__edge-path').first()).toBeVisible();
    await page.locator('.react-flow__controls-fitview').click();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const box = (await node.boundingBox())!;
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      document.body.dataset.routingUpdates = '0';
      Worker.prototype.postMessage = function (
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        document.body.dataset.routingUpdates = String(
          Number(document.body.dataset.routingUpdates) + 1,
        );
        return original.call(
          this,
          message,
          Array.isArray(options) ? { transfer: options } : options,
        );
      };
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.down();
    let updates = 0;
    for (let step = 1; step <= 100; step++) {
      const progress = step <= 20 ? step / 20 : 1 + Math.sin(step) / 10;
      await page.mouse.move(
        box.x + box.width / 2 + 50 * progress,
        box.y + box.height / 3 + 100 * progress,
      );
      // Simulate continuous pointer input across multiple routing intervals.
      await new Promise((resolve) => setTimeout(resolve, 20));
      updates = Number(await page.locator('body').getAttribute('data-routing-updates'));
      if (step >= 20 && updates > 0) break;
    }
    expect(updates).toBeGreaterThan(0);
    expect(await page.locator('.react-flow__edge-path').count()).toBeGreaterThan(0);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const map = await page.evaluate(() => window.workspace.projectMap());
        return map.positions.some((p) => p.nodeId === id);
      })
      .toBe(true);
    const dragged = (await page.evaluate(() => window.workspace.projectMap())).positions.find(
      (p) => p.nodeId === id,
    )!;
    await node.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => {
        const map = await page.evaluate(() => window.workspace.projectMap());
        return map.positions.find((p) => p.nodeId === id)?.x;
      })
      .toBeGreaterThan(dragged.x);
    const saved = (await page.evaluate(() => window.workspace.projectMap())).positions.find(
      (p) => p.nodeId === id,
    )!;
    await node.getByRole('button', { name: '소제목 접기' }).click();
    await expect(node.getByRole('button', { name: '소제목 펼치기' })).toBeVisible();
    await legend.getByRole('button', { name: '범례 접기' }).click();
    await expect(legend.getByRole('button', { name: '범례 펼치기' })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '관계 지도', exact: true }).click();
    const restored = await page.evaluate(() => window.workspace.projectMap());
    expect(restored.positions).toContainEqual(saved);
    expect(restored.collapsedDocumentIds).toContain(id);
    expect(restored.legendCollapsed).toBe(true);
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5 });
  }
});
