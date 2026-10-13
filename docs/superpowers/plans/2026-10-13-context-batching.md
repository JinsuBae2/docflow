# Context batching — #19

Use superpowers:executing-plans inline, TDD and one final independent review.

## Design

별도 프로젝트 분석은 등록된 저장 문서만 대상으로 한다. 제외 문서 및 초안 문서를 전송하지 않는다. 문서·섹션·원문 범위·revision을 가진 근거를 나누고 제목/섹션/링크의 검색 관련도를 우선한다. 일반 대화와 거절 피드백의 전송 경계는 유지한다.

모델의 실제 한도를 추측하지 않는다. 기본 context 32,768 / 출력 8,192 / 지침·schema 여유 8,192 토큰을 보수적인 로컬 예산으로 사용하며 사용자가 분석별로 설정한다. UTF-8 byte 수를 토큰 상한 추정치로 사용하므로 한국어는 특히 여유가 크다. Claude 출력 한도에 적용하고 Codex는 로컬 결과 크기 검증으로 적용한다. 계정 한도 또는 정확한 tokenizer 결과로 표시하지 않는다.

본문 묶음 다음에 기존 관계/Markdown 링크의 양쪽 근거를 함께 검토한다. 전체 연결 색인을 한 번에 보내지 않고 관계별 통합 검토를 한다. 링크가 없는 모든 문서 쌍의 전수 분석은 보장하지 않으며 UI에 명시한다. 예산을 넘는 metadata/출력은 오류로 남기고 조용히 버리지 않는다.

SQLite에 분석 계획·묶음 snapshot·완료 상태·오류를 저장한다. 취소/앱 재시작은 완료된 묶음을 보존한다. 재개 시 문서 revision, 초안, 프로젝트 설정 및 결정/거절 이력을 검사한다. provider/model/예산/입력 내용이 동일한 완료 묶음만 재사용한다. 제안 등록은 snapshot request ID 기준으로 중복 방지한다.

발췌 수정은 명시적 scopedSourceId 계약으로 원문 범위만 교체한다. 서버가 저장된 snapshot의 범위/본문/전체 revision을 재검증하고 journal로 저장한다. 관리 문서의 ID 구조를 변경하는 패치는 거부한다. 전체 문서 수정은 완전한 문서 근거에만 허용한다. UI는 발췌 전후만 비교하며 수락은 기존처럼 명시적이다.

## Verifiable tasks

- [x] 예산/분할/근거/제외·초안/연결 통합 계획 → 합성 대형 프로젝트 테스트.
- [x] checkpoint runner, 취소·재개·캐시·오류·사용량 → fake provider 통합 테스트.
- [x] 범위 수정 계약 및 수락 검증 → 원문 보존/충돌 테스트.
- [x] IPC·preload·분석 창·관계 검토 연결 → Electron E2E.
- [x] lint/format/typecheck/unit/build/E2E, 최종 리뷰, PR.

자동 업데이트와 실계정 유료 호출은 범위 밖이다. 일반 대화의 명시 선택이 단일 요청 예산을 넘으면 분할 분석으로 안내한다.
