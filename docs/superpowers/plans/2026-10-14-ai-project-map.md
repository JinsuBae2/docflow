# AI Project Relationship Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 현재 세션에서 직접 구현하고 마지막에 독립 리뷰를 한 번 수행한다.

**Goal:** docs 등록 후 AI로 프로젝트→문서→소제목 관계 지도를 생성하고, 사용자가 카드를 이동하며 관계의 의미와 원문 근거를 확인한다.

**Architecture:** ReactFlow는 원문 구조와 로컬 지도 메타데이터를 표시하고 Worker는 실측 장애물에 대한 배선을 계산한다. main은 배치·지도 제안을 저장하며 기존 분할 분석의 실행부를 지도 전용 출력 계약과 함께 재사용한다. 일반 문서 제안·Mermaid·기존 프로젝트 데이터는 유지한다.

**Tech Stack:** 기존 React/TypeScript, ReactFlow, SQLite, Zod, Codex/Claude 어댑터, Vite Web Worker, Vitest/Playwright. 새 제품 의존성을 추가하지 않는다.

**Spec:** ../specs/2026-10-14-ai-project-map-design.md

## Global Constraints

- 기본 화면은 왼쪽 프로젝트 루트 → 가운데 등록 문서 → 오른쪽 문서별 소제목/주제의 3열이다.
- 초기 열 x 좌표는 루트 0 / 문서 360 / 소제목 760px, 기본 카드 폭 230px이다.
- 범례: 실선 — 문서 구조 / 점선 — 문맥 관계 / AI 제안 — 미확정.
- 카드 장애물 여백 16px, A* 격자 12px, 드래그 배선 최대 100ms 간격, 탐색 상한 선당 50,000개 상태다.
- 파일 등록 자체로 AI 요청을 보내지 않으며 초안·제외 문서·가짜 근거를 보내거나 반영하지 않는다.
- 생성 결과는 지도 메타데이터이며 원문 Markdown과 기존 사용자 배치를 자동 덮어쓰지 않는다.
- 실제 제목과 AI 요약 주제는 구분하고 모든 AI 관계에 검증 가능한 양쪽 근거를 남긴다.
- AI 후보는 섹션당 상위 3개 + 별도로 모든 기존 링크 후보이며 전수 문서 쌍 비교를 주장하지 않는다.
- 실계정 유료 추론과 이슈 #3/#4, DMG·자동 업데이트는 이 계획의 구현 범위 밖이다.

## Review Focus

1. 동일 제목 반복/제목 변경 시 다른 섹션에 좌표·근거를 잘못 붙이지 않는다 → Task 1/4.
2. 겹치는 카드·역방향·자기 연결·막힌 통로에서 선을 카드 위로 통과시키지 않는다 → Task 3.
3. 생성 중 문서 변경·프로젝트 전환·새 초안 발생 시 오래된 제안을 반영하지 않는다 → Task 5/6.
4. 취소/앱 재시작/출력 오류로 완료 묶음을 잃거나 제안과 사용량을 중복 등록하지 않는다 → Task 5.
5. 문서 접기·재생성·원문 링크가 사용자 관계 이름·배치·연결 출처를 잃게 하지 않는다 → Task 2/4/6.

## 전달 단위

- **PR A:** Tasks 1–3. 로컬 3열 지도, 이동·저장, 범례, 장애물 회피. 후보 브랜치 `feat/project-map-layout`.
- **PR B:** Tasks 4–7. 구조화 AI 분석, 등록 직후 안내, 지도 제안 검토/반영. 후보 브랜치 `feat/ai-project-map`.
- 이슈와 브랜치는 구현 시작 시 만든다. PR 제목은 `feat(graph): …`, 본문은 `.github/pull_request_template.md`를 사용한다. 사용자 병합 후 다음 단계로 넘어간다.

## Task 1: 지도 데이터와 원문 구조

**Files:** Create `src/shared/project-map.ts`, `src/main/project/map-store.ts`, `tests/integration/project-map.test.ts`; Modify `src/shared/contracts.ts`, `src/main/project/store.ts`, `src/main/ipc.ts`, `src/preload/index.ts`.

**Interfaces:**
- `MapNode = { id, kind: 'root'|'document'|'section'|'topic', documentId?, sectionId?, title, origin: 'source'|'ai', revision?, evidence?: MapEvidence[] }`.
- `MapEvidence = { sourceId, documentId, revision, start, end, quote }`; start/end는 원문 Markdown의 UTF-16 offset이다.
- `MapPosition = { nodeId: string; x: number; y: number }`.
- `MapEdge = {id,fromId,toId,kind:'structure'|'semantic',label,origin,status,evidence?:MapEvidence[]}`. origin은 source/manual/ai/markdown, status는 pending/confirmed/stale이다.
- `ProjectMap = { projectId, nodes:MapNode[], edges:MapEdge[], positions:MapPosition[], collapsedDocumentIds:string[], legendCollapsed:boolean }`.
- `ProjectMapStore.read(): ProjectMap`; `saveLayout(projectId: string, positions: MapPosition[]): ProjectMap`; `saveView(projectId:string, view:{collapsedDocumentIds:string[];legendCollapsed:boolean}): ProjectMap`.
- IPC `projectMap()`, `saveMapLayout(projectId,positions)`, `saveMapView(projectId,view)`는 각각 `Promise<ProjectMap>`을 반환한다.

- [ ] RED: `project-map.test.ts`에 root 1개·document 전체·section 전체, 같은 제목/다른 ID, 이전 DB의 빈 배치, 원문 불변, NaN/Infinity/다른 project/node ID 거부를 검증하는 테스트를 작성한다.
- [ ] Run `npm test -- tests/integration/project-map.test.ts` → 새 계약 부재로 FAIL을 확인한다.
- [ ] 타입과 MapStore를 구현한다. 원문 구조를 재구성하고 로컬 메타데이터를 겹쳐 읽는다. 삭제 ID 좌표를 비활성 보존하며 새 ID에 재사용하지 않는다.
- [ ] 같은 테스트와 `npm run typecheck` → PASS.
- [ ] Commit: `feat(graph): add persistent project map structure`.

## Task 2: 3열 표시·이동·범례·의미 라벨

**Files:** Create `src/renderer/features/graph/MapLegend.tsx`, `src/renderer/features/graph/MapNodes.tsx`, `tests/e2e/project-map.spec.ts`; Modify `src/renderer/features/graph/ProjectGraph.tsx`, `layout.ts`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `tests/unit/graph-layout.test.ts`, `tests/e2e/graph-connect.spec.ts`.

**Interfaces:** `layoutProjectMap(map: ProjectMap, sizes: Record<string, {width:number;height:number}>): Record<string,{x:number;y:number}>`; `MapLegend({collapsed:boolean,onToggle:()=>void})`. 좌표/보기 설정은 Task 1의 IPC를 사용한다.

- [ ] RED: layout test에서 root.x=0/doc.x=360/section.x=760, 실측 카드 비중첩, 저장 좌표 우선, 새 노드만 추가를 검증한다. E2E는 드래그 후 재시작 복원, 폴링 중 드래그 유지/저장 실패 시 좌표 보존과 재시도, 클릭/연결 드래그의 잘못된 원문 이동 방지, 범례 고정/접기/키보드 동작을 검증한다.
- [ ] Run `npm test -- tests/unit/graph-layout.test.ts` → 새 배치 테스트 FAIL.
- [ ] 독립 root/document/section node, 좌우 handle, onNodesChange/drag stop 저장, 문서별 접기, 검색/원문 이동, 범례를 구현한다. 의미 관계는 점선, 미확정 제안은 배지와 접근성 라벨로 구분한다.
- [ ] 섹션 endpoint를 문서 카드로 항상 합치지 않고 섹션 카드에 연결한다. 접을 때만 표시를 문서 카드로 투영하고 실제 ID를 유지한다. 기존 type을 선 라벨에 사용하며 출처는 상세정보로 옮긴다.
- [ ] Unit/typecheck/build → PASS. 이후 `npm run test:e2e -- tests/e2e/project-map.spec.ts tests/e2e/graph-connect.spec.ts` → PASS.
- [ ] Commit: `feat(graph): show a movable left-to-right project map`.

## Task 3: 장애물 회피 배선

**Files:** Create `src/renderer/features/graph/routing.ts`, `routing.worker.ts`, `RoutedEdge.tsx`, `tests/unit/graph-routing.test.ts`; Modify `src/renderer/features/graph/ProjectGraph.tsx`, `layout.ts`, `tests/e2e/project-map.spec.ts`.

**Interfaces:** `routeEdges(input: {version:number; nodes:Array<{id:string;x:number;y:number;width:number;height:number}>; edges:Array<{id:string;fromId:string;toId:string}>}): {version:number;routes:Array<{id:string;points:Array<{x:number;y:number}>;labelPosition?:{x:number;y:number};status:'ready'|'blocked'|'budget'}>}`. Worker는 같은 입출력을 postMessage한다.

- [ ] RED: `graph-routing.test.ts`에서 모든 선분의 16px 확장 장애물 비침범, 직각 경로, 역방향/자기 연결/높이가 다른 카드/밀집/경로 없음/탐색 상한/이전 version 폐기를 검증한다.
- [ ] Run `npm test -- tests/unit/graph-routing.test.ts` → 미구현 FAIL.
- [ ] 포트/stub, 12px 격자 A*, 꺾임/교차 비용, 50,000 상한과 한 번의 외곽 확장, 최종 교차 검사, 카드 밖 라벨을 구현한다. renderer는 version이 맞는 Worker 결과만 적용하고 부정확한 이전 경로를 그리지 않는다.
- [ ] E2E에 카드 이동 후 전체 장애물 재계산, 접기/zoom/화면 밖 카드 검증을 추가한다. 300개 노드/500개 선의 실측을 기록한다. 2초 목표 미달 시에도 UI를 막거나 데이터를 조용히 누락하지 않는다.
- [ ] Unit/typecheck/build/E2E → PASS. 기존 detour 전용 코드는 모든 호출을 대체한 범위만 제거한다.
- [ ] Commit: `feat(graph): route edges around movable cards`. PR A를 리뷰/CI/사용자 병합에 전달한다.

## Task 4: AI 지도 출력 계약과 근거 검증

**Files:** Create `src/shared/map-schema.ts`, `src/main/project/map-proposals.ts`, `tests/integration/map-proposals.test.ts`; Modify `src/shared/project-map.ts`, `src/main/project/map-store.ts`.

**Interfaces:**
- `MapEndpoint = {kind:'document'|'section';id:string}|{kind:'topic';key:string}`.
- `MapAiResponse = {message:string;topics:Array<{key:string;title:string;documentId:string;keywords:string[];evidence:MapEvidence[]}>;relations:Array<{from:MapEndpoint;to:MapEndpoint;type:string;reason:string;evidence:MapEvidence[]}>}`.
- `MapDraft = {id,projectId,snapshotIds,status:'pending'|'accepted'|'rejected'|'stale',response:MapAiResponse}`. 항목별 선택 key와 topic 노드의 실제 UUID는 main에서 부여한다.
- `MapProposalService.register(snapshot: ContextSnapshot, raw: unknown): MapDraft`; `accept(draftId: string, selectedKeys: string[]): ProjectMap`; `reject(draftId:string):void`.
- `ProjectMapStore.setRelationLabel(projectId: string, relationId: string, label: string): ProjectMap`. 원문 파생 관계는 로컬 별칭으로 저장한다.

- [ ] RED: 가짜 root/section/source ID, 다른 프로젝트, 제외 source, 범위 초과/불일치 quote, 한쪽 근거 누락, 같은 제목/다른 section, revision 변경, 중복 accept, topic key 충돌을 거부하는 테스트를 작성한다. 원문 불변·수동 별칭 우선·기존 관계 보존도 검증한다.
- [ ] Run `npm test -- tests/integration/map-proposals.test.ts` → 미구현 FAIL.
- [ ] Zod strict schema와 snapshot ID/range/revision/quote 검증을 구현한다. topic/관계를 MapDraft로 저장하고 반영을 트랜잭션으로 처리한다. AI 출력으로 원문 구조를 삭제/교체하지 않는다.
- [ ] 같은 테스트와 typecheck → PASS.
- [ ] Commit: `feat(graph): validate evidence-backed AI map drafts`.

## Task 5: 분할 실행과 제공자 공통 출력

**Files:** Create `src/main/ai/structured-output.ts`, `src/main/project/batch-runner.ts`, `map-analysis.ts`, `tests/integration/map-analysis.test.ts`; Modify `src/main/ai/provider.ts`, `codex-provider.ts`, `claude-provider.ts`, `src/main/project/analysis.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`.

**Interfaces:**
- `StructuredRequest<T> = {context:unknown;instructions:string;jsonSchema:object;parse:(raw:unknown)=>T}`. `StructuredAiEvent<T>`는 기존 AiEvent에서 result.response만 T로 바꾼 타입이다.
- `AiProvider.runStructured<T>(request:StructuredRequest<T>,signal:AbortSignal,model?:string):AsyncIterable<StructuredAiEvent<T>>`. 기존 `run(context,signal,model)`은 AiResponse wrapper로 유지한다. parse callback을 IPC로 전달하지 않는다.
- `PersistedBatch = {id,key,phase,snapshot:ContextSnapshot,completed:boolean,cached:boolean}`. `PersistedBatchJob = {id,namespace:'document'|'project-map',batches:PersistedBatch[],provider:AiProviderId,model:string,budget:AnalysisBudget,revisions:Record<string,string>,boundary:string,status,completed:number,cached:number,total:number,error?:string}`.
- `BatchExecutor<T> = {request:(snapshot:ContextSnapshot)=>StructuredRequest<T>;register:(snapshot:ContextSnapshot,response:T)=>Promise<void>}`.
- `BatchRunner.run<T>(job:PersistedBatchJob,factory:()=>AiProvider,executor:BatchExecutor<T>,signal:AbortSignal):AsyncIterable<StructuredAiEvent<T>>`. 기존 analysis 기록은 wrapper에서 위 타입으로 읽고 이전 request/cache/usage의 호환을 유지한다.
- `MapAnalysisSummary extends AnalysisSummary`에 `phase:'documents'|'candidates'|'relations'|'completed'`, `relationBatchesKnown:boolean`, `draftIds:string[]`을 추가한다.
- `MapAnalysisService.prepare(input:AnalysisInput,settings:{provider:AiProviderId;model:string}):MapAnalysisSummary`; `run(id:string,signal:AbortSignal):AsyncIterable<MapGenerationEvent>`.
- `MapGenerationEvent`는 progress(text), usage(UsageReport), completed(draftIds), cancelled, error(message) 판별 union이다.
- IPC `prepareMapAnalysis(input)`, `startMapAnalysis(id)`, `cancelMapAnalysis()`, `listMapAnalyses()`, 독립 `onMapGenerationEvent`. 일반 대화의 RequestEvent와 섞지 않는다.

- [ ] RED: 가짜 제공자로 전체 포함 본문 coverage, AI 키워드 기반 상위 3개 후보+모든 기존 링크의 양쪽 검토, map/document 캐시 분리, 출력 초과, 인증/제공자 오류, 취소/재개, 저장된 응답 복원, 호출별 usage, 도중 변경/다른 프로젝트 무효화를 검증한다.
- [ ] Run `npm test -- tests/integration/map-analysis.test.ts` → 미구현 FAIL.
- [ ] 실행부를 공통화하고 일반 AnalysisService는 기존 테스트와 저장 계약을 유지한다. 두 provider에서 structured transport를 사용하되 인증·sandbox·도구 금지·출력 한도를 보존한다.
- [ ] 지도 전용 instructions/schema/cache namespace를 적용한다. 본문 분석→키워드 후보 검색→양쪽 검토를 checkpoint로 저장한다. 기존 source/section의 ID·문맥은 실제 제공한 범위만 모델에 포함한다.
- [ ] 후보 관계 묶음은 본문 분석 결과가 나온 뒤 확정한다. 최초 계획은 본문 묶음 수와 추가 검토 발생 가능성을 알리고, 관계 단계 진입 시 전체 수를 갱신한다. 진행률을 처음부터 확정 비용처럼 표시하지 않는다.
- [ ] Run `npm test -- tests/integration/map-analysis.test.ts tests/integration/context-analysis.test.ts tests/integration/codex-provider.test.ts tests/integration/claude-provider.test.ts` 및 typecheck → PASS.
- [ ] Commit: `feat(ai): generate project maps with resumable evidence analysis`.

## Task 6: 등록 안내와 지도 결과 검토

**Files:** Create `src/renderer/features/graph/MapGenerationDialog.tsx`, `MapReviewPanel.tsx`, `tests/e2e/ai-project-map.spec.ts`; Modify `src/renderer/App.tsx`, `src/renderer/features/graph/ProjectGraph.tsx`, `src/renderer/styles.css`, `src/main/ipc.ts`, `src/preload/index.ts`.

**Interfaces:** `MapGenerationDialog({workspace,newDocumentIds,onClose,onCompleted})`; `MapReviewPanel({drafts,onAccept,onReject,onSource})`. IPC `listMapDrafts()`, `acceptMapDraft(id,selectedKeys)`, `rejectMapDraft(id)`는 Task 4의 service를 사용한다.

- [ ] RED: 새 등록/수동 등록/import 완료 뒤 1회 안내, 취소/중복/재실행 시 자동 호출 없음, ‘나중에’ 선택 시 사용량 불변, 범위 확인 후에만 생성, 제외/초안/미연결/다른 프로젝트/도중 revision 변경을 E2E로 검증한다.
- [ ] Build 후 `npm run test:e2e -- tests/e2e/ai-project-map.spec.ts` → 새 UI 부재로 FAIL.
- [ ] 등록 전후 ID 차이로 newDocumentIds를 구한다. spec의 안내 문구를 사용하고 범위/예산/본문 묶음 확인과 생성 시작을 분리한다. 큰 처리에는 진행·취소·재개를 제공한다.
- [ ] 지도에서 ‘AI 요약 주제’와 ‘AI 제안’ 배지, 의미 관계, 근거/이유 상세정보, 원문 범위 이동, 일괄/선택 반영을 구현한다. 재생성해도 기존 좌표/별칭/수동 관계는 유지한다.
- [ ] 같은 E2E와 기존 document-registration/context-analysis/relationships/graph-connect E2E → PASS.
- [ ] Commit: `feat(graph): offer AI map generation after document registration`.

## Task 7: 최종 검증·문서·PR B

**Files:** Modify `README.md`; Create `docs/validation-ai-project-map-2026-10-14.md`. 캡처는 합성 문서로 `outputs/ai-project-map.png`에 저장한다.

- [ ] `npm run lint && npm run format:check && npm run typecheck` → PASS.
- [ ] `npm test` → 전체 unit/integration PASS, opt-in live 제외.
- [ ] `npm run build && npm run test:e2e` → PASS. 성능 실측/목표 미달 시 대안, 검토 범위, 원문 불변을 기록한다.
- [ ] 마지막 독립 리뷰에서 중요한 지적을 회귀 테스트와 함께 해소한다. spec 전체와 Task의 대응, 타입 이름, 확인 항목을 재검토한다.
- [ ] PR B를 템플릿으로 작성·첨부하고 macOS/Windows CI를 확인한다. 사용자 문서/키/DB를 포함하지 않고 AI 이용 범위와 미검증 사항을 설명한다. 사용자 병합을 기다린다.

## 계획 작성 시 자체 검토

구조/등록/AI/근거/이동/범례/의미 라벨/장애물/호환/취소/캐시를 각 Task에 대응시켰다. 기존 document-only relation 제안으로 section/topic 반영이 안 되는 점을 확인하고 별도 MapDraft로 분리했다. Worker의 오래된 결과, 제공자 schema 확장과 기존 대화 계약, 제목 없는 문서·동일 제목·접기 투영·대규모 탐색 상한을 검증에 포함했다.

계획만 작성한 상태다. 구현 시작 시 최신 main을 다시 확인하고 PR A부터 순서대로 직접 구현한다.
