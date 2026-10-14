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
- 최신 전체 Electron E2E: `npm run test:e2e` 17개 모두 통과(1.3분). 유저플로우 버튼 가림 회귀와 기존 사용량 테스트의 초기 모델 조회·설정 창 종료 대기를 포함한다. 변경 파일 ESLint·Prettier, 타입 검사와 빌드도 통과했다.
- 새 E2E는 최초 배치, 5종 렌더링, 선 시작점과 실제 핸들 좌표 일치, 드래그/방향키 저장, 근거 오류 후 원본 복원, 그룹 투영, 근거 왕복 이동, 재시작과 외부 JSON 신규 노드 추가 시 기존 배치 보존, 기존 Mermaid 탐색과 원문 불변을 검증한다.
- 실제 Claude 계정 연결·유료 추론은 실행하지 않았다. 사용량 E2E는 가짜 응답을 사용한다. 사용자 지시에 따라 실제 Claude 연결을 기다리거나 재시도하지 않는다.
- 예제 화면 `docs/images/user-flow-foundation.png`를 직접 확인했다. 사용자 문서·인증정보·개인 DB는 포함하지 않았다.

## 리뷰와 한계

독립 리뷰의 기존 좌표 초기화, 실패 후 최신 JSON 복원, 그룹 직접 연결 핸들 위치를 수정했다. 화면 검증에서 발견한 ELK 중첩 edge 컨테이너 좌표도 수정하고 테스트로 고정했다. 기존 과부하 시 단위 테스트 타임아웃은 별도 실행으로 114개 통과를 확인했으며 관련 없는 테스트 시간 제한은 변경하지 않았다.

최초 CI에서 macOS는 전체 E2E를 통과했고 Windows는 그룹 접기 후 선 투영 검사만 실패했다. 동적 Handle 변경 때 `useUpdateNodeInternals`로 재측정하도록 보완하고 펼치기·재접기 회귀를 추가했다. 실제 Claude 연결 오류와는 무관하다.

Windows에서는 재측정만으로 같은 실패가 남아, 접힌 노드 구조가 바뀌면 React Flow 인스턴스를 새로 만들고 현재 viewport를 전달하도록 보완했다. 이후 CI에서는 선 투영 검사를 통과했지만 양쪽 OS에서 펼치기 버튼 클릭이 차단됐다. Windows의 플로우 목록과 macOS의 캔버스 바깥 영역이 클릭을 가로막았다.

그룹을 접으면 오른쪽 위 버튼이 축소된 너비만큼 왼쪽으로 이동해 기존 viewport 밖으로 나가는 것을 작은 창에서 실제 캔버스 드래그로 재현했다. 접기·펼치기 때 버튼의 예상 화면 위치를 계산하고, 캔버스 가장자리 12px와 하단 컨트롤 영역을 피해 필요한 만큼만 viewport를 이동한다. 저장된 노드 좌표와 확대율은 유지한다. E2E는 버튼의 실제 hit target, 캔버스 내부 위치, 확대율 유지 및 강제 클릭 없이 반복 접기·펼치기를 검사한다. `force: true`, 타임아웃 증가는 사용하지 않았다.

수동 이동 후에는 연결점에 맞는 직각 선을 갱신하며 전체 ELK를 다시 실행하지 않는다. 새 시각적 노드 추가·편집 UI 대신 Phase 1에서는 JSON 편집을 사용한다. AI 추출·제안 검토·Mermaid 내보내기·DMG는 후속 단계다. 기존 elkjs 0.9.3의 EPL-2.0 고지를 재사용하며 배포물을 수정하지 않았다.

## 변경 파일

- 의존성: `package.json`, `package-lock.json`
- 공통 계약: `src/shared/user-flow.ts`, `src/shared/contracts.ts`
- 저장·IPC: `src/main/project/user-flows.ts`, `src/main/project/store.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- 화면: `src/renderer/App.tsx`, `src/renderer/styles.css`
- 유저플로우: `src/renderer/features/user-flow/ProjectDiagrams.tsx`, `UserFlowWorkspace.tsx`, `UserFlowCanvas.tsx`, `UserFlowNodes.tsx`, `layout.ts`, `layout.worker.ts`
- 테스트: `tests/unit/user-flow.test.ts`, `tests/unit/user-flow-layout.test.ts`, `tests/integration/user-flows.test.ts`, `tests/e2e/user-flows.spec.ts`
- 문서: `README.md`, `docs/user-flow-format.md`, 본 검증 기록, `docs/images/user-flow-foundation.png`, `docs/superpowers/specs/2026-10-14-user-flow-foundation.md`, `docs/superpowers/plans/2026-10-14-user-flow-foundation.md`
