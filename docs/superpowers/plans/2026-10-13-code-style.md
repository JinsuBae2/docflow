# ESLint·Prettier Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** #14의 코드 가독성·일관된 검사 기준을 기능 변경 없이 도입한다.
**Architecture:** Prettier는 표현 형식을, ESLint flat config는 구문/기본 오류를 검사한다. TS7 타입 검사는 기존 tsc를 유지한다. Babel 파서는 lint 전용이며 앱 빌드에 넣지 않는다.
**Tech Stack:** Node 24, ESLint, Babel parser, Prettier, TypeScript 7, Vitest, Playwright.
**Spec:** ../specs/2026-10-13-document-flows-design.md

## Global Constraints

- 기능·API·저장 형식·Hook 의존성은 유지한다. 새 AI 자동화는 추가하지 않는다.
- 생성물·라이선스 원문·기존 문서·예제·사용자 데이터는 포맷에서 제외한다.
- TypeScript compiler를 lint 호환성 때문에 낮추거나 peer 충돌을 강제로 무시하지 않는다.

## Review Focus

- 긴 JSX와 문자열: 포맷 전후 실행 AST/문자열 의미 유지.
- TS·TSX·ESM·CJS: 각각 파싱되고 파일별 globals가 맞음.
- 실제 사용자 데이터/생성물: 검사·포맷에서 제외.
- 기존 lint 위반: 기능 변경으로 해결하지 않고 필요한 예외를 좁게 기록.
- Windows 줄바꿈: LF와 Git 설정의 호환성 검증.

### Task 1: 검사 설정과 기계 포맷

Files: eslint.config.mjs, .prettierrc.json, .prettierignore, package.json/lock, src/**, tests/**, scripts/**, root dev configs.
Interfaces: npm run lint, npm run format, npm run format:check; 기존 typecheck/test/build/test:e2e 유지.

- [x] 호환 버전을 확인하고 lint 전용 개발 의존성을 고정한다.
- [x] 기존 추적 코드의 포맷 전 snapshot을 work/에 보관한다.
- [x] 설정과 명령을 추가하고 format:check의 기존 코드 실패를 확인한다.
- [x] Prettier로 지정된 범위만 정리한다. 실행 AST 동일성을 확인한다.
- [x] lint 결과를 읽고 규칙/경계에 맞는 최소 수정만 수행한다.
- [x] lint, format:check, typecheck, 전체 단위/통합 테스트, build, Electron E2E를 검증한다.
- [x] 설정과 기계 포맷을 구분 가능한 Conventional Commits로 보존한다.

### Task 2: CI·기여 안내·PR

Files: .github/workflows/checks.yml, CONTRIBUTING.md, docs/validation-code-style-2026-10-13.md.
Interfaces: 기존 CI의 npm ci 뒤 lint/format:check 실행; 사용자 문서 제외 기준 안내.

- [x] 기여 안내에 명령과 lint 역할/제약을 명시한다.
- [x] 기존 CI에 lint/format:check를 연결한다.
- [x] 가까운 설정 검증과 독립 읽기 전용 리뷰를 수행한다.
- [ ] 검증 기록을 작성하고 #14 전용 PR을 생성해 양쪽 OS CI를 확인한다. 병합은 별도 승인 없이 하지 않는다.
