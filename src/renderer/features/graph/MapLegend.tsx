export function MapLegend({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <section className="map-legend" role="region" aria-label="지도 범례">
      <button
        className="text-button"
        aria-label={collapsed ? '범례 펼치기' : '범례 접기'}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        지도 범례 {collapsed ? '＋' : '−'}
      </button>
      {!collapsed && (
        <>
          <p>
            <i className="legend-line" />
            실선 — 문서 구조
          </p>
          <p>
            <i className="legend-line dashed" />
            점선 — 문맥 관계
          </p>
          <p>
            <span className="map-pending-badge">AI 제안</span> 미확정
          </p>
        </>
      )}
    </section>
  );
}
