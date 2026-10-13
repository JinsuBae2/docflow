# Markdown 원문 링크 — #16

Spec: ../specs/2026-10-13-document-flows-design.md. Base: e584e17. Branch: feat/16-markdown-links.

원문 링크는 의미적 의존 관계와 구분한다. 매 workspace 읽기에서 Markdown AST를 색인해 저장·외부 수정 재조회·재시작 때 최신 파생 관계만 산출한다. 파생 관계를 DB에 저장하지 않아 수동/AI 관계를 덮어쓰지 않는다.

## Task 1: 링크 해석과 파생 관계

- [x] inline/reference 링크, 상대 경로·인코딩·한글·공백·중복 제목 앵커 테스트 RED→GREEN.
- [x] GitHub 제목 slug와 기존 섹션 ID 앵커를 실제 섹션 ID로 매핑. 파일 밖·위험 scheme·심볼릭 링크 차단.
- [x] 미등록/누락 파일/없는 앵커/외부 URL을 구분하고, 문서·앵커별 파생 관계를 중복 없이 생성.
- [x] 기존 수동 관계·새 AI 수락 관계 출처, 저장·재시작·외부 변경 후 재색인 테스트.

## Task 2: 안전한 이동과 UI

- [x] 원문 클릭은 색인된 link ID·문서 revision을 main에서 다시 검증한 결과로만 처리.
- [x] 문서/섹션 이동, 미등록 파일 추가 미리보기, 끊어진 링크 사유, 외부 HTTP(S) URL 확인창과 명시적 열기.
- [x] 관계 지도에서 원문/직접/AI 출처 표시. 파생 관계는 원문 수정으로만 변경하고 수동 편집 API로 제거하지 않음.
- [x] E2E로 본문 inline/reference 클릭·앵커 이동·미등록 등록·재색인·출처 보존 검증.

## Task 3: 검증과 전달

- [x] lint/format/typecheck·전체 테스트·build·전체 Electron E2E·합성 캡처.
- [ ] 독립 전체 브랜치 리뷰와 회귀 수정, 검증 기록, #16 전용 PR 및 macOS·Windows CI.

HTML 실행은 허용하지 않는다. 이 단계의 파일 앵커는 Markdown 제목과 기존 섹션 ID를 지원하며 raw HTML의 임의 id/name 앵커는 지원하지 않는다. 프로젝트 외부 파일은 차단하고 외부 URL은 HTTP(S)만 지원한다. 지도 선 그리기(#17)는 후속 범위다.
