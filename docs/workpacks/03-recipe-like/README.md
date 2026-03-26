# Slice: 03-recipe-like

## Goal

사용자가 `RECIPE_DETAIL` 화면에서 레시피 좋아요 버튼을 탭해 좋아요 상태를 토글할 수 있다.
비로그인 사용자가 좋아요를 시도하면 로그인 게이트 모달을 표시하고, 로그인 완료 후 원래 레시피 상세 화면으로 자동 복귀한다.
좋아요 등록/해제 시 `recipe_likes` 행과 `recipes.like_count` 비정규화 카운트가 동시에 원자 갱신된다.

## Branches

- 백엔드: `feature/be-03-recipe-like`
- 프론트엔드: `feature/fe-03-recipe-like`

## In Scope

- 화면:
  - `RECIPE_DETAIL` — 좋아요 버튼 토글 상태 표시(채워진/빈 하트 + 카운트) (기존 화면, low-risk UI change)
  - 로그인 게이트 모달 (Slice 01 전역 패턴 재사용)
- API:
  - `POST /api/v1/recipes/{recipe_id}/like` — 좋아요 토글 (api문서 §2-2)
- 상태 전이:
  - `recipe_likes`: 행 INSERT (좋아요 등록) / DELETE (좋아요 해제)
  - `recipes.like_count`: +1 / -1 원자 갱신 (비정규화 카운트)
- DB 영향:
  - `recipe_likes` (INSERT / DELETE)
  - `recipes` (`like_count` 갱신)
- Schema Change:
  - [ ] 없음 (테이블은 DB 설계 v1.3에 이미 존재)
  - [x] 있음 → `supabase/migrations/20260326233638_slice03_recipe_like_count_trigger.sql` (recipe_likes ↔ recipes.like_count 동기 트리거)

## Out of Scope

- 좋아요한 레시피북(`liked`) 목록 직접 조회 — Slice 17
- `DELETE /recipe-books/{book_id}/recipes/{recipe_id}`에서 liked 책 제거로 좋아요 해제하는 경로 — Slice 17
- 레시피 목록(HOME)에서 좋아요 카운트 실시간 반영 — 정렬/UI 변경 없음, 이번 범위 아님
- 낙관적 업데이트(Optimistic UI) + 롤백 — MVP 기본 처리만 (pending → 응답 후 UI 갱신)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |

> 모든 선행 슬라이스가 `merged`(또는 `bootstrap`) 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### `POST /api/v1/recipes/{recipe_id}/like`

```
POST /recipes/{recipe_id}/like
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Path | `recipe_id` | uuid | 대상 레시피 ID |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "is_liked": true,
    "like_count": 341
  },
  "error": null
}
```

`is_liked: false`인 응답(좋아요 해제)도 200이며 같은 구조다.

**에러**

| 상태 | code | 설명 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 비로그인 사용자 |
| 404 | `NOT_FOUND` | 존재하지 않는 `recipe_id` |

**토글 동작**

- `recipe_likes`에 `(user_id, recipe_id)` 행이 없으면 INSERT → `is_liked: true`, `like_count += 1`
- 이미 있으면 DELETE → `is_liked: false`, `like_count -= 1`
- UNIQUE 제약 `(user_id, recipe_id)`이 race condition 1차 방어선
- `like_count` 갱신은 INSERT/DELETE와 원자적으로 수행 (P1-3 정합성 규칙)

**권한 / 소유자 검증**

- 요청 사용자의 JWT로 `user_id` 추출
- 본인 `recipe_likes` 행만 INSERT/DELETE — 타 사용자 리소스 수정 없음

**멱등성**

- 토글 특성상 연속 호출 시 상태가 번갈아 변한다 (완료/취소성 API 멱등성 패턴과 다름)
- 네트워크 중복 호출 방어는 FE pending 상태(버튼 비활성)로 처리

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI (temporary)
- 필수 상태 5개:
  - `loading`: 좋아요 요청 중 버튼 pending/비활성 상태
  - `empty`: N/A (좋아요 버튼은 항상 노출)
  - `error`: 요청 실패 시 토스트 ("좋아요 처리에 실패했어요, 다시 시도해주세요")
  - `read-only`: N/A
  - `unauthorized`: 비로그인 시 로그인 게이트 모달 → return-to-action (RECIPE_DETAIL 복귀)
- 로그인 보호 액션: 좋아요 버튼 탭 → 비로그인 시 로그인 게이트 모달, 로그인 완료 후 동일 RECIPE_DETAIL 복귀

> `empty`와 `read-only`는 N/A지만 상태 타입 정의에서 명시적으로 `null` 처리한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

> **기존 화면 (`RECIPE_DETAIL`)**: 좋아요 버튼 토글 상태(채워진/빈 하트 아이콘 + like_count 표시) 추가는 low-risk UI change.
> design-generator / design-critic 생략 근거: RECIPE_DETAIL 화면 구조·레이아웃은 Slice 01 부트스트랩에서 구현됨.
> 추가 변경은 버튼 아이콘 상태(`--brand` 활성 / `--muted` 비활성)와 카운트 텍스트 갱신으로 confined 범위.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.md` — §1-2 레시피 상세, §1-5 레시피북
- `docs/화면정의서-v1.2.md` — §3 RECIPE_DETAIL, §0-3 로그인 게이트
- `docs/api문서-v1.2.1.md` — §2-2 좋아요 토글, §P1-3 카운트 갱신
- `docs/db설계-v1.3.md` — §11-1 recipe_likes, §4-1 recipes(like_count)
- `docs/design/design-tokens.md` — `--brand` 활성 하트, `--muted` 비활성 하트

## Key Rules

- `POST /like`는 **토글**이다. 좋아요 상태이면 해제, 아니면 등록한다.
- `recipe_likes`의 UNIQUE 제약 `(user_id, recipe_id)`이 race condition 방어 1차 라인이다.
- `recipes.like_count`는 비정규화 카운트다. `recipe_likes` INSERT/DELETE 시 DB 트리거로 **원자 갱신**한다 (P1-3 정합성 규칙).
- `liked` 레시피북은 `recipe_likes`가 source of truth이며, `POST /like`가 그 유일한 진입점이다 (이 슬라이스 scope).
- FE는 좋아요 요청 중 버튼을 pending 상태로 두어 중복 호출을 방지한다.
- 비로그인 좋아요 시도: 로그인 게이트 모달 → 로그인 완료 후 RECIPE_DETAIL return-to-action.
- 비로그인 시 `user_status`는 null (`GET /recipes/{id}` 응답). 버튼은 노출하되 탭 시 로그인 게이트.

## Contract Evolution Candidates (Optional)

- 후보: **낙관적 업데이트(Optimistic Update)** — 요청 전에 UI를 먼저 토글하고 실패 시 원복.
  현재 계약: pending 상태(요청 완료 후 갱신).
  제안 계약: 즉시 UI 토글 + 실패 시 롤백 에러 토스트.
  기대 사용자 가치: 좋아요 응답성 향상, 네트워크 지연 체감 감소.
  영향 문서: 화면정의서에 명시 없음, API 계약 변경 없음 (FE 전용 UX 변경).
  승인 상태: 미승인 — MVP에서는 pending 처리 유지, 이후 FE 리뷰 단계에서 결정.

## Primary User Path

1. 사용자가 `RECIPE_DETAIL` 화면에서 좋아요(하트) 버튼을 탭한다.
2. **로그인 상태**: `POST /recipes/{id}/like`가 호출되고 버튼이 pending 상태(비활성)로 전환된다.
3. 응답 수신 후 `is_liked` 상태와 `like_count`가 갱신되며 버튼이 활성/비활성으로 토글된다.
4. **비로그인 상태**: 로그인 게이트 모달이 표시되고, 로그인 완료 후 같은 RECIPE_DETAIL로 복귀해 자동으로 좋아요 동작을 실행한다.

## Delivery Checklist

- [ ] 백엔드 계약 고정 (`RecipeLikeResponse` 타입, 401/404 에러 계약)
- [ ] `POST /api/v1/recipes/{recipe_id}/like` Route Handler 구현 (toggle 로직, like_count 원자 갱신)
- [ ] Vitest: toggle 로직, 401/404 에러, like_count 갱신, race condition 방어 단위 테스트
- [ ] RECIPE_DETAIL 좋아요 버튼 상태(채워진/빈 하트 + like_count) 구현
- [ ] 좋아요 요청 pending 상태(버튼 비활성) 구현
- [ ] error 상태(토스트) 구현
- [ ] 비로그인 로그인 게이트 모달 → return-to-action 구현
- [ ] Playwright: 로그인 상태 좋아요 토글 E2E, 비로그인 → 로그인 게이트 → 복귀 E2E
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리
