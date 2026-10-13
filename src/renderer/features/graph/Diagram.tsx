import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { AlertCircle, GitBranch, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { Document } from '../../../shared/contracts';
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  themeVariables: {
    fontFamily: 'Apple SD Gothic Neo, Aptos, sans-serif',
    fontSize: '16px',
    primaryColor: '#eaf1ff',
    primaryTextColor: '#1d2939',
    primaryBorderColor: '#155eef',
    lineColor: '#526581',
    secondaryColor: '#eef2f8',
    tertiaryColor: '#fff2d6',
  },
  flowchart: { htmlLabels: false, curve: 'linear', nodeSpacing: 42, rankSpacing: 64, padding: 18 },
});
export function Diagram({
  documents,
  staleIds,
  onSource,
  onGenerate,
}: {
  documents: Document[];
  staleIds: string[];
  onSource: (id: string) => void;
  onGenerate: () => void;
}) {
  const blocks = documents.flatMap((doc) =>
    unified()
      .use(remarkParse)
      .parse(doc.markdown)
      .children.filter((node: any) => node.type === 'code' && node.lang === 'mermaid')
      .map((node: any, index) => ({ id: doc.id + '-' + index, doc, code: node.value })),
  );
  const [chosen, setChosen] = useState('');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const block = blocks.find((b) => b.id === chosen) || blocks[0];
  useEffect(() => {
    let active = true;
    setError('');
    setSvg('');
    setZoom(1);
    if (!block) return;
    if (
      !/^\s*(flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/.test(block.code) ||
      /%%\{|\b(click|href|callback)\b|<\/?(script|iframe|foreignObject)/i.test(block.code)
    ) {
      setError('첫 버전에서는 실행 링크 없는 흐름도만 표시합니다.');
      return;
    }
    void mermaid
      .render('diagram-' + crypto.randomUUID(), block.code)
      .then((result) => {
        if (active) setSvg(result.svg);
      })
      .catch(() => {
        if (active) setError('흐름도 문법을 확인해 주세요. 원문은 보존되어 있습니다.');
      });
    return () => {
      active = false;
    };
  }, [block?.id, block?.code]);
  return (
    <div className="diagram-view">
      <div className="view-heading">
        <div>
          <h1>다이어그램</h1>
          <span>프로젝트의 사용자 흐름</span>
        </div>
        <button className="button compact" onClick={onGenerate}>
          <GitBranch size={14} />
          AI로 생성
        </button>
      </div>
      {block ? (
        <>
          <div className="diagram-toolbar">
            <select
              aria-label="표시할 다이어그램"
              value={block.id}
              onChange={(e) => {
                setChosen(e.target.value);
                setZoom(1);
              }}
            >
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.doc.title}
                </option>
              ))}
            </select>
            <div className="action-row">
              <button
                className="icon-button"
                title="축소"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
              >
                <ZoomOut size={16} />
              </button>
              <button
                className="icon-button"
                title="확대"
                onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
              >
                <ZoomIn size={16} />
              </button>
              <button className="icon-button" title="배율 초기화" onClick={() => setZoom(1)}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          {staleIds.includes(block.doc.id) && (
            <div className="inline-warning">
              <AlertCircle size={14} />
              근거 문서가 변경되었습니다. 다이어그램 갱신을 검토해 주세요.
            </div>
          )}
          {error ? (
            <div className="empty-state">
              <AlertCircle size={28} />
              <p>{error}</p>
            </div>
          ) : (
            <div className="diagram-scroll">
              <div
                ref={canvas}
                className="diagram-canvas"
                style={{
                  width: `${zoom * 100}%`,
                  height: `${zoom * 100}%`,
                  minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          )}
          <div className="diagram-source">
            <span>원문</span>
            <button onClick={() => onSource(block.doc.id)}>{block.doc.title}</button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <GitBranch size={32} />
          <h3>아직 다이어그램이 없습니다</h3>
          <button className="button" onClick={onGenerate}>
            사용자 흐름 생성
          </button>
        </div>
      )}
    </div>
  );
}
