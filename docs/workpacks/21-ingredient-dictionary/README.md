# Slice: 21-ingredient-dictionary

## Goal

YouTube 설명란 파서가 추출한 재료명을 DB의 표준 재료(`ingredients.standard_name`)에 더 폭넓게 매칭한다. 이미 존재하는 `ingredient_synonyms` 테이블을 매칭 경로에 연결하고, 소량의 초기 synonym 데이터를 시딩해 실제 영상 재료의 매칭률을 끌어올린다.

## Branches

- 백엔드: `feature/be-21-ingredient-dictionary`

## In Scope (Phase 1 + 2)

- 화면: 없음 (BE-only)
- API: 기존 `POST /recipes/youtube/extract` 내부 매칭 로직 확장 (public API 계약 변경 없음)
- 상태 전이: 없음 (ingredient `resolution_status` resolved/needs_review/unresolved 판정 규칙 개선)
- DB 영향:
  - `ingredients` (INSERT — 신규 표준 재료 upsert, `on conflict do nothing`)
  - `ingredient_synonyms` (INSERT — synonym 연결, `on conflict do nothing`)
- Schema Change:
  - [x] DDL schema change 없음 — 기존 `ingredients` / `ingredient_synonyms` 테이블에 idempotent seed INSERT migration만 추가
  - [ ] 있음 → migration 필요

### 구현 범위

- `findIngredientIds()` 확장: standard 조회 + synonym 조회 병렬 실행 후 집계
- 매칭 결과 타입 변경: 단일 Map → 후보 집계 Map (canonical/source/dedup 지원)
- `buildExtractedIngredient` 분기: resolved / needs_review / unresolved 판정 규칙
- DB migration: 표준 재료 upsert(do nothing) + synonym 연결(소문자/trim)
- Phase 1 단위 테스트 6종

## Out of Scope

- Phase 3 안전 정규화 레이어 (접두어/부분문자열/fuzzy 추정 매칭 포함)
- Phase 4 미등록 재료 등록 흐름 (새 API + UI + contract evolution) — 별도 슬라이스
- 스푼→g 등 단위 환산 (원 단위 유지)
- 50~80개 일괄 대량 synonym 시딩 (소량·데이터 기반으로 시작)
- UI 변경 (이 슬라이스는 BE-only)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `20-youtube-real-import` | merged | [x] |

## Backend First Contract

### 내부 함수 계약 (`findIngredientIds` 확장)

기존 `findIngredientIds()`의 `ingredients.standard_name IN (...)` 단일 조회를 standard + synonym 병렬 조회로 확장한다. Public API 계약(`POST /recipes/youtube/extract` 응답)은 변경 없음.

**확장된 내부 반환 타입:**

```ts
type MatchSource = "direct" | "synonym";

// matchesByName: Map<originalName, Map<ingredientId, { standardName, source }>>
interface FindIngredientResult {
  error: PostgrestError | null;
  matchesByName: Map<string, Map<string, { standardName: string; source: MatchSource }>>;
}
```

**동작 규칙 (필수):**

- match 후보는 `ingredientId` 기준 dedup. 같은 재료가 direct/synonym 양쪽에서 잡히면 1개, `source`는 direct 우선.
- direct + synonym이 서로 다른 재료를 가리키면 `needs_review`(candidates 제공).
- synonym lookup DB 에러는 `error`로 전파 → 호출부에서 `INTERNAL_ERROR`. 조용한 unresolved 금지.
- 영어 synonym은 DB 소문자 저장 + lookup key에 소문자 variant 포함.
- lookup key는 trim 후 빈 문자열 제외, DB 결과는 `lookupKeyToOriginalNames`로 원본 parsed name에 되돌려 붙인다 (영어 대소문자 변형 버그 방지).
- embedded join 결과(`row.ingredients`)는 `Array.isArray` 정규화 후 사용, falsy면 skip.
- `source` 타입은 `"direct" | "synonym"` 단일 표기. candidates 정렬: direct → synonym → standardName.
- `needs_review`의 top-level `standard_name`은 원래 parsed name 유지 (임의 canonical 치환 금지). canonical 치환은 resolved일 때만.

**에러 케이스:**

- synonym 조회 DB 오류 → `error` 필드로 전파 (500 INTERNAL_ERROR)
- 기존 에러 계약 유지: 401/404 FEATURE_DISABLED/422/502/429

### Migration 계약 (Phase 2)

- 표준 재료: `on conflict (standard_name) do nothing` — 기존 row 불변
- synonym: `standard_name` 기준 join으로 연결, 영어는 `lower(trim(...))` 저장
- 카테고리: 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 내에서만 지정
- 시딩 범위: 보편 조미료 핵심 ~10개 + 실제 실패한 YouTube 케이스 재료 ~15개 (총 20~30개)
- migration 재실행은 idempotent (`on conflict ... do nothing`)

## Frontend Delivery Mode

- N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Design Authority

- UI risk: `none` (Phase 1+2는 서버측 매칭/데이터만 변경, UI 변경 없음)
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: Phase 4(미등록 재료 등록 UI)는 별도 슬라이스에서 design authority 판정.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/20-youtube-real-import/README.md` — 선행 슬라이스
- `docs/api문서-v1.2.6.md` — ingredient `resolution_status` 계약 (resolved/needs_review/unresolved)
- `docs/db설계-v1.3.4.md` — `ingredients`, `ingredient_synonyms` 테이블
- [lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts) — `findIngredientIds`, `buildExtractedIngredient`
- [app/api/v1/ingredients/route.ts](../../../app/api/v1/ingredients/route.ts) — 차용할 standard+synonym 병렬 조회 패턴
- [supabase/migrations/20260301000000_core_schema_bootstrap.sql](../../../supabase/migrations/20260301000000_core_schema_bootstrap.sql) — `ingredient_synonyms` 스키마

## QA / Test Data Plan

- **Fixture baseline**:
  - 기존 `tests/youtube-import.backend.test.ts` fixture 유지
  - synonym 매칭용 fixture 추가: direct-only, synonym-only, direct+synonym 동일, direct+synonym 다른 재료, ambiguous synonym, 빈 문자열, 대소문자 변형
- **Real DB smoke 경로**:
  - `pnpm dev:local-supabase` — 로컬 Supabase + migration 적용 후 synonym 시딩 확인
  - synonym 시딩 migration 적용 후 `findIngredientIds` 호출로 매칭률 개선 확인
- **Seed / reset 명령**: `pnpm local:reset:demo`
- **Bootstrap 선행 조건**:
  - `ingredients` 테이블 존재 (core_schema_bootstrap에서 생성)
  - `ingredient_synonyms` 테이블 존재 (core_schema_bootstrap에서 생성)
  - 슬라이스 20 모든 선행 조건 유지
- **Blocker 조건**:
  - `ingredient_synonyms` 테이블 부재 → synonym 조회 불가
  - `ingredients` 테이블 부재 → standard 조회 불가

## Key Rules

- 운영 migration은 기존 `ingredients` row를 덮어쓰지 않는다 (`on conflict (standard_name) do nothing`).
- synonym lookup DB 에러는 `error`로 전파 → 호출부에서 `INTERNAL_ERROR`. 조용한 unresolved 금지.
- 영어 synonym은 DB 소문자 저장 + lookup key에 소문자 variant 포함.
- lookup key는 trim 후 빈 문자열 제외.
- embedded join 결과는 `Array.isArray` 정규화 후 사용, falsy면 skip.
- `needs_review`의 top-level `standard_name`은 원래 parsed name 유지 (임의 canonical 치환 금지).
- `resolved`일 때만 top-level `standard_name`을 canonical로 치환하고, `display_text`/`raw_text`는 원문 유지.
- ambiguous 우려 synonym(예: "파")은 의도적으로 단일 매핑 유지하거나, 여러 재료에 붙는 경우 needs_review 후보로 동작하도록 설계.

## Contract Evolution Candidates (Optional)

없음. Public API 계약 변경 없이 내부 매칭 로직만 확장.

## Primary User Path

1. 사용자가 YouTube URL을 붙여넣고 추출을 시작한다 (`POST /recipes/youtube/extract`).
2. 서버가 설명란 파서로 재료명을 추출하고, `findIngredientIds`에서 standard + synonym 병렬 조회로 매칭한다.
3. 이전에 `unresolved`로 떨어지던 "진간장", "soy sauce" 같은 재료가 synonym 매칭으로 `resolved` 또는 `needs_review`로 전환되어 사용자가 바로 등록하거나 후보에서 선택할 수 있다.

## Confirmed Implementation Spec (v4 + delta)

> Codex 1~6차 리뷰 반영 최종본. 코드 예시 레벨까지 확정됨.

### Phase 1 — `findIngredientIds` 핵심 로직

```ts
type MatchSource = "direct" | "synonym";

// 1) lookup key 생성 + 원본 역매핑 (trim 후 빈 문자열 제외, key 중복 제거)
const lookupKeyToOriginalNames = new Map<string, Set<string>>();
for (const name of names) {
  const trimmed = name.trim();
  if (!trimmed) continue;
  for (const key of new Set([trimmed, trimmed.toLowerCase()])) {
    const existing = lookupKeyToOriginalNames.get(key);
    if (existing) existing.add(name);            // 역매핑엔 원본 name 보존
    else lookupKeyToOriginalNames.set(key, new Set([name]));
  }
}
const keys = [...lookupKeyToOriginalNames.keys()];
if (keys.length === 0) return { error: null, matchesByName: new Map() };

// 2) standard + synonym 병렬 조회 (route.ts 패턴 차용)
const [direct, viaSynonym] = await Promise.all([
  table(db, "ingredients").select("id, standard_name").in("standard_name", keys),
  table(db, "ingredient_synonyms")
    .select("synonym, ingredients!inner(id, standard_name)").in("synonym", keys),
]);
if (direct.error || viaSynonym.error) {          // 조용한 unresolved 금지
  return { error: direct.error ?? viaSynonym.error, matchesByName: new Map() };
}

// 3) DB row → lookup key → 원본 name 으로 역매핑하여 집계
//    matchesByName: Map<originalName, Map<ingredientId, { standardName, source }>>
const matchesByName = new Map<string, Map<string, { standardName: string; source: MatchSource }>>();
const attach = (lookupKey: string, ingId: string, standardName: string, source: MatchSource) => {
  for (const original of lookupKeyToOriginalNames.get(lookupKey) ?? []) {
    const bucket = matchesByName.get(original) ?? matchesByName.set(original, new Map()).get(original)!;
    const existing = bucket.get(ingId);
    if (!existing || (existing.source === "synonym" && source === "direct")) {  // direct 우선
      bucket.set(ingId, { standardName, source });
    }
  }
};

for (const row of direct.data ?? []) {
  attach(row.standard_name, row.id, row.standard_name, "direct");
}
for (const row of viaSynonym.data ?? []) {
  // embedded join 정규화 (route.ts:38 패턴)
  const ing = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients;
  if (!ing) continue;
  attach(row.synonym, ing.id, ing.standard_name, "synonym");
}

return { error: null, matchesByName };
```

### `buildExtractedIngredient` 분기 (bucket = `matchesByName.get(name)`)

- `bucket.size === 1` → **`resolved`**: top-level `standard_name`을 후보의 canonical로 치환. `display_text`/`raw_text`는 원문 유지.
- `bucket.size >= 2` → **`needs_review`**: top-level `standard_name`은 원래 parsed name 유지 (치환 금지). candidates만 canonical 이름을 direct → synonym → standardName 순으로 담음.
- `bucket.size === 0` / undefined → **`unresolved`**: parsed name 유지, 기존대로 저장 차단.

### Phase 2 — migration (소량·데이터 기반)

```sql
-- 표준 재료: 기존 row 불변 (do nothing)
insert into ingredients (standard_name, category, default_unit) values
  ('간장','양념',null), ...   -- 보편 조미료 ~10 + 실패 케이스 ~15 = 20~30개
on conflict (standard_name) do nothing;

-- synonym: standard_name 기준 연결, 영어는 소문자+trim 저장
insert into ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('간장','진간장'), ('간장','양조간장'), ('간장','soy sauce'),
  ...
) as v(name, synonym)
join ingredients i on i.standard_name = v.name
on conflict (ingredient_id, synonym) do nothing;
```

### 시딩 후보 (참고)

| standard_name | category | synonyms (예시) |
| --- | --- | --- |
| 간장 | 양념 | 진간장, 양조간장, 국간장, soy sauce |
| 설탕 | 양념 | 백설탕, 흰설탕, sugar |
| 식용유 | 양념 | 포도씨유, 카놀라유, 식물성 기름, 요리유 |
| 소금 | 양념 | 천일염, 꽃소금, salt |
| 참기름 | 양념 | sesame oil |
| 고춧가루 | 양념 | 고추가루, 굵은 고춧가루, 고운 고춧가루 |
| 다진마늘 | 양념 | 다진 마늘, 마늘다짐, minced garlic |
| 후추 | 양념 | 후춧가루, 통후추, black pepper |
| 생크림 | 유제품 | 휘핑크림, heavy cream, whipping cream |
| 버터 | 유제품 | 무염버터, 가염버터, butter |

> 위는 후보 목록이며, 실제 시딩은 슬라이스 구현 시 실패 케이스 데이터로 확정한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> BE-only 슬라이스이므로 Stage 4~6은 스킵. Stage 3 merge 시 슬라이스 종료.

- [ ] 백엔드 계약 고정 (findIngredientIds synonym 확장, buildExtractedIngredient 분기) <!-- omo:id=21-backend-contract;stage=2;scope=backend;review=3 -->
- [ ] API 또는 adapter 연결 (synonym 병렬 조회 패턴 적용) <!-- omo:id=21-api-adapter;stage=2;scope=backend;review=3 -->
- [ ] 타입 반영 (MatchSource, FindIngredientResult 타입) <!-- omo:id=21-types;stage=2;scope=shared;review=3 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 (resolved/needs_review/unresolved 판정, DB 에러 전파) <!-- omo:id=21-state-policy-tests;stage=2;scope=backend;review=3 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=21-fixture-smoke-split;stage=2;scope=shared;review=3 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 (ingredient_synonyms 테이블 존재) <!-- omo:id=21-bootstrap-readiness;stage=2;scope=shared;review=3 -->
- [ ] synonym 시딩 migration idempotent 검증 <!-- omo:id=21-synonym-seeding;stage=2;scope=backend;review=3 -->
- [ ] 기존 youtube-import 테스트 회귀 없음 <!-- omo:id=21-regression;stage=2;scope=backend;review=3 -->
- [ ] 실패 케이스 매칭률 개선 확인 <!-- omo:id=21-matching-improvement;stage=2;scope=backend;review=3 -->
