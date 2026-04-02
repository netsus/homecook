# Acceptance Checklist: 03-recipe-like

> README의 `Contract Evolution Candidates`(낙관적 업데이트)는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.

## Happy Path

- [x] 로그인 사용자가 `RECIPE_DETAIL`에서 좋아요 버튼을 탭하면 `POST /api/v1/recipes/{id}/like`가 호출된다
- [x] 응답 `{ success: true, data: { is_liked: true, like_count: N } }` 형식이 맞다
- [x] 좋아요 등록 후 버튼이 활성 상태(채워진 하트)로 전환되고 like_count가 +1 증가한다
- [x] 이미 좋아요 상태에서 다시 탭하면 `is_liked: false`를 반환하고 버튼이 비활성(빈 하트)으로 전환되며 like_count가 -1 감소한다
- [x] 백엔드 계약 타입 `RecipeLikeResponse`와 프론트 타입이 일치한다

## State / Policy

- [x] `recipe_likes` 테이블에서 `(user_id, recipe_id)` 행 존재 여부로 토글을 결정한다
- [x] INSERT 시 `recipes.like_count += 1`, DELETE 시 `recipes.like_count -= 1`이 원자적으로 갱신된다
- [x] 동일 사용자가 동일 레시피에 중복 INSERT를 시도하면 UNIQUE 제약으로 차단된다 (race condition 방어)
- [x] `GET /recipes/{id}` 응답의 `user_status.is_liked`가 실제 `recipe_likes` 행 존재와 일치한다
- [x] `liked` 레시피북(`book_type='liked'`)의 source of truth는 `recipe_likes`다 — 이 슬라이스 API 이외 경로로 like 상태가 변경되지 않는다

## Error / Permission

- [x] `loading` 상태: 좋아요 요청 중 버튼이 비활성(pending)이어서 중복 호출이 방지된다
- [x] `empty` 상태: N/A (버튼은 항상 노출)
- [x] `error` 상태: 요청 실패(네트워크/서버 오류) 시 토스트 메시지가 표시되고 버튼 상태는 요청 전으로 복원된다
- [x] `unauthorized` 처리: 비로그인 사용자가 좋아요 버튼을 탭하면 로그인 게이트 모달이 표시된다
- [x] `conflict` 처리: UNIQUE 제약 위반은 서버에서 처리하며 FE에는 최종 is_liked 상태가 반환된다
- [x] 401 응답: 비로그인 상태에서 직접 API 호출 시 `UNAUTHORIZED` 에러가 반환된다
- [x] 404 응답: 존재하지 않는 `recipe_id`로 호출 시 `NOT_FOUND` 에러가 반환된다
- [x] 로그인 게이트 후 return-to-action: 로그인 완료 후 동일 `RECIPE_DETAIL` 화면으로 복귀한다

## Data Integrity

- [x] 타인 `recipe_likes` 행을 수정할 수 없다 (본인 `user_id`만 INSERT/DELETE)
- [x] `recipes.like_count`가 음수가 되지 않는다 (DELETE 전 행 존재 확인)
- [x] invalid `recipe_id`(uuid 형식 아님 또는 존재하지 않음)를 적절히 거부한다 (404)
- [x] `like_count` 비정규화 값이 실제 `recipe_likes COUNT(*)` 와 일치한다 (P1-3 규칙)

## Data Setup / Preconditions

- QA fixture:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - `localStorage["homecook.e2e-auth-override"] = "guest" | "authenticated"`
  - fixture 경로: `/recipe/mock-kimchi-jjigae`
- 실 DB smoke:
  - `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - DB smoke 경로: `/recipe/550e8400-e29b-41d4-a716-446655440022`

## Manual QA

1. 로그인 상태에서 좋아요 버튼 탭 → 버튼 활성 전환 + like_count +1 확인
2. 동일 레시피 다시 탭 → 버튼 비활성 전환 + like_count -1 확인
3. 비로그인 상태에서 좋아요 버튼 탭 → 로그인 게이트 모달 → 소셜 로그인 → RECIPE_DETAIL 복귀 + 좋아요 상태 반영 확인
4. 좋아요 요청 중(네트워크 지연 시뮬레이션) 버튼 중복 탭 시도 → pending 동안 반응 없음 확인
5. 오프라인 또는 서버 오류 시 → 토스트 표시 + 버튼 상태 원복 확인
6. `GET /recipes/{id}` 로그인 상태 응답에서 `user_status.is_liked`가 실제 좋아요 상태와 일치하는지 확인

## Automation Split

### Vitest

- [x] 토글 로직: `(user_id, recipe_id)` 행 없을 때 INSERT + `is_liked: true` 반환
- [x] 토글 로직: 행 있을 때 DELETE + `is_liked: false` 반환
- [x] `like_count` +1 / -1 원자 갱신 검증
- [x] 401 반환: 비로그인 호출
- [x] 404 반환: 존재하지 않는 `recipe_id`
- [x] 응답 envelope `{ success, data: { is_liked, like_count }, error }` 형식 검증

### Playwright

- [x] 로그인 사용자 → 좋아요 버튼 탭 → 활성 상태 전환 + like_count 증가 확인 (E2E)
- [x] 로그인 사용자 → 좋아요 해제 탭 → 비활성 전환 + like_count 감소 확인 (E2E)
- [x] 비로그인 → 좋아요 탭 → 로그인 게이트 모달 → 로그인 완료 → RECIPE_DETAIL 복귀 확인 (E2E)
- [x] 요청 중 버튼 pending 상태 (버튼 비활성) 확인 (E2E, 네트워크 스로틀)

### Manual Only

- [ ] 실제 Supabase 환경에서 `recipe_likes` 행과 `recipes.like_count` 동기화 smoke (`pnpm qa:seed:01-05` 후)
- [ ] 소셜 로그인 전체 OAuth 흐름 + return-to-action 복귀 smoke (`pnpm test:e2e:oauth` 별도 실행)
- [ ] 네트워크 지연/오프라인 조건에서 토스트 + 버튼 원복 수동 확인
