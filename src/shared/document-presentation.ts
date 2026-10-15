import type { DocumentType } from './contracts';
const collator = new Intl.Collator('ko', { numeric: true });
export const compareDocuments = (a: { title: string }, b: { title: string }) =>
  collator.compare(a.title, b.title);
const labels: Record<DocumentType, string> = {
  note: '',
  overview: '개요',
  prd: 'PRD',
  feature: '기능 명세',
  design: '설계',
  flow: '흐름',
};
export function displayDocumentType(document: {
  title: string;
  type: DocumentType;
  relativePath?: string;
}) {
  if (document.type !== 'note') return labels[document.type];
  const name = `${document.title} ${document.relativePath?.split(/[\\/]/).pop() || ''}`;
  for (const [pattern, label] of [
    [/아키텍처|architecture/i, '아키텍처'],
    [/\bapi\b/i, 'API'],
    [/데이터|database|schema/i, '데이터'],
    [/기능.?명세|feature.?spec/i, '기능 명세'],
    [/\bprd\b|요구사항/i, 'PRD'],
    [/개요|overview|readme/i, '개요'],
  ] as const)
    if (pattern.test(name)) return label;
  return '';
}
