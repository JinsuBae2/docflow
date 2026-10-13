# 코드 스타일 검증 — 2026-10-13

대상: #14, `chore/14-code-style`. 기준 커밋: `aca0d5510f7a2810489bf13d06cd7683cd9c579e`.

## 변경 범위

- ESLint flat config와 Prettier 설정, npm 검사·포맷 명령을 추가했다.
- 소스·테스트·스크립트·개발 설정의 기계 포맷을 적용했다. 기존 Markdown·예제·라이선스 원문·빌드·사용자 데이터는 제외했다.
- 기존 macOS·Windows 검사에 lint와 format:check를 추가하고 Git 텍스트 줄바꿈을 LF로 지정했다.
- TypeScript 7을 유지했다. typescript-eslint의 지원 범위와 맞지 않아 Babel을 구문 파서로 사용하며 타입·미사용 선언은 기존 tsc가 검사한다. 타입 정보 기반 lint와 React Hooks 규칙은 이번 범위에 포함하지 않았다.
- 런타임 로직을 유지하기 위해 API 오류 정제 2곳, 종료 조건이 있는 페이지 순회 1곳, 파일명 제어문자 제거 1곳에 사유를 적은 줄 단위 lint 예외를 적용했다.

## 로컬 검증 결과

| 검사 | 결과 |
| --- | --- |
| `npm run lint` | 통과, 경고 0개 |
| `npm run format:check` | 통과 |
| `npm run typecheck` | 통과 |
| `npm test` | 59개 통과, 유료 API를 사용하는 선택 실행 테스트 5개 제외 |
| `npm run build` | 통과 |
| `npm run test:e2e` | Electron 화면 테스트 9개 통과 |
| `git diff --check` | 통과 |
| ESLint 음성 검증 | stdin의 도달 불가능한 TS 코드를 `no-unreachable` 오류와 종료 코드 1로 검출 |

기존 추적 JS/TS 파일 71개의 포맷 전 snapshot을 바탕으로 esbuild의 실행 코드와 Babel AST를 비교했다. 위치·주석을 제거하고, 같은 객체 키 표기와 네이티브 JSX의 인접 문자열 자식 표현을 정규화한 뒤 차이가 없었다. 정규화 전 표현 차이가 있었던 4개 파일도 이 범위에 해당했다. 이 비교는 CSS·HTML·설정의 의미 전체를 증명하지 않으므로 빌드와 Electron 테스트를 함께 수행했다. 로컬 비교 도구와 snapshot은 무시되는 work 디렉터리에 보관한다.

독립 읽기 전용 리뷰에서 차단 결함은 발견되지 않았다. 리뷰에서 확인한 Babel의 Node 요구사항에 맞춰 개발환경 안내를 Node 24.11 이상(24.x)으로 보완했다.

실제 Claude/Codex 추론과 설치 패키지 재생성은 수행하지 않았다. 후속 기능 #15–#19는 이 PR에 포함하지 않는다. GitHub CI 결과는 PR의 Checks에서 확인한다.
