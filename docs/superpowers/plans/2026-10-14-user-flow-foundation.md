# User Flow Foundation 구현 계획

Spec: ../specs/2026-10-14-user-flow-foundation.md

사용자의 명시적 구현 요청에 따라 이 세션에서 직접 진행한다. 이전 PR30 변경을 보존한 `feat/user-flow-foundation`에서 작업한다.

## 검증 루프

1. `src/shared/user-flow.ts`: Zod 스키마·무결성 파서, collapse projection, runtime Diff. 먼저 `tests/unit/user-flow.test.ts`에서 고아 edge/중복/부모/순환/투영/Diff 실패 확인 후 구현.
2. `src/main/project/user-flows.ts`: 안전한 JSON list/read/save/import, 프로젝트·revision·근거 검사. `tests/integration/user-flows.test.ts`에서 저장/재시작/원문 불변/충돌/잘못된 경로·근거·손상 파일 검증. contracts/ipc/preload를 같은 계약으로 연결.
3. `src/renderer/features/user-flow/layout.ts`, `layout.worker.ts`: 명시적 elkjs 의존성, 중첩 그룹·출력 포트·좌→우 자동 정렬. `tests/unit/user-flow-layout.test.ts`에서 노드 좌표·그룹 크기·분기 포트와 사용자 좌표 비변경 확인.
4. `UserFlowNodes.tsx`, `UserFlowCanvas.tsx`, `UserFlowWorkspace.tsx`: 그룹+5종 카드, 저장·재시도·JSON 편집·가져오기·자동 정렬·이동·접기·배지. Diagram/App에 보기 전환과 양방향 원문 이동 통합. 기존 Mermaid 기능 보존.
5. Electron E2E로 다섯 노드 렌더링, 접기 선 투영, 드래그·재시작 복원, 근거 왕복 이동, 충돌·기존 Mermaid 가져오기 확인. Prettier/ESLint/typecheck/test/build/관련 E2E 실행, 주요 변경이므로 전체 회귀 실행. 마지막에 한 번 독립 리뷰 후 필요한 수정과 재검증.

## 리뷰 초점

- 손상·심볼릭 링크·외부 JSON 경로가 다른 프로젝트 파일을 덮어쓰지 않는다.
- 접힌 중첩 그룹의 선과 분기 라벨이 원본 endpoint/ID를 잃지 않는다.
- 프로젝트 전환·오래된 revision·이동 중 폴링이 좌표를 덮어쓰지 않는다.
- 문서 수정·삭제 이후 기존 근거가 오래되었다고 표시하고 새 저장은 충돌을 검사한다.
- 사용자 배치는 자동으로 재정렬하지 않고 원본 Mermaid/Markdown을 변경하지 않는다.
