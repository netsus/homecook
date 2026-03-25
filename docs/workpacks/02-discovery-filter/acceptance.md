# Acceptance Checklist: 02-discovery-filter

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 이 acceptance 범위에 포함하지 않는다.

## Happy Path

- [ ] HOME에서 "재료로 검색" 버튼 탭 시 `INGREDIENT_FILTER_MODAL`이 열린다
- [ ] `INGREDIENT_FILTER_MODAL`에서 재료명 검색 시 `GET /api/v1/ingredients?q=...` 결과가 체크리스트로 표시된다
- [ ] 카테고리 탭 선택 시 `GET /api/v1/ingredients?category=...`가 호출되고 해당 카테고리 재료만 표시된다
- [ ] 재료 다중 선택 후 [적용] 탭 시 `GET /api/v1/recipes?ingredient_ids=id1,id2,...` 호출이 발생한다
- [ ] 선택 재료가 **모두 포함된** 레시피만 HOME 목록에 노출된다
- [ ] `GET /api/v1/ingredients` 응답 형식이 `{ success: true, data: { items: [...] }, error: null }`을 따른다
- [ ] `GET /api/v1/recipes?ingredient_ids=...` 응답이 기존 `{ success, data: { items, next_cursor, has_next }, error }` 형식을 유지한다
- [ ] 백엔드 계약 타입(`IngredientItem`, `RecipeListQuery`)과 프론트 타입이 일치한다

## State / Policy

- [ ] `ingredient_ids` AND 조건이 지켜진다 — 선택 재료 일부만 포함된 레시피는 결과에서 제외된다
- [ ] 필터 선택 상태가 모달 닫기 → 재열기 시 유지된다 (세션 내 Zustand)
- [ ] 카테고리 탭 전환 시 기존 검색어(`q`)는 유지되며 `q + category` AND 조회로 재료 목록이 갱신된다
- [ ] 필터 적용 직후 HOME URL은 same-session mirror로 `ingredient_ids`를 반영한다
- [ ] 새로고침 시 필터 상태가 초기화된다 (영구 저장 없음)
- [ ] hard refresh 시 URL `ingredient_ids`가 제거되고 전체 레시피 목록으로 복귀한다
- [ ] `ingredient_ids` 미전달 시 전체 레시피 목록이 조회된다 (기존 동작 유지)
- [ ] `q`와 `ingredient_ids` 동시 전달 시 AND 결합으로 처리된다
- [ ] 중복 호출에도 결과가 꼬이지 않는다 (동시 요청 레이스 컨디션 없음)

## Error / Permission

- [ ] `loading` 상태: 모달 진입 시 재료 목록 로딩 스피너/스켈레톤 표시
- [ ] `loading` 상태: 필터 적용 후 HOME 레시피 목록 재조회 중 로딩 표시
- [ ] `empty` 상태 (재료): 재료 검색 결과 없음 메시지 표시
- [ ] `empty` 상태 (레시피): 필터 결과 레시피 없음 → "조건에 맞는 레시피가 없어요" + [필터 초기화] 버튼
- [ ] `error` 상태: `GET /ingredients` 실패 시 재료 목록 에러 메시지 표시
- [ ] `error` 상태: `GET /recipes` 실패 시 "레시피를 불러오지 못했어요" + [다시 시도] 버튼
- [ ] `read-only`: N/A (읽기 전용 슬라이스)
- [ ] `unauthorized`: N/A (비로그인 허용)
- [ ] `conflict (409)`: N/A (쓰기 없음)
- [ ] 로그인 게이트 return-to-action: N/A (비로그인 허용)

## Data Integrity

- [ ] 타인 리소스 수정 불가: N/A (읽기 전용)
- [ ] 존재하지 않는 `ingredient_ids` 전달 시 빈 결과 반환 (에러가 아닌 `items: []`)
- [ ] 재료 검색이 `standard_name` + `ingredient_synonyms` 모두에서 일치하는 결과를 반환한다
- [ ] malformed / 빈 / 중복 `ingredient_ids` token은 무시하고, 유효 UUID가 하나도 없으면 `items: []`를 반환한다

## Manual QA

1. HOME에서 "재료로 검색" 버튼 탭 → 재료 2~3개 다중 선택 → [적용] → 레시피 목록 확인 (선택 재료 모두 포함 레시피만 표시되는지)
2. 필터 적용 상태에서 HOME [필터 초기화] → 전체 목록 복귀 확인
3. 모달 닫기 → "재료로 검색" 버튼 재탭 → 이전 선택 재료가 유지되는지 확인
4. 동의어로 재료 검색 (예: "파" → "대파" 포함 결과 확인) — `seed data required`, DB 데이터 의존 수동 확인
5. 결과 없는 재료 조합 선택 → empty 상태 확인 + [필터 초기화] 동작 확인
6. 카테고리 탭 변경 → 해당 카테고리 재료만 노출되는지 확인
7. 재료 목록 로딩 실패 시뮬레이션 → error 상태 메시지 확인
8. 필터 적용 후 hard refresh → URL `ingredient_ids` 제거 + 전체 목록 복귀 확인

## Automation Split

### Vitest

- [ ] `ingredient_ids` 쉼표 파싱 유틸 (빈 문자열, 단일 ID, 복수 ID, malformed token 무시, 유효 UUID 없음)
- [ ] `GET /ingredients` Route Handler: q 검색 (표준명 일치), q 검색 (동의어 일치, fixture 기반), category 필터, 빈 결과
- [ ] `GET /recipes` `ingredient_ids` AND 필터 로직: 단일 재료, 복수 재료 AND, 미포함 레시피 제외, malformed / nonexistent 입력
- [ ] `ingredient_ids` 미전달 시 기존 전체 조회 동작 유지 (회귀)

### Playwright

- [ ] HOME → "재료로 검색" 버튼 탭 → `INGREDIENT_FILTER_MODAL` 열림 확인
- [ ] 모달에서 재료 1개 선택 → [적용] → HOME URL에 `ingredient_ids` 파라미터 포함 확인
- [ ] 필터 적용 후 [필터 초기화] → `ingredient_ids` 파라미터 제거 + 전체 목록 복귀 확인
- [ ] 모달 닫기 → 재열기 → 이전 선택 상태 유지 확인
- [ ] 필터 적용 후 hard refresh → Zustand 초기화 + URL `ingredient_ids` 제거 + 전체 목록 복귀 확인

### Manual Only

- [ ] 동의어 데이터가 실제 Supabase DB에 존재하는지 확인 (데이터 의존)
- [ ] 카테고리 탭 목록이 공식 DB 문서 기본값과 실제 DB `ingredients.category` 값에 모두 부합하는지 확인 (데이터 의존)
- [ ] 재료 마스터 seed 데이터 존재 여부 확인 (초기 데이터 없으면 모달 empty 상태로 보임)
- [ ] 재료 수가 많을 때 전체 로드 응답 시간 체감 확인 (MVP 허용 범위 주관 판단)
