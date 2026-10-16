import { describe, expect, it } from 'vitest';
import { parseLinkedDocument } from '../../src/main/project/markdown';
import {
  extractPlanningItems,
  planningCategory,
  groupPlanningDocuments,
} from '../../src/shared/planning-items';

let sequence = 0;
const doc = (text: string, title = '요구사항 명세서') =>
  parseLinkedDocument(text, {
    id: `doc-${++sequence}`,
    type: 'note',
    relativePath: 'documents/spec.md',
    title,
  });
describe('planning document items', () => {
  it('extracts requirement rows in source order with exact evidence and markdown', () => {
    const document = doc(
      '# 요구사항\n## 인증\n| ID | 요구사항 | 우선 |\n|---|---|---|\n| FR-A-01 | **인증** 및 `토큰` 확인 | P0 |\n| FR-A-02 | A\\|B 지원 | P1 |',
    );
    const items = extractPlanningItems(document);
    expect(items.map((item) => item.label)).toEqual(['FR-A-01', 'FR-A-02']);
    expect(items[0].markdown).toContain('**인증**');
    expect(items[1].markdown).toContain('A\\|B');
    expect(items[0].evidence).toMatchObject({
      documentId: document.id,
      revision: document.revision,
      sectionId: document.sections[1].id,
    });
    expect(document.markdown.split(/\r?\n/)[items[0].evidence.start - 1]).toContain('FR-A-01');
  });
  it('supports API columns and ignores tables inside code fences', () => {
    const items = extractPlanningItems(
      doc(
        '# API\n| 메서드 | 경로 | 설명 |\n|---|---|---|\n| POST | /api/events | 수집 |\n\n```md\n| FR-FAKE-01 | 가짜 |\n```',
        'API 명세서',
      ),
    );
    expect(items.map((item) => item.label)).toEqual(['POST /api/events']);
  });
  it('uses list items when no structured IDs exist and preserves CRLF source lines', () => {
    const document = doc(
      '# 기능\r\n## 목록\r\n- 첫 기능 **강조**\r\n- 둘째 기능\r\n',
      '기능 명세서',
    );
    const items = extractPlanningItems(document);
    expect(items.map((item) => item.title)).toEqual(['첫 기능 강조', '둘째 기능']);
    expect(items[0].markdown).toContain('**강조**');
    expect(document.markdown.split(/\r?\n/)[items[0].evidence.start - 1]).toContain('첫 기능');
  });
  it('falls back to leaf sections and supports text without headings', () => {
    const sections = extractPlanningItems(
      doc('# 설계\n## 구성\n### API\n내용\n### 저장소\nDB', '아키텍처'),
    );
    expect(sections.map((item) => item.title)).toEqual(['API', '저장소']);
    expect(extractPlanningItems(doc('제목 없는 본문')).length).toBe(1);
  });
  it('hides reference documents by default while retaining explicit planning types', () => {
    expect(planningCategory({ title: '11. 연동 가이드', type: 'note' }).core).toBe(false);
    expect(planningCategory({ title: '기타', type: 'prd' }).core).toBe(true);
    expect(planningCategory({ title: 'API specification', type: 'note' }).label).toBe('API');
  });
  it('groups identical source bodies without grouping different documents', () => {
    const a = doc('# 문서\n내용'),
      b = doc('# 문서\n내용');
    a.source = undefined;
    const different = doc('# 문서\n다름');
    const groups = groupPlanningDocuments([a, { ...b, source: 'linked' }, different], true);
    expect(groups).toHaveLength(2);
    expect(groups[0].document.id).toBe(b.id);
    expect(groups[0].members).toHaveLength(2);
    expect(groupPlanningDocuments([a, b], false)).toHaveLength(2);
  });
});
it('treats API integration guides as reference documents and does not group blank drafts', () => {
  expect(planningCategory({ title: 'API 연동 가이드', type: 'note' }).core).toBe(false);
  expect(groupPlanningDocuments([doc(''), doc('')], true)).toHaveLength(2);
});
it('retains a full endpoint section when a later index repeats its ID', () => {
  const items = extractPlanningItems(
    doc(
      '# API\n## POST /api/events\n```json\n{"events":[]}\n```\n## 목록\n| 메서드·경로 | 설명 |\n|---|---|\n| POST /api/events | 수집 |',
      'API 명세서',
    ),
  );
  expect(items).toHaveLength(1);
  expect(items[0].markdown).toContain('```json');
});
it('maps complete API section evidence and accepts project-specific requirement IDs', () => {
  const api = doc('# API\n## GET /api/status\n내용\n```json\n{}\n```', 'API');
  const item = extractPlanningItems(api)[0];
  expect(item.evidence.end).toBe(
    api.sections[1].line + api.sections[1].content.split(/\r?\n/).length - 1,
  );
  expect(
    extractPlanningItems(doc('# 요구\n| ID | 내용 |\n|---|---|\n| R001 | 로그인 |'))[0].label,
  ).toBe('R001');
});
it('preserves complete suffix requirement IDs', () => {
  const ids = extractPlanningItems(
    doc('# 요구\n| ID | 내용 |\n|---|---|\n| FR-001-A | 첫째 |\n| FR-001-B | 둘째 |'),
  );
  expect(ids.map((item) => item.label)).toEqual(['FR-001-A', 'FR-001-B']);
});
it('includes nested request and response after an earlier API index', () => {
  const api = doc(
    '# API\n| 메서드·경로 | 설명 |\n|---|---|\n| POST /events | 수집 |\n## POST /events\n### 요청\n```json\n{}\n```\n### 응답\n성공\n## GET /status\n상태',
    'API',
  );
  const items = extractPlanningItems(api);
  expect(items[0].markdown).toContain('### 요청');
  expect(items[0].markdown).toContain('### 응답');
  expect(items[0].markdown).not.toContain('GET /status');
  expect(items[0].evidence.end).toBe(api.sections.find((s) => s.title === 'GET /status')!.line - 1);
});
