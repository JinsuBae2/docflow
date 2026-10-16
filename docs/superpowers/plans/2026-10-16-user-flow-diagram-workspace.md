# User Flow Diagram Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 이슈 #44의 문서 없는 생성 요청, ERD 미리보기, 좁은 다이어그램 공간을 해결한다.

**Architecture:** 기존 Mermaid·React Flow 및 ContextSnapshot 검토 경로를 사용한다. ProjectDiagrams를 유지한 채 CSS 확대 보기를 적용해 자식 컴포넌트를 재마운트하지 않는다.

**Tech Stack:** React, TypeScript, Electron, Mermaid, React Flow, Vitest, Playwright.

**Spec:** 사용자 승인된 대화 계획과 https://github.com/JinsuBae2/docflow/issues/44. 문서 다이어그램/유저플로우 생성 전 근거를 검토하고, ERD를 안전하게 렌더하며, 캔버스가 남은 공간을 사용한다. 확대 보기 복귀 시 선택·배율·편집 내용을 보존한다.

## Global Constraints

- 문서·DB 스키마·기존 ID·revision·수동 좌표를 변경하지 않는다.
- 실제 계정 AI 요청과 개인 데이터 캡처를 하지 않는다.
- 기존 보안 필터와 명시적 제안 수락 절차를 유지한다.
- 범위는 기존 화면과 요청 경로이며 새 엔진·자동 업데이트·공개 Release는 제외한다.

## Review Focus

- 아이디어 상담 상태에서 문서 생성 진입 시 문서 모드로 전환한다.
- 선택 문서가 없거나 모두 제외돼도 요청은 전송되지 않는다.
- ERD 지원 추가가 실행 링크·HTML·설정 지시문 차단을 약화하지 않는다.
- 확대 보기·목록 접기가 편집기 재마운트나 수동 좌표 저장을 일으키지 않는다.
- 작은 화면과 키보드 조작에서 확대 보기 종료 및 캔버스 조작에 접근할 수 있다.

### Task 1: 문서 다이어그램 지원과 역할 명확화

**Files:** src/shared/flows.ts, src/main/project/flows.ts, src/renderer/features/graph/Diagram.tsx, src/renderer/features/user-flow/ProjectDiagrams.tsx, tests/unit/flows.test.ts, tests/e2e/project-flows.spec.ts 및 기존 이름 참조 테스트.

**Interfaces:** FlowKind에 er를 추가하고 기존 ProjectFlow 계약을 사용한다. parseSimpleFlow는 단순 flowchart 편집만 허용한다.

- [ ] ERD 분류·보안 필터·편집 불가 회귀 테스트를 추가하고 실패를 확인한다.
- [ ] ERD 분류와 미리보기, 형식에 맞는 읽기 전용 안내 및 문서 다이어그램 명칭을 적용한다.
- [ ] `npm test -- tests/unit/flows.test.ts tests/integration/project-flows.test.ts` → 통과.
- [ ] `feat(diagrams): ERD 미리보기와 문서 다이어그램 역할 명확화` 커밋.

### Task 2: 문서 기반 생성 진입점

**Files:** src/renderer/App.tsx, tests/e2e/flow-proposals.spec.ts, tests/e2e/project-flows.spec.ts.

**Interfaces:** 문서 다이어그램 요청은 기존 documentInstructions/schema, 유저플로우 요청은 flowId 및 flowInstructions/schema를 유지한다. 공통 검토 함수는 현재 문서·포함·제외 상태를 명시적으로 전달한다.

- [ ] 아이디어 상담 상태의 두 문서 생성 진입점이 근거 검토를 열고 문서 없는 전송을 막는 E2E를 추가하고 실패를 확인한다.
- [ ] 기존 유저플로우 검토 경로를 공유하며 문서 다이어그램 생성과 사용자 흐름 정리에 적용한다.
- [ ] 관련 Electron E2E → 통과. 기존 문서/플로우 제안의 수락 계약 보존 확인.
- [ ] `fix(flows): 문서 기반 생성 전 근거 검토 통일` 커밋.

### Task 3: 캔버스 공간과 확대 보기

**Files:** src/renderer/features/user-flow/ProjectDiagrams.tsx, src/renderer/features/graph/Diagram.tsx, src/renderer/styles.css, tests/e2e/project-flows.spec.ts, tests/e2e/user-flows.spec.ts.

**Interfaces:** ProjectDiagrams의 로컬 상태로 목록 접기와 확대 보기를 제어한다. 자식 key와 저장 계약은 유지한다. Mermaid는 SVG viewBox 기준 배율로 화면에 맞춘다. React Flow의 기존 Controls를 유지한다.

- [ ] 800×700, 1280×800, 1600×1050 공간·확대 복귀·편집 보존 테스트를 작성하고 실패를 확인한다.
- [ ] 상단을 압축하고 캔버스가 남은 공간을 사용하도록 제한된 CSS를 수정한다. 목록 접기와 고정 위치 확대 보기를 적용하고 Escape 종료와 포커스 복원을 제공한다.
- [ ] 관련 E2E와 비식별 화면 캡처 → 통과.
- [ ] lint·format:check·typecheck·전체 단위 테스트·빌드·전체 E2E → 통과.
- [ ] 전체 변경 리뷰 후 `feat(diagrams): 캔버스 확장과 확대 보기 추가` 커밋.
- [ ] PR 템플릿에 Closes #44, 검증 결과·AI 활용·화면 캡처를 기록하고 PR 생성. 검증한 최신 빌드로 DMG 생성. 설치 교체는 실행 중 편집 상태 확인 후 진행한다.
