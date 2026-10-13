import { useState } from 'react';
import type { DocumentRegistrationPreview } from '../../shared/contracts';
import { Dialog } from './Dialog';

export function DocumentRegistrationDialog({
  preview,
  busy,
  onCancel,
  onConfirm,
  onChoose,
}: {
  preview: DocumentRegistrationPreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (paths: string[]) => void;
  onChoose: (kind: 'files' | 'folder') => void;
}) {
  const eligible = preview.files.filter((file) => !file.reason);
  const [selected, setSelected] = useState<string[]>([]);
  const bytes = eligible
    .filter((file) => selected.includes(file.path))
    .reduce((sum, file) => sum + file.bytes, 0);
  const overLimit = selected.length > 30 || bytes > 10_000_000;
  return (
    <Dialog title="프로젝트 원본 문서 등록" onClose={onCancel} locked={busy}>
      <p className="dialog-intro">
        발견한 문서를 추가할까요? 선택한 원본 파일을 연결합니다. 등록만으로 본문을 바꾸거나 AI에
        전송하지 않습니다.
      </p>
      <p className="dialog-hint">프로젝트: {preview.root}</p>
      <div className="action-row registration-tools">
        <button
          className="button compact"
          disabled={busy}
          onClick={() =>
            setSelected(
              selected.length === eligible.length ? [] : eligible.map((file) => file.path),
            )
          }
        >
          전체 선택 / 해제
        </button>
        <button className="button compact" disabled={busy} onClick={() => onChoose('files')}>
          파일 직접 선택
        </button>
        <button className="button compact" disabled={busy} onClick={() => onChoose('folder')}>
          폴더 직접 선택
        </button>
      </div>
      {!preview.files.length && (
        <p>발견한 docs 문서가 없습니다. 프로젝트 내부 파일이나 폴더를 직접 선택할 수 있습니다.</p>
      )}
      <div className="import-previews">
        {preview.files.map((file) => (
          <label className="import-preview registration-file" key={file.path}>
            <input
              type="checkbox"
              aria-label={file.path}
              disabled={busy || !!file.reason}
              checked={selected.includes(file.path)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, file.path]
                    : selected.filter((path) => path !== file.path),
                )
              }
            />
            <span>
              <strong>{file.path}</strong>
              <small>
                {file.bytes.toLocaleString()} bytes
                {file.reason ? ` · ${file.reason}` : ' · 원본 연결 가능'}
              </small>
            </span>
          </label>
        ))}
      </div>
      {preview.warnings.map((warning, index) => (
        <p className="dialog-hint" key={index}>
          {warning}
        </p>
      ))}
      <p className="dialog-hint">
        한 번에 30개·파일당 2MB·전체 10MB까지. 프로젝트 밖 파일은 기존 Markdown 가져오기로 사본을
        추가하세요. 편집 후 저장하면 표시된 원본 경로에 반영됩니다.
      </p>
      {overLimit && <p role="alert">선택 한도를 초과했습니다. 문서 수와 크기를 줄여 주세요.</p>}
      <div className="modal-footer">
        <button className="button" disabled={busy} onClick={onCancel}>
          문서 등록 취소
        </button>
        <button
          className="button primary"
          disabled={busy || !selected.length || overLimit}
          onClick={() => onConfirm(selected)}
        >
          {selected.length}개 원본 문서 등록
        </button>
      </div>
    </Dialog>
  );
}
