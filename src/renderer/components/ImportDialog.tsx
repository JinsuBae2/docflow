import type { ImportPreview } from '../../shared/contracts';
import { Dialog } from './Dialog';

export function ImportDialog({
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: ImportPreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog title="Markdown 가져오기 미리보기" onClose={onCancel} locked={busy}>
      <p className="dialog-intro">
        {preview.files.length}개 파일을 새 문서로 저장합니다. 기존 문서와 작성 중인 초안은
        유지됩니다. AI에 전송하지 않습니다.
      </p>
      <div className="import-previews">
        {preview.files.map((file, index) => (
          <article className="import-preview" key={index}>
            <span className="import-filename">{file.name}</span>
            <h3>{file.title}</h3>
            <p>
              {file.characters.toLocaleString()}자 · 섹션 {file.headings}개 · 다이어그램{' '}
              {file.diagrams}개
            </p>
            <pre>{file.excerpt}</pre>
          </article>
        ))}
      </div>
      <p className="dialog-hint">
        한 번에 30개, 파일당 2MB, 전체 10MB까지. 저장 중 오류가 나면 완료된 문서는 유지되며, 다시
        확정할 때 남은 파일만 처리합니다.
      </p>
      <div className="modal-footer">
        <button className="button" disabled={busy} onClick={onCancel}>
          가져오기 취소
        </button>
        <button className="button primary" disabled={busy} onClick={onConfirm}>
          {busy ? '가져오는 중…' : `${preview.files.length}개 문서 가져오기`}
        </button>
      </div>
    </Dialog>
  );
}
