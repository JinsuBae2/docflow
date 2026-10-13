# AI 관계 검토와 수동 편집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 문서 근거를 검토한 관계 제안을 명시적 수락 후 반영하고 수동 편집한다.

**Architecture:** 기존 제안 파이프라인에 관계 kind를 추가하고 근거 문서 revision과 관계 저장을 검증한다. renderer의 그래프와 제안 화면에 검토 조작을 연결한다.

**Tech Stack:** Electron, TypeScript, React, SQLite, Vitest, Playwright.

**Spec:** [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md)

**Issue:** #6 · **Branch:** `feat/6-ai-relationships`

## 공통 제약

- 설계: [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md). 해당 기능의 절과 공통 개발 절차를 함께 따른다.
- 비공개 저장소, Conventional Commits, 이슈별 브랜치·PR·CI. 선행 PR을 승인 없이 병합하지 않는다.
- 기존 문서 ID·revision·미저장 초안·대화·수락/거절 이력·IPC 보안 경계를 보존한다. Gemini·유료 자동 추론·결제·한도 초기화·새 상태 관리 라이브러리는 추가하지 않는다.
- 검증 데이터는 임시 폴더의 합성 문서와 가짜 제공자. 개인 DB·키·실계정 응답은 커밋하지 않는다.
- 완료 전 타입 검사·가까운 테스트·빌드·관련 Electron E2E·개인정보 없는 캡처를 확인한다. 최종 통합 뒤 DMG 복사본의 실행과 상대 링크를 확인한다.

## Review Focus

- 제외된 문서를 관계 근거로 지정 → 등록 거부
- 삭제·수정된 문서로 연결 수락 → 적용 차단과 stale 표시
- 동일 관계 중복 수락·저장 중 오류 → 중복 생성/반쪽 이력 방지
- 구버전 문서·결정 제안 → 기존 계약 호환 유지
- 수동 섹션 연결 및 AI 연결 유형 수정 → 기존 ID와 이력 유지

### Task 1: 구조화된 관계 제안과 원자적 수락

Files: `src/shared/contracts.ts`, `src/shared/proposal-schema.ts`, `src/main/ai/instructions.ts`, `src/main/project/proposals.ts`, `src/main/project/store.ts`, `src/main/project/context.ts`, `tests/unit/relation-proposals.test.ts`(신규), `tests/fixtures/fake-codex.cjs`.

Interfaces: 기존 ProposalDraft와 관계 제안의 판별 union을 사용한다. 관계 kind는 `fromId`, `toId`, `relationType`, `fromRevision`, `toRevision`, `reason`, `sourceIds`를 가진다. 과거 kind의 필드를 변경하지 않는다. AI JSON Schema가 제공자의 strict structured output 요구에 맞도록 discriminator별 계약을 유지한다. `ProjectStore.acceptRelationProposal(id)`는 관계와 제안 수락 상태를 한 트랜잭션으로 갱신한다. `updateRelation(id,type)`는 기존 대상과 방향을 유지한다.

- [ ] 관계 제안의 유효 근거·자기 연결·타 프로젝트 ID·중복·stale revision·삭제 대상·트랜잭션 실패 테스트를 작성한다. 기존 문서/결정 제안 parse 및 수락도 검사한다.
- [ ] `npx vitest run tests/unit/relation-proposals.test.ts tests/unit/proposals.test.ts` → 실패 확인.
- [ ] 관계 계약·출력 스키마·프롬프트·context 검증·저장 및 revision 재검증을 구현한다. 기존 관계를 자동 제거하지 않는다.
- [ ] 위 테스트, 기존 Codex/Claude 제공자 테스트와 타입 검사 통과 확인.
- [ ] `feat(graph): 근거를 검증하는 관계 제안 추가`로 커밋한다.

### Task 2: 관계 검토 UI와 수동 유형 편집

Files: `src/renderer/features/graph/ProjectGraph.tsx`, `src/renderer/features/proposals/ProposalList.tsx`, `src/renderer/App.tsx`, `src/main/ipc.ts`, `src/preload/index.ts`, `tests/e2e/relationships.spec.ts`(신규).

Interfaces: `updateRelation(id,type)` IPC 추가. 기존 맥락 미리보기에서 관계 검토에 포함할 저장 문서를 선택한다. 기존 AI 요청 파이프라인의 관계 kind를 사용하며 전송 제외 문서를 재추가하지 않는다.

- [ ] E2E에서 검토 전 맥락 확인/제외, AI 대기 연결, 수락 전 미반영, 수락·거절, 유형 수정과 삭제, 외부 수정 후 수락 차단을 검증하고 기존 수동 연결을 확인한다.
- [ ] 빌드 후 해당 E2E가 실패하는지 확인한다.
- [ ] 그래프의 확정/대기 관계 구분, 문서 선택과 ‘AI로 관계 검토’, 제안 근거/상태, 수동 편집 UI와 tooltip/focus를 구현한다.
- [ ] 타입 검사·가까운 테스트·빌드·관계 및 기존 문서 E2E 통과와 합성 화면 캡처 확인.
- [ ] `feat(graph): AI 관계 검토와 커스텀 편집 연결` 커밋 후 #6을 연결한 PR 생성.
