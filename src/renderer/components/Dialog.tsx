import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  title,
  onClose,
  children,
  locked = false,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  locked?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <section
        ref={ref}
        className="modal utility-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !locked) {
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Tab') {
            const elements = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input, select, textarea, [tabindex="0"]',
              ),
            ];
            const first = elements[0];
            const last = elements.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last || document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            aria-label={closeLabel || (title === 'Codex 연결 설정' ? '안내 닫기' : '미리보기 닫기')}
            title="닫기"
            disabled={locked}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
