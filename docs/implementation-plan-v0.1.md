# Electron 문서 워크스페이스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 직접 실행을 권장하며, 하위 에이전트는 사용자 요청 없이 사용하지 않는다.

**Goal:** 로컬 문서를 시각적으로 탐색하고, 실제 Codex가 프로젝트 맥락으로 생성한 문서·보완 제안을 수락·거절하며 그 판단을 다음 요청에 반영하는 데스크톱 앱을 만든다.

**Architecture:** Electron main이 파일·DB·AI 프로세스를 관리하고 React renderer는 제한된 preload API만 호출한다. Markdown을 본문 원본으로, SQLite를 연결·결정·대화·제안 이력 저장소로 사용한다. AI 출력은 제안으로만 등록하며 적용은 버전 검사와 복구 기록을 갖춘 프로젝트 서비스가 수행한다.

**Tech Stack:** Electron, React, TypeScript, Vite, Electron Forge, SQLite, unified/remark Markdown 파서, React Flow, Mermaid, Zod, Vitest, Playwright. SQLite 드라이버는 Electron과의 호환성을 Task 1에서 확인하고 결정한다. 패키지는 구현 시작 시 현재 공식 문서와 호환성을 확인한 뒤 lockfile로 고정한다.

**Spec:** [아키텍처 설계서 v0.2](./architecture-design-v0.1.md)

## Global Constraints

- macOS와 Windows에 설치하는 로컬 앱이다.
- 실제 AI 연결 하나를 포함해야 이 흐름을 완료한 것으로 본다.
- 고정 예제 응답은 개발·테스트에만 사용하며 실제 AI 결과로 표시하지 않는다.
- 단순 선택이나 보기 전환은 AI 요청을 발생시키지 않는다.
- 본문의 기준은 Markdown 하나다.
- 화면에는 파일 시스템이나 임의 명령 실행 권한을 직접 제공하지 않는다.
- 거절은 문서를 바꾸지 않고 처리 이력만 남긴다.
- 현재 macOS 환경에서의 성공만으로 Windows 실행 성공을 주장하지 않는다.
- 개인 프로젝트·인증정보를 소스 저장소와 분리한다. 라이선스는 소유자 선택 전에 임의 부여하지 않는다.
- 각 단계에서 집중 테스트를 먼저 실행하고 통과한 검사는 관련 변경 없으면 반복하지 않는다.

## Review Focus

1. 한글·공백·중복 제목·코드 블록의 `#`: 올바르게 파싱하고 고유 ID를 유지한다. Task 2에서 검사한다.
2. 검토 중 외부 문서 수정: 원문을 덮어쓰지 않고 제안을 재검토 필요로 바꾼다. Task 4에서 검사한다.
3. 응답 중 취소·중복 이벤트·로그인 만료: 부분 응답을 적용하거나 제안을 중복 생성하지 않는다. Task 1과 4에서 검사한다.
4. 파일 교체 뒤 DB 기록 전 중단: 재시작 시 미완료 변경을 복구하고 허위 성공을 표시하지 않는다. Task 4에서 검사한다.
5. 문서·AI 응답의 실행 코드 및 프로젝트 밖 경로: 스크립트와 임의 명령을 실행하거나 범위 밖 파일을 접근하지 않는다. Task 2와 5에서 검사한다.

## 파일 구성과 공통 인터페이스

```text
src/
  shared/contracts.ts                 IPC 명령·이벤트와 공통 데이터 타입
  shared/proposal-schema.ts           AI 제안 응답 검증
  main/index.ts                       앱 시작·종료와 창 관리
  main/ipc.ts                         검증된 IPC 명령 등록
  main/ai/provider.ts                 AI 어댑터 계약
  main/ai/codex-provider.ts            Codex 프로세스와 요청 수명 관리
  main/project/markdown.ts            문서 파싱과 ID 유지
  main/project/store.ts               SQLite 저장·조회
  main/project/files.ts               프로젝트 범위의 파일 접근
  main/project/context.ts             출처·버전을 가진 맥락 구성
  main/project/proposals.ts           제안 등록·수락·거절
  main/project/recovery.ts            파일·DB 변경의 복구 기록
  preload/index.ts                    허용한 API만 노출
  renderer/App.tsx                    작업 공간 배치
  renderer/features/documents/        문서 목록·목차·본문
  renderer/features/conversation/     AI 대화·맥락 확인
  renderer/features/proposals/        근거·변경 비교·검토
  renderer/features/graph/            관계 지도·흐름도
tests/unit/                           행동 중심 집중 테스트
tests/integration/                    저장 복구·AI 프로토콜 테스트
tests/e2e/                            Electron 사용자 흐름
examples/                             개인 자료 없는 예제 문서
.github/workflows/                    검사·OS별 빌드·릴리스
```

공통 ID와 버전: `Id = string`, `Revision = string`이며 Revision은 UTF-8 본문의 SHA-256이다. 데이터 타입은 `contracts.ts`에서 한 번만 정의한다.

- `Document`: `id`, `type`, `relativePath`, `revision`, `markdown`, `sections`.
- `Section`: `id`, `documentId`, `parentId`, `title`, `level`, `order`, `content`.
- `Relation`: `id`, `fromId`, `toId`, `type`, `confirmed`.
- `Decision`: `id`, `text`, `sourceIds`, `status`.
- `Proposal`: `id`, `requestId`, `kind`, `targetId`, `baseRevision`, `replacement`, `sourceIds`, `reason`, `dependencyIds`, `status`.
- `ContextSnapshot`: `id`, `requestId`, `instruction`, `sources`, `decisions`, `proposalHistory`, `omittedIds`.
- `RequestState`: `idle | running | completed | cancelled | failed`.

`replacement`는 새 문서 또는 변경 후 문서 전체 본문이다. 첫 버전의 변경 단위는 문서 하나이며 화면에는 변경 전후 차이를 표시한다.

## Task 1: Electron 기반과 실제 Codex 연결 검증

**Files:** `package.json`, `tsconfig*.json`, `forge.config.ts`, `vite.*.config.ts`, `.gitignore`, `src/shared/contracts.ts`, `src/shared/proposal-schema.ts`, `src/main/index.ts`, `src/main/ai/provider.ts`, `src/main/ai/codex-provider.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`, `tests/integration/codex-provider.test.ts`, `outputs/codex-connection-check.md`.

**Interfaces:** `AiProvider.getStatus(): Promise<ProviderStatus>`, `run(context: ContextSnapshot, signal: AbortSignal): AsyncIterable<AiEvent>`, `close(): Promise<void>`. `AiEvent`는 진행, 최종 응답, 분류된 오류를 구분한다.

- [ ] 로컬 Node·Codex 버전과 app-server 공식 프로토콜을 확인한다. 로그인 상태 확인은 토큰 내용을 출력하지 않는다.
- [ ] Git 저장소를 초기화하고 의존성·빌드 파일을 구성한다. `dev`, `typecheck`, `test`, `test:e2e`, `package`, `make` 스크립트를 정의한다.
- [ ] `codex-provider.test.ts`에 프로토콜 초기화, 응답 분할 수신, 취소, 로그인 만료 분류, 중복 이벤트 제거 테스트를 작성한다. 임시 프로토콜 테스트 프로세스를 사용하고 실제 AI 요청을 단위 테스트에서 실행하지 않는다.
- [ ] `npm test -- tests/integration/codex-provider.test.ts`로 의도한 실패를 확인한다.
- [ ] 셸 문자열 연결 없이 실행 파일과 인자 배열로 Codex를 구동한다. 버전별 프로토콜을 확인하고 연결·취소·종료를 구현한다. 문서 쓰기와 명령 실행을 허용하지 않는 구성으로 시작한다.
- [ ] 실제 Codex에 개인 자료가 아닌 짧은 두 문서로 한 번 요청해 구조화된 제안과 출처를 확인한다. 쓰기 제한을 충족하지 못하면 지원되는 대안을 문서화하고 이 단계를 완료 처리하지 않는다.
- [ ] `npm run typecheck`, 집중 테스트, `npm run package`를 확인한다. SQLite 드라이버로 임시 DB를 열고 쓰고 닫는 packaged 실행 검사도 수행한다.
- [ ] 결과와 한계를 `outputs/codex-connection-check.md`에 기록하고 변경을 커밋한다. 인증정보와 원시 세션 기록은 포함하지 않는다.

## Task 2: 문서·연결·이력의 로컬 저장

**Files:** `src/main/project/{markdown,files,store}.ts`, `src/shared/contracts.ts`, `tests/unit/markdown.test.ts`, `tests/integration/project-store.test.ts`, `examples/{prd,features}.md`.

**Interfaces:** `parseDocument(markdown: string, previous?: Document): Document`, `ProjectStore.open(root: string): Promise<ProjectStore>`, `listDocuments(): Promise<Document[]>`, `saveDocument(doc: Document, expectedRevision: Revision | null): Promise<Document>`, `saveRelation(relation: Relation): Promise<void>`, `close(): Promise<void>`.

- [ ] 코드 블록 안의 제목 제외, 중복·한글 제목, 제목 변경·이동 후 ID 유지, ID 제거 시 재연결 표시 테스트를 작성한다.
- [ ] 임시 프로젝트에서 가져오기·저장·재열기와 `../`, 절대 경로, 외부를 가리키는 심볼릭 링크 거부 테스트를 작성한다.
- [ ] `npm test -- tests/unit/markdown.test.ts tests/integration/project-store.test.ts`로 실패를 확인한다.
- [ ] frontmatter의 문서 ID와 제목 앞 주석의 섹션 ID를 표준 Markdown 파서로 관리한다. 새 ID 삽입은 가져오기 미리보기 이후 확정한다.
- [ ] schema version을 가진 SQLite 마이그레이션, 상대 경로 검증, 본문 해시 검사와 파일 읽기·저장을 구현한다. 문서 DB 인덱스는 원문에서 재생성 가능하게 한다.
- [ ] 집중 테스트 통과와 예제 문서의 저장·재열기를 확인한 뒤 커밋한다.

## Task 3: 근거를 추적하는 맥락 구성

**Files:** `src/main/project/context.ts`, `src/shared/contracts.ts`, `tests/unit/context.test.ts`.

**Interfaces:** `buildContext(input: { projectId: Id; instruction: string; selectedIds: Id[]; excludedIds: Id[]; maxCharacters: number }, store: ProjectStore): Promise<ContextSnapshot>`. `ProjectStore`에 프로젝트·결정·관계·제안 이력 조회와 맥락 저장 메서드를 추가한다.

- [ ] '회원가입 없음' 결정과 관련 기능 명세가 선택 문서의 맥락에 포함되고 거절 이력이 확정 요구사항으로 섞이지 않는 테스트를 작성한다.
- [ ] 제외한 문서가 전송되지 않고, 용량 초과 시 제외 목록이 표시되며, 필수 목표·결정·선택 원문이 한도를 넘으면 범위 축소 오류를 반환하는 테스트를 작성한다.
- [ ] `npm test -- tests/unit/context.test.ts`로 실패를 확인한다.
- [ ] 목표·제약·확정 결정·선택 원문을 우선하고 직접 연결·키워드 검색으로 관련 문서를 선택한다. 전달하는 각 원문에 ID·버전·내용을 기록한다. 첫 구현에는 요약 생성과 벡터 DB를 넣지 않는다.
- [ ] 후속 요청마다 최신 원문을 조회하고 새 ContextSnapshot을 저장한다. 이전 대화 응답을 확정 사실로 승격하지 않는다.
- [ ] 집중 테스트 통과 후 커밋한다.

## Task 4: 제안 검토·수락·거절과 복구

**Files:** `src/main/project/{proposals,recovery}.ts`, `src/shared/proposal-schema.ts`, `tests/unit/proposals.test.ts`, `tests/integration/recovery.test.ts`.

**Interfaces:** `registerProposals(snapshotId: Id, response: unknown): Promise<Proposal[]>`, `acceptProposal(id: Id): Promise<ApplyResult>`, `rejectProposal(id: Id, reason?: string): Promise<void>`, `requestRevision(id: Id, instruction: string): Promise<Id>`, `recoverPendingOperations(root: string): Promise<RecoveryResult[]>`.

- [ ] 전달하지 않은 출처 ID 거부, 중복 응답 등록 방지, 거절 시 본문 불변, 수락 후 다음 맥락에 최신 내용 반영 테스트를 작성한다.
- [ ] 기준 버전 변경·선행 제안 미수락 시 적용 차단, 수정 요청 실패 시 원안 유지, 후속안 생성 후 원안 대체 테스트를 작성한다.
- [ ] 파일 교체 전·후와 DB 기록 전 중단을 주입하고 재시작 복구 결과가 이전 또는 완전히 적용된 상태인지 검사한다.
- [ ] `npm test -- tests/unit/proposals.test.ts tests/integration/recovery.test.ts`로 실패를 확인한다.
- [ ] Zod 응답 검증과 상태 전이, 단일 대상 문서 교체, 복구 저널·이전 파일 보관을 구현한다. 완료 전에는 수락 성공을 반환하지 않는다.
- [ ] 집중 테스트 통과 후 커밋한다.

## Task 5: 문서·대화·제안·시각화 화면 연결

**Files:** `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`, `src/renderer/features/{documents,conversation,proposals,graph}/`, `tests/e2e/workspace.spec.ts`, `tests/unit/render-safety.test.ts`.

**Interfaces:** preload의 `window.workspace`에 프로젝트 열기, 문서 목록·저장·관계 연결, 맥락 미리보기·요청 시작·취소, 제안 처리 메서드만 제공한다. 요청 이벤트는 구독 해제 함수를 반환한다. 모든 IPC 입력을 main에서 검증한다.

- [ ] 예제 두 문서를 열어 제목 이동·관계 연결·맥락 제외·제안 비교·수락·거절·재시작 후 이력 유지하는 E2E를 작성한다. E2E의 테스트 AI는 명확히 테스트 모드로 분리한다.
- [ ] Markdown 스크립트·이벤트 속성·위험 URL과 다이어그램의 실행 링크 차단 테스트를 작성한다. AI 연결 없음·취소·실패 시 문서 편집을 계속할 수 있는 E2E를 추가한다.
- [ ] `npm run test:e2e -- tests/e2e/workspace.spec.ts`, 렌더링 집중 테스트로 실패를 확인한다.
- [ ] 3영역 작업 화면, 새 문서 생성·가져오기, 변경 비교, 근거 이동, 상태 표시를 구현한다. 아이콘은 lucide를 사용하고 빈 상태·로딩·오류·취소 상태를 포함한다.
- [ ] React Flow로 확인된 관계 지도를, Mermaid로 사용자 흐름도를 표시한다. 다이어그램 요소와 원문을 연결하고 기준 문서 변경 시 갱신 필요를 표시한다.
- [ ] 실제 Codex로 새 문서 생성과 수락·거절 후 후속 요청을 확인한다. 맥락과 출처 확인 결과를 연결 검증 문서에 추가한다.
- [ ] Playwright 스크린샷으로 1440×900·1024×768·800×600 창에서 텍스트·패널 겹침과 지도 표시를 확인한다. 개발 서버와 앱을 실행해 사용자에게 실행 방법을 제공하고 커밋한다.

## Task 6: OS별 빌드와 GitHub 공개 준비

**Files:** `README.md`, `CONTRIBUTING.md`, `.github/workflows/{checks,release}.yml`, `forge.config.ts`, `outputs/verification-report.md`.

**Interfaces:** `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run make`를 로컬·CI에서 동일하게 사용한다. 릴리스 워크플로는 수동 실행과 지정 버전 태그로만 배포하며 PR에서 배포 비밀정보를 사용하지 않는다.

- [ ] README에 제품 목적, 개발·설치 방법, Codex 설치·로그인 조건, Gemini 지원 현황, 데이터 경로·전송 범위를 기록한다. 개발자가 아닌 사용자 기준의 예제도 포함한다.
- [ ] macOS와 Windows CI에 타입 검사·단위 및 통합 테스트·패키징을 연결한다. native SQLite 모듈이 선택됐다면 Electron 대상 재빌드·패키징 후 구동 검사를 포함한다.
- [ ] 공개 예제와 빌드 산출물에서 실제 사용자 문서·토큰·세션 캐시가 제외되는지 확인한다. 라이선스 결정 전 공개 릴리스는 준비 완료로만 기록한다.
- [ ] 로컬에서 아직 수행하지 않은 통합 검사를 실행하고 `npm run make`로 macOS 산출물을 만든다. Windows CI나 실제 Windows 결과가 없으면 미검증으로 기록한다.
- [ ] 확인한 항목과 미확인 항목을 `outputs/verification-report.md`에 구분하고 커밋한다. 원격 저장소 생성·push·공개 릴리스 결과는 실제 실행한 경우에만 보고한다.

## 실행 순서와 완료 판단

Task 1 → 2 → 3 → 4 → 5 → 6 순서로 직접 진행한다. 한 단계의 핵심 실패를 다음 단계의 화면으로 숨기지 않는다. 모든 변경은 해당 단계의 검증 후 커밋하며 사용자 작업을 되돌리지 않는다.

현재 확인: Node와 npm 실행 경로가 있고 Codex CLI 0.160.1이 설치되어 있다. 실제 인증·app-server 요청·Electron 실행은 아직 검증하지 않았다. 저장소도 아직 초기화하지 않았다.

이 계획은 설계서의 첫 구현 범위를 다룬다. Gemini 연결, 추가 다이어그램 유형, 자유로운 와이어프레임 편집, 팀 협업·클라우드 동기화는 이번 완료 조건에 포함하지 않는다.
