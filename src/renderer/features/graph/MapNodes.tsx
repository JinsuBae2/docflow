import { Handle, Position, type Node, type NodeProps, type NodeHandle } from '@xyflow/react';
import {
  CARD_WIDTH,
  CARD_HEADER,
  SECTION_ROW_HEIGHT,
  sectionHandle,
  type DocumentCard,
} from '../../../shared/document-map';
export function cardGeometry(card: DocumentCard) {
  const handles: NodeHandle[] = [
    { id: 'left', type: 'target', position: Position.Left, x: 0, y: 48, width: 0, height: 0 },
    {
      id: 'right',
      type: 'source',
      position: Position.Right,
      x: CARD_WIDTH,
      y: 48,
      width: 0,
      height: 0,
    },
    ...card.rows.flatMap((row, index) =>
      (['left', 'right'] as const).map((side) => ({
        id: sectionHandle(row.id, side),
        type: side === 'left' ? ('target' as const) : ('source' as const),
        position: side === 'left' ? Position.Left : Position.Right,
        x: side === 'left' ? 0 : CARD_WIDTH,
        y: CARD_HEADER + index * SECTION_ROW_HEIGHT + SECTION_ROW_HEIGHT / 2,
        width: 0,
        height: 0,
      })),
    ),
  ];
  return { width: CARD_WIDTH, height: card.height, handles };
}
export type MapFlowNode = Node<
  {
    card: DocumentCard;
    expanded: boolean;
    onToggle: () => void;
    onExpand: () => void;
    onOpen: (id: string) => void;
    onFocus: () => void;
  },
  'map'
>;
export function MapNodeCard({ data }: NodeProps<MapFlowNode>) {
  const card = data.card;
  return (
    <div className="map-card map-document">
      <header className="map-card-header">
        <strong title={card.node.title}>{card.node.title}</strong>
        <div className="map-card-actions nodrag nopan">
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onOpen(card.node.id);
            }}
          >
            원문 열기
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onFocus();
            }}
          >
            집중 보기
          </button>
          {!!card.sectionCount && (
            <button
              aria-label={card.collapsed ? '소제목 펼치기' : '소제목 접기'}
              aria-expanded={!card.collapsed}
              onClick={(e) => {
                e.stopPropagation();
                data.onToggle();
              }}
            >
              {card.collapsed ? '펼치기' : '접기'}
            </button>
          )}
        </div>
      </header>
      {card.rows.map((row) => (
        <div className="map-section-row" key={row.id}>
          <button
            className="nodrag nopan"
            title={row.title}
            onClick={(e) => {
              e.stopPropagation();
              data.onOpen(row.id);
            }}
          >
            {row.title}
          </button>
        </div>
      ))}
      {!!card.sectionCount && (
        <button
          className="map-more-sections nodrag nopan"
          disabled={card.collapsed}
          onClick={(e) => {
            e.stopPropagation();
            data.onExpand();
          }}
        >
          {card.collapsed
            ? `${card.sectionCount}개 섹션 접힘`
            : data.expanded
              ? '핵심 섹션만 보기'
              : card.hiddenCount
                ? `+ 외 ${card.hiddenCount}개 섹션`
                : '연결된 모든 섹션'}
        </button>
      )}
      {cardGeometry(card).handles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          style={{ top: handle.y }}
        />
      ))}
    </div>
  );
}
