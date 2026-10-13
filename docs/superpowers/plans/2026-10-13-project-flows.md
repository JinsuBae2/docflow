# Project Flows Implementation Plan — #18

> Use superpowers:executing-plans inline, with TDD and one final independent review.

**Goal:** 관계 지도와 구분되는 로컬 프로젝트 흐름 목록·미리보기·원문 이동과 기본 시각 편집.
**Architecture:** main에서 Markdown AST와 프로젝트 내부 .mmd/.mermaid 링크를 색인한다. 순수 shared 모듈은 형식·실행 요소 검증과 기본 flowchart 편집 계약을 담당한다. renderer는 목록·Mermaid 미리보기·ReactFlow 편집을 제공하며 저장은 main의 revision 검증과 기존 문서 복구 경로를 재사용한다.
**Spec:** ../specs/2026-10-13-document-flows-design.md
**Tech Stack:** 기존 unified/remark, Mermaid, ReactFlow, TypeScript, Vitest, Playwright. 새 실행 엔진을 설치하지 않는다.

## Task 1: 색인과 편집 계약

- [x] 여러 문서/중첩 코드 블록을 제목·섹션·행으로 색인; 별도 정의 파일의 상대 링크·중복·경로 경계 검증.
- [x] 블록 fingerprint로 비다이어그램 본문·다른 블록 삽입에 안정적인 ID를 제공. 동일 코드 중복은 등장 순서로 구분한다. 코드 수정 시 새 fingerprint가 생기며 저장 결과로 선택을 유지한다.
- [x] flowchart/graph, sequenceDiagram, stateDiagram(-v2) 형식을 구분하고 실행 URL·HTML·config 지시문을 차단. 지원 밖/문법 오류/렌더 한도는 원문 열람을 유지한다.
- [x] 기본 편집은 사각 노드·단일 방향 화살표·라벨·방향에 한정. 서브그래프·스타일·주석 등 손실되는 문법은 읽기 보기로 유지.
- [x] 문서의 해당 코드 범위만 변경하고 전체 revision·초안을 검사. 기존 journal/충돌 검증 사용. 별도 정의 파일은 이번 단계 읽기 전용으로 보존.

## Task 2: 흐름 탐색 UI

- [x] 프로젝트 흐름 목록·검색·형식 표시, 원문 코드·경로·행, 변경 상태와 로컬 새로고침.
- [x] AI 없는 미리보기와 별도 AI 생성 버튼. 기존 AI 제안/수락 경로 유지.
- [x] Markdown 원문 코드 위치로 이동. 정의 파일은 원문 코드를 앱 안에서 열람하고 참조 문서로 이동.
- [x] 기본 흐름 시각 편집: 노드 추가·이름 변경·삭제·핸들/키보드 연결·연결 삭제·방향 설정, 미리보기·명시 저장·취소.
- [x] 미리보기 오류/복잡한 문법/저장 충돌 시 원문·편집 초안 보존. 미저장 편집 중 목록 전환·종료는 확인.

## Task 3: 검증과 PR

- [x] 가까운 테스트 RED→GREEN 후 전체 lint/format/typecheck/test/build/Electron E2E.
- [x] 실제 앱 합성 캡처와 독립 전체 리뷰, 검증 문서·README.
- 전달: #18 전용 PR을 생성하고 macOS·Windows CI 결과를 PR Checks에서 확인한다. 병합은 사용자가 수행한다.

검증 파일: tests/unit/flows.test.ts, tests/integration/project-flows.test.ts, tests/e2e/project-flows.spec.ts.
구현 파일: src/shared/flows.ts, src/main/project/flows.ts, store/contracts/ipc/preload, Diagram.tsx, SimpleFlowEditor.tsx, DocumentView/App/styles.
한계: Mermaid 자체의 렌더 예산(50,000자·500 edge)은 명시하고 원문은 유지한다. 다른 언어의 code fence는 형식 어댑터 확장점으로 표시하고 자동 실행하지 않는다. #19 AI 맥락 분할은 별도다.
