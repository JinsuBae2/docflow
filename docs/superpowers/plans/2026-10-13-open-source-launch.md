# Docflow 오픈소스 공개 및 연결 확장 계획

> **For agentic workers:** 구현 단계에서는 `superpowers:executing-plans`를 적용해 단계별로 실행한다. 이 문서는 조사 결과와 제안이며, 저장소 생성·커밋·업로드를 실행한 기록이 아니다.

**Goal:** 기존 문서와 작업을 보존하면서 현재 앱을 정직한 첫 공개 기준선으로 만들고, 한국어 기여 체계와 후속 프로젝트 전환·Claude 연결 작업을 구성한다.
**Architecture:** 기존 Electron main/preload/renderer 경계와 프로젝트별 저장 구조를 유지한다. 공개 준비와 기능 확장은 별도 변경으로 진행한다.
**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright, GitHub Actions.
**Spec:** 사용자의 2026-10-13 공개 준비 요청 및 기존 개선 범위. 세부 선택은 아래 결정 항목에 명시한다.

## 조사 결과

- 현재 브랜치: `feat/desktop-workspace`. 커밋 0개, 추적 파일 0개, Git remote 없음. 코드와 문서는 로컬 미추적 파일로 존재한다.
- 프로젝트 폴더를 여러 개 생성·열 수 있으나 한 창에서 활성 프로젝트는 하나다. 마지막 프로젝트만 복원하며 최근 프로젝트 목록·동시 탭은 없다.
- AI 제공자 인터페이스는 있지만 실제 생성·설정 연결은 Codex 중심이다. Claude 어댑터와 제공자별 설정을 추가할 기반은 있다.
- 로컬 Claude Code 2.1.284의 버전과 도움말을 확인했다. 실제 인증·생성 요청은 실행하지 않았다.
- 한국어 README와 짧은 영어 CONTRIBUTING, 검사·패키징 워크플로가 있다. LICENSE, 이슈 폼, PR 템플릿, 보안 정책 등은 없다.
- 기존 화면 캡처가 있다. 공개 전 샘플 데이터·모델 이름·개인정보를 확인하고 필요한 화면을 다시 촬영한다.
- 의존성 잠금 파일의 라이선스 메타데이터만으로는 공개 감사를 마칠 수 없다. 누락 항목과 실제 배포물의 고지를 별도로 확인한다.

## Global Constraints

- 문서, 미저장 초안, 제안 수락·거절 이력, 보안 경계를 보존한다. 초기화를 위해 reset/clean을 사용하지 않는다.
- 공개 전 코드·문서·이미지·파일명·패키징 내용의 비밀정보 및 개인정보를 검사한다.
- 사용자 프로젝트, DB, 인증정보, dist, node_modules, 개인 작업 로그는 Git에 넣지 않는다. 앱 설치 파일은 Releases에 배포한다.
- 실제 과거 작업을 확인할 수 없는 커밋·이슈·PR 이력을 만들어 내거나 날짜를 소급하지 않는다.
- API/CLI 실요청 테스트는 별도 비용과 계정 사용이 발생함을 구분한다. 기본 CI에는 가짜 제공자 테스트를 사용한다.
- Gemini는 이번 범위 밖이다.

## Review Focus

- 첫 공개 커밋에서 새로 clone한 환경으로 빌드와 테스트가 가능한가?
- README의 기능·지원 OS·검증 결과가 실제 코드 및 증거와 일치하는가?
- 공개 이미지나 문서에 개인 경로·사용자 문서·인증정보가 없는가?
- AI 사용 고지가 구체적이고, 사람이 하지 않은 검토를 했다고 주장하지 않는가?
- 기여 절차가 1인 유지관리자가 실제로 운영할 수 있는 수준인가?

## 1. 공개 기준선 확정

- [ ] 현재 소스와 검증 자료를 로컬 백업하고 공개 대상 파일 목록을 확정한다.
- [ ] 비밀정보·개인정보·의존성 라이선스·사용 이미지와 폰트의 배포 조건을 검사한다. 발견 사항은 공개 전에 해결한다.
- [ ] `README.md`, `package.json`, `.gitignore`, 기존 `docs/`를 검사해 공개 내용과 제외 대상을 구분한다.
- [ ] 선택한 파일만 stage하고 staged diff 및 파일 목록을 검토한다. 무분별한 `git add .`를 피한다.
- [ ] 현재 동작하는 앱을 하나의 초기 기준 커밋으로 남기는 방식을 기본으로 한다.

권장 초기 메시지: `feat: Docflow 데스크톱 워크스페이스 초기 공개`.
기존 작업을 여러 층으로 나누는 대안은 각 커밋이 독립적으로 빌드되는 경우에만 사용한다. 현재 얽힌 작업을 과거처럼 재구성하는 비용보다 앞으로의 변경 이력을 명확히 남기는 편이 낫다.

검증: 공개 대상 사본에서 `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. 기존 결과는 참고 자료이며 공개 기준선 검증을 대신하지 않는다.

## 2. 한국어 공개 문서와 이미지

- [ ] `README.md`: 한 줄 소개 → 실제 앱 화면 → 주요 사용 흐름 → 설치와 개발 → AI 연결 → 데이터와 개인정보 → 현재 제약 → 기여·라이선스 순서로 작성한다.
- [ ] `docs/development.md`: 요구사항 정리, 디자인 선택, Electron 경계, 제공자 설계, 제안 비교·수락 구조, 테스트와 패키징 등 실제 제작 과정을 설명한다.
- [ ] `AI_USAGE.md`: 제작 과정의 AI 활용, 검증 방식과 한계, 기여자의 AI 사용 공개 방법을 명시한다.
- [ ] `CONTRIBUTING.md`: 한국어 개발 환경, 이슈부터 PR까지의 흐름, 필요한 테스트, 문서·디자인·번역 기여를 설명한다.
- [ ] `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, 필요한 `THIRD_PARTY_NOTICES.md`, `CHANGELOG.md`를 구성한다. 보안 신고 연락처는 실제 운영 가능한 경로를 정한다.
- [ ] `docs/images/`에 샘플 문서 읽기, 변경 비교, 관계 지도, 가져오기 미리보기 중 3~4장을 선별한다. 화면 설명과 대체 텍스트를 붙인다.
- [ ] `package.json`에 확정된 repository, bugs, homepage, license 정보를 반영한다. `private: true`는 npm 오발행 방지 용도이므로 유지할 수 있다.

AI 고지 초안:

> Docflow는 제작자가 요구사항과 방향을 정하고 OpenAI Codex의 도움으로 설계·코드·테스트·문서를 작성한 프로젝트입니다. AI 활용 범위와 검증 결과를 공개하며, 변경 내용의 검토와 유지보수 책임은 제작자와 기여자에게 있습니다.

PR에서는 사용 도구, 도움받은 범위, 직접 확인한 검증을 간단히 공개하도록 한다. 프롬프트 원문이나 개인 대화 전체 제출은 요구하지 않는다. AI 사용만으로 자동 거절하지 않으며 이해하지 못한 코드·검증되지 않은 설명을 그대로 제출하지 않도록 안내한다.

검증: 문서 링크·명령·화면 기능을 실제 앱과 대조하고, 새 환경 설치 안내를 따라간다. LICENSE와 의존성 고지의 일치 여부를 확인한다.

## 3. 이슈·PR·브랜치·커밋 규칙

- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml`: 앱/OS 버전, 재현 단계, 기대·실제 동작, 비식별 로그·샘플을 받는다.
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml`: 해결할 문제, 사용 상황, 완료 기준을 받는다.
- [ ] `.github/ISSUE_TEMPLATE/config.yml`: 보안 신고와 질문 경로를 연결한다.
- [ ] `.github/pull_request_template.md`: 목적, 변경, 검증, UI 캡처, 연결 이슈, AI 활용 항목을 둔다.
- [ ] 브랜치는 `main`과 짧게 유지하는 `feat/<번호>-<설명>`, `fix/...`, `docs/...`를 사용한다. 상시 `develop` 브랜치는 도입하지 않는다.
- [ ] 한 PR은 하나의 목적을 다루고 squash merge한다. PR 제목과 최종 커밋은 Conventional Commits 형식, 설명은 한국어로 작성한다.
- [ ] 최소 라벨: bug, enhancement, documentation, security, help wanted, good first issue. 유지 가능한 범위로 시작한다.
- [ ] 기존 checks 워크플로가 원격에서 성공한 뒤 실제 job 이름으로 필수 검사를 설정한다. main 강제 push·삭제를 제한한다.
- [ ] 1인 운영 중 외부 리뷰어 승인을 필수로 걸어 병합을 막지 않는다. 공동 유지관리자 참여 후 승인 규칙을 강화한다.

예: `feat(projects): 최근 프로젝트 전환 추가`, `fix(import): 중복 파일 미리보기 오류 수정`, `docs: AI 활용과 기여 방법 안내`.
중간 WIP 커밋까지 강제하는 도구보다 PR 제목 검사부터 적용한다. 기존 작업을 위한 가상 완료 이슈는 만들지 않고, 남은 실제 과제만 등록한다.

검증: 샘플 이슈·PR 양식, PR 제목 검사 성공/실패, 필수 CI 및 solo 유지관리자 병합 가능 여부를 확인한다.

## 4. GitHub 생성과 첫 릴리스

- [ ] 소유자·이름·라이선스를 확정한다. 제안: `JinsuBae2/docflow`, MIT 라이선스. 이름 사용 가능 여부는 생성 전에 확인한다.
- [ ] 기본 브랜치를 main으로 정리하고 로컬 기준선을 준비한다. 빈 원격 생성 시 README/LICENSE 자동 초기화를 피한다.
- [ ] 공개 전 검사를 통과한 기준선을 push한다. 첫 기본 브랜치를 만드는 bootstrap은 이후 PR 운영과 구분한다.
- [ ] 후속 변경부터 실제 이슈 → 브랜치 → PR → CI → squash 흐름을 사용한다.
- [ ] 저장소 소개·토픽·기여 링크·보안 신고 경로와 branch protection을 설정한다.
- [ ] 검증한 플랫폼만 설치 파일과 체크섬을 Releases에 올린다. 첫 릴리스의 안정성에 맞춰 `v0.1.0` 또는 사전 릴리스 태그를 선택한다.

현재 macOS arm64 패키지 검증 자료가 있으며 서명·공증, Intel Mac, Windows 배포 검증은 별개다. 워크플로가 존재하는 것과 GitHub에서 통과한 것은 구분해 적는다.

## 5. 프로젝트 전환 개선: 별도 기능 PR

- [ ] 최근 프로젝트 목록과 전환 메뉴를 우선 구현한다. 동시 탭·멀티윈도는 요구가 확인될 때 별도 설계한다.
- [ ] 경로가 사라진 프로젝트, 목록에서 제거, 중복 경로, 마지막 프로젝트 복원을 다룬다.
- [ ] 미저장 초안 확인, AI 실행 중 전환 제한, 프로젝트별 문서·제안 이력 분리를 유지한다.

대상: main 설정/IPC, 공유 타입, preload 계약, renderer 프로젝트 메뉴와 관련 테스트. 정확한 파일은 구현 착수 시 현재 코드에 맞춰 확정한다.
검증: 두 샘플 프로젝트 왕복, 초안 보호, 삭제된 경로, 앱 재시작 복원, 이력 격리 E2E.

## 6. Claude 연결: 별도 기능 PR

권장 첫 공개 방식은 사용자의 Anthropic API 키를 사용하는 제공자다. API 비용과 Claude 구독의 관계는 연결 화면에서 정확히 안내한다. 구독 기반 CLI 연결은 공식 문서 간 차이를 해소하고 실제 사용 조건을 확인한 후 선택한다.

- [ ] 기존 `AiProvider` 기반 제공자 factory와 제공자별 모델·연결 설정을 추가한다. 기존 설정은 Codex로 마이그레이션한다.
- [ ] Claude에서도 구조화된 제안만 반환하도록 하고 파일 변경·명령 실행 도구를 제공하지 않는다.
- [ ] API 자격증명은 OS 보안 저장소 사용을 검토하며 일반 설정·로그·명령 인자에 기록하지 않는다. 연결 해제와 삭제를 제공한다.
- [ ] 제공자 선택, 모델 조회·유효성, 연결 상태, 스트리밍, 취소, 타임아웃, 오류 안내를 구현한다.
- [ ] 기존 수락·거절 및 검증 경계를 재사용하고 필요하면 제안 이력에 제공자 출처를 보존한다.
- [ ] CLI 대안을 채택할 경우 사용자 자체 설치·공식 로그인 흐름을 이용하고 인증 토큰을 수집하지 않는다. 도구·MCP·플러그인·프로젝트 설정 로딩과 파일 접근을 검증한다.

검증: 가짜 제공자 계약 테스트, 설정 마이그레이션, 오류·취소·불완전 응답, preload/IPC 보안 검사, Electron E2E. 실계정 생성 요청은 별도 opt-in 검증으로 구분한다.

## 결정할 항목

1. 저장소 소유자·이름: `JinsuBae2/docflow` 제안.
2. 라이선스: 단순하고 허용적인 MIT 제안. 실제 권리 및 의존성 검사 후 확정한다.
3. Claude 첫 연결: API 키 방식 권장. Claude Code 구독 활용이 핵심 요구라면 CLI 조건 검증을 먼저 한다.

## 참고 자료와 적용 범위

- [Zettlr 기여 안내](https://github.com/Zettlr/Zettlr/blob/develop/CONTRIBUTING.md): 문서 앱의 기여 분류, 이슈·PR 안내, AI 활용 공개를 참고한다. 해당 프로젝트의 AI 작성 PR 설명 금지 정책까지 그대로 적용하지는 않는다.
- [Joplin 개발 기여 안내](https://joplinapp.org/help/dev/): 재현 가능한 버그, 목적이 좁은 PR, UI 캡처와 테스트 안내를 참고한다. CLA 절차를 자동 도입하지 않는다.
- [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow): main과 짧은 작업 브랜치, PR 중심 운영의 근거.
- [보호 브랜치](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches): 실제 필수 CI와 유지관리자 운영 조건을 맞춘다.
- [Conventional Commits 한국어 명세](https://www.conventionalcommits.org/ko/v1.0.0/): 타입·범위·설명 형식을 적용한다.
- [MIT 라이선스](https://choosealicense.com/licenses/mit/): 라이선스 선택 참고. 공개 저장소만으로 사용 허가가 생기지는 않는다.
- [Claude 법률·인증 안내](https://code.claude.com/docs/en/legal-and-compliance): 제품의 API 인증 권고, 자격증명 중개 제한 및 원본 CLI 사용 조건을 확인했다.
- [Claude 구독과 Agent SDK 안내](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): 2026-10-07 업데이트가 외부 앱·CLI의 구독 사용을 안내한다. 위 문서와 범위가 달라 Docflow의 구독 지원을 아직 보장하지 않는다.

문서 조사일: 2026-10-13. 공급자 정책과 GitHub 설정은 구현 시 다시 확인한다.
