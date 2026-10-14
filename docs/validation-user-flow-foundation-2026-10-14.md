# 유저플로우 Phase 1 검증 — 2026-10-14

이슈 #31, `feat/user-flow-foundation`. 관계지도 PR #30의 변경을 유지하고 최신 main 기준으로 Phase 1 변경만 분리한다.

## 구현 결과

- strict JSON 타입·파서: 고아 edge, 전체 중복 ID, 잘못된 부모·순환 그룹, 조건 포트·근거 범위·좌표·영구 Diff 플래그를 차단한다.
- `.workspace/flows/<id>.json` 원자 저장·불러오기, 프로젝트·기대 revision·실제 문서 근거 검증, 손상 파일별 안내, 원문 불변.
- 그룹과 5종 노드, 근거/AI 추정 배지, 문서↔플로우 노드 이동, 중첩 그룹 접기 투영.
- ELK 전용 Worker의 좌→우 Layered/Orthogonal 배치. 최초/자동 정렬을 구분하며 기존 좌표와 미배치 노드가 섞인 JSON에서도 수동 좌표를 보존한다. 이동·키보드·접기는 좌표와 상태만 저장한다.
- 기존 Mermaid 보기를 유지하고 지원되는 단순 flowchart만 별도 JSON으로 가져온다. 순수 Diff helper는 추가·수정·삭제를 계산하며 원본에 표시 상태를 저장하지 않는다.

## 실행 결과

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`: 통과.
- `npm test`: 114개 통과, 실계정 제공자 테스트 5개 건너뜀.
- 전체 Electron E2E: 기존 기능 15개 통과, 기존 사용량 테스트 대기 오류와 새 방향키 저장 회귀 실패를 확인했다. 선택 상태 반영을 수정한 후 `user-flows.spec.ts`와 `usage.spec.ts`를 함께 단독 실행해 2개 모두 통과했다. 전체 실행이 한 번에 17개 통과했다고 주장하지 않는다.
- 새 E2E는 최초 배치, 5종 렌더링, 선 시작점과 실제 핸들 좌표 일치, 드래그/방향키 저장, 근거 오류 후 원본 복원, 그룹 투영, 근거 왕복 이동, 재시작과 외부 JSON 신규 노드 추가 시 기존 배치 보존, 기존 Mermaid 탐색과 원문 불변을 검증한다.
- 실제 Claude 계정 연결·유료 추론은 실행하지 않았다. 사용량 E2E는 가짜 응답을 사용한다. 사용자 지시에 따라 실제 Claude 연결을 기다리거나 재시도하지 않는다.
- 예제 화면 `docs/images/user-flow-foundation.png`를 직접 확인했다. 사용자 문서·인증정보·개인 DB는 포함하지 않았다.

## 리뷰와 한계

독립 리뷰의 기존 좌표 초기화, 실패 후 최신 JSON 복원, 그룹 직접 연결 핸들 위치를 수정했다. 화면 검증에서 발견한 ELK 중첩 edge 컨테이너 좌표도 수정하고 테스트로 고정했다. 기존 과부하 시 단위 테스트 타임아웃은 별도 실행으로 114개 통과를 확인했으며 관련 없는 테스트 시간 제한은 변경하지 않았다.

수동 이동 후에는 연결점에 맞는 직각 선을 갱신하며 전체 ELK를 다시 실행하지 않는다. 새 시각적 노드 추가·편집 UI 대신 Phase 1에서는 JSON 편집을 사용한다. AI 추출·제안 검토·Mermaid 내보내기·DMG는 후속 단계다. 기존 elkjs 0.9.3의 EPL-2.0 고지를 재사용하며 배포물을 수정하지 않았다.

## 변경 파일

- 의존성: `package.json`, `package-lock.json`
- 공통 계약: `src/shared/user-flow.ts`, `src/shared/contracts.ts`
- 저장·IPC: `src/main/project/user-flows.ts`, `src/main/project/store.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- 화면: `src/renderer/App.tsx`, `src/renderer/styles.css`
- 유저플로우: `src/renderer/features/user-flow/ProjectDiagrams.tsx`, `UserFlowWorkspace.tsx`, `UserFlowCanvas.tsx`, `UserFlowNodes.tsx`, `layout.ts`, `layout.worker.ts`
- 테스트: `tests/unit/user-flow.test.ts`, `tests/unit/user-flow-layout.test.ts`, `tests/integration/user-flows.test.ts`, `tests/e2e/user-flows.spec.ts`
- 문서: `README.md`, `docs/user-flow-format.md`, 본 검증 기록, `docs/images/user-flow-foundation.png`, `docs/superpowers/specs/2026-10-14-user-flow-foundation.md`, `docs/superpowers/plans/2026-10-14-user-flow-foundation.md`
