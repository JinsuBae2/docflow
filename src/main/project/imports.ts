import { basename } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { parseDocument } from './markdown';
import type { ImportInput, ImportFilePreview } from '../../shared/contracts';
export function prepareImports(inputs: ImportInput[]): Array<ImportFilePreview & { text: string }> {
  if (!inputs.length || inputs.length > 30)
    throw new Error('한 번에 1~30개의 Markdown 파일을 선택해 주세요.');
  let total = 0;
  for (const input of inputs) {
    if (!/\.(md|markdown)$/i.test(input.name))
      throw new Error('Markdown 파일(.md, .markdown)만 가져올 수 있습니다.');
    const bytes = Buffer.byteLength(input.text, 'utf8');
    total += bytes;
    if (bytes > 2_000_000) throw new Error(`${input.name}: 2MB 이하의 파일을 선택해 주세요.`);
    if (total > 10_000_000) throw new Error('전체 파일 크기는 10MB 이하여야 합니다.');
    if (input.text.includes('\0')) throw new Error('일반 텍스트 Markdown 파일을 선택해 주세요.');
  }
  return inputs.map((input) => {
    const doc = parseDocument(input.text);
    if (Buffer.byteLength(doc.markdown, 'utf8') > 2_000_000)
      throw new Error(`${input.name}: 문서 식별자를 포함한 저장 크기는 2MB 이하여야 합니다.`);
    const tree = unified().use(remarkParse).parse(input.text);
    return {
      name: basename(input.name),
      title: doc.title,
      characters: input.text.length,
      headings: doc.sections.length,
      diagrams: tree.children.filter((n: any) => n.type === 'code' && n.lang === 'mermaid').length,
      excerpt: input.text.slice(0, 300),
      text: input.text,
    };
  });
}
