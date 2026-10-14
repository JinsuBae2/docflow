# 유저플로우 Phase 1 설계

사용자가 확정한 아키텍처를 구현한다. 관계지도와 기존 Mermaid 탐색은 유지하고 다이어그램에 독립 유저플로우 보기를 추가한다.

기준 파일은 `.workspace/flows/<id>.json`이며 schemaVersion=1, id/projectId/title/revision/nodes/edges를 저장한다. group + startEnd/page/action/condition/system 노드, parentId, 부모 기준 좌표, 그룹 크기·collapsed, 근거와 grounded/inferred 출처를 검증한다. quoteRange는 원문 Markdown UTF-16 start/end다. 동일 노드/엣지 ID, 고아 연결, 그룹이 아닌 부모, 그룹 순환, 유효하지 않은 포트·좌표·근거 범위를 거부한다. 실제 근거 문서·섹션·revision은 저장 때 다시 검증한다.

JSON은 임시 파일과 rename으로 원자 저장하고, 프로젝트 및 기대 revision을 검사한다. 손상 파일은 별도 오류로 안내하며 다른 정상 파일은 열 수 있다. 기존 JSON에 잘못된 수정이나 심볼릭 링크가 있으면 덮어쓰지 않는다. 문서 원문은 자동 변경하지 않는다.

ELK는 최초 생성과 명시적 자동 정렬에서만 Worker로 실행한다. 좌→우 Layered/Orthogonal, 분기별 출력 포트, mergeEdges=false를 사용한다. 드래그·키보드 이동은 좌표만 저장하며 그룹 이동 시 자식 상대 좌표를 유지한다. 접기 투영은 노드와 edge 원본 ID를 보존하고 외부 선을 보이는 최상위 접힌 그룹으로 위임한다. 그룹 내부 연결은 접힌 동안 숨긴다. 초기 맞춤 maxZoom=1.

5종 노드는 기존 CSS 토큰으로 구분한다. 근거 배지는 원문 이동을 제공하며 오래된 근거를 표시한다. 문서에서도 관련 플로우 노드를 연다. 새 유저플로우는 빈 JSON 초안으로 작성할 수 있고, 지원되는 단순 Mermaid만 별도 JSON으로 가져온다. 원본 Mermaid는 변경하지 않는다.

Phase 3 대비 순수 diffUserFlow(base,proposed)는 추가·수정·삭제를 계산하고 저장하지 않는다. Phase 1에서는 AI 추출·프롬프트 변경·제안 수락/거절 UI·Mermaid 왕복 변환·DMG 배포를 하지 않는다.
