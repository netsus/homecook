# Acceptance: 21-ingredient-dictionary (Phase 1 + 2)

> 상태: **plan-only**. 아래는 정식 구현 착수 시 고정할 수용 기준의 초안이다.

## Phase 1 — synonym 매칭 (`findIngredientIds` / `buildExtractedIngredient`)

### 단위 테스트 (필수 6종)

- [ ] `진간장` synonym 입력이 `간장`으로 `resolved`되고, top-level `standard_name`이 canonical(`간장`)로 치환된다.
- [ ] `Soy Sauce` 입력이 DB의 `soy sauce` synonym으로 `resolved`된다 (대소문자 + 역매핑 검증).
- [ ] direct와 synonym이 **같은** ingredientId를 가리키면 후보 1개로 dedup되고 `source`가 `direct`다.
- [ ] direct와 synonym이 **서로 다른** ingredientId를 가리키면 `needs_review`가 되며, top-level `standard_name`은 원본 parsed name을 유지한다(canonical 치환 안 됨).
- [ ] 같은 synonym이 여러 재료에 붙으면 `needs_review` candidates가 **direct → synonym → standardName** 순으로 안정 정렬된다.
- [ ] synonym 조회 DB 에러가 `findIngredientIds`의 `error`로 전파되어 호출부에서 `INTERNAL_ERROR`로 차단된다(조용한 unresolved 금지).

### 동작 불변식

- [ ] lookup key는 trim 후 빈 문자열을 제외한다 (예: `" "` 입력이 빈 key를 만들지 않는다).
- [ ] embedded join 결과(`row.ingredients`)가 단일/배열/null 어떤 형태로 와도 `Array.isArray` 정규화로 안전하게 처리되고, falsy면 skip한다.
- [ ] `resolved`일 때만 top-level `standard_name`을 canonical로 치환하고, `display_text`/`raw_text`는 원문을 유지한다.

## Phase 2 — synonym 시딩 (migration)

- [ ] migration이 표준 재료를 `on conflict (standard_name) do nothing`으로 삽입해 기존 row를 덮지 않는다.
- [ ] synonym은 `standard_name` 기준 join으로 연결되고, 영어 synonym은 `lower(trim(...))`로 저장된다.
- [ ] 카테고리는 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 내에서만 지정된다.
- [ ] migration 재실행이 idempotent하다 (중복 synonym `on conflict (ingredient_id, synonym) do nothing`).

## 통합/회귀

- [ ] 기존 `tests/youtube-import.backend.test.ts`가 모두 통과한다 (resolution_status 계약 불변).
- [ ] 실제 실패 케이스(오이참치 꼬마김밥 등)에서 시딩된 재료가 `resolved` 또는 `needs_review`로 전환되어 매칭률이 개선된다.

## Out of Scope (이 슬라이스 acceptance 아님)

- Phase 3 안전 정규화 / 위험 추정 매칭
- Phase 4 미등록 재료 등록 흐름 (별도 슬라이스 + contract evolution)
