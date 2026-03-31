# Slice: 02-discovery-filter

## Goal

사용자가 HOME 화면에서 재료 필터 모달(`INGREDIENT_FILTER_MODAL`)을 통해 재료를 다중 선택하고,
선택된 재료가 **모두 포함된** 레시피만 목록에 노출한다.
이 슬라이스에서 `GET /api/v1/ingredients` 엔드포인트를 신규 구현하고,
기존 `GET /api/v1/recipes`에 `ingredient_ids` AND 필터 파라미터를 추가한다.

## Branches

- 백엔드: `feature/be-02-discovery-filter`
- 프론트엔드: `feature/fe-02-discovery-filter`

## In Scope

- 화면:
  - `HOME` — "재료로 검색" 버튼 + 필터 적용 상태 표시 (기존 화면, low-risk UI change)
  - `INGREDIENT_FILTER_MODAL` — 재료 검색 + 카테고리 탭 + 다중 선택 + [적용]/[초기화] (신규 화면)
- API:
  - `GET /api/v1/ingredients` — 재료 목록 조회, 신규 구현 (api문서 §1-3)
  - `GET /api/v1/recipes` — `ingredient_ids` 파라미터 추가 (api문서 §1-1 계약 확장)
- 상태 전이: 없음 (읽기 전용 슬라이스)
- DB 영향:
  - `ingredients` (읽기)
  - `ingredient_synonyms` (읽기 — `q` 검색 시 동의어 JOIN)
  - `recipe_ingredients` (읽기 — `ingredient_ids` AND 필터 JOIN)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- `q`(제목 검색)와 `ingredient_ids` 동시 적용 UX 개선 — API는 AND 결합, 화면 UX는 기본 처리 유지
- 카테고리 목록 전용 API (`GET /ingredients/categories`) — 문서에 없음, MVP 미포함
- 재료 목록 페이지네이션 — `GET /ingredients`는 전체 로드 (api문서 기준, cursor/limit 없음)
- 실시간 결과 수 미리보기 (`count_only`, `[레시피 N개 보기]`) — 공식 API 문서에 없음
- 팬트리 보유 재료와 필터 연동 (보유 표시 등) — Slice 13
- `RECIPE_SEARCH_PICKER`의 재료 필터 — Slice 08a
- 필터 선택 상태 영구 저장 (로컬스토리지 등) — 세션 내 Zustand 상태만 유지
- 공유 가능한 deep-link / 세션 외 URL 유지 — 이번 슬라이스 범위 제외

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |

> `bootstrap`은 `merged`와 동등하게 취급한다.

## Backend First Contract

### `GET /api/v1/ingredients` (신규)

```
GET /api/v1/ingredients
```

🔓 비로그인

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Query | `q` | string? | 재료명 검색 (표준명 + 동의어) |
| Query | `category` | string? | 카테고리 필터 |

**응답 (200)**:

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "uuid", "standard_name": "양파", "category": "채소" }
    ]
  },
  "error": null
}
```

**에러**: 없음 (비로그인 허용, 결과 없으면 `items: []`)

**설계 결정**:
- 페이지네이션 없음 (api문서 기준 cursor/limit 없음, MVP 전체 로드)
- `q` 검색: `ingredients.standard_name` ILIKE + `ingredient_synonyms.synonym` ILIKE (JOIN)
- `category` 필터: `ingredients.category` 일치 조건

---

### `GET /api/v1/recipes` — `ingredient_ids` 파라미터 추가

```
GET /api/v1/recipes
```

🔓 비로그인 (기존과 동일)

기존 파라미터 유지: `q`, `sort`, `cursor`, `limit`

추가 파라미터:

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Query | `ingredient_ids` | string? | 재료 ID 쉼표 구분 (`id1,id2,...`) — AND 필터 |

**응답 (200)**: 기존과 동일

```json
{
  "success": true,
  "data": {
    "items": [...],
    "next_cursor": "string|null",
    "has_next": false
  },
  "error": null
}
```

**에러**: 없음 (결과 없으면 `items: []`)

**필터 규칙**:
- `ingredient_ids` 미전달 시 전체 목록 조회 (기존 동작 유지)
- `ingredient_ids` 전달 시 각 재료 ID가 **모두 포함된** 레시피만 반환 (AND 조건)
  - 현재 구현 잠금: `recipe_ingredients`에서 후보 행을 읽은 뒤 `ingredient_id`를 recipe 단위로 DISTINCT 집계해 AND 조건을 판정한다
  - DB-side aggregate/HAVING 최적화는 PostgREST 실환경에서 의미 검증이 끝난 뒤에만 허용한다
- `ingredient_ids`는 쉼표 기준으로 파싱하고, 빈 값 / 중복 / malformed token은 무시한다
- 유효 UUID가 하나도 남지 않으면 `200 { items: [] }`를 반환한다
- 유효 UUID는 있으나 매칭 레시피가 없으면 `200 { items: [] }`를 반환한다
- `q`와 `ingredient_ids` 동시 전달 시 AND 결합

**권한 / 멱등성**: 읽기 전용 — N/A

---

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI (temporary)
- 필수 상태 5개:
  - `loading`: 모달 진입 시 재료 목록 로딩, 필터 적용 후 레시피 목록 재조회
  - `empty`: 재료 검색 결과 없음 / 필터 결과 레시피 없음 ("조건에 맞는 레시피가 없어요" + [필터 초기화])
  - `error`: `GET /ingredients` 실패 (재료 목록 에러) / `GET /recipes` 실패 ("레시피를 불러오지 못했어요" + [다시 시도])
  - `read-only`: N/A (읽기 전용 슬라이스)
  - `unauthorized`: N/A (비로그인 허용)
- 로그인 보호 액션: 없음 (비로그인 허용)

> `read-only`와 `unauthorized`는 N/A지만 상태 타입 정의에서 명시적으로 `null` 처리

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> **신규 화면 (`INGREDIENT_FILTER_MODAL`)**: Stage 1에서 design-generator + design-critic 실행 완료
> **기존 화면 (`HOME`)**: 필터 버튼 활성 상태 표시 추가는 low-risk UI change → design-generator/critic 생략
> 생략 근거: HOME 화면 구조·컴포넌트는 Slice 01 Retrofit에서 `confirmed` 처리됨.
> 추가 변경은 버튼 활성 색상 및 선택 재료 수 배지 표시로 confined 범위임.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.md` — §1-1 홈(레시피 탐색)
- `docs/화면정의서-v1.2.md` — §1 HOME, §2 INGREDIENT_FILTER_MODAL
- `docs/api문서-v1.2.1.md` — §1-1 레시피 목록 조회, §1-3 재료 목록 조회
- `docs/db설계-v1.3.md` — §2 재료 마스터 (`ingredients`, `ingredient_synonyms`)
- `docs/design/design-tokens.md` — `--olive` 필터 칩, `--brand` 활성 버튼 색상

## Key Rules

- `ingredient_ids` 필터는 **AND 조건**이다. 선택 재료가 모두 포함된 레시피만 반환한다.
- `GET /ingredients`와 `GET /recipes?ingredient_ids=...` 모두 **비로그인 허용**이다.
- `ingredient_ids`는 **쉼표 구분 문자열**로 전달한다 (`id1,id2,id3`).
- `ingredient_ids`는 쉼표 기준으로 파싱하며, 빈 값 / 중복 / malformed token은 무시한다. 유효 UUID가 하나도 없으면 `items: []`를 반환한다.
- `GET /ingredients` 검색(`q`)은 `standard_name` ILIKE + `ingredient_synonyms` JOIN으로 처리한다.
- 카테고리 기본 목록은 공식 DB 문서(`docs/db설계-v1.3.md`)의 `채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타`를 기준으로 한다.
- `전체` 탭은 UI 전용 sentinel이며, 서버에 `category=all`을 전달하지 않는다. 전체 조회는 `category` 미전달로 처리한다.
- HOME 필터 초기화: `ingredient_ids` 파라미터를 제거하고 전체 레시피 목록으로 복귀한다.
- 세션 내 필터 선택 상태의 source of truth는 Zustand다. URL의 `ingredient_ids`는 same-session mirror로만 사용한다.
- 필터 적용 / 초기화 직후에는 HOME URL을 동기화하지만, hard refresh 시에는 store와 URL을 함께 초기화하고 전체 목록으로 복귀한다.
- 모달 CTA는 `[적용]` / `[초기화]` 기준으로 고정한다. 실시간 결과 수 미리보기는 제공하지 않는다.
- `GET /ingredients`는 페이지네이션 없이 전체 로드한다 (api문서 기준).

## Contract Evolution Candidates

- 현재 이 슬라이스에서 사용자 승인된 공식 계약 변경은 없다. Stage 2/4 구현은 위 `Backend First Contract`와 `Key Rules`만 기준으로 한다.
- 아래 후보는 참고용 backlog이며, 이 README의 In Scope / acceptance / Ready for Review gate를 바꾸지 않는다.
- 후보 1: 실시간 결과 수 미리보기 (`count_only` 또는 별도 preview 계약)
  현재 공식 API 문서와 화면정의서에는 없지만, 사용자가 적용 전 예상 결과 수를 보는 UX 가치는 있다.
  채택하려면 공식 API/화면 문서 갱신과 별도 `contract-evolution` PR이 먼저 필요하다.
- 후보 2: 세션 외 deep-link persistence
  hard refresh 이후에도 필터를 복원하는 공유 가능한 URL은 사용자 편의가 있지만, 현재 공식 문서의 same-session mirror 정책을 바꾸는 계약 변경이므로 후속 후보로만 남긴다.

## 구현 전 잠금 결정 사항

> Stage 2 착수 전, 아래 결정이 별도 `docs-governance` PR로 main에 반영되어 있어야 한다.

### 1. Stage 0 docs-governance gate

- Stage 0 문서 잠금은 별도 `docs-governance` PR로 분리한다.
- 대상 파일: `docs/workpacks/02-discovery-filter/README.md`, `acceptance.md`, `ui/designs/INGREDIENT_FILTER_MODAL.md`, `ui/designs/critiques/INGREDIENT_FILTER_MODAL-critique.md`
- 이 Stage 0는 현재 공식 계약을 잠그는 단계이며, `Contract Evolution Candidates` 채택 여부를 결정하는 단계가 아니다.
- Stage 2 착수 전 HEAD에서 아래 흔적이 제거되었는지 다시 확인한다:
  - `count_only`
  - `previewCount` / `count_only` / 비공식 `ingredients` query 계약 (design 파일 §디자인 결정 사항 참조)
  - `category=all`
  - `[레시피 N개 보기]`
  - 체크리스트 정의와 충돌하는 모호한 칩 전용 설명

### 2. 카테고리 source of truth

- 카테고리 허용값의 기본 source of truth는 공식 DB 문서(`docs/db설계-v1.3.md`)다.
- FE 기본 탭 목록은 `전체(UI) + 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타`로 잠근다.
- 로컬 seed / fixture가 공식 문서와 다르면, 이번 슬라이스에서는 workpack / acceptance에 실제 허용값을 먼저 기록하고 구현은 그 잠금값을 따른다.
- 공식 DB 문서 승격은 후속 docs 작업으로 분리한다.

### 3. `ingredient_ids` AND 필터 SQL

- 현재 Stage 2 잠금 구현은 `recipe_ingredients` 후보 행 조회 후, route 내부에서 `COUNT(DISTINCT ingredient_id)`와 같은 의미가 되도록 recipe별 고유 `ingredient_id` 개수를 집계해 AND 필터를 판정하는 방식이다.
- PostgREST 공식 문서상 aggregate와 함께 `HAVING`은 아직 직접 지원되지 않으므로, 실환경 검증 전까지 alias 기반 aggregate filter를 기본안으로 채택하지 않는다.
- 이후 DB-side aggregate 최적화를 도입하려면 실제 Supabase 환경에서 의미 검증을 먼저 수행하고, 그 결과를 근거로 이 README를 갱신한다.

### 4. `GET /ingredients` 검색 / 테스트 정책

- 검색 방식은 `standard_name ILIKE '%q%'` + `ingredient_synonyms.synonym ILIKE '%q%'`로 고정한다.
- 실제 동의어 seed 데이터가 없으면 자동화는 fixture 기반 테스트로 계약을 고정하고, Manual QA는 `seed data required` 조건부로 둔다.

### 5. HOME 필터 UX / URL 정책

- 필터 활성 UI 기본값은 HOME 버튼의 선택 수 표시(예: `"재료로 검색 (3)"`)다.
- 카테고리 탭 전환 시 기존 검색어는 유지되며 `q + category` AND 조회를 수행한다.
- URL은 same-session mirror이므로 적용 / 초기화 직후에만 동기화하고, hard refresh는 초기화 동작을 우선한다.

### 6. 실제 동작 확인 gate

- Stage 2는 `pnpm test:all` 이후 실제 API smoke 확인을 거쳐 Ready for Review로 넘긴다.
  - 현재 필수 smoke는 response envelope/분기 확인이다.
  - `ingredient_ids`의 AND 의미는 Vitest fixture로 고정하고, Supabase product schema가 준비된 환경이 있을 때만 실 DB smoke를 추가 수행한다.
- Stage 4는 `pnpm test:all` 이후 실제 브라우저에서 `HOME → 모달 열기 → 선택 → 적용 → URL 반영 → hard refresh 초기화 → 필터 초기화` smoke 확인을 거쳐 Ready for Review로 넘긴다.

## Primary User Path

1. 사용자가 `HOME`에서 "재료로 검색" 버튼을 탭한다.
2. `INGREDIENT_FILTER_MODAL`이 열리고, 재료명을 검색하거나 카테고리 탭을 선택해 재료 체크리스트를 다중 선택한다.
3. 카테고리 탭을 바꿔도 기존 검색어(`q`)는 유지되며, `q + category` 조건으로 재료 목록이 갱신된다.
4. [적용] 버튼을 탭하면 모달이 닫히고 HOME에 선택 재료가 모두 포함된 레시피만 노출된다. 이때 같은 세션 안에서는 URL `ingredient_ids`도 함께 동기화된다.
5. 필터가 적용된 상태에서 [필터 초기화]를 탭하거나 hard refresh를 수행하면 전체 레시피 목록으로 복귀한다.

## Delivery Checklist

- [x] Stage 0 `docs-governance` PR merge 완료
- [x] 백엔드 계약 고정 (`IngredientItem` 타입, `RecipeListQuery` 타입 업데이트)
- [x] `GET /api/v1/ingredients` Route Handler 구현
- [x] `GET /api/v1/recipes` `ingredient_ids` 파라미터 추가 및 AND 필터 로직 구현
- [x] `INGREDIENT_FILTER_MODAL` 컴포넌트 구현 (검색 + 카테고리 탭 + 다중 선택 + 버튼)
- [x] HOME "재료로 검색" 버튼 + 필터 활성 상태 표시 업데이트
- [x] Zustand `selectedIngredientIds` 상태 관리 구현
- [x] `loading / empty / error` 상태 구현 (모달 + HOME 목록 양쪽)
- [x] Vitest: `ingredient_ids` 파싱·필터 로직, 동의어 검색 유닛 테스트
- [x] Playwright: HOME → 모달 열기 → 재료 선택 → 적용 → 필터 결과 E2E
- [x] 실제 API smoke: `GET /api/v1/ingredients`, `GET /api/v1/recipes?ingredient_ids=...`
- [x] 실제 브라우저 smoke: HOME → 모달 → 적용 → URL 동기화 → hard refresh 초기화 → 필터 초기화
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리
