import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('renders semantic flows, preserves manual positions, projects collapsed edges and navigates document evidence', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-user-flows-'));
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
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
    });
    await page.getByRole('button', { name: '안내 닫기' }).click();
    await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
    const workspace = (await page.evaluate(() => window.workspace.current()))!;
    const doc = workspace.documents.find((doc) => doc.title === '프로젝트 개요')!;
    const section = doc.sections[0];
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await page.getByRole('tab', { name: '유저플로우', exact: true }).click();
    await page.getByRole('button', { name: '새 유저플로우', exact: true }).click();
    const draft = JSON.parse(
      await page.getByRole('textbox', { name: '유저플로우 JSON' }).inputValue(),
    );
    const node = (id: string, type: string, label: string, parentId?: string) => ({
      id,
      type,
      parentId,
      data: { label },
      origin: 'inferred',
      evidence: [],
    });
    draft.title = 'Phase1 여정';
    draft.nodes = [
      node('g', 'group', '온보딩'),
      node('start', 'startEnd', '시작', 'g'),
      {
        ...node('page', 'page', '로그인 화면', 'g'),
        origin: 'grounded',
        data: { label: '로그인 화면', components: ['API 키 입력', '연결 확인'] },
        evidence: [
          {
            documentId: doc.id,
            sectionId: section.id,
            revision: doc.revision,
            quoteRange: {
              start:
                doc.markdown
                  .split('\n')
                  .slice(0, section.line - 1)
                  .join('\n').length + (section.line > 1 ? 1 : 0),
              end: doc.markdown.length,
            },
          },
        ],
      },
      node('action', 'action', '연결 클릭', 'g'),
      {
        ...node('condition', 'condition', '연결 성공?', 'g'),
        data: {
          label: '연결 성공?',
          outputs: [
            { id: 'yes', label: '성공' },
            { id: 'no', label: '실패' },
          ],
        },
      },
      node('system', 'system', '설정 저장', 'g'),
      { ...node('end', 'startEnd', '종료'), data: { label: '종료', role: 'end' } },
    ];
    draft.edges = [
      ['start', 'page'],
      ['page', 'action'],
      ['action', 'condition'],
      ['condition', 'system'],
      ['condition', 'end'],
      ['system', 'end'],
    ].map(([source, target], index) => ({
      id: `edge-${index}`,
      source,
      target,
      ...(source === 'condition' ? { sourceHandle: target === 'system' ? 'yes' : 'no' } : {}),
      origin: 'inferred',
      evidence: [],
    }));
    await page.getByRole('textbox', { name: '유저플로우 JSON' }).fill(JSON.stringify(draft));
    await page.getByRole('button', { name: 'JSON 저장', exact: true }).click();
    const canvas = page.getByLabel('유저플로우 캔버스');
    await expect(canvas.locator('.user-flow-card')).toHaveCount(7);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    for (const type of ['group', 'startEnd', 'page', 'action', 'condition', 'system'])
      expect(await canvas.locator(`.user-flow-${type}`).count()).toBeGreaterThan(0);
    await expect(canvas.locator('.user-flow-port-label').filter({ hasText: '성공' })).toHaveCount(
      1,
    );
    const original = (await page.evaluate(() => window.workspace.current()))!.userFlows!.find(
      (flow) => flow.id === draft.id,
    )!;
    await canvas.locator('.react-flow__controls-fitview').click();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(canvas.locator('.user-flow-page strong')).toBeInViewport();
    const detached = await page.evaluate(
      (edges: Array<{ id: string; source: string; sourceHandle?: string }>) =>
        edges
          .filter((edge) => {
            const path = document.querySelector<SVGPathElement>(
              `.react-flow__edge[data-id="${edge.id}"] .react-flow__edge-path`,
            );
            const handle = document.querySelector<HTMLElement>(
              `.react-flow__node[data-id="${edge.source}"] .react-flow__handle[data-handleid="${edge.sourceHandle || 'out'}"]`,
            );
            if (!path || !handle || !path.getScreenCTM()) return true;
            const start = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
            const box = handle.getBoundingClientRect();
            return (
              Math.hypot(start.x - box.x - box.width / 2, start.y - box.y - box.height / 2) > 4
            );
          })
          .map((edge) => edge.id),
      draft.edges,
    );
    expect(detached).toEqual([]);
    await page.mouse.move(20, 20);
    await page.screenshot({ path: test.info().outputPath('user-flow-foundation.png') });
    const card = canvas.locator('.react-flow__node[data-id="page"]');
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 3 + 25, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const flow = (await page.evaluate(() => window.workspace.current()))!.userFlows!.find(
          (flow) => flow.id === draft.id,
        )!;
        return flow.nodes.find((node) => node.id === 'page')!.position;
      })
      .not.toEqual(original.nodes.find((node) => node.id === 'page')!.position);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    const dragged = (await page.evaluate(() => window.workspace.current()))!.userFlows!.find(
      (flow) => flow.id === draft.id,
    )!;
    await card.focus();
    await expect(card).toHaveClass(/draggable/);
    if (!(await card.getAttribute('class'))?.split(' ').includes('selected')) {
      await page.keyboard.press('Enter');
    }
    await expect(card).toHaveClass(/selected/);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => {
        const flow = (await page.evaluate(() => window.workspace.current()))!.userFlows!.find(
          (flow) => flow.id === draft.id,
        )!;
        return flow.nodes.find((node) => node.id === 'page')!.position!.x;
      })
      .toBeGreaterThan(dragged.nodes.find((node) => node.id === 'page')!.position!.x);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    const moved = (await page.evaluate(() => window.workspace.current()))!.userFlows!.find(
      (flow) => flow.id === draft.id,
    )!;
    await page.getByRole('button', { name: 'JSON 편집', exact: true }).click();
    const rejected = JSON.parse(
      await page.getByRole('textbox', { name: '유저플로우 JSON' }).inputValue(),
    );
    rejected.nodes.find((node: { id: string }) => node.id === 'page').position.x += 777;
    rejected.nodes.find((node: { id: string }) => node.id === 'page').evidence[0].revision =
      'outdated';
    await page.getByRole('textbox', { name: '유저플로우 JSON' }).fill(JSON.stringify(rejected));
    await page.getByRole('button', { name: 'JSON 저장', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '문서 근거가 변경' })).toBeVisible();
    await page.getByRole('button', { name: 'JSON 편집', exact: true }).click();
    await page.getByRole('button', { name: 'JSON 편집 취소', exact: true }).click();
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장 필요');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '최신 JSON 불러오기', exact: true }).click();
    await page.getByRole('button', { name: 'JSON 편집', exact: true }).click();
    const reloaded = JSON.parse(
      await page.getByRole('textbox', { name: '유저플로우 JSON' }).inputValue(),
    );
    expect(reloaded.nodes.find((node: { id: string }) => node.id === 'page').position).toEqual(
      moved.nodes.find((node) => node.id === 'page')!.position,
    );
    await page.getByRole('button', { name: 'JSON 편집 취소', exact: true }).click();
    await card.getByRole('button', { name: '로그인 화면 문서 근거 1' }).click();
    await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Phase1 여정 · 로그인 화면', exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="page"]')).toHaveClass(/selected/);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 900));
    await canvas.locator('.react-flow__controls-fitview').click();
    await expect(canvas.locator('.user-flow-page strong')).toBeInViewport();
    await canvas.locator('.react-flow__controls-zoomin').click();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const canvasBounds = (await canvas.boundingBox())!;
    const collapseBounds = (await page
      .getByRole('button', { name: '온보딩 접기', exact: true })
      .boundingBox())!;
    const panX = canvasBounds.x + 80 - collapseBounds.x;
    await page.mouse.move(
      canvasBounds.x + canvasBounds.width - 20,
      canvasBounds.y + canvasBounds.height - 20,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBounds.x + canvasBounds.width - 20 + panX,
      canvasBounds.y + canvasBounds.height - 20,
      { steps: 10 },
    );
    await page.mouse.up();
    const viewportBeforeCollapse = await canvas
      .locator('.react-flow__viewport')
      .getAttribute('style');
    // Remounting a projected graph must not depend on asynchronous DOM measurements.
    await page.evaluate(() => {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    });
    await page.getByRole('button', { name: '온보딩 접기', exact: true }).click();
    await expect(canvas.locator('.user-flow-card')).toHaveCount(2);
    try {
      await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
    } catch (error) {
      console.log(
        'Collapsed flow diagnostics',
        warnings,
        await canvas.locator('.react-flow__node').evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.getAttribute('data-id'),
            transform: (node as HTMLElement).style.transform,
            handles: [...node.querySelectorAll('.react-flow__handle')].map((handle) => ({
              id: handle.getAttribute('data-handleid'),
              className: handle.className,
            })),
          })),
        ),
      );
      await page.screenshot({ path: test.info().outputPath('collapsed-flow-failure.png') });
      throw error;
    }
    const expand = page.getByRole('button', { name: '온보딩 펼치기', exact: true });
    await expect
      .poll(() =>
        expand.evaluate((button) => {
          const box = button.getBoundingClientRect();
          const bounds = button.closest('.user-flow-canvas')!.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return (
            box.left >= bounds.left &&
            box.right <= bounds.right &&
            box.top >= bounds.top &&
            box.bottom <= bounds.bottom &&
            !!hit &&
            button.contains(hit)
          );
        }),
      )
      .toBe(true);
    const viewportAfterCollapse = await canvas
      .locator('.react-flow__viewport')
      .getAttribute('style');
    expect(viewportAfterCollapse!.match(/scale\([^)]+\)/)?.[0]).toBe(
      viewportBeforeCollapse!.match(/scale\([^)]+\)/)?.[0],
    );
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    await page.getByRole('button', { name: '온보딩 펼치기', exact: true }).click();
    await expect(canvas.locator('.user-flow-card')).toHaveCount(7);
    await expect(canvas.locator('.react-flow__edge')).toHaveCount(6);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    await page.getByRole('button', { name: '온보딩 접기', exact: true }).click();
    await expect(canvas.locator('.user-flow-card')).toHaveCount(2);
    await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    const jsonPath = join(workspace.root, '.workspace', 'flows', `${draft.id}.json`);
    const external = JSON.parse(await readFile(jsonPath, 'utf8'));
    external.nodes.push(node('external-new', 'action', '외부 JSON에서 추가'));
    await writeFile(jsonPath, JSON.stringify(external));
    app = await launch();
    page = await app.firstWindow();
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await page.getByRole('tab', { name: '유저플로우', exact: true }).click();
    await expect(page.locator('.user-flow-card')).toHaveCount(3);
    await expect(page.locator('.flow-detail').getByRole('status')).toHaveText('저장됨');
    const restored = (await page.evaluate(() => window.workspace.current()))!;
    expect(restored.userFlows![0].nodes.find((node) => node.id === 'page')!.position).toEqual(
      moved.nodes.find((node) => node.id === 'page')!.position,
    );
    expect(restored.documents.find((item) => item.id === doc.id)!.markdown).toBe(doc.markdown);
    expect(
      JSON.parse(
        await readFile(join(workspace.root, '.workspace', 'flows', `${draft.id}.json`), 'utf8'),
      ).nodes,
    ).toHaveLength(8);
    await page.getByRole('tab', { name: '문서 속 흐름', exact: true }).click();
    await expect(page.locator('.diagram-canvas svg')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5 });
  }
});
