# Docflow

AI와 함께 기획 문서를 만들고, 연결 관계와 흐름을 시각적으로 검토하는 로컬 데스크톱 워크스페이스입니다. Electron + React + TypeScript로 구현한 첫 번째 실행 가능 버전입니다.

## 현재 기능

- 새 문서 작성, Markdown 다중 가져오기·드래그앤드롭·확정 전 미리보기, 편집·내보내기, 목차 탐색
- 첫 실행 Codex 연결 안내·상태 확인, 실제 CLI 모델 목록 선택·설정 저장
- 흑연색 문서 목록과 흰 읽기 영역, 파란 선택 상태, hover·키보드 focus 상세 툴팁
- 문서·섹션 연결, 관계 지도, Mermaid 흐름도와 원문 이동
- 프로젝트 목표·제약·확정 결정·수락/거절 이력을 포함한 AI 맥락 구성과 전송 전 확인
- Codex 제안의 근거와 변경 내용 검토, 수락·거절·재요청, 취소
- Markdown 원본 + SQLite 메타데이터 저장, 외부 수정 충돌 감지, 중단된 저장 복구

![Workspace](outputs/improved-document.png)

## 개발 실행

Node.js 24와 npm이 필요합니다.

```sh
npm ci
npm run dev
```

첫 실행에서 프로젝트 폴더를 선택하거나 예제 프로젝트를 열 수 있습니다. AI 없이도 문서 작성과 시각화는 동작합니다.

## Codex 연결

로컬 Codex CLI 설치 후 `codex login`으로 로그인하세요. 앱은 `codex app-server --stdio`에 JSON-RPC로 연결하며, 계정 상태는 CLI가 관리합니다. 앱에서 API 키나 구독 쿠키를 저장하지 않습니다. macOS의 GUI 실행 환경에서도 `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`를 탐색합니다. 다른 위치에서는 `DOCFLOW_CODEX_PATH`를 실행 파일의 절대 경로로 지정하세요. Windows에서는 네이티브 `codex.exe`가 PATH에 있어야 하며 WSL 경로는 지원하지 않습니다.

실제 검증 버전은 Codex CLI 0.160.1입니다. 실험적 권한 프로필과 app-server API에 의존하므로 CLI 버전 변경 시 호환성 검증이 필요합니다. 구독의 사용량 제한이 적용되며 API 사용권과 같지 않습니다. **Gemini 연결은 아직 구현하지 않았습니다.**

문서는 로컬에 저장되지만 AI 요청 시 선택한 문서, 목표, 결정, 처리 이력이 Codex를 통해 외부 AI 서비스로 전달됩니다. 전송 전 맥락 확인 화면에서 내용을 확인하세요. 입력란 아래 모델 이름을 눌러 연결 설정을 열고, CLI에서 조회한 모델을 선택할 수 있습니다. 선택은 프로젝트 경로와 함께 앱 설정에 저장됩니다. ‘Codex 기본 모델’은 CLI 기본값을 사용합니다.

## Markdown 가져오기

문서 목록의 **Markdown 가져오기**를 누르거나 `.md` / `.markdown` 파일을 창에 끌어놓으세요. 프로젝트가 없으면 먼저 저장 폴더를 선택합니다. 제목, 섹션 수, 다이어그램 수와 발췌를 확인한 뒤 확정해야 새 문서가 저장됩니다. 취소하면 저장하지 않습니다. 현재 문서의 미저장 초안과 기존 처리 이력은 유지됩니다.

한 번에 30개, 파일당 2MB, 전체 10MB까지 지원합니다. 문서 ID를 추가한 저장 크기도 2MB 이하여야 합니다. 일부 파일 저장 후 실패하면 완료된 문서는 유지되며, 다시 확정할 때 남은 파일만 처리합니다. 가져오기는 로컬 작업이며 AI 전송을 실행하지 않습니다.

버튼의 설명은 마우스를 올리거나 키보드로 초점을 맞춰 확인하고 Escape로 닫을 수 있습니다. 관계 지도는 근거에서 후속 문서로 이어지는 방향으로 배치합니다. 다이어그램은 화면 맞춤과 확대·축소를 지원합니다.

## 검증

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

UI 테스트는 테스트 전용 가짜 제공자를 사용합니다. 제품 빌드에서는 활성화되지 않습니다. 실제 계정 요청 테스트는 명시적으로 실행하며 구독 사용량을 소비합니다.

```sh
DOCFLOW_LIVE=1 npm test -- tests/integration/live-codex.test.ts
# 실제 모델 목록만 확인 (추론 요청 없음)
DOCFLOW_MODELS=1 npm test -- tests/integration/live-models.test.ts
```

## 패키징

```sh
npm run package
npm run make
# macOS, package 또는 make 이후
npm run make:dmg
```

결과는 `dist/` 아래에 생성됩니다. GitHub Actions는 macOS/Windows 검사와 수동 패키징 워크플로를 포함합니다. macOS ARM64에서 로컬 검증했으며 Windows 및 macOS Intel 실기기 검증은 남아 있습니다. 현재 패키지는 서명·공증되지 않았습니다. 공개 배포 전 Apple/Windows 코드 서명과 오픈소스 라이선스를 결정해야 합니다.

## 구조와 데이터

`src/main`은 파일·SQLite·Codex·IPC, `src/preload`는 제한된 브리지, `src/renderer`는 UI, `src/shared`는 타입·응답 스키마입니다. renderer는 Node와 파일에 직접 접근하지 않습니다. 계획과 설계 문서는 `docs/`에 있습니다.

프로젝트 폴더의 `documents/*.md`가 본문이며 `.workspace/`에 메타데이터·이력이 저장됩니다. 둘을 함께 백업하세요. Markdown의 `docflow-id`와 `docflow-section` 주석은 안정적인 연결을 위한 ID입니다. 외부 수정으로 ID가 사라지면 재연결이 필요할 수 있습니다. 파일 시스템 변경은 2.5초마다 확인합니다. 대형 프로젝트 인덱싱, PDF/Word 가져오기, Git 동기화, 팀 협업은 범위 밖입니다.

보안상 원문 HTML, 원격 이미지, 실행 링크, Mermaid의 클릭 명령은 표시하지 않습니다. 현재 다이어그램은 흐름도만 지원하고 노드별 문서 이동은 지원하지 않습니다. AI에는 선택된 텍스트만 전달하고 앱의 다른 파일을 읽거나 수정하는 도구는 제공하지 않습니다.
