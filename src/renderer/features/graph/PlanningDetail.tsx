import { useLayoutEffect, useRef, useState } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import type { Document } from '../../../shared/contracts';
import type { PlanningItem } from '../../../shared/planning-items';
import type { Rect } from './routing';
import { adjacentDetailPosition } from './planning-layout';
import { Markdown } from '../documents/DocumentView';
export function PlanningDetail({
  item,
  document,
  card,
  width,
  height,
  onClose,
  onSource,
}: {
  item: PlanningItem;
  document: Document;
  card: Rect;
  width: number;
  height: number;
  onClose: () => void;
  onSource: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 280, height: 350 });
  useLayoutEffect(() => {
    const element = panel.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.offsetWidth, height: element.offsetHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, [item.id]);
  const position = adjacentDetailPosition(card, width, height, size.width, size.height);
  return (
    <div
      ref={panel}
      className="planning-detail"
      role="dialog"
      aria-modal="false"
      aria-labelledby="planning-detail-title"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <small>{document.title}</small>
          <h2 id="planning-detail-title">{item.label || item.title}</h2>
        </div>
        <button ref={close} className="icon-button" aria-label="상세보기 닫기" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="prose planning-detail-markdown">
        <Markdown text={item.markdown} />
      </div>
      <footer>
        <small>
          {document.relativePath}
          <br />
          원문 {item.evidence.start}–{item.evidence.end}행 · revision{' '}
          {item.evidence.revision.slice(0, 8)}
        </small>
        <button
          className="text-button"
          onClick={() => onSource(item.evidence.sectionId || document.id)}
        >
          원문 열기 <ArrowUpRight size={13} />
        </button>
      </footer>
    </div>
  );
}
