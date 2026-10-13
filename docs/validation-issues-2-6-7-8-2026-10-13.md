# 이슈 #2·#6·#7·#8 작업 복구 및 통합 검증

날짜: 2026-10-13 (Asia/Seoul)

## 복구 시 확인한 상태

- 현재 브랜치: `feat/8-rejection-followup`, 기준 커밋 `adfb1e2`.
- 추적 파일 변경 없음. 미추적 `tests/unit/feedback.test.ts`를 보존해 구현을 이어갔다.
- #2 프로젝트 섹션: `2988fa3`, `8102150`, PR #10.
- #6 관계 제안과 편집: `b0a42ce`, `05401cf`, PR #11.
- #7 사용량: `7500f8b`, `519dadb`, `adfb1e2`, PR #12.
- #8: 테스트만 작성된 상태로 중단. 승인된 설계와 `docs/superpowers/plans/2026-10-13-rejection-followup.md`의 두 작업을 재개했다.
- #11 Windows CI의 기존 실패는 `tests/unit/imports.test.ts`의 시간 초과였다. 동일 실패 작업을 재실행해 macOS·Windows 모두 통과했다. #10·#12도 양쪽 OS CI 통과를 확인했다.

## 이번 변경

- 거절 버튼은 사유 입력을 열고, 보내기 전 취소는 상태와 이력을 변경하지 않는다.
- 빈 사유는 거절만 기록하며 AI를 호출하거나 사용자 대화·사용량을 만들지 않는다.
- 사유가 있으면 거절·피드백·사용자 메시지를 한 트랜잭션으로 기록하고 기존 AI 요청 흐름으로 답변을 받는다.
- 동일 피드백 ID의 재전송·실패 후 재시도는 거절과 사용자 메시지를 중복 생성하지 않는다. 재시도는 새 요청 ID를 사용하고 사용량도 요청별로 기록한다.
- 진행 중이던 요청은 재개방 때 실패 상태로 복구해 다시 요청할 수 있다. 진행 중·초과 길이·이미 처리된 제안·다른 프로젝트의 요청을 차단한다.
- 거절 제안의 ID·제목·종류·사유 요약만 후속 맥락에 넣는다. 전체 replacement와 과거 AI 근거 설명은 넣지 않고 기존 문서 제외를 유지한다.
- 후속 응답 뒤 대화 탭을 유지한다. 새 제안은 대기 상태이며 원래 거절 이력과 문서 원본을 보존한다.
- 공통 AI 요청 경로의 예약을 맥락 생성 전에 수행하고, 제공자 종료 및 저장 뒤 완료 이벤트를 보내 중복 요청 경합을 방지한다.

## 검증

- 타입 검사 통과.
- 단위·통합: 58개 통과, 명시 실행용 실제 계정 테스트 5개 제외.
- 신규 Electron 테스트: 입력·취소·빈 사유·후속 답변, 실패·재시작·재시도, 중복·프로젝트 범위·3000자 제한 검증.
- 합성 화면 `outputs/rejection-input.png`, `outputs/rejection-chat.png`를 직접 확인했다.
- 신규 UI 테스트에서 초기 제안 탭을 찾지 못하는 경합이 있었다. PR #13의 macOS CI에서 재현해 진단했으며, 제안 수가 붙으면 접근성 이름이 ‘제안 2’로 바뀌는데 테스트가 정확히 ‘제안’만 찾던 것이 원인이었다. 문서 로드를 기다리고 탭 영역 안에서 개수를 허용하는 선택자로 수정했다.

## 제한

- 실제 제공자의 유료 추론은 실행하지 않았다. AI 검증은 임시 합성 프로젝트와 가짜 제공자를 사용했다.
- 기존 PR은 의존 순서로 열려 있으며, 사용자 승인 없이 병합하거나 이슈를 닫지 않는다.
- 사용자 설치 앱과 개인 프로젝트·DB·인증정보는 교체하거나 변경하지 않는다.
- 패키지는 macOS ARM64용이며 서명·공증 및 Windows 실기기 검증은 범위 밖이다.

## 최종 통합 결과

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm test` | 58개 통과, 실제 계정 명시 실행 테스트 5개 제외 |
| `npm run build` / `npm run package` | 통과, macOS ARM64 |
| `npm run test:e2e` | 8개 통과. 관계 지도 테스트의 구형 즉시 거절 기대 1곳 수정 후 해당 테스트 1개 통과. 총 9개 검증 |
| 패키지 실행 | Electron·SQLite·preload·관계 지도 통과 |
| `npm run make:dmg` / `hdiutil verify` | 생성 통과, 체크섬 VALID |
| DMG 별도 경로 복사 앱 | 임시 프로젝트에서 실행 통과, 상대 링크 포함 심볼릭 링크 14개 중 끊어진 링크 0개 |

- 앱: `dist/Docflow-darwin-arm64/Docflow.app`
- DMG: `dist/make/Docflow-0.1.0-arm64.dmg`
- SHA-256: `1e81c9fe8fb3697eae9dc2c2a8ca30334c98bc5955c63d98330059fb4ad604fd`
- 체크섬 파일: `dist/make/Docflow-0.1.0-arm64.dmg.sha256`
- 신규 UI 체크포인트는 `feat/8-rejection-followup`에 보존했다. 기존 #2·#6·#7 구현과 원래 미추적 테스트는 유지했다.

## 변경 파일

- 서비스·저장·맥락: `src/main/project/feedback.ts`, `src/main/project/store.ts`, `src/main/project/context.ts`
- IPC·공통 계약: `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`
- 화면: `src/renderer/App.tsx`, `src/renderer/features/proposals/ProposalList.tsx`
- 테스트: `tests/unit/feedback.test.ts`, `tests/e2e/rejection.spec.ts`, `tests/e2e/relationships.spec.ts`, `tests/e2e/workspace.spec.ts`, `tests/fixtures/fake-codex.cjs`
- 패키징·안내: `forge.config.cjs`, `README.md`, 이 검증 기록

최종 패키지 내용 검사에서 개발용 `.superpowers`와 `test-results`가 포함된 기존 패키징 설정을 발견했다. `.superpowers`, `test-results`, `playwright-report`를 패키징 제외에 추가하고 재패키징한 아카이브에서 개발 기록·테스트 산출물이 없는 것을 확인했다. 앱 런타임 코드 변경 없이 동일 빌드로 패키지를 다시 만들었다. 재시도 API의 완료된 피드백 무처리 결과(`null`)도 공통 타입에 반영하고 타입 검사를 통과했다.

PR #13 최초 CI: Windows 통과, macOS는 신규 거절 테스트 2개의 정확한 탭 이름 선택자 때문에 실패했다. 탭 범위를 지정하고 개수를 허용하는 선택자로 수정한 뒤 신규 거절 E2E 2개가 통과했다. 제품 동작 변경은 없으며 최신 커밋으로 양쪽 OS CI를 다시 확인한다.
