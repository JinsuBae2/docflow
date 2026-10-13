import { it, expect } from 'vitest';
import { prepareImports } from '../../src/main/project/imports';
it('previews multiple Markdown documents without creating files', () => {
  const result = prepareImports([{ name: 'PRD.md', text: '# 내 프로젝트\n## 목표\n로컬 저장' }, { name: 'flow.markdown', text: '# 흐름\n```mermaid\nflowchart LR\nA --> B\n```' }]);
  expect(result.map(f => f.title)).toEqual(['내 프로젝트', '흐름']);
  expect(result[0].headings).toBe(2);
  expect(result[1].diagrams).toBe(1);
  expect(() => prepareImports([{ name: 'bad.exe', text: '# 실행 파일' }])).toThrow(/Markdown/);
  expect(() => prepareImports([{ name: 'large.md', text: '한'.repeat(700000) }])).toThrow(/2MB/);
});
it('rejects empty, excessive, binary, oversized batches and documents whose stored IDs exceed the limit', () => {
  expect(() => prepareImports([])).toThrow(/1~30/);
  expect(() => prepareImports(Array.from({ length: 31 }, () => ({ name: 'x.md', text: '# X' })))).toThrow(/1~30/);
  expect(() => prepareImports([{ name: 'binary.md', text: '# X\0binary' }])).toThrow(/텍스트/);
  expect(() => prepareImports(Array.from({ length: 6 }, () => ({ name: 'x.md', text: 'x'.repeat(1_800_000) })))).toThrow(/10MB/);
  expect(() => prepareImports([{ name: 'limit.md', text: '# Limit\n' + 'x'.repeat(1_999_990) }])).toThrow(/2MB/);
});
