# Docflow는 어떻게 만들었나요?

## 출발점

기획 문서가 여러 파일로 나뉘면 관련 근거와 결정이 흩어집니다. Docflow는 문서를 읽고 연결 관계를 탐색하면서 AI 제안을 원본과 비교해 반영하는 로컬 작업 도구를 목표로 시작했습니다. 요구사항과 제품 방향은 제작자가 정하고 설계·구현·테스트·문서 작성에 OpenAI Codex를 활용했습니다. 상세 정책은 [AI_USAGE.md](../AI_USAGE.md)를 참고하세요.

## 구현 선택

Electron main이 Markdown 파일, SQLite 메타데이터, AI 제공자와 IPC를 관리합니다. React renderer는 제한된 preload API로만 작업합니다. 문서는 Markdown으로 남기고 ID, revision, 관계, 제안 처리 이력은 함께 보관합니다. 문서를 외부 편집기로 수정할 수 있으므로 충돌 확인과 중단된 저장 복구가 필요했습니다.

AI가 반환한 내용을 바로 파일에 쓰지 않고, 구조 검증 → 근거와 변경 비교 → 사용자 수락 → 저장 순서로 처리합니다. 수락·거절 이력도 후속 맥락에 포함합니다. AI에는 명령 실행이나 프로젝트 파일 탐색 도구를 제공하지 않습니다.

Codex는 사용자가 설치한 CLI의 app-server에 연결하고, Claude는 main에서 Anthropic API에 직접 연결합니다. Claude 요청에는 공급한 맥락과 응답 스키마만 포함하며 도구 정의는 전송하지 않습니다. 제공자별 모델 선택을 분리해 기존 Codex 설정을 보존합니다.

## 프로젝트 이해와 맥락 선택

브리핑은 문서 유형·파일명, 확정 연결, 흐름과 제안 상태를 순수 함수로 집계합니다. AI 요약과 분리하며 마지막 편집 보기를 바꾸지 않고 다시 열 수 있는 진입점입니다.

맥락 선택은 직렬화 예산 안에서 원문 전체 또는 정확한 UTF-16 범위를 고릅니다. 필수 문서의 메타데이터 공간을 먼저 확보하고 관련 섹션을 우선 배분합니다. 선택/제외 내역은 로컬 UI에만 표시하고 제공자 payload에서 제외합니다. 빈 근거 검사는 IPC와 각 제공자 양쪽에 두며, 검토 후 전송 시 소스 revision·범위·프로젝트·수정 대상이 같아야 합니다.

앱 전용 지침은 짧은 기획 설명·확인된 문서 근거·제안 카드로 응답하도록 요구합니다. Codex 임시 작업 디렉터리에서 `project_doc_max_bytes=0`, 빈 fallback 목록, 앱 소유 `developer_instructions`/`model_instructions_file`과 thread 지침을 사용해 로컬 AGENTS·개발자 보고서 지침의 상속을 차단합니다. 로그인과 사용자 설정 파일을 수정하지 않습니다. 설정 의미는 [공식 설정 참조](https://learn.chatgpt.com/docs/config-file/config-reference)와 [AGENTS 탐색 규칙](https://learn.chatgpt.com/docs/config-file/config-advanced#project-instructions-discovery)을 따릅니다.

구조화 AI 응답의 생성 스키마는 모든 속성을 required로 선언하고, 로컬 선택 속성은 nullable로 표현합니다. 제공자 응답에서 선언된 선택 속성의 null만 제거한 뒤 기존 엄격한 파서로 검증합니다. 필수 속성의 null·미등록 키는 계속 거부하며, 저장하는 유저플로우 JSON의 선택 속성 규칙은 바꾸지 않습니다. 이는 [Structured Outputs의 필수 필드 규칙](https://developers.openai.com/api/docs/guides/structured-outputs)을 따릅니다.

## 빈 프로젝트의 기획 세션

아이디어 기획은 문서 근거 검토와 별도 세션으로 처리합니다. 기존 SQLite records에 `planning` 레코드를 저장하고 단계·확정 내용·열린 질문·가정과 요청 ID를 보관합니다. 사용자 메시지는 제공자 연결 전에 저장하며 실패·취소에도 유지합니다. 같은 세션의 대화만 다음 요청에 넣고 긴 대화는 완전한 턴 단위로 선별합니다. 사용자 예산 입력 없이 맥락 크기를 자동 관리하며 전체 기록은 로컬에 남깁니다.

기획 전용 응답 schema는 두 제공자에 공통 적용합니다. 토론에서는 질문과 정리를, 문서화 요청에서는 create 제안을 받습니다. AI 정리는 pendingBrief 후보로만 저장하고 사용자 반영 후 확정하며, 문서 생성은 기존 ProposalService의 검토·수락 경로를 재사용합니다. 같은 세션의 create 제안만 수정·거절 맥락으로 연결합니다.

## 문서 구조와 사용자 흐름

문서 구조의 기본 기획 펼치기는 Cytoscape로 문서와 원문 순서의 항목을 펼치고 카드 옆 Markdown 상세·근거 이동을 제공합니다. 동일 본문 묶기와 기획 문서 필터는 원본 ID·관계를 바꾸지 않습니다.

연결 탐색은 React Flow 기반 기존 관계 편집입니다. 논리적 문서·섹션 ID와 관계는 보존하고, 화면에는 문서 카드만 투영합니다. 연결된 섹션 행은 원본 ID의 핸들을 사용하고 숨긴 행은 카드 경계로 위임합니다. 확정·미확정 상태를 분리한 연결 묶음은 선택 시 원래 연결로 펼칩니다. 집중 보기는 직접 연결된 문서만 임시 배치하며 이동량을 전체 지도 좌표에 반영합니다.

배선은 Worker의 장애물 회피 경로를 우선 사용하고 대기·실패 시 곡선을 즉시 표시합니다. `map-view`의 `layoutVersion: 2`는 문서 카드 좌표이며, 기존 3열 배치는 첫 저장 때 `map-view-v1` 레코드에 백업합니다. React Flow 노드 크기·핸들 좌표를 선언적으로 제공하고 정렬 옵션 참조를 고정해 DOM 측정·렌더 타이밍에 따른 표시 차이를 줄였습니다. 674px 창에서 집중 카드의 버튼이 캔버스 안에 있는지도 회귀 검증합니다.

유저플로우는 `.workspace/flows/<id>.json`이 기준 데이터입니다. Mermaid와 자동 왕복 변환하지 않으며, AI 제안은 별도 스키마·근거 검증과 캔버스 Diff를 거쳐 사용자가 수락할 때 저장합니다. 문서와 플로우 revision 검사 및 복구 저널로 외부 변경과 저장 중단을 처리합니다. [사용 가이드](workspace-guide.md)와 [JSON 규칙](user-flow-format.md)에 현재 동작을 정리했습니다.

## 디자인과 검증

frontend-design 스킬을 활용해 흑연색 사이드바, 흰 문서 영역, 파란 선택 상태로 구성했습니다. 목차, 문서 구조의 집중 탐색, 사용자 흐름 확대, 변경 비교와 키보드 focus 설명을 중심으로 개선했습니다.

단위·통합 테스트는 저장, 가져오기, 맥락, 응답 검증과 제공자 오류를 확인합니다. Playwright는 Electron을 실행해 문서 작성, 가져오기, 초안 보호, 제안 수락·거절, 모델 설정과 재시작 복원을 확인합니다. 계정 없는 테스트와 실제 서비스 테스트를 구분하며 설치 파일도 별도로 실행합니다.

## 공개 화면 갱신

```sh
npm run build
npm run screenshots
npm run test:e2e -- tests/e2e/flow-proposals.spec.ts tests/e2e/planning.spec.ts tests/e2e/diagram-workspace.spec.ts
```

캡처 스크립트는 임시 예제에 섹션 연결과 시연용 유저플로우를 작성하고 문서·지도·집중 보기·Mermaid·유저플로우·키 없는 Claude 설정 화면을 저장합니다. 개인 프로젝트는 열지 않으며 추론 요청을 보내지 않습니다. AI 변경 검토 이미지는 가짜 제공자 E2E의 `test-results/flow-proposals-*/flow-proposal-diff.png`를 `docs/images/user-flow-proposal-diff.png`로 복사합니다. 아이디어 기획과 문서 다이어그램 확대 이미지는 각 E2E의 `outputs/idea-to-project.png`, `outputs/diagram-workspace-expanded.png`를 확인해 `docs/images/`에 복사합니다. 화면을 직접 확인한 뒤 README의 설명과 함께 갱신합니다.

## Git 이력에 관하여

초기 개발은 세부 커밋 없이 로컬에서 진행됐습니다. 공개 준비 시 기존 앱을 하나의 기준 커밋으로 남겼습니다. 과거 이슈나 PR을 가상으로 재구성하지 않으며 이후부터 실제 변경별 이슈·브랜치·PR·CI 흐름을 사용합니다. `docs/`의 초기 기획과 검증 문서는 당시의 기록으로, 현재 기능과 차이가 있을 수 있습니다. 현재 기능은 README와 소스를 기준으로 확인하세요.

## 다음 과제

코드 서명·공증, 자동 업데이트, 타 플랫폼 실기기 검증, 앱의 Claude API 실계정 검증 등이 남아 있습니다. 프로젝트 브리핑, 원문 발췌·분할 분석과 기획 대화의 턴 단위 선별은 구현했습니다. AI 요약으로 과거 대화를 자동 압축하는 기능은 구현하지 않았습니다. 동시 프로젝트 탭과 Gemini는 현재 지원하지 않습니다. 작업의 구체적 완료 기준은 GitHub 이슈에서 관리합니다.
