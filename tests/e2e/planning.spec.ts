import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PlanningSessionStore } from '../../src/main/project/planning';
import { ProjectStore } from '../../src/main/project/store';

test('starts a blank software project, carries conversation, restores notes and creates only accepted documents', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-idea-project-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
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
    await expect(
      page.getByRole('button', { name: '브레인스토밍 시작', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '브레인스토밍 시작', exact: true }).click();
    await expect(page.getByRole('heading', { name: '아이디어에서 프로젝트로' })).toBeVisible();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('운영자를 위한 경보 검토 도구');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByText('어떤 사용자의 어떤 문제를 해결하고 싶나요?', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('문서 없이 아이디어 상담', { exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('검토 시간을 줄이고 싶어');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByText('이전 설명을 이어갑니다: 운영자를 위한 경보 검토 도구', { exact: true }),
    ).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.documents).toHaveLength(0);
    await page.getByRole('button', { name: 'AI 정리 반영', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '확정 내용', exact: true })).toHaveValue(
      '운영자를 위한 경보 검토 도구',
    );
    await page.getByRole('combobox', { name: '기획 단계' }).selectOption('requirements');
    await page.getByRole('button', { name: '기획 저장', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '기획 저장됨' })).toBeVisible();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('combobox', { name: '기획 단계' })).toHaveValue('requirements');
    await expect(page.getByRole('textbox', { name: '확정 내용', exact: true })).toHaveValue(
      '운영자를 위한 경보 검토 도구',
    );
    await page.getByRole('button', { name: '문서 초안 작성', exact: true }).click();
    await expect(page.getByRole('button', { name: '제안 수락', exact: true })).toHaveCount(3);
    expect((await page.evaluate(() => window.workspace.current()))!.documents).toHaveLength(0);
    const firstProposal = page.locator('.proposal-pending').first();
    await firstProposal.getByRole('button', { name: '제안 수정 요청', exact: true }).click();
    await firstProposal
      .getByRole('textbox', { name: '수정 요청', exact: true })
      .fill('MVP 범위로 줄여줘');
    await firstProposal.getByRole('button', { name: '수정 요청 보내기', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.workspace.current()))!.proposals.filter(
            (p) => p.status === 'superseded',
          ).length,
      )
      .toBe(1);
    await page.getByRole('button', { name: /^제안(?: \d+)?$/ }).click();
    const rejected = page.locator('.proposal-pending').first();
    await rejected.getByRole('button', { name: '제안 거절', exact: true }).click();
    await rejected
      .getByRole('textbox', { name: '거절 이유', exact: true })
      .fill('구현은 다음 단계로 미뤄줘');
    await rejected.getByRole('button', { name: '보내기', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.workspace.current()))!.feedbacks?.filter(
            (f) => f.status === 'completed',
          ).length,
      )
      .toBe(1);
    await page.getByRole('button', { name: /^제안(?: \d+)?$/ }).click();
    await page.getByRole('button', { name: '제안 수락', exact: true }).first().click();
    await expect
      .poll(async () => (await page.evaluate(() => window.workspace.current()))!.documents.length)
      .toBe(1);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.getByRole('heading', { name: '아이디어에서 프로젝트로' }).scrollIntoViewIfNeeded();
    await page.mouse.move(10, 10);
    await page.screenshot({ path: 'outputs/idea-to-project.png' });
    await page.locator('.view-tabs').getByRole('button', { name: '문서', exact: true }).click();
    await expect(page.locator('.document-surface')).toContainText('운영자를 위한 경보 검토 도구');
    await page.getByRole('button', { name: '아이디어 기획', exact: true }).click();
    await page.getByRole('button', { name: '새 계획 세우기', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '기획 단계' })).toHaveValue('scope');
    await expect(page.getByRole('textbox', { name: '확정 내용', exact: true })).toHaveValue('');
    await expect(page.locator('.chat-messages')).not.toContainText('운영자를 위한 경보 검토 도구');
    const sessions = (await page.evaluate(() => window.workspace.current()))!.planningSessions!;
    await page.getByRole('combobox', { name: '기획 세션' }).selectOption(sessions[0].id);
    await page.getByRole('button', { name: '대화', exact: true }).click();
    await expect(page.locator('.chat-messages')).toContainText('운영자를 위한 경보 검토 도구');
    await page
      .locator('.view-tabs')
      .getByRole('button', { name: '사용자 흐름', exact: true })
      .click();
    await page.getByRole('tab', { name: '유저플로우', exact: true }).click();
    await page.getByRole('button', { name: 'AI로 플로우 생성', exact: true }).click();
    await expect(page.getByRole('button', { name: '검토한 맥락으로 플로우 요청' })).toBeEnabled();
    await expect(page.getByText(/예상 입력/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('keeps long and failed conversations, protects unsaved notes and fits narrow windows', async () => {
  const data = await mkdtemp(join(tmpdir(), 'docflow-planning-long-ui-'));
  const root = join(data, 'project');
  const store = await ProjectStore.open(root);
  const sessions = new PlanningSessionStore(store);
  const session = sessions.start('plan');
  sessions.attachRequest(session.id, 'old');
  store.put('message', {
    id: 'old',
    role: 'user',
    text: '오래된 한국어 대화 👩‍💻'.repeat(7000),
    requestId: 'old',
    createdAt: '',
  });
  store.saveSession({
    selectedId: '',
    view: 'planning',
    planningSessionId: session.id,
    prompt: '',
    collapsed: false,
  });
  store.close();
  await writeFile(join(data, 'settings.json'), JSON.stringify({ root, onboardingDone: true }));
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
    for (const [width, height] of [
      [800, 700],
      [1280, 800],
      [1600, 1050],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('combobox', { name: '기획 단계' })).toBeVisible();
      await page
        .getByRole('button', { name: '문서 초안 작성', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: '문서 초안 작성', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.getByRole('textbox', { name: '확정 내용', exact: true }).fill('저장 전 아이디어');
    await page.evaluate(() => (window.confirm = () => false));
    await page.locator('.view-tabs').getByRole('button', { name: '문서', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '확정 내용', exact: true })).toHaveValue(
      '저장 전 아이디어',
    );
    await page.getByRole('button', { name: '기획 저장', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '기획 저장됨' })).toBeVisible();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('사용량 실패');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('fixture failure');
    await expect(page.getByRole('status').filter({ hasText: '전체 대화 기록' })).toBeVisible();
    const after = (await page.evaluate(() => window.workspace.current()))!;
    expect(after.messages).toHaveLength(2);
    expect(after.messages[0].text.length).toBeGreaterThan(60000);
    expect(after.messages[1].text).toBe('사용량 실패');
    expect(after.planningSessions![0].brief.confirmed).toBe('저장 전 아이디어');
    expect(after.planningSessions![0].pendingBrief).toBeUndefined();
    await page.getByRole('textbox', { name: 'AI에게 요청' }).fill('계속 기획하자');
    await page.getByRole('button', { name: '요청 보내기', exact: true }).click();
    await expect(
      page.getByText('이전 설명을 이어갑니다: 사용량 실패', { exact: true }),
    ).toBeVisible();
    expect((await page.evaluate(() => window.workspace.current()))!.messages).toHaveLength(4);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
