import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Document } from '../../src/shared/contracts';
import { ProjectStore } from '../../src/main/project/store';

test('keeps 24 document cards readable, focuses one hop and restores section endpoints with fallback routes', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-map-scale-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  const docs: Document[] = [];
  // Deliberately insert in reverse order to exercise the sidebar's numeric sort.
  for (let i = 23; i >= 0; i--)
    docs.unshift(
      await store.createDocument(
        `${String(i + 1).padStart(2, '0')}. 안내`,
        'note',
        `# 문서 ${i}\n` +
          Array.from({ length: 30 }, (_, j) => `## 절 ${j}\n원문 ${i}-${j}`).join('\n'),
      ),
    );
  for (let i = 0; i < 50; i++) {
    const from = Math.floor(i / 2) % 24,
      to = (from + 1) % 24;
    store.addRelation(docs[from].sections[1 + (i % 2)].id, docs[to].sections[1].id, `근거 ${i}`);
  }
  const originalRelations = store.workspace().relations;
  store.put('map-view', {
    id: store.workspace().project.id,
    version: 4,
    positions: [
      { nodeId: docs[0].id, x: 99999, y: 88888 },
      { nodeId: docs[0].sections[1].id, x: 760, y: 77777 },
    ],
    collapsedDocumentIds: [],
    legendCollapsed: false,
  });
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: data },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 674 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A blocked routing worker must never make an edge disappear.
    await page.evaluate(() => {
      Worker.prototype.postMessage = function (message: {
        version: number;
        edges: { id: string }[];
      }) {
        queueMicrotask(() =>
          this.onmessage?.call(
            this,
            new MessageEvent('message', {
              data: {
                version: message.version,
                done: true,
                routes: message.edges.map((e) => ({ id: e.id, status: 'blocked', points: [] })),
              },
            }),
          ),
        );
      };
    });
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    await expect(page.locator('.map-document')).toHaveCount(24);
    await expect(page.locator('.map-root, .map-section')).toHaveCount(0);
    const sidebarTitles = await page
      .locator('.document-nav-item > span:first-of-type')
      .allTextContents();
    expect(sidebarTitles).toEqual(docs.map((d) => d.title));
    await expect(page.locator('.document-nav .nav-type')).toHaveCount(0);
    await expect(page.locator('.relations-list')).not.toHaveAttribute('open');
    expect(await page.locator('.map-section-row').count()).toBeLessThanOrEqual(120);
    const metrics = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')!;
      const scale = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
      return {
        font:
          parseFloat(getComputedStyle(document.querySelector('.map-card strong')!).fontSize) *
          scale,
        height: document.querySelector('.graph-canvas')!.getBoundingClientRect().height,
        windowHeight: innerHeight,
      };
    });
    expect(metrics.font).toBeGreaterThanOrEqual(12);
    expect(metrics.height).toBeGreaterThan(metrics.windowHeight * 0.55);
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(24);
    await expect(page.locator('[data-routing="fallback"]')).toHaveCount(24);
    await expect(page.getByText(/겹친 카드를 이동/)).toHaveCount(0);
    const card = page.locator(`.react-flow__node[data-id="${docs[0].id}"]`);
    await card.getByRole('button', { name: '집중 보기', exact: true }).click();
    await expect(page.locator('.map-document')).toHaveCount(3);
    await expect(page.locator(`.react-flow__node[data-id="${docs[23].id}"]`)).toHaveCount(1);
    await card.focus();
    if ((await card.getAttribute('aria-selected')) !== 'true') await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.workspace.projectMap())).positions.find(
            (p) => p.nodeId === docs[0].id,
          )?.x,
      )
      .toBe(5);
    const edge = page.locator(`.react-flow__edge[data-id="${originalRelations[0].id}"] > g`);
    await expect(edge).toHaveAttribute(
      'data-sourcehandle',
      `section:${docs[0].sections[1].id}:right`,
    );
    const fold = card.getByRole('button', { name: '소제목 접기', exact: true });
    await expect
      .poll(async () => {
        const button = await fold.boundingBox();
        const canvas = await page.locator('.graph-canvas').boundingBox();
        return (
          !!button &&
          !!canvas &&
          button.y >= canvas.y &&
          button.y + button.height <= canvas.y + canvas.height
        );
      })
      .toBe(true);
    await fold.click();
    await expect(card.locator('.map-section-row')).toHaveCount(0);
    await expect(edge).toHaveAttribute('data-sourcehandle', 'right');
    await expect
      .poll(async () => (await page.evaluate(() => window.workspace.projectMap())).layoutVersion)
      .toBe(2);
    const migrated = await page.evaluate(() => window.workspace.projectMap());
    expect(migrated.positions).toHaveLength(24);
    expect(migrated.positions.every((p) => p.y < 2200 && p.x < 2000)).toBe(true);
    await card.getByRole('button', { name: '소제목 펼치기', exact: true }).click();
    await expect(edge).toHaveAttribute(
      'data-sourcehandle',
      `section:${docs[0].sections[1].id}:right`,
    );
    const from = await card
      .locator(`[data-handleid="section:${docs[0].sections[1].id}:right"]`)
      .boundingBox();
    const to = await card
      .locator(`[data-handleid="section:${docs[0].sections[2].id}:left"]`)
      .boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
    await page.mouse.up();
    const connection = page.getByRole('dialog', { name: '문서 연결' });
    await expect(connection).toBeVisible();
    await expect(connection.getByRole('combobox', { name: '기준 문서' })).toHaveValue(
      docs[0].sections[1].id,
    );
    await expect(connection.getByRole('combobox', { name: '연결할 문서' })).toHaveValue(
      docs[0].sections[2].id,
    );
    await connection.getByRole('button', { name: '닫기' }).click();
    await page.getByRole('button', { name: '전체 보기', exact: true }).click();
    await expect(page.locator('.map-document')).toHaveCount(24);
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(24);
    expect(
      (await page.evaluate(() => window.workspace.projectMap())).positions.find(
        (p) => p.nodeId === docs[0].id,
      )?.x,
    ).toBe(5);
    expect((await page.evaluate(() => window.workspace.current()))!.relations).toEqual(
      originalRelations,
    );
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5 });
  }
});
