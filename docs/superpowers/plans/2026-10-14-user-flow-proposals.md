# User Flow Phase 2 Implementation Plan

> Execute inline using superpowers:executing-plans, one testable step at a time.

**Goal:** 문서 맥락에서 AI 플로우 생성/수정 제안을 받고 캔버스 Diff를 검토·수락·거절한다.

**Architecture:** 기존 proposal/feedback 계약에 flow 유형을 추가한다. 요청 시 flowContext에 서버가 생성한 ID, 프로젝트 ID, 기준 플로우를 저장한다. 제안의 모든 근거를 전달 범위와 실제 문서에 검증하고, 기존 같은 부모 노드 좌표를 보존한다. 미리보기는 기존 ELK Worker로 신규 노드만 배치한다. 수락 IPC는 배치 좌표 외 변경을 거부하며 기준/문서 revision을 재검증한다.

**Tech Stack:** TypeScript, Zod, React Flow, ELK Worker, Electron IPC, Vitest, Playwright.

**Spec:** 사용자의 2026-10-14 Phase 2 요청.

## Constraints

- 관계 지도/기존 문서 제안/Mermaid 유지. 실제 Claude/API 호출 없이 fixtures만 검증.
- grounded 근거는 UTF-16 원문 범위, 문서/섹션/revision 일치. excluded/unprovided 근거 차단.
- 제안 등록/미리보기/거절 시 flows JSON 불변. 수락 시 atomic save.
- 기존 노드 ID/같은 부모 좌표 보존. 부모 이동 좌표는 새 부모 기준 재배치.
- Diff 표시 상태는 런타임만 유지. 삭제 노드/연결선은 읽기 전용 ghost.
- 파일 경로 POSIX 규칙 및 기존 Windows 클릭 안전 영역 유지.

## Review Focus

- 오래된 문서/플로우, 없는 문서, 범위 밖 근거: 수락/등록 거부.
- 클라이언트 배치 결과에 내용 변경: 수락 거부.
- 미저장 편집/프로젝트 변경 중 요청: 차단.
- 부모 이동/조건 라벨/삭제된 그룹 내부: Diff 명확히 표시.
- 거절 사유 후속 요청: 기존 feedback 보존·재시도 사용.

## Steps

- [x] 1. 계약·맥락·검증 RED→GREEN: flow proposal schema, snapshot base, scope evidence, position preservation. Verify integration/user-flow-proposals.test.ts.
- [x] 2. 수락·거절 RED→GREEN: atomic flow save, revision conflict/stale, layout-only payload, feedback context. Verify same integration tests and old proposals/context tests.
- [x] 3. 요청 UI·Diff: AI generate/modify -> existing context review + estimated tokens -> request. Reuse worker layout; runtime ghost statuses and summary; existing review controls/feedback.
- [x] 4. Fake Codex + Claude mock: generation/update/malformed scenario. Verify provider tests.
- [x] 5. E2E create -> no write while pending -> accept -> modify Diff -> reject -> stale conflict. Run focused, then full unit/typecheck/lint/format/build/E2E. Create conventional PR with all verification results.
