import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
test('expands canvas document cards, keeps coordinates, paginates and shows adjacent Markdown evidence', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-planning-'));
  const root = join(data, 'project'),
    store = await ProjectStore.open(root);
  const requirements = await store.createDocument(
    '04. 요구사항 명세서',
    'note',
    '# 04. 요구사항 명세서\n## 인증\n| ID | 요구사항 | 우선 |\n|---|---|---|\n' +
      Array.from(
        { length: 10 },
        (_, i) =>
          `| FR-A-${String(i + 1).padStart(2, '0')} | **인증 ${i + 1}** 및 토큰 확인 | P0 |`,
      ).join('\n'),
  );
  await store.createDocument(
    '06. API 명세서',
    'note',
    '# 06. API 명세서\n## POST /api/events\n요청 예시\n```json\n{"events":[]}\n```',
  );
  await store.createDocument('11. 연동 가이드', 'note', '# 11. 연동 가이드\n참고 문서');
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: data },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1600, height: 1050 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    const document = page.getByRole('button', {
      name: '문서 펼치기: 04. 요구사항 명세서',
      exact: true,
    });
    await expect(document).toBeVisible();
    await expect(page.locator('.planning-node-hit[data-kind="document"]')).toHaveCount(2);
    const initial = await document.boundingBox();
    await document.click();
    await expect(page.locator('.planning-node-hit[data-kind="item"]')).toHaveCount(8);
    expect(await document.boundingBox()).toEqual(initial);
    await page.getByRole('button', { name: /^상세보기: FR-A-01 / }).click();
    const detail = page.getByRole('dialog', { name: 'FR-A-01', exact: true });
    await expect(detail).toBeVisible();
    await expect(detail.locator('strong').filter({ hasText: '인증 1' })).toHaveCount(1);
    await expect(detail).toContainText(requirements.relativePath);
    await expect(detail).toContainText(requirements.revision.slice(0, 8));
    await page.mouse.move(10, 10);
    await page.screenshot({ path: test.info().outputPath('planning-detail.png') });
    await page.getByRole('button', { name: '상세보기 닫기' }).click();
    await expect(detail).toHaveCount(0);
    await page.getByRole('button', { name: '다음 항목', exact: true }).click();
    await expect(page.locator('.planning-node-hit[data-kind="item"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^상세보기: FR-A-09 / })).toBeVisible();
    await document.click();
    await expect(page.locator('.planning-node-hit[data-kind="item"]')).toHaveCount(0);
    expect(await document.boundingBox()).toEqual(initial);
    await page.getByRole('button', { name: '문서 펼치기: 06. API 명세서', exact: true }).click();
    await page.getByRole('button', { name: /^상세보기: POST \/api\/events / }).click();
    await expect(page.getByRole('dialog').locator('pre code')).toContainText('events');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('checkbox', { name: '기획·설계 문서만' }).uncheck();
    await expect(page.locator('.planning-node-hit[data-kind="document"]')).toHaveCount(3);
    await document.click();
    await page.getByRole('button', { name: /^상세보기: FR-A-01 / }).click();
    await page.getByRole('button', { name: '원문 열기', exact: true }).click();
    await expect(page.locator('.document-surface')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('keeps 24 planning documents readable and preserves their stored relationships and positions', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-planning-scale-')),
    root = join(data, 'project');
  const store = await ProjectStore.open(root);
  const docs = [];
  for (let i = 0; i < 24; i++)
    docs.push(
      await store.createDocument(
        `${i + 1}. 기능`,
        'feature',
        `# ${i + 1}. 기능\n## 항목\n- 기능 ${i}\n- 다른 기능 ${i}`,
      ),
    );
  store.addRelation(docs[0].id, docs[1].id, '참조');
  const before = store.workspace();
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', DOCFLOW_DATA_DIR: data },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 740 });
    await page.getByRole('button', { name: '문서 구조', exact: true }).click();
    await expect(page.locator('.planning-node-hit[data-kind="document"]')).toHaveCount(24);
    const first = page.getByRole('button', { name: '문서 펼치기: 1. 기능', exact: true });
    const position = await first.boundingBox();
    await first.click();
    await expect(page.locator('.planning-node-hit[data-kind="item"]')).toHaveCount(2);
    expect(await first.boundingBox()).toEqual(position);
    await expect(page.locator('.planning-routes path')).toHaveCount(26);
    const last = page.getByRole('button', { name: '문서 펼치기: 24. 기능', exact: true });
    await last.focus();
    await expect
      .poll(() => page.locator('.planning-stage').evaluate((element) => element.scrollTop))
      .toBe(0);
    const lastBox = (await last.boundingBox())!,
      stageBox = (await page.locator('.planning-stage').boundingBox())!;
    expect(lastBox.y).toBeGreaterThanOrEqual(stageBox.y);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height);
    await last.press('Enter');
    await expect(last).toHaveAttribute('aria-expanded', 'true');
    const after = (await page.evaluate(() => window.workspace.current()))!;
    expect(after.relations).toEqual(before.relations);
    expect(after.mapView).toEqual(before.mapView);
    await page.getByRole('button', { name: '연결 탐색', exact: true }).click();
    await expect(page.locator('.map-document')).toHaveCount(24);
    await page.getByRole('button', { name: '기획 펼치기', exact: true }).click();
    await page.setViewportSize({ width: 800, height: 700 });
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      canvas: document.querySelector('.planning-canvas')!.getBoundingClientRect().height,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
    expect(metrics.canvas).toBeGreaterThanOrEqual(300);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
