import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { Check, Code2, Eye, Pencil, RotateCcw, Save } from 'lucide-react';
import type { Document, EditorDraft, DocumentLink } from '../../../shared/contracts';
export function Markdown({
  text,
  sections = [],
  links = [],
  onLink,
}: {
  text: string;
  sections?: Document['sections'];
  links?: DocumentLink[];
  onLink?: (link: DocumentLink) => void;
}) {
  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    ({ node, children }: any) => (
      <Tag id={sections.find((s) => s.line === node?.position?.start?.line)?.id}>{children}</Tag>
    );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkFrontmatter]}
      skipHtml
      components={{
        h1: heading('h1'),
        h2: heading('h2'),
        h3: heading('h3'),
        h4: heading('h4'),
        h5: heading('h5'),
        h6: heading('h6'),
        a: ({ children, node }) => {
          const link = links.find(
            (link) =>
              link.line === node?.position?.start.line &&
              link.column === node?.position?.start.column,
          );
          return link && onLink ? (
            <button
              className="document-link"
              data-link-status={link.status}
              title={link.reason || link.href}
              onClick={() => onLink(link)}
            >
              {children}
            </button>
          ) : (
            <span className="document-link">{children}</span>
          );
        },
        img: ({ alt }) => <span className="image-placeholder">{alt || '첨부 이미지'}</span>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
export function DocumentView({
  doc,
  initialDraft,
  onDraftChange,
  onSave,
  onDirty,
  links,
  onLink,
}: {
  doc: Document;
  initialDraft?: EditorDraft;
  onDraftChange: (draft: EditorDraft | null) => void;
  onSave: (text: string, revision: string) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  links?: DocumentLink[];
  onLink?: (link: DocumentLink) => void;
}) {
  const [editing, setEditing] = useState(!!initialDraft);
  const [draft, setDraft] = useState(initialDraft?.markdown ?? doc.markdown);
  const [base, setBase] = useState(initialDraft?.baseRevision ?? doc.revision);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== doc.markdown && editing;
  useEffect(() => {
    if (!editing) {
      setDraft(doc.markdown);
      setBase(doc.revision);
    }
  }, [doc.revision, editing]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft, base);
      onDraftChange(null);
      setEditing(false);
      onDirty(false);
    } catch {
      /* The parent displays the error; keep the draft available. */
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="document-surface">
      {doc.source === 'linked' && (
        <p className="linked-document-path" title={doc.relativePath}>
          원본 연결 · 저장 대상: {doc.relativePath}
        </p>
      )}
      <div className="document-actions">
        <span className="document-state">
          <Check size={13} />
          {dirty ? '저장하지 않은 변경' : '로컬에 저장됨'}
        </span>
        <div className="action-row">
          {editing && (
            <>
              <button
                className="icon-button"
                title="변경 취소"
                aria-label="변경 취소"
                onClick={() => {
                  if (!dirty || confirm('작성 중인 변경을 취소할까요?')) {
                    onDraftChange(null);
                    setDraft(doc.markdown);
                    setEditing(false);
                  }
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="button primary compact"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                <Save size={14} />
                {doc.source === 'linked' ? '원본에 저장' : '저장'}
              </button>
            </>
          )}
          <button
            className={'icon-button ' + (editing ? 'selected' : '')}
            title={editing ? '미리보기' : 'Markdown 편집'}
            aria-label={editing ? '미리보기' : 'Markdown 편집'}
            onClick={() => {
              if (!editing) {
                setDraft(doc.markdown);
                setBase(doc.revision);
                setEditing(true);
              } else if (
                !dirty ||
                confirm('저장하지 않은 변경을 취소하고 미리보기로 돌아갈까요?')
              ) {
                onDraftChange(null);
                setEditing(false);
              }
            }}
          >
            {editing ? <Eye size={17} /> : <Pencil size={17} />}
          </button>
        </div>
      </div>
      {doc.needsReconnect && (
        <div className="inline-warning">외부 수정으로 일부 섹션 연결을 다시 확인해야 합니다.</div>
      )}
      {editing && base !== doc.revision && (
        <div className="inline-warning">
          문서가 변경되었습니다. 작성 중인 내용은 보존되며 저장 전 충돌을 확인합니다.
        </div>
      )}
      {editing ? (
        <div className="editor-wrap">
          <div className="editor-label">
            <Code2 size={13} />
            MARKDOWN
          </div>
          <textarea
            className="markdown-editor"
            aria-label="Markdown 본문"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange({ documentId: doc.id, markdown: e.target.value, baseRevision: base });
            }}
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                void save();
              }
            }}
          />
        </div>
      ) : (
        <article className="prose">
          <Markdown text={doc.markdown} sections={doc.sections} links={links} onLink={onLink} />
        </article>
      )}
    </div>
  );
}
