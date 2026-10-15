import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'docflow-screenshots-'));
let app;
try {
  await mkdir('docs/images', { recursive: true });
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: '',
      DOCFLOW_DATA_DIR: root,
      DOCFLOW_TEST_FIXTURE: '',
    },
  });
  const page = await app.firstWindow();
  const settleFrames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
        ),
    );
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.getByRole('button', { name: '안내 닫기' }).click();
  await page.getByRole('button', { name: '예제 프로젝트 열기' }).click();
  await expect(page.locator('.project-briefing')).toBeVisible();
  await page.mouse.move(720, 25);
  await page.screenshot({ path: 'docs/images/project-briefing.png' });
  await page.getByRole('button', { name: '문서', exact: true }).click();
  await expect(page.getByRole('heading', { name: '프로젝트 개요', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/workspace.png' });
  // Add illustrative section links only to this temporary example project.
  await page.evaluate(async () => {
    const workspace = await globalThis.window.workspace.current();
    const overview = workspace.documents.find((doc) => doc.type === 'overview');
    const prd = workspace.documents.find((doc) => doc.type === 'prd');
    await globalThis.window.workspace.connectDocuments(
      overview.sections[1].id,
      prd.sections[1].id,
      '명세 근거',
    );
    await globalThis.window.workspace.connectDocuments(
      overview.sections[2].id,
      prd.sections[2].id,
      '요구사항 연결',
    );
  });
  await page.reload();
  const tabs = page.locator('.view-tabs');
  await tabs.getByRole('button', { name: '문서 구조', exact: true }).click();
  await expect(page.locator('.map-document')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__edge-path').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge [data-routing="routed"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'AI 패널 표시 전환', exact: true }).click();
  await page.locator('.graph-canvas .react-flow__controls-fitview').click();
  await settleFrames();
  await page.locator('.graph-canvas .react-flow__controls-zoomout').click();
  await settleFrames();
  await page.mouse.move(720, 25);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/project-map-layout.png' });
  await page
    .locator('.react-flow__node')
    .filter({ hasText: '프로젝트 개요' })
    .getByRole('button', { name: '집중 보기', exact: true })
    .click();
  await expect(page.locator('.map-document')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '전체 보기', exact: true })).toBeVisible();
  await settleFrames();
  await expect(page.locator('.graph-canvas .react-flow__edge-path')).toHaveCount(3);
  await page.locator('.graph-canvas .react-flow__controls-fitview').click();
  await settleFrames();
  await page.locator('.graph-canvas .react-flow__controls-zoomout').click();
  await settleFrames();
  await page.mouse.move(720, 25);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/document-map-focus.png' });
  await page.getByRole('button', { name: 'AI 패널 표시 전환', exact: true }).click();
  await tabs.getByRole('button', { name: '사용자 흐름', exact: true }).click();
  await expect(page.locator('.diagram-canvas svg')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/images/diagram.png' });
  await page.getByRole('tab', { name: '유저플로우', exact: true }).click();
  await page.getByRole('button', { name: '새 유저플로우', exact: true }).click();
  const draft = JSON.parse(
    await page.getByRole('textbox', { name: '유저플로우 JSON' }).inputValue(),
  );
  const workspace = await page.evaluate(() => globalThis.window.workspace.current());
  const sourceDocument = workspace.documents.find((doc) => doc.type === 'overview');
  const node = (id, type, label, x, y, width, height, parentId = 'journey') => ({
    id,
    type,
    data: { label },
    origin: 'inferred',
    evidence: [],
    position: { x, y },
    width,
    height,
    ...(parentId ? { parentId } : {}),
  });
  draft.title = '문서 검토 여정 · 예시';
  draft.nodes = [
    node('journey', 'group', '기획 검토', 0, 0, 800, 450, null),
    {
      ...node('start', 'startEnd', '프로젝트 열기', 25, 100, 130, 88),
      data: { label: '프로젝트 열기', role: 'start' },
    },
    {
      ...node('document', 'page', '문서 확인', 200, 90, 200, 160),
      data: { label: '문서 확인', components: ['목차와 원문', '연결된 근거'] },
      origin: 'grounded',
      evidence: [
        {
          documentId: sourceDocument.id,
          sectionId: null,
          revision: sourceDocument.revision,
          quoteRange: { start: 0, end: sourceDocument.markdown.length },
        },
      ],
    },
    {
      ...node('review', 'condition', '수락할까요?', 460, 90, 200, 160),
      data: {
        label: '수락할까요?',
        outputs: [
          { id: 'yes', label: '수락' },
          { id: 'no', label: '수정 요청' },
        ],
      },
    },
    node('feedback', 'action', '의견 남기기', 200, 290, 200, 120),
    node('save', 'system', '변경 저장', 460, 290, 200, 120),
    {
      ...node('end', 'startEnd', '검토 완료', 850, 300, 130, 88, null),
      data: { label: '검토 완료', role: 'end' },
    },
  ];
  draft.edges = [
    ['start', 'document'],
    ['document', 'review'],
    ['review', 'save', 'yes', '수락'],
    ['review', 'feedback', 'no', '수정 요청'],
    ['feedback', 'document'],
    ['save', 'end'],
  ].map(([source, target, sourceHandle, label], i) => ({
    id: `edge-${i}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle, label } : {}),
    origin: 'inferred',
    evidence: [],
  }));
  await page.getByRole('textbox', { name: '유저플로우 JSON' }).fill(JSON.stringify(draft, null, 2));
  await page.getByRole('button', { name: 'JSON 저장', exact: true }).click();
  await expect(page.locator('.user-flow-card')).toHaveCount(7);
  await page.getByRole('button', { name: 'AI 패널 표시 전환', exact: true }).click();
  await page.locator('.user-flow-canvas .react-flow__controls-fitview').click();
  await settleFrames();
  await page.locator('.user-flow-canvas .react-flow__controls-zoomin').click();
  await page.locator('.user-flow-canvas .react-flow__controls-zoomin').click();
  await settleFrames();
  await page.mouse.move(720, 25);
  await page.keyboard.press('Escape');
  const flowCanvas = await page.locator('.user-flow-canvas').boundingBox();
  const bounds = await page.locator('.user-flow-canvas .react-flow__node').evaluateAll((nodes) => {
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
    };
  });
  const centerX = flowCanvas.x + flowCanvas.width / 2;
  await page.mouse.move(centerX, flowCanvas.y + 20);
  await page.mouse.down();
  await page.mouse.move(centerX + centerX - (bounds.left + bounds.right) / 2, flowCanvas.y + 20, {
    steps: 12,
  });
  await page.mouse.up();
  await page.mouse.move(720, 25);
  await settleFrames();
  await page.screenshot({ path: 'docs/images/user-flow-foundation.png' });
  await page.getByRole('button', { name: 'AI 패널 표시 전환', exact: true }).click();
  await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
  await expect(page.getByLabel('AI 제공자')).toBeEnabled();
  await page.getByLabel('AI 제공자').selectOption('claude');
  await expect(page.getByRole('dialog', { name: 'Claude 연결 설정' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Claude 연결 설정' }).getByRole('status'),
  ).toContainText('API 키');
  await expect(page.getByRole('dialog', { name: 'Claude 연결 설정' })).toBeVisible();
  await page.screenshot({ path: 'docs/images/claude-setup.png' });
  console.log('Captured six current UI views using a temporary example; no inference requests.');
} finally {
  if (app) {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  }
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
}
