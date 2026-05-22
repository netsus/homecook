# Slice: 21-ingredient-dictionary

> 상태: **계획 보존 단계 (plan-only)**. 이 문서는 슬라이스 20(`20-youtube-real-import`) 머지 이후, YouTube 추출 재료 매칭 실패("재료를 찾지 못했어요") 문제를 해소하기 위한 재료 사전(synonym) 매칭 + 미등록 재료 등록 방향의 확정 계획을 보존한다. Codex 6차 리뷰까지 반영된 구현 지시서 v4+델타를 그대로 담는다. 실제 구현은 정식 슬라이스 절차(Stage 1~6)로 별도 진행한다.

## Goal

YouTube 설명란 파서가 추출한 재료명을 DB의 표준 재료(`ingredients.standard_name`)에 더 폭넓게 매칭한다. 현재는 `standard_name` 정확 일치만 시도하므로 "진간장", "soy sauce" 같은 동의어/표기 변형이 모두 `unresolved`로 떨어져 저장이 차단된다. 이미 존재하는 `ingredient_synonyms` 테이블을 매칭 경로에 연결하고, 소량의 초기 synonym 데이터를 시딩해 실제 영상 재료의 매칭률을 끌어올린다. 완전 신규 재료의 사용자 확인 기반 등록은 별도 슬라이스(Phase 4)로 분리한다.

## Background / Problem

- 실제 영상(오이참치 꼬마김밥 등) 테스트에서 다수 재료가 `unresolved`로 표시되어 등록이 막힘.
- `ingredient_synonyms` 테이블은 [supabase/migrations/20260301000000_core_schema_bootstrap.sql](../../../supabase/migrations/20260301000000_core_schema_bootstrap.sql) 에 이미 존재하고 `synonym` 인덱스도 있으나, 현재 추출 매칭 경로에서 사용되지 않는다.
- 현재 매칭 함수 [lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts) `findIngredientIds()`는 `ingredients.standard_name IN (...)`만 조회한다.
- 기존 재료 검색 API [app/api/v1/ingredients/route.ts](../../../app/api/v1/ingredients/route.ts)는 이미 `ingredients` + `ingredient_synonyms` 두 쿼리를 병렬 실행 후 `mergeIngredientItems`로 id 기준 dedup하는 검증된 패턴을 갖고 있다. 이 패턴을 추출 매칭에 차용한다.

## Phasing

| Phase | 내용 | 효과 | 리스크 | 시기 |
| --- | --- | ---: | --- | --- |
| 1 | synonym 조회 연결 (`findIngredientIds` 확장) | 즉시 | 낮음 | 이 슬라이스 |
| 2 | 소량·데이터 기반 synonym 시딩 (migration) | 높음 | 낮음 | 이 슬라이스 (Phase 1과 한 묶음) |
| 3 | 안전 정규화 레이어 (공백/괄호/소문자), 위험 추정은 needs_review | 중간 | 낮음 | unresolved 비율 측정 후 별도 |
| 4 | 미등록 재료 사용자 확인 등록 흐름 | 높음 | 중간 | 별도 workpack + contract evolution |

**이 슬라이스 범위: Phase 1 + 소량 Phase 2.** Phase 3/4는 unresolved 비율 측정 후 별도 슬라이스.

## In Scope (Phase 1 + 2)

- `findIngredientIds()` 확장: standard 조회 + synonym 조회 병렬 실행 후 집계
- 매칭 결과 타입 변경: 단일 Map → 후보 집계 Map (canonical/source/dedup 지원)
- `buildExtractedIngredient` 분기: resolved / needs_review / unresolved 판정 규칙
- DB migration: 표준 재료 upsert(do nothing) + synonym 연결(소문자/trim)
- Phase 1 단위 테스트 6종

## Out of Scope

- Phase 3 정규화 레이어 (접두어/부분문자열/fuzzy 추정 매칭 포함)
- Phase 4 미등록 재료 등록 흐름 (새 API + UI + contract evolution) — 별도 슬라이스
- 스푼→g 등 단위 환산 (원 단위 유지)
- 50~80개 일괄 대량 synonym 시딩 (소량·데이터 기반으로 시작)

## Confirmed Implementation Spec (v4 + delta)

> Codex 1~6차 리뷰 반영 최종본. 코드 예시 레벨까지 확정됨.

### 동작 규칙 (필수)

- match 후보는 **`ingredientId` 기준 dedup**. 같은 재료가 direct/synonym 양쪽에서 잡히면 1개, `source`는 **direct 우선**.
- direct + synonym이 **서로 다른 재료**를 가리키면 `needs_review`(candidates 제공).
- 운영 migration은 기존 `ingredients` row를 **덮어쓰지 않는다**(`on conflict (standard_name) do nothing`).
- synonym lookup **DB 에러는 `error`로 전파** → 호출부에서 `INTERNAL_ERROR`. 조용한 unresolved 금지.
- 영어 synonym은 **DB 소문자 저장 + lookup key에 소문자 variant 포함**.
- lookup key는 **trim 후 빈 문자열 제외**, DB 결과는 **`lookupKeyToOriginalNames`로 원본 parsed name에 되돌려 붙인다**(영어 대소문자 변형 버그 방지).
- embedded join 결과(`row.ingredients`)는 **`Array.isArray` 정규화** 후 사용, falsy면 skip.
- `source` 타입은 **`"direct" | "synonym"`** 단일 표기. candidates 정렬: **direct → synonym → standardName**.
- `needs_review`의 top-level `standard_name`은 **원래 parsed name 유지**(임의 canonical 치환 금지). canonical 치환은 **resolved일 때만**.

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

- `bucket.size === 1` → **`resolved`**: top-level `standard_name`을 후보의 **canonical로 치환**. `display_text`/`raw_text`는 원문 유지.
- `bucket.size >= 2` → **`needs_review`**: top-level `standard_name`은 **원래 parsed name 유지**(치환 금지). candidates만 canonical 이름(예: 대파, 쪽파)을 **direct → synonym → standardName 순**으로 담음. confidence는 parsed confidence(여러 후보 동일해도 무방, UI 선택 강제라 자동 저장 리스크 없음).
- `bucket.size === 0` / undefined → **`unresolved`**: parsed name 유지, 기존대로 저장 차단.

> 호출부([lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts) `handleYoutubeExtract`)는 이미 `ingredientLookup.error` 시 `INTERNAL_ERROR`로 차단하는 패턴이 있어, synonym 조회 에러를 동일 `error` 필드로 전파하면 자동으로 보장된다.

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

- 카테고리는 **채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타** 내에서만 지정.
- 시딩 범위: 보편 조미료 핵심 ~10개 + 실제 실패한 YouTube 케이스 재료 ~15개 (총 20~30개).
- ambiguous 우려 synonym(예: "파")은 의도적으로 단일 매핑 유지하거나, 여러 재료에 붙는 경우 needs_review 후보로 동작하도록 설계.

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

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/20-youtube-real-import/README.md` — 선행 슬라이스
- [lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts) `findIngredientIds`, `buildExtractedIngredient`
- [app/api/v1/ingredients/route.ts](../../../app/api/v1/ingredients/route.ts) — 차용할 standard+synonym 병렬 조회 패턴
- [supabase/migrations/20260301000000_core_schema_bootstrap.sql](../../../supabase/migrations/20260301000000_core_schema_bootstrap.sql) — `ingredient_synonyms` 스키마
- [supabase/seed.sql](../../../supabase/seed.sql) — upsert + synonym 시딩 패턴 참고
- `docs/api문서-v1.2.6.md` — ingredient `resolution_status` 계약 (resolved/needs_review/unresolved)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `20-youtube-real-import` | merged | [x] |

## Design Authority

- UI risk: `none` (Phase 1+2는 서버측 매칭/데이터만 변경, UI 변경 없음)
- Authority status: `not-required`
- Phase 4(미등록 재료 등록 UI)는 별도 슬라이스에서 design authority 판정.

## Notes

- 이 문서는 plan-only 보존본이다. 정식 구현 착수 시 Stage 1에서 본 spec을 기준으로 acceptance를 고정하고 Stage 2 백엔드로 진행한다.
- Phase 4는 현재 계약(unresolved → picker/search 교체)을 바꾸므로 contract-evolution 문서를 먼저 갱신해야 한다.
