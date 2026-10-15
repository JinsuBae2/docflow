# 유저플로우 JSON 작성·저장 규칙

**사용자 흐름 → 유저플로우**는 **문서 구조**와 별도의 사용자 여정을 표시한다. 기준 데이터는 프로젝트의 `.workspace/flows/<id>.json`이며 문서 원문과 기존 Mermaid는 자동 수정하지 않는다.

## 작성과 저장

**새 유저플로우 → JSON 편집**에서 제목·nodes·edges를 작성한다. 생성된 id/projectId/revision은 변경하지 않는다. 기존 문서 안의 지원 가능한 단순 flowchart는 **Mermaid 가져오기**에서 별도 JSON으로 변환한다. 의미를 임의 추정하지 않으므로 가져온 단계는 기본 action으로 표시한다. 복잡한 flowchart·sequence·state는 **문서 속 흐름** 보기에서 계속 탐색한다.

JSON 저장 시 새 단계의 좌표를 배치한다. 기존 좌표가 있으면 보존하고 새 단계만 빈 공간에 추가한다. **자동 정렬**은 확인 후 전체 배치를 다시 계산한다. 카드 드래그·방향키 이동·그룹 접기 상태는 자동 저장한다. 그룹 안의 position은 부모 기준 상대 좌표다. 그룹을 이동해도 자식의 상대 좌표는 유지된다.

저장 실패 시 현재 변경을 유지하며 **저장 재시도** 또는 **최신 JSON 불러오기**를 제공한다. 최신 JSON을 불러오면 저장하지 않은 변경은 버린다. 프로젝트가 바뀌거나 디스크 revision이 달라졌다면 덮어쓰기를 거부한다.

## 스키마

최상위 필드: `schemaVersion: 1`, `id`, `projectId`, `title`, `revision`, `nodes`, `edges`.

| 노드 type | 표시와 용도 |
| --- | --- |
| group | 여정 컨테이너, collapsed로 접기 |
| startEnd | 시작/종료 pill, data.role은 start 또는 end |
| page | 화면 카드, description 및 components 요약 |
| action | 사용자 인터랙션 칩 |
| condition | 분기 카드, data.outputs의 포트 ID·라벨 |
| system | 데이터 저장·API·AI 처리 카드 |

각 노드는 `id`, `type`, `data: {label}`, `origin`, `evidence`가 필수다. 선택 필드는 `parentId`, `extent: 'parent'`, `position: {x,y}`, `width`, `height`, `collapsed`와 data의 description/components/role/outputs다. 부모는 group이어야 하며 순환은 허용하지 않는다.

각 연결은 `id`, `source`, `target`, `origin`, `evidence`가 필수이며 `label`, `sourceHandle`을 선택 지정한다. 조건 노드에서 나가는 연결은 해당 outputs의 ID를 sourceHandle로 지정한다. 출력 포트의 `in`은 예약된 입력 ID이므로 사용할 수 없다.

```json
{
  "id": "check",
  "type": "condition",
  "parentId": "onboarding",
  "data": {
    "label": "연결 성공?",
    "outputs": [
      { "id": "success", "label": "성공" },
      { "id": "failure", "label": "실패" }
    ]
  },
  "origin": "inferred",
  "evidence": []
}
```

위 예시는 nodes 배열에 넣는 노드 한 개이며 onboarding 그룹과 연결 대상 노드는 별도로 정의해야 한다. ID는 영문·숫자로 시작하며 영문·숫자·하이픈·밑줄을 최대 101자까지 사용한다. 노드와 연결 전체의 ID가 고유해야 한다. 최대 500개 노드·1,000개 연결·2MB JSON, 좌표 범위 ±1,000,000을 검증한다. 알 수 없는 필드와 영구 isNew/isUpdated/isDeleted 상태는 거부한다.

## 근거와 검토 기반

`origin`은 grounded 또는 inferred다. grounded에는 하나 이상의 `{documentId, sectionId, revision, quoteRange: {start,end}}` 근거가 필요하다. sectionId는 문서 전체 근거일 때 null이다. quoteRange는 **원문 Markdown 전체 문자열의 UTF-16 오프셋**, start 포함·end 제외이며 해당 섹션 안에 있어야 한다. 저장 시 실제 문서 ID·섹션·revision·범위를 다시 확인한다.

근거 버튼은 원본 문서·섹션으로 이동한다. 문서 하단에서도 연결된 플로우 노드를 열 수 있다. 문서가 바뀌면 기존 플로우는 읽을 수 있지만 배지에 근거 변경을 표시하고 오래된 근거를 포함한 저장은 거부한다. 추정 단계는 AI 추정 배지로 구분한다.

그룹 접기는 화면 투영이며 원본 노드·연결 ID를 바꾸지 않는다. 내부 연결은 숨기고 외부 연결은 접힌 그룹 경계로 위임한다. `diffUserFlow(base, proposed)`는 추가·수정·삭제·유지 상태를 런타임에 계산한다. AI 생성·수정 제안은 캔버스에서 비교하고 revision 확인 후 수락·거절한다. Diff 상태는 원본 JSON에 저장하지 않는다. [AI 제안 검토 절차](user-flow-proposals.md)를 참고한다.
