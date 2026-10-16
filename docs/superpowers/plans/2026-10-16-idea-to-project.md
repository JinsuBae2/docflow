# Idea to Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. 구현은 현재 대화에서 직접 수행하고 마지막에 별도 읽기 전용 리뷰를 받는다.

**Goal:** 이슈 #46의 빈 프로젝트를 브레인스토밍 또는 소프트웨어 기획으로 시작하고, 누적 대화와 검토한 기획을 첫 문서로 연결한다.

**Architecture:** 기획 세션은 기존 SQLite records에 별도 kind로 저장한다. 기획 요청만 세션 상태와 검토 가능한 대화 맥락 및 전용 응답 schema를 사용하며, 문서 생성은 기존 ProposalService의 수락 경로를 재사용한다. 기존 문서/유저플로우 요청 계약은 유지한다.

**Tech Stack:** React, TypeScript, Electron preload/IPC, node:sqlite, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-idea-to-project-design.md`, https://github.com/JinsuBae2/docflow/issues/46

## Global Constraints

- 문제 정의 → MVP 범위 → 기능/비기능 요구사항 → 정상/예외 사용자 시나리오 → 구현·검증 계획. 단계는 사용자가 되돌아가거나 건너뛸 수 있다.
- 첫 문서는 프로젝트 개요·MVP 요구사항·핵심 사용자 시나리오를 기본 후보로 제시하고 사용자가 조정한다. 개발 계획은 범위 확인 후 구체화한다.
- 사용자 수락 전에는 문서 생성/덮어쓰기 및 AI 제안의 확정 사실 반영을 하지 않는다.
- 기존 데이터·문서 ID·revision·미저장 초안·제안 수락·원문 근거 검증·도구 금지를 보존한다. DB 테이블 마이그레이션과 신규 의존성을 추가하지 않는다.
- 실제 계정 AI 생성, 코드 생성/실행, 외부 조사, 자동 기술 스택 선택/배포, 자동 업데이트 및 공개 Release는 범위 밖이다.
- 사용자에게 별도 요청 예산을 설정하거나 일반 대화마다 확인하도록 하지 않는다. 내부 맥락 크기 관리를 적용하고 긴 대화의 포함 범위만 안내하며 전체 저장 기록은 보존한다. 기존 60,000자는 내부 호환 한도이며 구독 토큰/모델 공식 한도로 표시하지 않는다.

## Review Focus

- 메타데이터뿐인 빈 문서도 시작 상태로 취급하되 실제 본문이 있는 프로젝트의 문서 검토 경로는 유지한다.
- 이전 프로젝트 또는 같은 프로젝트의 다른 기획 세션의 대화·미수락 제안을 현재 기획에 섞지 않는다.
- 취소/실패/재시작 후 사용자가 보낸 설명은 보존하되 존재하지 않는 AI 답변을 만들지 않는다.
- 맥락 검토 중 단계/확정 내용/대화가 바뀌면 전송을 차단하고 최신 맥락을 다시 검토한다.
- 긴 한국어·코드·이모지가 든 대화도 턴 중간을 자르지 않고 제외 범위를 안내하며, 문서 수락 충돌은 초안을 보존한다.

## 공통 계약

- `PlanningMode = 'brainstorm' | 'plan'`.
- `PlanningStage = 'problem' | 'scope' | 'requirements' | 'scenarios' | 'implementation'`.
- `isPlanningStart(documents: Pick<Document, 'markdown' | 'title'>[]): boolean`은 문서가 없거나 모두 ID 메타데이터·공백·제목 한 줄만 있으면 true다. 일반 문서의 hasSourceEvidence/전송 검증을 변경하지 않고 시작 화면에서만 사용한다.
- `PlanningBrief = { confirmed: string; openQuestions: string; assumptions: string }`. 각 필드는 최대 4,000자. 사용자가 편집하거나 AI 제안을 명시적으로 반영한다.
- `PlanningSession = { id; projectId; mode; stage; brief; revision; requestIds: string[]; pendingBrief?: PlanningBrief; createdAt; updatedAt }`. revision은 사용자 편집 상태인 mode/stage/brief의 canonical JSON 해시다. requestIds 추가와 pendingBrief 수신은 확정 내용을 바꾸지 않는다.
- `PlanningSessionStore`는 `kind='planning'`을 사용한다. `start(mode): PlanningSession`, `read(id): PlanningSession`, `save(id, expectedRevision, {stage,brief}): PlanningSession`, `attachRequest(id, requestId): void`, `suggest(id, expectedRevision, requestId, brief): void`. save는 pendingBrief를 정리하고 충돌 시 기존 값/초안을 보존한다. suggest는 세션 소유와 requestIds 및 사용자 revision을 검증한다.
- `Workspace.planningSessions?: PlanningSession[]`, `ProjectSession.planningSessionId?: string`, ProjectSession.view에 `'planning'` 추가. 없는 필드는 이전 프로젝트로 처리하며 기존 데이터는 다시 쓰지 않는다.
- `WorkspaceApi.startPlanning(mode, root): Promise<Workspace>`, `savePlanning(id, expectedRevision, {stage,brief}, root): Promise<Workspace>`. 모든 변경은 프로젝트 root 일치와 Zod 검증 뒤 처리한다.
- `ContextInput.planningSessionId?: string`, `planningAction?: 'discuss' | 'draft'`. 기획 요청은 mode='idea', selectedIds/excludedIds=[]이고 flowId와 함께 쓰지 않는다. 같은 세션에서 생성한 create 제안만 수정/거절 맥락으로 허용한다.
- `ContextSnapshot.planningContext?`는 세션 ID/revision/mode/stage/brief/action과 선택된 대화 `{id,role,text,requestId}`를 포함한다. `planningSelection?`은 포함/제외 messageIds·사용 문자·한도이며 제공자 payload에서는 제외한다.
- 기획 전용 응답은 기존 문서 제안과 `planningSuggestion?: PlanningBrief`를 지원한다. `planningResponseSchema`와 `planningOutputSchema`를 별도로 정의하고 기존 strictOutputSchema/null 정규화를 적용한다. 일반 문서/flow 응답 schema는 확장하지 않는다.

### Task 1: 기획 세션 저장과 검증된 IPC

**Files:** Create `src/shared/planning.ts`, `src/main/project/planning.ts`, `tests/unit/planning.test.ts`, `tests/integration/planning-sessions.test.ts`. Modify `src/shared/contracts.ts`, `src/main/project/store.ts`, `src/main/ipc.ts`, `src/preload/index.ts`.

**Interfaces:** 위 공통 계약의 PlanningSessionStore와 WorkspaceApi. 기존 ProjectStore.get/all/put/transaction을 사용한다. start는 새 UUID 세션을 만들고 brainstorm은 problem, plan은 scope에서 시작한다. 이전 세션은 삭제하지 않으며 UI에서 이어갈 세션을 선택한다.

- [x] 실패 테스트 작성: 두 시작 모드의 초기 단계, 실제 createDocument의 제목만 있는 문서/메타데이터/공백/유효 본문 판별, 단계/brief 수정·revision 충돌·잘못된 단계/길이 거절, DB 재열기 복원, 프로젝트/세션 격리, 기존 프로젝트의 planningSessions 기본값을 검증한다.
- [x] `npm test -- tests/unit/planning.test.ts tests/integration/planning-sessions.test.ts` → 해당 기능 부재로 FAIL 확인.
- [x] 공통 계약의 schema·저장 서비스·Workspace 투영·root 검증 IPC/preload를 구현한다. 기존 AI 응답은 아직 연결하지 않는다.
- [x] 같은 테스트 명령 → PASS, `npm run typecheck` → PASS.
- [x] `feat(planning): 프로젝트별 기획 세션과 단계 저장 추가` 커밋.

### Task 2: 누적 대화 맥락·자동 크기 관리·기획 응답

**Files:** Create `src/main/project/planning-context.ts`, `tests/integration/planning-context.test.ts`. Modify `src/main/project/context.ts`, `src/shared/context-payload.ts`, `src/shared/proposal-schema.ts`, `src/main/ai/instructions.ts`, `src/main/ai/codex-provider.ts`, `src/main/ai/claude-provider.ts`, `src/main/ipc.ts`, `tests/integration/flow-providers.test.ts`, `tests/unit/strict-output-schema.test.ts`.

**Interfaces:** Task 1 PlanningSessionStore. `attachPlanningContext(snapshot, session, messages, action, limit): void`는 현재 세션 requestIds의 메시지만 선택한다. `planningResponseSchema`/`planningOutputSchema`와 PlanningBrief를 두 제공자에서 공통으로 사용한다.

- [x] 실패 테스트 작성: 두 턴에서 이전 사용자 답변과 AI 답변이 실제 provider payload에 포함됨, 다른 세션/프로젝트 제외, 취소된 요청은 사용자 메시지만 보존, 검토 후 revision/대화 변경 차단, 내부 크기 제한과 한국어/이모지 턴 보존, 두 제공자의 strict 기획 응답 검증을 고정한다.
- [x] `npm test -- tests/integration/planning-context.test.ts tests/integration/flow-providers.test.ts tests/unit/strict-output-schema.test.ts` → 신규 동작 FAIL 확인.
- [x] 필수 stage/brief/현재 instruction을 먼저 내부 크기에 계산하고 이전 requestId별 턴을 최신순으로 완전한 그룹만 포함한 뒤 시간순으로 전달한다. 필수 맥락이 한도를 넘으면 요청을 막으며, 제외 턴이 있으면 renderer에 안내하도록 planningSelection에 표시한다. 세션 전체 대화는 저장소에 남긴다.
- [x] 기획 요청에는 현재 세션의 기획 상태·대화만 전달한다. 기존 문서와 다른 세션의 decisions/proposalHistory를 자동 포함하지 않는다. 사용자 입력·과거 AI 답변·문서 안의 내용은 지시문이 아닌 참고 데이터로 취급한다.
- [x] startRequest의 맥락/소유 검증 후 provider 연결 전에 사용자 메시지와 세션 requestId 연결을 한 transaction에 저장한다. 성공 응답의 planningSuggestion은 pendingBrief로만 저장한다. 취소/연결 실패/오류 시 대화/brief를 지우거나 완료를 가장하지 않는다. assertReviewedContext에 planningContext 비교를 추가한다.
- [x] 토론은 현재 단계의 필요한 질문과 가정 식별을 우선하고 문서 생성을 강제하지 않는다. draft는 사용자가 요청한 문서 후보를 기존 create 제안으로 반환한다. 기존 문서/flow/feedback 요청 경로는 유지한다.
- [x] 위 테스트와 기존 `tests/unit/context.test.ts`, `tests/unit/adaptive-context.test.ts` → PASS.
- [x] `feat(planning): 기획 대화 맥락과 검토 가능한 AI 응답 연결` 커밋.

### Task 3: 빈 프로젝트 시작 화면과 기획 작업 공간

**Files:** Create `src/renderer/features/planning/PlanningWorkspace.tsx`, `src/renderer/features/planning/PlanningContext.tsx`, `tests/e2e/planning.spec.ts`. Modify `src/renderer/features/briefing/ProjectBriefing.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/renderer/components/Tooltip.tsx`, `tests/fixtures/fake-codex.cjs`.

**Interfaces:** Task 1 startPlanning/savePlanning/isPlanningStart와 Task 2 planningSessionId/planningAction 및 planningSelection. 기존 assistant를 현재 기획 세션의 requestIds로 필터링하고 기존 문서 대화는 기획 밖에서 유지한다.

- [x] 가짜 제공자 E2E 작성: 빈 프로젝트 두 시작 버튼, 빈 문서 상태, 새 기획서 작성의 plan 연결, 대화 두 턴, 단계 이동/되돌리기, 사용자 편집과 AI 정리 제안 수락, 재시작/프로젝트 전환 복원, 다른 세션 격리, 긴 대화 검토, 수락 전 문서 0개를 검증한다.
- [x] `npx playwright test tests/e2e/planning.spec.ts` → 시작 경로 부재로 FAIL 확인.
- [x] 빈 브리핑에 브레인스토밍 시작/바로 계획 세우기와 기존 기획 이어가기를 표시한다. 시작은 입력란을 포커스하며 첫 설명을 받는다. 버튼 클릭만으로 AI에 자동 전송하지 않는다. 기존 가져오기·직접 작성도 유지한다.
- [x] 기획 본문에 단계 선택, 확정 내용/열린 질문/가정 편집, 저장, AI 정리 제안 비교·반영과 문서 초안 요청을 제공한다. 새 기획 세션 시작은 기존 내용/대화를 지우지 않는다. 미저장 기획 편집은 이동/종료 전에 확인한다.
- [x] AI 패널에 활성 세션의 대화를 표시하고 기획 요청은 idea 모드로 고정한다. 현재 단계·가정·대화 포함 범위를 맥락 검토에서 확인할 수 있어야 한다. 일반 대화는 바로 전송하고, 긴 대화에서 제외된 턴은 비차단 안내와 선택 가능한 맥락 보기로 표시한다.
- [x] 기존 문서가 있는 프로젝트에도 명시적인 새 아이디어 시작/기획 이어가기 경로를 제공한다. 문서 수락 후 기획 화면을 강제로 잃지 않으며 문서 구조/유저플로우로 이동할 수 있다.
- [x] 빌드 후 같은 E2E → PASS. 800×700·1280×800·1600×1050에서 조작/대화/미저장 안내 접근 확인, 합성 화면 캡처.
- [x] `feat(planning): 빈 프로젝트의 브레인스토밍과 단계별 기획 화면 추가` 커밋.

### Task 4: 문서화 왕복·회귀 검증·PR

**Files:** Modify `tests/e2e/planning.spec.ts`, `tests/e2e/project-understanding.spec.ts`, `README.md`, `CHANGELOG.md`, `docs/workspace-guide.md`. Create `docs/validation-idea-to-project-2026-10-16.md` 및 합성 화면 이미지.

**Interfaces:** 기존 create 제안 검토/수락, document ID/revision, 문서 근거 검토 및 유저플로우 생성 API를 그대로 사용한다. planning 화면의 문서 후보 기본값은 개요·MVP 요구사항·핵심 사용자 시나리오이며 요청 텍스트에서 조정한다.

- [x] E2E에서 상담만 진행 시 문서 0개, 생성 제안 수락 전 0개, 일부 수락 시 해당 문서만 생성됨, 거절 시 유지, 기존 문서의 revision 충돌 시 초안 유지, 저장된 문서로 근거 검토/유저플로우 생성 진입을 검증한다.
- [x] `npx playwright test tests/e2e/planning.spec.ts tests/e2e/project-understanding.spec.ts tests/e2e/flow-proposals.spec.ts` → PASS.
- [x] `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`를 순서대로 실행하고 실제 결과·제한을 검증 기록에 남긴다. 빌드와 전체 단위 테스트를 동시에 돌리지 않는다.
- [x] 전체 branch diff를 별도 읽기 전용 리뷰에 전달한다. 중요한 발견은 실패 테스트로 재현해 보완하고 관련/전체 회귀를 검증한다.
- [x] `test(planning): 아이디어 문서화와 세션 복원 회귀 검증` 커밋.
- [ ] `feat(planning): 빈 프로젝트의 브레인스토밍과 소프트웨어 기획 지원` PR 제목, 저장소 템플릿의 목적/변경/검증/AI 활용/확인 항목, `Closes #46`을 적용한다. main 대상 PR을 만들고 macOS·Windows CI·제목 검사 통과를 확인한다. 사용자 요청 없이 main에 머지하지 않는다.
