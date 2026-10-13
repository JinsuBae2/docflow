import type { DocumentLink } from '../../shared/contracts';
const statusLabels: Record<DocumentLink['status'], string> = {
  resolved: '이동 가능',
  unregistered: '미등록 · 추가하기',
  missing: '파일 없음',
  'missing-anchor': '앵커 없음',
  external: '외부 URL · 확인 후 열기',
  blocked: '차단됨',
};
export function DocumentLinksPanel({
  links,
  busy,
  onLink,
  onRefresh,
}: {
  links: DocumentLink[];
  busy: boolean;
  onLink: (link: DocumentLink) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="document-links-panel" aria-label="원문 링크 목록">
      <div className="action-row">
        <h3>원문 링크</h3>
        <button className="text-button" disabled={busy} onClick={onRefresh}>
          링크 새로고침
        </button>
      </div>
      {!links.length && <p className="muted">원문에 작성된 Markdown 링크가 없습니다.</p>}
      {links.map((link) => (
        <div className="document-link-row" key={link.id}>
          <button className="text-button" disabled={busy} onClick={() => onLink(link)}>
            {link.label || link.href}
          </button>
          <small>
            {statusLabels[link.status]} · {link.line}행
          </small>
          <code>{link.href}</code>
          {link.reason && <p>{link.reason}</p>}
        </div>
      ))}
    </section>
  );
}
