# 집밥 서비스 작업 규칙

## Read First

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. 관련 `docs/workpacks/<slice>/README.md`
3. 관련 공식 문서 in `docs/`
4. 필요한 경우에만 `docs/reference/wireframes/`

## Source of Truth

- 공식 최신본:
  - 요구사항 `docs/요구사항기준선-v1.6.md`
  - 화면정의서 `docs/화면정의서-v1.2.md`
  - 유저 Flow맵 `docs/유저flow맵-v1.2.md`
  - DB 설계 `docs/db설계-v1.3.md`
  - API 문서 `docs/api문서-v1.2.1.md`
- `wireframes`는 보조 레퍼런스다.
- wireframe과 공식 문서가 충돌하면 공식 문서가 우선이다.

## Working Model

- 구현 단위는 화면 하나가 아니라 `세로 슬라이스(workpack)`다.
- 한 슬라이스 안에서 화면, 상태 전이, API, DB 영향, 테스트를 같이 닫는다.
- 새로운 기능 작업 전 `docs/workpacks/<slice>/README.md`를 먼저 만든다.
- 문서 간 충돌이 보이면 구현보다 충돌 정리를 우선한다.

## Domain Rules

- `meals.status`: `registered -> shopping_done -> cook_done`
- 장보기 preview 대상: `status='registered' AND shopping_list_id IS NULL`
- 장보기 생성 시 대상 `meals.shopping_list_id`를 먼저 세팅한다.
- `SHOPPING_DETAIL`은 구매 섹션 / 팬트리 제외 섹션 2영역 구조다.
- 장보기 완료 후 리스트는 read-only다. 수정 API는 `409`를 반환한다.
- `is_pantry_excluded=true`가 되면 `is_checked=false`로 자동 정리한다.
- `add_to_pantry_item_ids`: `null`은 기본값, `[]`는 미반영, 선택값은 해당 항목만 반영이다.
- 무효 항목(미체크/제외/중복)은 무시하고 진행한다.
- `pantry_added`는 `pantry_added_item_ids` 길이와 일치해야 한다.
- `shopping_list_items` 정렬은 `sort_order ASC`, 동일 시 `id ASC`다.
- 팬트리는 수량이 아니라 보유 여부만 저장한다.
- 독립 요리는 `meals` 상태를 바꾸지 않는다.
- 요리모드에서는 인분 조절 UI를 두지 않는다.
- 저장 가능한 레시피북 타입은 `saved`, `custom`만이다.
- 삭제된 엔드포인트 `DELETE /recipes/{id}/save`는 되살리지 않는다.

## Implementation Rules

- 문서에 없는 필드, 상태, 엔드포인트를 임의 추가하지 않는다.
- public contract 변경 시 문서 영향도를 먼저 적는다.
- API 응답은 `{ success, data, error }` 래퍼를 유지한다.
- error 객체는 `{ code, message, fields[] }` 구조를 따른다.
- 상태 전이 로직은 테스트로 고정한다.
- UI는 필요한 `loading / empty / error / read-only` 상태를 포함한다.
- 비로그인 보호 액션은 로그인 안내 후 return-to-action을 지원한다.

## Review Checks

- 완료/취소성 API가 멱등한가
- read-only 정책이 우회되지 않는가
- exclude -> uncheck 규칙이 지켜지는가
- `add_to_pantry_item_ids`의 `null / [] / 선택값`이 구분되는가
- 다른 사용자 리소스를 수정할 수 없는가
- 독립 요리와 플래너 요리의 상태 전이가 섞이지 않는가

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
