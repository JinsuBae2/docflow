# 유저플로우 Phase 2 검증 — 2026-10-14

이슈 #33, 브랜치 `feat/user-flow-proposals`, 기준 main `0074704`.

## 결과

- flow 전용 AI 출력 스키마/지침, 서버 기준본과 범위별 근거 검증, 기존 ID·같은 부모 좌표 보존.
- 생성/수정 요청 시 기존 문서 선택·맥락 확인과 보수적 입력 토큰 추정 안내.
- 추가/수정/삭제 캔버스 Diff, 변경 속성 패널, 근거 이동, ELK Worker 배치.
- revision 충돌 차단, 기존 recovery journal을 통한 JSON·수락 상태 복구, 사유 거절 후 후속 요청.
- 문서/관계 제안 출력 스키마는 기존 크기 유지. 실제 Claude 연결/유료 요청 없음.

## 검증

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`: 통과.
- `npm test`: 127개 통과, 실계정 테스트 5개 건너뜀.
- `npm run test:e2e`: 18개 통과(1.2분), 기존17개 + AI 플로우1개.
- 새 E2E: AI 생성 → 추가 Diff/수락 전 파일 불변 → 수락/좌표 저장 → 수정·삭제 Diff → 사유 거절/원본 불변 → 후속 제안 → 수정 수락/기존 좌표 유지. 노드 겹침도 검사.
- 독립 리뷰 4건을 RED→GREEN 회귀 테스트로 수정: 섹션 후속 요청 범위 유지, 그룹 유형 변경 후 ghost 배치, 파일 교체 후 수락 상태 복구, 유지 그룹 내부 ghost 공간 예약.
- 공개 예제 데이터의 캔버스 화면을 직접 확인: `docs/images/user-flow-proposal-diff.png`.
- 첫 전체 단위 실행은 스키마 크기 증가로 기존 분석 예산 검사9건과 과부하 테스트1건이 실패했다. 전용 스키마 분리 후 관련13개, 최종 단독 전체127개가 통과했다. 제한 시간을 늘리지 않았다.

## 사용 안내

`docs/user-flow-proposals.md` 참고. 원본/미리보기 분리와 기본60000자 맥락 정책을 유지한다. DMG·자동 업데이트는 이번 범위가 아니다. CI 결과는 PR checks를 확인한다.

## 변경 파일

- `docs/images/user-flow-proposal-diff.png`
- `docs/superpowers/plans/2026-10-14-user-flow-proposals.md`
- `docs/user-flow-proposals.md`
- `docs/validation-user-flow-proposals-2026-10-14.md`
- `src/main/ai/claude-provider.ts`
- `src/main/ai/codex-provider.ts`
- `src/main/ai/instructions.ts`
- `src/main/ipc.ts`
- `src/main/project/context.ts`
- `src/main/project/flow-proposals.ts`
- `src/main/project/proposals.ts`
- `src/main/project/recovery.ts`
- `src/main/project/store.ts`
- `src/main/project/user-flows.ts`
- `src/preload/index.ts`
- `src/renderer/App.tsx`
- `src/renderer/features/proposals/ProposalList.tsx`
- `src/renderer/features/user-flow/FlowProposalReview.tsx`
- `src/renderer/features/user-flow/ProjectDiagrams.tsx`
- `src/renderer/features/user-flow/UserFlowCanvas.tsx`
- `src/renderer/features/user-flow/UserFlowNodes.tsx`
- `src/renderer/features/user-flow/UserFlowWorkspace.tsx`
- `src/renderer/features/user-flow/proposal-layout.ts`
- `src/renderer/styles.css`
- `src/shared/contracts.ts`
- `src/shared/flow-proposal-preview.ts`
- `src/shared/proposal-schema.ts`
- `tests/e2e/flow-proposals.spec.ts`
- `tests/fixtures/fake-codex.cjs`
- `tests/fixtures/flow-response.cjs`
- `tests/integration/flow-providers.test.ts`
- `tests/integration/user-flow-proposals.test.ts`
- `tests/unit/flow-proposal-preview.test.ts`
