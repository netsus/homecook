# 집밥 서비스 작업 규칙

## Read First

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. `docs/workpacks/README.md`
3. 관련 `docs/workpacks/<slice>/README.md`
4. 관련 공식 문서 in `docs/`
5. 필요한 경우에만 `docs/reference/wireframes/`

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
- 기능 구현은 가능한 한 더 작은 작업 단위로 쪼개서 순차적으로 진행한다.
- 한 슬라이스 안에서 화면, 상태 전이, API, DB 영향, 테스트를 같이 닫는다.
- 현재 저장소에 이미 들어온 탐색/상세/로그인 게이트는 `01-discovery-detail-auth` 부트스트랩 슬라이스로 간주한다.
- 새로운 기능 작업 전 `docs/workpacks/<slice>/README.md`를 먼저 만든다.
- 문서 간 충돌이 보이면 구현보다 충돌 정리를 우선한다.

## Branch And Delivery

- 기능 작업은 기본 브랜치에서 직접 하지 않고 기능별 새 브랜치에서 진행한다.
- 같은 기능 슬라이스라도 `백엔드 브랜치`와 `프론트엔드 브랜치`를 분리한다.
- 브랜치 이름은 `feat/be-<slice>` / `feat/fe-<slice>` 패턴을 기본값으로 사용한다.
- 브랜치 하나에는 가능한 한 하나의 작은 기능 단위 또는 명확한 하위 작업만 담는다.
- 백엔드 브랜치가 API 계약, 권한, 상태 전이, 테스트를 먼저 고정한다.
- 프론트엔드 브랜치는 고정된 API 계약을 기준으로 화면 상태와 사용자 흐름을 닫는다.
- 구현 후 테스트 전용 에이전트 또는 동등한 검증 절차로 테스트를 완료한 뒤 푸시한다.
- 푸시 후 실제 동작까지 확인된 변경만 머지한다.
- 머지 전에는 `lint`, `typecheck`, `test`, 핵심 사용자 흐름 1회 수동 스모크 등 해당 변경 범위의 검증을 통과시킨다.

## Tech Stack

- 패키지 매니저: `pnpm`
- 프론트엔드: `Next.js 15` + `React 19` + `TypeScript`
- 스타일링: `Tailwind CSS 4`
- 상태관리: `Zustand`
- 백엔드/BaaS: `Supabase`
- API 구현: `Next.js Route Handlers`
- 테스트: `Vitest`
- Drag and Drop: `@dnd-kit/core`

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
- 백엔드 브랜치는 슬라이스 시작 시 request/response/error 계약과 타입 기준을 먼저 고정한다.
- 프론트엔드는 백엔드 계약을 그대로 소비하고, 화면 컴포넌트보다 API 타입 / 상태 enum / 권한 상태 / read-only 여부를 우선 분리한다.
- 상태 전이 로직은 테스트로 고정한다.
- UI는 필요한 `loading / empty / error / read-only` 상태를 포함한다.
- 디자인 확정 전 프론트는 기능 가능한 임시 UI를 우선 구현하고, 추후 `CSS 변수`, `Tailwind 클래스`, 공용 컴포넌트 중심으로 스타일을 교체할 수 있게 유지한다.
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
