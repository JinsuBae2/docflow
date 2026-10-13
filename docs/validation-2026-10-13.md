# Docflow 개선 완료 및 검증 기록

날짜: 2026-10-13 (Asia/Seoul)
브랜치: feat/desktop-workspace. 기존 미추적 파일을 유지했으며 커밋·GitHub 업로드는 하지 않았다.

## 작업 결과

- 문서 목록의 가져오기 버튼과 시작 화면 진입점, 다중 파일 선택·드롭, 발췌·제목·섹션·다이어그램 미리보기, 취소·확정을 연결했다. 프로젝트가 없으면 저장 폴더부터 선택한다.
- 실제 Codex CLI의 model/list 결과로 모델을 선택하고 기존 프로젝트 경로를 보존해 설정을 저장한다. 첫 실행 연결 안내와 재확인을 제공한다.
- 버튼별 설명 툴팁을 포털로 표시하며 hover·focus·aria-describedby·Escape를 지원한다. 연결·가져오기 대화상자는 초점 순환과 복귀를 지원한다.
- 흑연색 사이드바, 흰 문서 영역, 선명한 파란 선택 상태로 디자인을 개편했다. 본문과 변경 비교의 글자 크기·대비를 높였다.
- 관계 지도는 의존 깊이와 분기를 기준으로 배치하고 유형별 노드·방향 연결선·핸들을 표시한다. Mermaid strict와 실행 링크 차단을 유지하며 화면 맞춤·확대·축소를 제공한다.
- 2MB 저장 한도에 문서 ID 삽입 크기도 포함하고, 가져온 큰 문서를 편집할 수 있도록 save IPC 크기를 정렬했다. 한도를 넘으면 원본을 보존한다.
- 읽을 수 없는 문서의 DB ID·섹션 ID도 충돌 검사에 포함한다. 삭제·이동된 원본의 백업을 가져와도 기존 메타데이터·관계가 덮어써지지 않는다.
- 미리보기 없이 저장하던 구형 importDocument IPC/preload API를 제거했다.

## 검증 상태

| 검증 | 결과 |
| --- | --- |
| npm run typecheck | 통과 |
| npm test | 21개 통과, 명시 실행용 실제 계정 테스트 2개 건너뜀 |
| DOCFLOW_MODELS=1 npm test -- tests/integration/live-models.test.ts | 실제 설치 CLI 계정 상태·모델 목록 조회 1개 통과. 추론·사용자 문서 전송 없음 |
| npm run build / npm run package | macOS ARM64 빌드·패키징 통과 |
| npm run test:e2e | 최종 3개 통과 |
| node scripts/verify-package.mjs dist/Docflow-darwin-arm64/Docflow.app/Contents/MacOS/docflow | 최종 패키지 Electron·SQLite·preload·관계 지도 실행 통과 |
| npm run make:dmg / hdiutil verify | 생성 및 내부 체크섬 VALID |

Electron 검증은 임시 프로젝트에서 다중 native 선택, 프로젝트 미선택 가져오기, 드롭 취소·확정, 중복·만료 확정 거부, 확장자 검사, 150k 이상 문서 저장, 미저장 초안 보존, 모델 재실행 보존, tooltip hover/focus/Escape, 제안 수락·거절 및 이력 보존, Markdown HTML 차단, 관계 지도와 다이어그램 확대를 확인했다. 1440·1024·800 화면을 캡처하고 직접 검토했다.

마지막 UI 테스트의 간헐 실패는 취소 IPC 뒤 React 화면 반영을 기다리지 않고 합성 drop을 보내는 테스트 경합이었다. 미리보기 닫힘과 가져오기 버튼 활성화를 기다리도록 수정했다. 실패한 초안 테스트의 정리는 임시 창을 강제 파괴해 native 종료 확인창이 원래 오류를 가리지 않도록 했다. 제품의 초안 확인 동작은 유지했다.

## 수정된 파일 목록

이번 재개 작업에서 수정하거나 추가한 코드·문서:

- README.md
- src/shared/contracts.ts
- src/preload/index.ts
- src/main/ipc.ts
- src/main/project/imports.ts
- src/main/project/store.ts
- src/renderer/App.tsx
- src/renderer/styles.css
- src/renderer/components/Dialog.tsx
- src/renderer/components/ConnectionSetup.tsx
- src/renderer/components/ImportDialog.tsx
- src/renderer/components/Tooltip.tsx
- src/renderer/features/graph/layout.ts
- src/renderer/features/graph/ProjectGraph.tsx
- src/renderer/features/graph/Diagram.tsx
- tests/unit/imports.test.ts
- tests/unit/graph-layout.test.ts
- tests/integration/project-store.test.ts
- tests/integration/live-models.test.ts
- tests/e2e/workspace.spec.ts
- scripts/verify-package.mjs
- docs/validation-2026-10-13.md
- work/resume-2026-10-13.md (로컬 체크포인트)

앞선 체크포인트에 저장된 Codex provider/model 전달 및 fixture 테스트 변경도 유지하고 검증했다.

화면 캡처: outputs/improved-document.png, improved-graph.png, connection-setup.png, import-preview.png, desktop.png, compact.png, compact-800.png, authoring.png, packaged.png.

## 최종 산출물과 남은 제한

- 앱: dist/Docflow-darwin-arm64/Docflow.app
- 설치 이미지: dist/make/Docflow-0.1.0-arm64.dmg
- SHA-256: af2772e5ee72ac5e9bf71462de2616bde2a610efdbe5348b8e0e187d7d4f0074
- 체크섬 파일: dist/make/Docflow-0.1.0-arm64.dmg.sha256
- 현재 패키지는 서명·공증되지 않았다. Windows/macOS Intel 실기기 검증은 하지 않았다.
- 모델 목록은 실제 CLI로 검증했고 선택 모델 전달은 fixture로 검증했다. 이번에는 실제 AI 추론 테스트를 재실행하지 않았다.
- Gemini, 커밋·업로드, 기존 설치본 교체는 수행하지 않았다. 실행 중인 이전 앱을 강제 종료하지 않았다.
