import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const descriptions: Record<string, string> = {
  '프로젝트 만들기':
    '프로젝트를 저장할 폴더를 선택합니다. 문서와 변경 처리 이력을 이 폴더에 보관합니다.',
  '폴더 열기': '기존 Docflow 프로젝트 폴더를 선택해 저장된 문서와 처리 이력을 불러옵니다.',
  '예제 프로젝트 열기':
    '예제 문서 3개와 연결 관계가 있는 로컬 프로젝트를 엽니다. 기존 프로젝트는 유지됩니다.',
  'Markdown 파일로 시작': '저장 폴더를 먼저 선택한 뒤 Markdown 파일을 여러 개 미리보고 가져옵니다.',
  '직접 작성': '새 문서 이름과 유형을 지정하고 직접 내용을 작성합니다.',
  '문서 만들기': '입력한 이름과 유형으로 빈 Markdown 문서를 로컬 프로젝트에 저장합니다.',
  'AI와 시작': '프로젝트 아이디어를 적을 수 있도록 AI 요청 입력란에 초점을 맞춥니다.',
  'AI로 생성':
    '현재 문서의 맥락으로 흐름도 생성을 요청하는 문장을 준비합니다. 보내기를 눌러야 전송됩니다.',
  '사용자 흐름 생성': 'Mermaid 흐름도 문서 생성을 요청할 문장을 입력란에 준비합니다.',
  '제안 수정 요청':
    '이전 제안에서 바꿀 내용을 입력합니다. 수정 요청을 보내면 새 제안을 받아 비교합니다.',
  '이유 남기기': '거절 이유 입력란을 엽니다. 거절 확정 후 후속 요청에 이 사유를 전달합니다.',
  '거절 확정': '작성한 이유와 함께 제안을 거절하고 처리 이력에 저장합니다.',
  '수정 요청 보내기': '이전 제안과 수정 지시를 선택한 AI 제공자로 전달해 후속 제안을 요청합니다.',
  '연결 저장': '선택한 두 문서 사이에 지정한 유형의 관계를 저장합니다.',
  취소: '새 문서 작성을 취소하고 현재 문서로 돌아갑니다.',
  확인: '맥락 미리보기를 닫습니다. 이 동작은 AI 요청을 보내지 않습니다.',
  '안내 닫기':
    '첫 실행 안내를 닫습니다. 입력란 아래 모델 이름으로 언제든 연결 설정을 다시 열 수 있습니다.',
  '미리보기 닫기': '가져오기 목록을 취소하고 현재 문서로 돌아갑니다. 파일은 저장하지 않습니다.',
  'zoom in': '문서 구조를 확대해 문서와 관계 이름을 읽습니다.',
  'zoom out': '문서 구조를 축소해 연결 구조를 살펴봅니다.',
  'fit view': '문서 구조의 글씨가 읽히는 크기를 유지하며 문서 구조를 정렬합니다.',
  '프로젝트 열기': '기존 프로젝트 폴더를 엽니다. 저장하지 않은 변경이 있으면 이동 전에 확인합니다.',
  '프로젝트 설정': '프로젝트 이름, 목표와 제약을 편집하고 확정된 결정을 확인합니다.',
  'Markdown 가져오기':
    'Markdown 파일을 여러 개 선택하고 내용을 미리본 뒤 새 문서로 저장합니다. 파일을 이 창에 끌어놓을 수도 있습니다.',
  '새 문서': '이름과 유형을 정해 새 로컬 문서를 만듭니다.',
  '문서 목록 표시 전환': '문서 목록과 목차를 접거나 펼쳐 읽기 공간을 조절합니다.',
  'AI 패널 표시 전환': '대화와 변경 제안 패널을 접거나 펼칩니다.',
  'AI 연결 설정':
    'Codex 또는 Claude 연결 방법과 상태를 확인하고, 연결된 계정에서 조회한 AI 모델을 선택합니다.',
  'AI 연결 확인':
    '선택한 AI 제공자의 연결 상태를 다시 확인합니다. 문서나 생성 요청은 전송하지 않습니다.',
  '키 저장 및 연결 확인':
    'Claude API 키를 OS 보안 저장소로 암호화한 뒤 모델 목록을 조회합니다. 문서 생성 요청은 보내지 않습니다.',
  '저장된 키 삭제':
    '앱이 보관한 Claude API 키를 삭제합니다. 외부에 설정한 환경 변수는 삭제하지 않습니다.',
  'Markdown 편집':
    '현재 문서의 Markdown 원문을 편집합니다. 저장하기 전에는 원본이 바뀌지 않습니다.',
  미리보기: '편집을 마치고 문서 보기로 돌아갑니다. 저장하지 않은 변경은 확인 후 취소합니다.',
  저장: '현재 초안을 로컬 문서에 저장합니다. 외부 변경과 충돌하면 초안을 유지합니다. ⌘/Ctrl+S',
  '변경 취소': '저장하지 않은 편집 내용을 확인 후 취소하고 원래 문서로 돌아갑니다.',
  '문서 구조':
    '기획 문서를 펼쳐 항목과 원문 근거를 확인합니다. 연결 탐색에서는 문서 사이의 관계를 편집합니다.',
  문서: '선택한 문서와 목차, 연결된 문서를 읽습니다.',
  '사용자 흐름': '문서 속 흐름과 AI 유저플로우를 탐색하고 검토합니다.',
  '요청 보내기':
    '확인한 문서 맥락과 요청을 Codex로 보냅니다. 변경은 제안으로만 표시됩니다. ⌘/Ctrl+Enter',
  '요청 취소': '진행 중인 AI 요청을 중단합니다. 기존 문서와 처리 이력은 유지됩니다.',
  '제안 수락': '변경 비교를 확인한 제안을 문서에 반영하고 수락 이력을 저장합니다.',
  '제안 거절': '제안을 반영하지 않고 거절 이력을 저장합니다. 후속 AI 요청의 맥락에 포함됩니다.',
  'Markdown 내보내기':
    '모든 문서를 선택한 폴더의 새 하위 폴더로 내보냅니다. 기존 파일을 덮어쓰지 않습니다.',
  '새 프로젝트': '선택한 폴더에 로컬 프로젝트를 만들거나 기존 프로젝트를 엽니다.',
  '연결 추가': '기준 문서, 대상 문서와 관계 유형을 정해 연결을 저장합니다.',
  '연결 해제': '이 관계만 제거합니다. 연결된 문서는 삭제하지 않습니다.',
  축소: '흐름도를 축소해 더 넓은 범위를 봅니다.',
  확대: '흐름도를 확대해 노드와 연결의 글자를 읽습니다.',
  '배율 초기화': '흐름도를 화면에 맞는 기본 배율로 되돌립니다.',
  'AI 검토':
    '누락이나 결정과의 모순을 검토하는 요청을 입력란에 준비합니다. 보내기를 눌러야 전송됩니다.',
  대화: '이 프로젝트에 저장된 AI 요청과 응답을 확인합니다.',
  제안: '변경 비교와 근거를 확인하고 제안을 수락하거나 거절합니다.',
  '연결 다시 확인':
    '선택한 제공자의 연결 상태와 계정에서 사용할 수 있는 모델 목록을 새로 조회합니다.',
  '설정 저장': '선택한 AI 모델을 앱 설정에 저장합니다. 다음 실행에도 유지됩니다.',
  닫기: '현재 안내나 창을 닫고 작업으로 돌아갑니다.',
  '가져오기 취소': '미리보기 목록을 폐기합니다. 아직 확정하지 않은 파일은 저장하지 않습니다.',
};

// Delegation also covers dynamically rendered document, proposal and flow controls.
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(
    null,
  );
  useEffect(() => {
    let target: HTMLElement | null = null;
    let previous: string | null = null;
    const hide = () => {
      if (target) {
        if (previous) target.setAttribute('aria-describedby', previous);
        else target.removeAttribute('aria-describedby');
      }
      target = null;
      setTip(null);
    };
    const show = (event: Event) => {
      const button = (event.target as Element)?.closest<HTMLElement>('button');
      if (!button || button === target) return;
      hide();
      const label =
        button.getAttribute('aria-label') ||
        button.getAttribute('title') ||
        button.textContent?.trim() ||
        '';
      if (!label) return;
      const text =
        button.dataset.tooltip ||
        descriptions[label] ||
        (button.closest('.section-nav')
          ? `${label} 섹션으로 이동합니다.`
          : button.closest('.document-nav, .related-documents, .relation-row, .source-links')
            ? `${label} 문서를 열어 원문을 확인합니다.`
            : button.closest('.suggestion-actions') ||
                label.includes('AI로') ||
                label.includes('생성')
              ? `${label}: 요청을 입력란에 준비합니다. 보내기를 누르기 전에는 AI에 전송하지 않습니다.`
              : label.includes('맥락 확인')
                ? 'AI에 전달할 문서와 처리 이력을 미리보고, 제외할 문서를 선택합니다.'
                : `${label} 작업을 실행합니다.`);
      const rect = button.getBoundingClientRect();
      const width = Math.min(320, innerWidth - 24);
      target = button;
      previous = button.getAttribute('aria-describedby');
      button.setAttribute(
        'aria-describedby',
        [previous, 'docflow-tooltip'].filter(Boolean).join(' '),
      );
      setTip({
        text,
        x: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 12)),
        y: rect.bottom + 8,
        above: rect.bottom > innerHeight - 120,
      });
    };
    const leave = (event: Event) => {
      const related = (event as MouseEvent).relatedTarget;
      if (target && (!(related instanceof Node) || !target.contains(related))) hide();
    };
    const scroll = (event: Event) => {
      if (
        target &&
        (event.target === document ||
          (event.target instanceof Node && event.target.contains(target)))
      )
        hide();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && target) {
        if (!(event.target instanceof Element && event.target.closest('[role="dialog"]')))
          event.stopImmediatePropagation();
        hide();
      }
    };
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', leave);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', scroll, true);
    return () => {
      hide();
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', leave);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('resize', hide);
      document.removeEventListener('scroll', scroll, true);
    };
  }, []);
  return tip
    ? createPortal(
        <div
          id="docflow-tooltip"
          role="tooltip"
          className="tooltip"
          style={{
            left: tip.x,
            top: tip.above ? undefined : tip.y,
            bottom: tip.above ? innerHeight - tip.y + 44 : undefined,
          }}
        >
          {tip.text}
        </div>,
        document.body,
      )
    : null;
}
