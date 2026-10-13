# 프로젝트별 섹션과 초안 보존 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 등록 프로젝트의 안전한 전환과 프로젝트별 문서·대화 입력 복원을 제공한다.

**Architecture:** main의 등록 목록/프로젝트 DB와 renderer의 활성 프로젝트·초안 상태를 연결한다. 임의 경로 전환을 노출하지 않고 등록 ID를 사용한다.

**Tech Stack:** Electron, TypeScript, React, SQLite, Vitest, Playwright.

**Spec:** [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md)

**Issue:** #2 · **Branch:** `feat/2-project-sections`

## 공통 제약

- 설계: [../specs/2026-10-13-project-ai-workflows-design.md](../specs/2026-10-13-project-ai-workflows-design.md). 해당 기능의 절과 공통 개발 절차를 함께 따른다.
- 비공개 저장소, Conventional Commits, 이슈별 브랜치·PR·CI. 선행 PR을 승인 없이 병합하지 않는다.
- 기존 문서 ID·revision·미저장 초안·대화·수락/거절 이력·IPC 보안 경계를 보존한다. Gemini·유료 자동 추론·결제·한도 초기화·새 상태 관리 라이브러리는 추가하지 않는다.
- 검증 데이터는 임시 폴더의 합성 문서와 가짜 제공자. 개인 DB·키·실계정 응답은 커밋하지 않는다.
- 완료 전 타입 검사·가까운 테스트·빌드·관련 Electron E2E·개인정보 없는 캡처를 확인한다. 최종 통합 뒤 DMG 복사본의 실행과 상대 링크를 확인한다.

## Review Focus

- 과거 root만 있는 설정 → 첫 등록 프로젝트로 이관하고 AI 설정 보존
- 같은 폴더의 별칭·누락 폴더 → 중복 방지와 항목별 오류
- 외부 수정 후 초안 복원 → 원본을 덮어쓰지 않고 충돌 표시
- 문서 편집·대화 입력 후 프로젝트 전환/재시작 → 각각 복원
- AI 요청 중 전환·등록 해제 → 현재 요청과 데이터 소유권 보존

### Task 1: 프로젝트 등록 목록과 초안 저장 계약

Files: `src/main/project/registry.ts`(신규), `src/main/project/store.ts`, `src/main/ipc.ts`, `src/shared/contracts.ts`, `src/preload/index.ts`, `tests/unit/project-registry.test.ts`(신규), `tests/integration/project-drafts.test.ts`(신규).

Interfaces: `ProjectEntry { id, name, root, lastOpenedAt, error? }`, `EditorDraft { documentId, markdown, baseRevision }`, `ProjectSession { selectedId, view, prompt, collapsed }`. IPC는 `listProjects()`, `activateProject(id)`, `forgetProject(id)`, `saveSession(session)`, `saveDraft(draft)`, `discardDraft(documentId)`를 제공한다. 프로젝트 목록 저장은 main만, 초안과 session은 활성 프로젝트 DB만 수정한다. `current()` 결과에 복원할 session/drafts를 추가하고 과거 DB에는 빈 기본값을 사용한다.

- [ ] 이관·canonical 경로 중복·손상 설정 보존·누락 폴더·등록 해제 시 실제 파일 보존 테스트를 작성한다. 초안 테스트는 원본 Markdown이 그대로이며 재개방한 DB에서 baseRevision/본문이 복원되는지 검사한다. 서로 다른 두 프로젝트에 같은 문서 ID를 넣어도 격리되는지 검사한다.
- [ ] `npx vitest run tests/unit/project-registry.test.ts tests/integration/project-drafts.test.ts` → 미구현 계약 때문에 실패를 확인한다.
- [ ] 등록 목록의 atomic JSON 저장·기존 root 이관, session/draft DB 저장, 등록 ID 검증과 요청 중 전환 차단을 구현한다. 기존 settings 저장이 새 목록을 누락하지 않게 연결한다.
- [ ] 위 테스트와 `npm run typecheck` 통과를 확인한다.
- [ ] `feat(projects): 프로젝트 등록 목록과 초안 저장 추가`로 관련 파일만 커밋한다.

### Task 2: 사이드바 섹션과 복원 UI

Files: `src/renderer/components/ProjectSections.tsx`(신규), `src/renderer/App.tsx`, `src/renderer/features/documents/DocumentView.tsx`, `src/renderer/styles.css`, `tests/e2e/projects.spec.ts`(신규).

Interfaces: Task 1의 등록 목록·Workspace session/drafts와 IPC를 사용한다. DocumentView에 초안 초기값과 변경 콜백을 추가하고, 문서 ID뿐 아니라 프로젝트 ID로 초안 소유권을 구분한다. 화면 전환 전에 현재 초안/session 저장을 await하여 저장 실패 시 현재 화면을 유지한다.

- [ ] E2E에서 두 프로젝트를 생성해 섹션 접기·펼치기, 활성 전환, 비활성 문서 선택, Markdown 미저장 초안과 대화 입력 왕복 복원·재시작 복원을 검증한다. 외부 수정 충돌과 AI 요청 중 전환 차단도 검사한다.
- [ ] `npm run build` 후 `npx playwright test tests/e2e/projects.spec.ts` → 기존 UI에서 실패 확인.
- [ ] 섹션 UI·키보드 조작·저장 오류 표시·초안 복원과 충돌 표시를 구현한다. 원본 저장과 초안 버리기를 구분한다. 기존 문서 탐색/미저장 변경 보호 테스트를 유지한다.
- [ ] 타입 검사, Task 1 테스트, 빌드, 프로젝트 및 기존 문서 E2E 통과를 확인하고 합성 프로젝트 화면을 캡처한다.
- [ ] `feat(projects): 프로젝트별 사이드바와 초안 복원 연결` 커밋 후 이슈 #2를 연결한 PR을 생성한다.
