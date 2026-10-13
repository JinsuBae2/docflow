# 거절 사유 후속 대화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 거절을 보내기 전에는 확정하지 않고 사유 전송 후 대화에서 AI 판단을 이어간다.

**Architecture:** 거절 피드백을 멱등 기록하는 별도 서비스와 기존 AI 요청 파이프라인을 연결한다. 이미 거절된 제안도 안전한 요약 컨텍스트로 후속 답변을 요청할 수 있게 한다.

**Tech Stack:** Electron, TypeScript, React, SQLite, Vitest, Playwright.

**Spec:** [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md)

**Issue:** #8 · **Branch:** `feat/8-rejection-followup`

## 공통 제약

- 설계: [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md). 해당 기능의 절과 공통 개발 절차를 함께 따른다.
- 비공개 저장소, Conventional Commits, 이슈별 브랜치·PR·CI. 선행 PR을 승인 없이 병합하지 않는다.
- 기존 문서 ID·revision·미저장 초안·대화·수락/거절 이력·IPC 보안 경계를 보존한다. Gemini·유료 자동 추론·결제·한도 초기화·새 상태 관리 라이브러리는 추가하지 않는다.
- 검증 데이터는 임시 폴더의 합성 문서와 가짜 제공자. 개인 DB·키·실계정 응답은 커밋하지 않는다.
- 완료 전 타입 검사·가까운 테스트·빌드·관련 Electron E2E·개인정보 없는 캡처를 확인한다. 최종 통합 뒤 DMG 복사본의 실행과 상대 링크를 확인한다.

## Review Focus

- 거절 클릭 후 취소 → 제안 상태·이력 불변
- 빈 사유 → 거절만 기록, AI 호출 없음
- 요청 실패·재시도·앱 재시작 → 거절/사용자 메시지 중복 없음
- 제외 문서가 과거 제안의 전체 본문에 포함 → 외부 전송 누출 차단
- 이미 수락된 제안·AI 진행 중 중복 보내기 → main에서 검증·차단

### Task 1: 멱등 거절 피드백과 안전한 컨텍스트

Files: `src/main/project/feedback.ts`(신규), `src/main/project/proposals.ts`, `src/main/project/context.ts`, `src/main/ipc.ts`, `src/shared/contracts.ts`, `src/preload/index.ts`, `tests/unit/feedback.test.ts`(신규), `tests/unit/context.test.ts`.

Interfaces: `RejectionFeedback { id, proposalId, reason, messageId, status:'ready'|'running'|'failed'|'completed', requestId? }`. `sendRejection(proposalId,reason,feedbackId)`의 최초 호출은 트랜잭션으로 거절·피드백·사용자 메시지를 기록한다. `retryRejection(feedbackId)`는 동일 이력을 재사용하고 새 AI 요청 ID로 다시 시도한다. ContextSnapshot에 `rejectedProposal { id,title,kind,rejectionReason }` 요약을 추가하며 제안 replacement·기존 AI 근거 설명·제외 문서 본문을 복사하지 않는다.

- [ ] 취소 전 무변경, 빈 사유의 AI 호출 없음, 최초 거절 원자성, 동일 ID 재전송, 이미 처리된 상태, 실패 후 재시도·재개방, 제외 문서의 본문 미포함 테스트 작성.
- [ ] `npx vitest run tests/unit/feedback.test.ts tests/unit/context.test.ts tests/unit/proposals.test.ts` → 실패 확인.
- [ ] 서비스·IPC 검증과 상태 기록·멱등 메시지 저장·후속 snapshot을 구현한다. 기존 수정 요청 replacesId와 거절 피드백을 혼용하지 않는다. AI 실패가 거절 기록을 롤백하지 않게 한다.
- [ ] 가까운 테스트·제공자 테스트·타입 검사 통과 확인.
- [ ] `feat(proposals): 거절 피드백과 후속 요청 기록 추가` 커밋.

### Task 2: 이유 입력과 보내기·재시도 UI

Files: `src/renderer/features/proposals/ProposalList.tsx`, `src/renderer/App.tsx`, `tests/e2e/rejection.spec.ts`(신규), `tests/e2e/workspace.spec.ts`, `tests/fixtures/fake-codex.cjs`.

Interfaces: Task 1의 피드백 ID와 상태를 UI에서 사용한다. 거절 버튼은 입력 모드를 열고 ‘보내기’가 새 IPC를 호출한다. 사유가 있으면 대화 탭으로 이동하고 결과를 기존 request event 흐름으로 표시한다. 실패 후 동일 피드백 재시도 버튼 제공.

- [ ] E2E에서 클릭만으로 거절되지 않음, 취소, 빈 사유, 사유 전송과 후속 응답·새 제안, 이력 보존, 실패·재시도 중복 방지를 검증한다. 기존 E2E의 즉시 거절 기대를 새 보내기 흐름으로 수정한다.
- [ ] 빌드 후 해당 E2E 실패 확인.
- [ ] ‘보내기’·취소·사유 길이·전송 상태·재시도와 AI 후속 대화를 구현한다. 후속 제안은 자동 수락하지 않는다.
- [ ] 타입 검사·전체 테스트(공통 AI 흐름 변경 마일스톤)·빌드·전체 Electron E2E·합성 캡처 확인.
- [ ] `feat(proposals): 거절 이유를 보내고 대화 이어가기` 커밋 후 #8을 연결한 PR 생성. 네 기능이 통합된 최종 앱/DMG를 갱신하고 DMG 복사본 실행 검증 기록을 남긴다.
