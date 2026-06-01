# API\_설계\_v1.2.15

상태: 공식문서
담당자: 킴실장
날짜: 6월 2

# 집밥 서비스 — API 설계 v1.2.15

> 기준 문서: 요구사항 기준선 v1.7.5 / 화면정의서 v1.5.12 / DB 설계 v1.3.11 / 유저 Flow맵 v1.3.12
> 작성: 킴실장
> v1.1 → v1.2: 채실장 2차 리뷰 A1~A4 + 장보기 구현 아이디어 반영
> v1.2 → v1.2.1: 채실장 3차 리뷰 P0 4건 + P1 3건 (예시 수정 + 정책 문구 추가, 엔드포인트 변경 없음)
> v1.2.1 → v1.2.2: `PLANNER_WEEK` 끼니 컬럼 CRUD 제거, 4끼 고정 슬롯 정책 반영
> v1.2.2 → v1.2.3: 기본 끼니 컬럼을 3개로 변경하고 `/planner/columns` 조회/추가/이름변경/삭제 계약 재도입
> v1.2.3 → v1.2.4: Wave1 prototype parity 계약 반영. HOME `latest` 정렬, multi-save, 장보기 기록 `completed_at`, 남은요리 카드 메타, 레시피북 상세 메타 확장
> v1.2.4 → v1.2.5: PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로. 신규 엔드포인트 없음 — 기존 9-2 `POST /cooking/sessions`를 `MEAL_SCREEN`에서 단일 `meal_id`로 호출하는 사용 패턴 공식화
> v1.2.5 → v1.2.6: 슬라이스 20 YouTube 실제 API 기반 추출 contract-evolution. §6 전면 개정: 3-way classification, 서버 세션 기반 추출, ingredient resolution, step incomplete, 원자적 RPC 등록, provenance session FK, provider 에러(502/429), feature flag guard(404)
> v1.2.6 → v1.2.7: 슬라이스 22 YouTube 미등록 재료 등록 contract-evolution. Extract ingredient에 `draft_ingredient_id` 추가, `POST /recipes/youtube/ingredient-registration` 추가, `register_youtube_ingredient(...)` RPC로 표준 재료/동의어 등록 후 클라이언트 row resolved 전환
> v1.2.7 → v1.2.8: MVP 1 계약 위험 잠금. 실제 route/화면/테스트 소비자가 없는 `POST /auth/refresh`를 제거하고, 세션 갱신은 Supabase SDK / `@supabase/ssr` 세션 관리에 위임
> v1.2.8 → v1.2.9: MVP 1 계약 위험 잠금 CR-002. 웹에서 직접 소비하지 않는 `POST /auth/login`, `PATCH /auth/profile`을 public API 계약에서 제거. 로그인은 Supabase OAuth callback, 신규/기존 사용자 bootstrap은 callback 및 `PATCH /users/me` 계열로 정리
> v1.2.9 → v1.2.10: RC-MO-06 회원 탈퇴 정책 확정. `DELETE /users/me`는 사용자 개인 데이터를 삭제하고, 사용자가 직접 등록한 레시피는 작성자 정보 없이 보존한다. 엔드포인트 수 변경 없음
> v1.2.10 → v1.2.11: slice27 선행 taxonomy contract lock. `GET /ingredients?category=`와 YouTube ingredient registration은 legacy 7종 category label을 유지하고, cooking method category는 optional additive metadata로만 취급한다. 엔드포인트 수 변경 없음
> v1.2.11 → v1.2.12: Admin Foundation 읽기 전용 엔드포인트 3종 추가. `GET /api/v1/admin/users`, `GET /api/v1/admin/operational-events`, `GET /api/v1/admin/audit-logs`. `createServiceRoleClient()` 필수, 감사 로그 기록, PII 최소화. 엔드포인트 수 55 → 58
> 2026-05-28 addendum: 레시피오형 quick import 중복 확인 `GET /api/v1/recipes/youtube/recipio/check` 추가. 기존 validate/extract/register 계약 재사용, DB 변경 없음. 엔드포인트 수 58 → 59
> v1.2.12 → v1.2.13: YouTube section label persistence. `component_label` nullable field를 extract/register/detail/cook-mode ingredient/step 계약에 추가. `POST /recipes` manual body는 6-4 참조에서 분리하고 `component_label` 비허용을 명시. 엔드포인트 수 변경 없음
> 2026-05-30 addendum: 한 영상에 여러 요리가 있는 YouTube 영상은 공개 설명란/작성자 댓글/caption timedtext에서 후보를 분리해 `multi_parent` 세션으로 저장한다. 사용자는 `POST /recipes/youtube/candidate-drafts`로 후보 하나를 `candidate_child` 세션으로 승격한 뒤 기존 register 계약을 사용한다. 엔드포인트 수 59 → 60
> v1.2.13 → v1.2.14: Recipe media/tags contract. `POST /api/v1/recipes/images` 이미지 업로드 endpoint 추가, YouTube register가 session thumbnail/tags를 서버에서 저장, manual `POST /recipes`가 current-user upload reference만 허용하고 tags는 서버 생성. 엔드포인트 수 60 → 61
> v1.2.14 → v1.2.15: YouTube visual quantity enrichment contract. `POST /recipes/youtube/extract` 응답에 `quantity_*` review fields를 추가하고, `POST /recipes/youtube/register`가 `draft_ingredient_id`와 `quantity_confirmation_status`를 서버 draft 기준으로 검증한다. 신규 엔드포인트 없음

---

## v1.2.14 → v1.2.15 변경

### YouTube visual quantity enrichment 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| YT-QTY-1 | 공개 텍스트 추출과 기존 Gemini text structured fallback 이후에도 재료 수량이 부족하면 조건부 visual quantity enrichment를 실행할 수 있다 | provider boundary는 `visual_quantity_extractor`; 첫 adapter는 Gemini video understanding/public YouTube URL |
| YT-QTY-2 | extract 응답 재료 row에 수량 출처와 검수 필요 여부를 노출한다 | `quantity_source`, `quantity_confidence`, `quantity_raw_text`, `quantity_evidence_refs`, `quantity_review_required`, `quantity_user_confirmed` optional fields |
| YT-QTY-3 | visual enrichment는 원천 source가 아니라 보조 enrichment이다 | `extraction_methods`에는 추가하지 않고 `source_providers`와 `extraction_meta_json.visual_quantity_extractor`에 기록 |
| YT-QTY-4 | 추정 수량은 사용자 확인 없이 등록할 수 없다 | register body의 `quantity_confirmation_status`를 서버가 session draft의 `draft_ingredient_id` 기준으로 검증 |
| YT-QTY-5 | provider/cache/event 저장 범위 제한 | raw video/frame/provider response, API key, secret, 레시피오 data 저장/반환 금지 |

`YoutubeQuantitySource`:

```ts
type YoutubeQuantitySource =
  | "text_explicit"
  | "visual_explicit"
  | "unit_normalized"
  | "ingredient_default"
  | "recipe_inferred"
  | "user_entered"
  | "unknown";
```

`quantity_confirmation_status`:

```ts
type YoutubeQuantityConfirmationStatus =
  | "not_required"
  | "confirmed_suggestion"
  | "edited_quantity"
  | "cleared_to_taste";
```

검증 우선순위:

1. `text_explicit`: 공개 텍스트에 명시된 수량
2. `visual_explicit`: 화면 속 명시 수량
3. `unit_normalized`: raw explicit evidence 기반 단위 변환
4. `ingredient_default`: 명시 count evidence 기반 기본값
5. `recipe_inferred`: 추론 수량, 항상 review-required

---

## v1.2.13 → v1.2.14 변경

### 레시피 미디어/태그 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| MEDIA-TAG-1 | YouTube 등록 레시피 상세에 영상 썸네일을 표시 | extract session의 `thumbnail_url`을 register 시 `recipes.thumbnail_url`에 서버가 복사. 클라이언트 override 금지 |
| MEDIA-TAG-2 | 직접 등록 레시피에 사용자 이미지 업로드 지원 | `POST /api/v1/recipes/images` 추가. Supabase Storage `recipe-images/{user_id}/{uuid}.{ext}`에 저장 |
| MEDIA-TAG-3 | 임의 외부 이미지 URL과 cross-user 이미지 참조 차단 | `POST /recipes`는 현재 사용자 업로드 API가 반환한 참조만 허용 |
| MEDIA-TAG-4 | YouTube/직접 등록 모두 자동 태그 생성 | 공유 결정론 tag generator가 `recipes.tags`를 최대 3개 생성. 클라이언트 임의 태그 입력 금지 |
| MEDIA-TAG-5 | MVP 범위 보호 | YouTube 썸네일 다운로드/리호스팅/압축, DB binary 저장, generated/AI image fallback, normalized tag table은 scope 밖 |

---

## v1.2.12 → v1.2.13 변경

### YouTube 섹션 라벨 영속화

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| YT-SECTION-1 | 설명란의 재료/단계 섹션 라벨을 등록 후에도 유지 | `component_label` nullable field를 YouTube extract/register, recipe detail, cook-mode 응답에 추가 |
| YT-SECTION-2 | 섹션 라벨과 본문 prefix 중복 표시 방지 | `component_label`이 있으면 `display_text`, `instruction`은 같은 `[섹션명]` prefix를 포함하지 않음 |
| YT-SECTION-3 | 직접 레시피 등록 계약 보호 | `POST /recipes` manual body를 §6-4 참조에서 분리하고 `component_label` 비허용 명시 |

---

## v1.2.11 → v1.2.12 변경

### Admin Foundation 읽기 전용 내부 운영 API

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| ADMIN-1 | 내부 운영자가 `/admin`에서 사용자 목록, 운영 이벤트, 감사 로그를 읽기 전용으로 조회해야 함 | `/api/v1/admin/*` 3개 GET endpoint 추가 |
| ADMIN-2 | 관리자 권한은 일반 사용자 권한과 분리되어야 함 | `admin_members`를 단일 진실 소스로 사용하고 서버에서 `requireAdminUser` 검증 |
| ADMIN-3 | 교차 사용자 조회는 user-scoped client로 처리하면 안 됨 | `createServiceRoleClient()` 필수, service role 부재 시 fail closed, `routeClient` fallback 금지 |
| ADMIN-4 | 운영자 조회 행위는 추적 가능해야 함 | 모든 Admin API read와 `/admin` 진입은 `admin_audit_logs`에 기록 |
| ADMIN-5 | 로그가 민감정보 저장소가 되면 안 됨 | `request_path`는 pathname만 저장하고 OAuth code/next/error, YouTube URL/source text, admin search term/email/nickname 저장 금지 |

---

## v1.2.10 → v1.2.11 변경

### Taxonomy contract lock (slice27 선행)

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| TAXONOMY-1 | 재료 category query/validation은 freeze 기간 동안 legacy 7종 label을 유지 | `GET /ingredients?category=<legacy label>`, `POST /recipes/youtube/ingredient-registration.category` 계약 명시 |
| TAXONOMY-2 | 신규 ingredient taxonomy는 API field replacement가 아님 | `category_code` 같은 additive field는 사용자 승인 전 미도입 |
| TAXONOMY-3 | `GET /cooking-methods` v1 shape 유지 | category는 optional additive metadata 후보이며 현재 응답 필수 필드 아님 |
| TAXONOMY-4 | 외부 데이터는 production API로 직수입하지 않음 | 식약처/농식품올바로 raw import API는 이번 계약 범위 밖, staging/review/approved seed gate 필요 |

---

## v1.2.9 → v1.2.10 변경

### 회원 탈퇴 데이터 정리 정책

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| ACCOUNT-DELETE-1 | 회원 탈퇴는 기존 `users.deleted_at` soft-delete만으로 처리하지 않는다. 같은 소셜 계정으로 다시 로그인해도 이전 개인 기록이 보이지 않아야 한다. | `DELETE /users/me`에서 `delete_user_private_data(p_user_id)` DB RPC 호출 |
| ACCOUNT-DELETE-2 | 레시피북, 플래너, 장보기, 팬트리, 좋아요, 남은요리, cooking session 등 사용자 소유 개인 데이터는 삭제한다. | `public.users` row 삭제와 FK cascade로 정리 |
| ACCOUNT-DELETE-3 | 사용자가 직접/유튜브로 등록한 레시피는 다른 사용자의 저장/플래너 참조를 깨지 않도록 DB에 남긴다. | `recipes.created_by`는 FK `ON DELETE SET NULL`에 따라 작성자 정보 없이 보존 |
| ACCOUNT-DELETE-4 | 삭제된 사용자의 저장/좋아요 row가 사라진 뒤 레시피 카운트가 남은 참조 기준과 맞아야 한다. | 영향받은 recipe의 `save_count`, `like_count` 재계산 |
| ACCOUNT-DELETE-5 | public API surface는 그대로 유지한다. | endpoint active count 55개 유지 |

---

## v1.2.8 → v1.2.9 변경

### legacy auth login/profile endpoint 제거

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| AUTH-LEGACY-1 | `POST /auth/login`은 실제 route와 테스트는 있었지만 현재 웹 LOGIN 화면에서 직접 호출하지 않는다. 웹 로그인은 Supabase browser client의 `signInWithOAuth`와 `/auth/callback`에서 처리한다. | endpoint 제거 |
| AUTH-LEGACY-2 | `PATCH /auth/profile`은 신규 회원 닉네임 설정 용도였지만, 현재 사용자 프로필 수정 API는 `PATCH /users/me`가 담당한다. | `PATCH /auth/profile` 대체: `PATCH /users/me` |
| AUTH-LEGACY-3 | 신규/기존 사용자 bootstrap은 `/auth/callback`, `GET /users/me`, `PATCH /users/me`, settings/account 계열 API에서 `ensurePublicUserRow` / `ensureUserBootstrapState`로 보정한다. | 별도 auth profile API를 유지하지 않는다 |
| AUTH-LEGACY-4 | endpoint 전체 목록의 active method/path 수를 실제 route 수와 맞춘다. | active 55개 |

---

## v1.2.7 → v1.2.8 변경

### 인증 refresh endpoint 제거

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| AUTH-REFRESH-1 | `POST /auth/refresh`가 API 문서에는 있었지만 실제 `app/api/v1/auth/refresh/route.ts`, 화면 호출, 테스트가 없었다. | endpoint 제거 |
| AUTH-REFRESH-2 | 현재 웹 인증은 Supabase OAuth callback, `getSession()`, `onAuthStateChange()`, `@supabase/ssr` cookie 기반 세션 관리에 의존한다. | 별도 public refresh API를 만들지 않는다 |
| AUTH-REFRESH-3 | refresh token을 body로 받는 새 public API를 만들면 불필요한 token handling surface가 늘어난다. | Supabase SDK 세션 갱신에 위임 |
| AUTH-REFRESH-4 | endpoint 전체 목록의 active method/path 수를 실제 route 수와 맞춘다. | active 57개 |

---

## v1.2.4 → v1.2.5 변경 (엔드포인트 변경 없음)

### PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| PL-03-1 | `MEAL_SCREEN`에서 `shopping_done` 식사의 개별 `[요리하기]` 진입 경로 공식화 | 9-2 `POST /cooking/sessions`의 허용 호출자에 `MEAL_SCREEN` 추가, `meal_ids`에 단일 ID 허용 명시 |
| PL-03-2 | 서버 검증 규칙은 기존과 동일 — 소유자, `status='shopping_done'`, `recipe_id` 일치 | 변경 없음 |
| PL-03-3 | `registered` 식사는 `meal_ids`에 포함될 수 없음 — 서버가 409 반환 | 기존 검증으로 자연 차단됨 |
| PL-03-4 | 엔드포인트 수 유지 (51개), DB 변경 없음 | 변경 없음 |

---

## v1.1 → v1.2 변경 체크리스트

### 채실장 2차 리뷰 반영 (4건)

| #   | 이슈                                               | 조치                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A-1 | recipe_books id 타입 충돌 (시스템 책 id가 문자열)  | 모든 recipe_books의 id를 uuid로 통일. 시스템/커스텀 구분은 book_type으로만                          |
| A-2 | DELETE /recipes/{id}/save가 Body를 요구하는 구조   | **2-4 엔드포인트 삭제**. 저장 해제는 12-7 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` 사용 |
| A-3 | shopping_list_items.added_to_pantry가 API에 미노출 | 8-2/8-3 item 응답에 `added_to_pantry` 필드 추가                                                     |
| A-4 | share-text 제외 항목 포함 여부 미정의              | `is_pantry_excluded=false` 항목만 포함하는 정책 명시                                                |

### 장보기 구현 아이디어 반영 (2건 → API 변경 4건)

| #         | 아이디어                      | API 변경                                                                                   |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| 장보기-1a | 생성 후 상세 자동 이동        | 클라이언트 로직 (8-2 응답의 id로 이동, API 변경 없음)                                      |
| 장보기-1b | 카드 드래그&드롭 순서 변경    | `sort_order` 필드 추가 + **8-4b 순서 변경 API 신규**                                       |
| 장보기-1c | 팬트리 제외 섹션 넣었다 뺐다  | 기존 8-4 `is_pantry_excluded` 토글 활용 + **제외 시 is_checked=false 자동 정리 규칙** 추가 |
| 장보기-2  | 완료 후 팬트리 추가 선택 팝업 | 8-5에 `add_to_pantry_item_ids` 파라미터 추가 (팬트리 반영 분리)                            |

### 연쇄 수정

| 항목           | 내용                                                               |
| -------------- | ------------------------------------------------------------------ |
| 엔드포인트 수  | 50개 유지 (2-4 삭제 -1 + 8-4b 신규 +1)                             |
| 12-7 역할 확대 | 레시피북 제거 + 레시피 저장 해제 겸용                              |
| DB 참고        | shopping_list_items에 sort_order 컬럼 필요 (DB v1.3에서 반영 필요) |

---

## v1.2 → v1.2.1 패치 (엔드포인트 변경 없음)

### P0 (구현 전 고정 필수) — 4건

| #    | 이슈                                     | 조치                                                 |
| ---- | ---------------------------------------- | ---------------------------------------------------- |
| P0-1 | 8-5 응답 pantry_added=6인데 item_ids 2개 | 예시 수정 + `pantry_added = item_ids 길이` 정의 고정 |
| P0-2 | 8-5 미전달 vs 빈배열 구분 없음           | null=기본값 적용, []=팬트리 반영 안 함               |
| P0-3 | 8-5 서버 검증 규칙 없음                  | 4단계 검증 + 무효 항목 무시하고 진행                 |
| P0-4 | 완료 후 리스트 수정 가능 여부 미정의     | 완료 후 read-only (8-4/8-4b → 409)                   |

### P1 (애매함 해소) — 3건

| #    | 이슈                               | 조치                            |
| ---- | ---------------------------------- | ------------------------------- |
| P1-1 | 8-3 동일 sort_order 시 정렬 불안정 | tie-breaker: `id ASC`           |
| P1-2 | 2-3 저장 시 book_type 무제한       | saved/custom만 허용, 나머지 409 |
| P1-3 | 12-7 삭제 시 카운트 갱신 미언급    | like_count/save_count 갱신 명시 |

---

## 공통 규약

### Base URL

```
/api/v1
```

### 인증

| 구분 | 설명                            |
| ---- | ------------------------------- |
| 방식 | Bearer Token (JWT)              |
| 헤더 | `Authorization: Bearer {token}` |
| 🔓   | 비로그인 허용 (토큰 없어도 200) |
| 🔒   | 로그인 필수 (토큰 없으면 401)   |
| 🔐   | 관리자 전용 (`admin_members` 등록 필요, 미등록 시 403) |

### 공통 응답 형식

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "레시피를 찾을 수 없습니다.",
    "fields": []
  }
}
```

> **문서 예시 표기 규칙**
> 이 문서의 각 엔드포인트 응답 예시는 가독성을 위해 `data` 래퍼를 생략하고 내부 payload만 표시한다.
> 실제 API 응답은 항상 위 공통 응답 형식으로 래핑된다.

### 공통 에러 코드

| HTTP | code               | 설명                                   |
| ---- | ------------------ | -------------------------------------- |
| 400  | INVALID_REQUEST    | 요청 파라미터 오류                     |
| 401  | UNAUTHORIZED       | 인증 필요                              |
| 403  | FORBIDDEN          | 권한 없음 (다른 유저 리소스 접근 포함) |
| 404  | RESOURCE_NOT_FOUND | 리소스 없음                            |
| 409  | CONFLICT           | 중복/충돌/이미 완료                    |
| 422  | VALIDATION_ERROR   | 데이터 검증 실패                       |
| 500  | INTERNAL_ERROR     | 서버 오류                              |

**Validation Error 필드별 상세**

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해주세요.",
    "fields": [
      { "field": "planned_servings", "message": "1 이상이어야 합니다." }
    ]
  }
}
```

### 페이지네이션

```
?cursor={cursor}&limit=20
```

> `cursor`는 **opaque string** (정렬키 포함). 클라이언트는 파싱하지 않고 그대로 전달.

```json
{
  "items": [...],
  "next_cursor": "opaque-cursor-or-null",
  "has_next": true
}
```

### 멱등성 규칙

> complete / cancel 등 상태 전이 엔드포인트는 멱등하게 동작한다.
> 이미 완료/취소된 리소스에 다시 호출하면 200 + 동일 결과 반환.

### 서버 검증 공통 규칙

> `meal_ids`를 받는 모든 엔드포인트에서 서버는 다음을 검증한다.

1. **소유자 일치**: meal_id의 user_id = 요청 유저
2. **status 조건 일치**: 해당 액션에 필요한 status
3. **recipe_id 일치**: 요리 세션 시
4. **shopping_list_id 미할당**: 장보기 생성 시
   > 검증 실패: 403 (소유자 불일치), 409 (상태 충돌), 422 (파라미터 오류)

---

## 0. 인증 (LOGIN)

> 화면: `LOGIN` / Flow: ② 로그인 여정

> `LOGIN` 화면의 소셜 로그인은 public `/api/v1/auth/login` endpoint가 아니라 Supabase browser client OAuth + `/auth/callback`으로 처리한다.
> 신규/기존 사용자 row와 기본 recipe book / planner column bootstrap은 callback 및 users/me 계열 API에서 보정한다.
> 닉네임 설정/변경은 `PATCH /auth/profile` 대체 API인 `PATCH /users/me`를 사용한다.

### 0-4. 로그아웃

```
POST /auth/logout
```

🔒 로그인 필수

---

## 1. 홈 — 레시피 탐색 (HOME)

> 화면: `HOME`, `INGREDIENT_FILTER_MODAL` / Flow: ① 레시피 탐색 여정

### 1-1. 레시피 목록 조회

```
GET /recipes
```

🔓 비로그인

| 구분  | 필드           | 타입    | 설명                                                            |
| ----- | -------------- | ------- | --------------------------------------------------------------- |
| Query | q              | string? | 제목 검색어                                                     |
| Query | ingredient_ids | string? | 재료 ID 콤마 구분 (AND 필터)                                    |
| Query | sort           | string? | `view_count`(기본) / `latest` / `save_count` / `plan_count` / `cook_count` |
| Query | cursor         | string? | opaque 커서                                                     |
| Query | limit          | int?    | 기본 20                                                         |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "tags": ["한식", "찌개"],
      "base_servings": 2,
      "view_count": 1520,
      "like_count": 340,
      "save_count": 210,
      "source_type": "youtube",
      "user_status": {
        "is_saved": true,
        "saved_book_ids": ["uuid"]
      }
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": true
}
```

> 로그인 사용자는 목록/테마 카드에 `user_status`가 포함된다. 비로그인 또는 저장 없음은 `user_status: null` 또는 `{ "is_saved": false, "saved_book_ids": [] }`로 처리할 수 있다.
> `latest`는 `recipes.created_at DESC, id DESC` 기준이다. `cook_count`는 요리완료 수 기준이다. `like_count`는 응답 지표와 좋아요 토글에는 남지만 HOME 노출 정렬 키에서는 제외한다.

### 1-2. 테마 섹션 조회

```
GET /recipes/themes
```

🔓 비로그인

**응답 (200)**

```json
{
  "themes": [
    {
      "id": "popular",
      "title": "이번 주 인기 레시피",
      "recipes": [
        /* 레시피 카드 배열 (최대 10개) */
      ]
    }
  ]
}
```

> 테마는 `popular`를 기본으로 포함하고, 태그/제목/source 기반 분류 결과가 있으면 `korean-home`, `quick-meal`, `noodle-pasta`, `dessert`, `youtube` 같은 추가 테마를 함께 반환한다.

### 1-3. 재료 목록 조회 (재료 필터용)

```
GET /ingredients
```

🔓 비로그인

| 구분  | 필드     | 타입    | 설명                          |
| ----- | -------- | ------- | ----------------------------- |
| Query | q        | string? | 재료명 검색 (표준명 + 동의어) |
| Query | category | string? | legacy 7종 카테고리 label 필터 (`채소` / `육류` / `해산물` / `양념` / `유제품` / `곡류` / `기타`) |

**응답 (200)**

```json
{
  "items": [{ "id": "uuid", "standard_name": "양파", "category": "채소" }]
}
```

---

## 2. 레시피 상세 (RECIPE_DETAIL) `v1.2 변경`

> 화면: `RECIPE_DETAIL` / Flow: ① 탐색, ⑧ 독립 요리, ⑪ 저장/관리

### 2-1. 레시피 상세 조회

```
GET /recipes/{recipe_id}
```

🔓 비로그인 (로그인 시 좋아요/저장 여부 포함)

**응답 (200)**

```json
{
  "id": "uuid",
  "title": "김치찌개",
  "description": "...",
  "thumbnail_url": "https://...",
  "base_servings": 2,
  "tags": ["한식", "찌개"],
  "source_type": "youtube",
  "source": {
    "youtube_url": "https://youtube.com/watch?v=...",
    "youtube_video_id": "abc123"
  },
  "view_count": 1520,
  "like_count": 340,
  "save_count": 210,
  "plan_count": 150,
  "cook_count": 89,
  "ingredients": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "component_label": "찌개 재료",
      "scalable": true,
      "sort_order": 1
    },
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "amount": null,
      "unit": null,
      "ingredient_type": "TO_TASTE",
      "display_text": "소금 약간",
      "component_label": "간 맞추기",
      "scalable": false,
      "sort_order": 5
    }
  ],
  "steps": [
    {
      "id": "uuid",
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "component_label": "재료 손질",
      "cooking_method": {
        "id": "uuid",
        "code": "prep",
        "label": "손질",
        "color_key": "gray"
      },
      "ingredients_used": [
        {
          "ingredient_id": "uuid",
          "amount": 200,
          "unit": "g",
          "cut_size": "한입 크기"
        }
      ],
      "heat_level": null,
      "duration_seconds": null,
      "duration_text": null
    }
  ],
  "user_status": {
    "is_liked": false,
    "is_saved": false,
    "saved_book_ids": []
  }
}
```

> 비로그인 시 `user_status`는 null. 조회 시 `increment_recipe_view_count(p_recipe_id)`로 `view_count += 1`을 원자적으로 반영한 뒤 응답한다.
> `component_label`은 nullable이다. 값이 있으면 UI는 인접 항목의 label 변경 지점에만 섹션 소제목을 표시한다. 같은 label prefix가 본문에 있으면 중복 표시하지 않는다.

### 2-2. 좋아요 토글

```
POST /recipes/{recipe_id}/like
```

🔒 로그인 필수

**응답 (200)**

```json
{ "is_liked": true, "like_count": 341 }
```

### 2-3. 레시피 저장 (레시피북에 추가) `v1.2.4 멀티 저장`

```
POST /recipes/{recipe_id}/save
```

🔒 로그인 필수

| 구분 | 필드     | 타입   | 설명                                      |
| ---- | -------- | ------ | ----------------------------------------- |
| Body | book_ids | uuid[] | 저장할 레시피북 ID 목록. 1개 이상 필수    |

**응답 (200)**

```json
{
  "saved": true,
  "save_count": 213,
  "book_ids": ["uuid-1", "uuid-2"],
  "created_book_ids": ["uuid-2"],
  "already_saved_book_ids": ["uuid-1"]
}
```

> **저장 가능 book_type 제한** `v1.2.1 추가book_type`이 `saved` 또는 `custom`인 레시피북만 허용한다.
> `book_type='my_added'` 또는 `'liked'`에 저장 시 **409 CONFLICT** 반환.
> (my_added는 레시피 생성 시 자동 포함, liked는 좋아요 토글로만 관리)
> `book_ids` 내 중복 ID는 1개로 정규화한다. 이미 저장된 레시피북은 오류가 아니라 `already_saved_book_ids`에 포함하고 200으로 응답한다.
> `save_count`는 새로 생성된 `recipe_book_items` 수만큼 증가한다.

### ~~2-4. 레시피 저장 해제~~ `v1.2 삭제`

> **v1.2 변경**: 삭제. HTTP DELETE + Body는 호환 이슈가 있으므로 제거.
> 저장 해제는 12-7 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}`를 사용.

### 2-5. 플래너에 추가

```
POST /meals
```

🔒 로그인 필수

| 구분 | 필드             | 타입  | 설명                 |
| ---- | ---------------- | ----- | -------------------- |
| Body | recipe_id        | uuid  | 레시피 ID            |
| Body | plan_date        | date  | 날짜 (YYYY-MM-DD)    |
| Body | column_id        | uuid  | 끼니 컬럼 ID         |
| Body | planned_servings | int   | 계획 인분 (1 이상)   |
| Body | leftover_dish_id | uuid? | 남은요리에서 추가 시 |

**응답 (201)**

```json
{
  "id": "uuid",
  "recipe_id": "uuid",
  "plan_date": "2026-03-01",
  "column_id": "uuid",
  "planned_servings": 2,
  "status": "registered",
  "is_leftover": false,
  "leftover_dish_id": null
}
```

> `leftover_dish_id`가 있으면 서버에서 `is_leftover=true` 자동 세팅

---

## 3. 식단 플래너 (PLANNER_WEEK)

> 화면: `PLANNER_WEEK` / Flow: ③ 식단 계획 여정

### 3-1. 플래너 조회 (주간)

```
GET /planner
```

🔒 로그인 필수

| 구분  | 필드       | 타입 | 설명   |
| ----- | ---------- | ---- | ------ |
| Query | start_date | date | 시작일 |
| Query | end_date   | date | 종료일 |

**응답 (200)**
공통 응답 래퍼 `{ success, data, error }`의 `data` payload:

```json
{
  "columns": [
    { "id": "uuid", "name": "아침", "sort_order": 0 },
    { "id": "uuid", "name": "점심", "sort_order": 1 },
    { "id": "uuid", "name": "저녁", "sort_order": 2 }
  ],
  "meals": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "plan_date": "2026-03-01",
      "column_id": "uuid",
      "planned_servings": 2,
      "status": "registered",
      "is_leftover": false
    }
  ]
}
```

> 끼니 컬럼은 사용자별 동적 목록이다. 신규 사용자 기본값은 `아침 / 점심 / 저녁` 3개이며, 기존 사용자에게 이미 있는 컬럼은 자동 삭제하지 않는다.
> 컬럼 수는 최소 1개, 최대 5개다. 순서 변경 API는 1차 구현 범위가 아니며, 신규 컬럼은 현재 마지막 `sort_order + 1`로 생성한다.

### 3-2. 끼니 컬럼 목록 조회

```
GET /planner/columns
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "columns": [
    { "id": "uuid", "name": "아침", "sort_order": 0 },
    { "id": "uuid", "name": "점심", "sort_order": 1 },
    { "id": "uuid", "name": "저녁", "sort_order": 2 }
  ]
}
```

### 3-3. 끼니 컬럼 추가

```
POST /planner/columns
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| ---- | ---- | ---- | ---- |
| Body | name | string | 새 끼니 컬럼명 (1~30자) |

**응답 (201)**

```json
{
  "column": { "id": "uuid", "name": "간식", "sort_order": 3 }
}
```

**정책**
- 사용자별 컬럼 수가 이미 5개면 409 `COLUMN_LIMIT_REACHED`
- 같은 사용자 안에서 공백을 trim한 이름이 중복되면 409 `COLUMN_NAME_DUPLICATE`

### 3-4. 끼니 컬럼 이름 변경

```
PATCH /planner/columns/{column_id}
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| ---- | ---- | ---- | ---- |
| Path | column_id | uuid | 끼니 컬럼 ID |
| Body | name | string | 변경할 끼니 컬럼명 (1~30자) |

**응답 (200)**

```json
{
  "column": { "id": "uuid", "name": "브런치", "sort_order": 0 }
}
```

**정책**
- 다른 사용자의 컬럼이면 403
- 존재하지 않는 컬럼이면 404
- 같은 사용자 안에서 공백을 trim한 이름이 중복되면 409 `COLUMN_NAME_DUPLICATE`

### 3-5. 끼니 컬럼 삭제

```
DELETE /planner/columns/{column_id}
```

🔒 로그인 필수

**응답 (200)**

```json
{ "deleted": true }
```

**정책**
- 컬럼이 1개만 남은 상태면 409 `MIN_COLUMN_REQUIRED`
- 해당 컬럼에 연결된 `meals`가 1건 이상 있으면 409 `COLUMN_HAS_MEALS`
- 삭제 후 남은 컬럼은 `sort_order ASC, id ASC` 기준으로 0부터 다시 정렬한다

---

## 4. 끼니 화면 (MEAL_SCREEN)

> 화면: `MEAL_SCREEN` / Flow: ③ 식단 계획 여정

### 4-1. 특정 끼니의 식사 목록 조회

```
GET /meals
```

🔒 로그인 필수

| 구분  | 필드      | 타입 | 설명         |
| ----- | --------- | ---- | ------------ |
| Query | plan_date | date | 날짜         |
| Query | column_id | uuid | 끼니 컬럼 ID |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "planned_servings": 2,
      "status": "registered",
      "is_leftover": false
    }
  ]
}
```

### 4-2. 식사 인분 변경

```
PATCH /meals/{meal_id}
```

🔒 로그인 필수

| 구분 | 필드             | 타입 | 설명                 |
| ---- | ---------------- | ---- | -------------------- |
| Body | planned_servings | int  | 변경할 인분 (1 이상) |

### 4-3. 식사 삭제

```
DELETE /meals/{meal_id}
```

🔒 로그인 필수

**응답 (204)**: No Content

---

## 5. 식사 추가 (MENU_ADD, RECIPE_SEARCH_PICKER)

> 화면: `MENU_ADD`, `RECIPE_SEARCH_PICKER` / Flow: ③ 식단 계획 여정

### 5-1. 레시피 검색 (식사 추가용)

> 1-1 `GET /recipes` 재사용

### 5-2. 레시피북에서 추가

> 12-2 → 12-6 → 2-5 `POST /meals` 순서

### 5-3. 남은요리에서 추가

> 2-5 `POST /meals`에 `leftover_dish_id` 포함

### 5-4. 팬트리 기반 레시피 추천

```
GET /recipes/pantry-match
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "match_score": 0.85,
      "matched_ingredients": 5,
      "total_ingredients": 6,
      "missing_ingredients": [{ "id": "uuid", "standard_name": "두부" }]
    }
  ]
}
```

---

## 6. 유튜브 레시피 등록 (YT_IMPORT) `v1.2.7 contract-evolution`

> 화면: `YT_IMPORT` / Flow: ⑨ 유튜브 등록 여정
> 슬라이스 20: URL 미리보기는 YouTube oEmbed로 quota 없이 확인하고, 실제 추출 단계에서 YouTube Data API `videos.list` 기반 3-way classification과 description-first 추출을 수행한다. 서버 세션, ingredient resolution, step incomplete, 원자적 RPC 등록을 포함한다.

### 공통 정책

- **Feature flag**: `youtube_import` off → 모든 §6 엔드포인트 404 `FEATURE_DISABLED`
- **인증**: 모든 엔드포인트 🔒 로그인 필수 (미인증 → 401)
- **Provider 에러**: oEmbed/YouTube API 장애 → 502 `PROVIDER_ERROR`, YouTube API quota 초과 → 429 `QUOTA_EXCEEDED`
- **YouTube API key**: 서버 환경변수 `YOUTUBE_API_KEY`, 클라이언트 노출 금지

### 6-1. 유튜브 URL 검증 + oEmbed 미리보기 (Step 1)

```
POST /api/v1/recipes/youtube/validate
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**처리**: URL에서 video_id 파싱 → YouTube oEmbed 호출(제목/채널/썸네일 미리보기) → `classification_status='uncertain'`으로 반환. 설명란/태그/카테고리 기반 3-way classification은 quota 절약을 위해 §6-2 extract 단계에서만 수행한다.

**응답 (200)**

```json
{
  "is_valid_url": true,
  "is_recipe_video": true,
  "classification_status": "uncertain",
  "classification_reasons": ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
  "video_info": {
    "video_id": "abc123",
    "title": "백종원 김치찌개",
    "channel": "백종원의 요리비책",
    "thumbnail_url": "https://..."
  }
}
```

| classification_status | 의미 | 프론트 행동 |
| --- | --- | --- |
| `uncertain` | oEmbed 미리보기만 완료, 요리 여부 미확정 | extract 진행 |

> `recipe`/`non_recipe` 판정은 §6-2 extract 단계에서 `videos.list` 설명란/태그/카테고리를 확인한 뒤 수행한다. `non_recipe`는 extract에서 422 `NOT_RECIPE_VIDEO`로 차단한다.

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 422 | INVALID_URL | 유튜브 URL 형식 아님 또는 video_id 파싱 실패 |
| 404 | VIDEO_NOT_FOUND | oEmbed에서 영상 미리보기 조회 불가 |
| 404 | FEATURE_DISABLED | feature flag off |
| 502 | PROVIDER_ERROR | oEmbed 호출 실패 |

### 6-2. 유튜브 레시피 추출 + 세션 생성 (Step 2)

```
POST /api/v1/recipes/youtube/extract
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**처리**: video_id 파싱 → YouTube `videos.list` 호출 → description/tags/category 기반 3-way classification → 설명란 파싱으로 재료/스텝 추출 → 부족하면 공개 작성자 댓글 후보와 공개 caption timedtext를 순서대로 보조 source로 파싱 → 그래도 부족하고 env/API key/cache/한도/근거 검증 조건을 만족하면 Gemini structured fallback으로 공개 텍스트를 JSON 구조화 → 여전히 재료 수량이 부족하고 `YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=true`, provider config/API key, 사용자/일일 한도, cache miss, timeout budget 조건을 만족하면 `visual_quantity_extractor`로 화면 속 명시 수량을 보강 → 한 영상에서 여러 요리 후보가 감지되면 `multi_parent` 세션과 `recipe_candidates[]`를 생성 → 그 외에는 단일 draft 세션 생성 → 추출 결과 반환

`extraction_methods` 허용값:
- `description`: YouTube 설명란
- `comment`: 공개 작성자 top-level 댓글 후보
- `caption`: 공개 caption timedtext

Gemini는 원천 source가 아니라 구조화 보조 extractor이므로 `extraction_methods`에 별도 값을 추가하지 않는다.
Gemini 사용 시 `source_providers`에는 `gemini_structured_extractor` 또는 `gemini_structured_extractor_cache`를 추가하고, `extraction_meta_json.llm_extractor`에 `provider`, `model`, `fallback_model`, `schema_version`, `status`, `cache_hit`, `retry_count`, `fallback_used`, `input_tokens`, `output_tokens`, `reason`, `parser_quality`를 저장한다.
Visual quantity enrichment 사용 시 `source_providers`에는 `visual_quantity_extractor` 또는 `visual_quantity_extractor_cache`를 추가하고, `extraction_meta_json.visual_quantity_extractor`에 `provider`, `model`, `schema_version`, `status`, `cache_hit`, `trigger_reason`, `enriched_count`, `review_required_count`를 저장한다.
`raw_source_text`에는 설명란/작성자 댓글/caption 같은 공개 텍스트만 저장하고 API key, provider raw response, secret, 레시피오 결과는 저장하지 않는다.
raw video, raw frame, raw provider response, API key, secret, 레시피오 data는 저장하거나 응답하지 않는다.

레시피오 quick import 중복 확인을 제외한 추출 단계는 특정 `youtube_video_id`별 고정 recipe fixture를 반환하지 않고 항상 provider/parser 경로를 거친다.

**다중 레시피 응답 규칙 (2026-05-30 addendum)**

- `multi_recipe_status`: `single` / `multiple` / `ambiguous`
- `recipe_candidates[]`: 후보별 title, time range, confidence, ingredients, steps, warnings, blocking_issues, evidence_refs
- `source_segments_summary[]`: 후보 분리에 사용한 공개 source(`description`/`comment`/`caption`), 언어, track kind, segment count
- top-level `ingredients` / `steps`는 비워 두고 `blocking_issues=["MULTI_CANDIDATE_REVIEW_REQUIRED"]`를 반환한다.
- 저장하려면 먼저 §6-3b 후보 초안 API로 하나를 선택해야 한다. `multi_parent` 세션은 §6-4 register와 §6-3 ingredient-registration에서 409 `CANDIDATE_PROMOTION_REQUIRED`로 거부된다.

**응답 (200)**

```json
{
  "extraction_id": "uuid",
  "title": "백종원 김치찌개",
  "base_servings": 2,
  "thumbnail_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "tags": ["한식", "찌개"],
  "extraction_methods": ["description", "comment", "caption"],
  "ingredients": [
    {
      "draft_ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "component_label": "찌개 재료",
      "quantity_source": "text_explicit",
      "quantity_confidence": 0.95,
      "quantity_raw_text": "김치 200g",
      "quantity_evidence_refs": [
        {
          "source_method": "description",
          "source_provider": "youtube_description_parser",
          "line_index": 12,
          "snippet": "김치 200g"
        }
      ],
      "quantity_review_required": false,
      "quantity_user_confirmed": false,
      "ingredient_id": "uuid",
      "resolution_status": "resolved",
      "confidence": 0.95
    },
    {
      "draft_ingredient_id": "uuid",
      "standard_name": "소금",
      "amount": null,
      "unit": null,
      "ingredient_type": "TO_TASTE",
      "display_text": "소금 약간",
      "component_label": "간 맞추기",
      "quantity_source": "unknown",
      "quantity_confidence": null,
      "quantity_raw_text": null,
      "quantity_evidence_refs": [],
      "quantity_review_required": false,
      "quantity_user_confirmed": false,
      "ingredient_id": "uuid",
      "resolution_status": "resolved",
      "confidence": 0.80
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "component_label": "재료 손질",
      "cooking_method": {
        "id": "uuid",
        "code": "prep",
        "label": "손질",
        "color_key": "gray",
        "is_new": false
      },
      "duration_text": null,
      "is_incomplete": false,
      "missing_fields": []
    }
  ],
  "new_cooking_methods": [
    {
      "id": "uuid",
      "code": "auto_1710000000",
      "label": "절이기",
      "color_key": "unassigned",
      "is_new": true
    }
  ],
  "draft_warnings": ["일부 재료의 수량이 불확실합니다"],
  "blocking_issues": []
}
```

**ingredient resolution_status**

| 값 | 의미 | UI |
| --- | --- | --- |
| `resolved` | 정상 매칭 | 표시 없음 |
| `needs_review` | 불확실 매칭 | 경고 배지, candidate 선택/교체 전 저장 차단 |
| `unresolved` | 매칭 실패 | 에러 배지 (저장 차단) |

> `draft_ingredient_id`는 extract 시 서버가 생성해 응답과 `youtube_extraction_sessions.draft_json.ingredients[]`에 같이 저장하는 안정 식별자다. 검수 화면에서 사용자가 재료명/수량/단위/순서를 수정해도 값은 유지하며, 미등록 재료 등록 API가 대상 draft row를 확인할 때 사용한다.
> `component_label`은 nullable이다. YouTube 설명란에서 `| 빵 반죽` 같은 섹션 heading이 감지되면 extract 응답과 session draft에 보존한다. `component_label`이 있으면 `display_text`, `instruction`에는 같은 `[섹션명]` prefix를 포함하지 않는다.
> `thumbnail_url`은 YouTube provider thumbnail URL이며 session에 저장된다. register 단계에서 클라이언트가 제공하거나 override하지 않는다.
> `tags`는 서버 결정론 tag generator preview 결과다. YouTube 설명란 해시태그, provider `snippet.tags`, 제목, 재료, 조리 과정, 조리방법을 입력으로 정규화하고 최대 3개로 제한한다. 클라이언트는 태그를 수정/추가/삭제할 수 없다.
> `quantity_*` fields는 top-level `ingredients[]`, `recipe_candidates[].ingredients[]`, parent `multi_parent` session draft, selected `candidate_child` session draft, `POST /recipes/youtube/candidate-drafts` 응답에 모두 전파한다.
> `recipe_inferred`는 항상 `quantity_review_required=true`로 시작하며, quick import auto-register와 register를 사용자 확인 없이 unblock하지 못한다.

**step missing_fields**

| 필드 | 유형 | 빈값 시 |
| --- | --- | --- |
| `instruction` | blocking | 저장 차단 |
| `cooking_method` | blocking | 저장 차단 |
| `duration` | warning | 경고만 |
| `ingredients_used` | warning | 경고만 |

> 미분류 조리방법은 이 단계에서 즉시 INSERT → id 포함 반환.
> `color_key: "unassigned"`: 프론트는 fallback 색상(회색 계열) 적용.

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 422 | INVALID_URL | URL 형식 오류 |
| 404 | FEATURE_DISABLED | feature flag off |
| 422 | NOT_RECIPE_VIDEO | `non_recipe` classification 영상에 대해 extract 시도 |
| 429 | QUOTA_EXCEEDED | YouTube API quota 소진 |
| 502 | PROVIDER_ERROR | YouTube API 호출 실패 |

### 6-3. 유튜브 미등록 재료 등록 (Step 3 보완)

```
POST /api/v1/recipes/youtube/ingredient-registration
```

🔒 로그인 필수 / Feature flag guard

검수 단계에서 `unresolved` 또는 `needs_review` 재료가 기존 검색으로 해결되지 않을 때, 사용자가 확인한 표준명/legacy 7종 카테고리로 새 재료를 등록하거나 이미 존재하는 표준 재료를 재사용한다. 성공 시 서버는 `draft_json`을 수정하지 않고, 클라이언트가 반환값으로 현재 row를 `resolved`로 바꾼다.

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | extraction_id | string | 추출 세션 ID |
| Body | draft_ingredient_id | string | extract 응답의 재료 row 안정 식별자 |
| Body | standard_name | string | 사용자가 확인한 표준 재료명 |
| Body | category | string | freeze 기간 v1 canonical: `채소` / `육류` / `해산물` / `양념` / `유제품` / `곡류` / `기타` |
| Body | default_unit | string? | 기본 단위. 없으면 null |
| Body | synonym | string? | 원문명을 동의어로 저장할 때 사용. 없으면 null |

**검증**

- `extraction_id`로 `youtube_extraction_sessions` 조회 → 소유권 검증(user_id == current_user)
- session status는 `draft`여야 하며, 만료(`expires_at < now`)면 410
- `draft_ingredient_id`는 session `draft_json.ingredients[]` 안의 `unresolved` 또는 `needs_review` row여야 함
- `standard_name`: trim 후 1~100자, 제어문자 금지, 내부 연속 공백 collapse
- `category`: freeze 기간 v1 canonical 카테고리 7종 중 하나
- `default_unit`: null 또는 20자 이하 문자열
- `synonym`: trim 후 저장, 영어는 lower-case

**처리**: session 검증 → Postgres RPC `register_youtube_ingredient(...)` 원자적 실행

**RPC 원자적 처리**

1. `ingredients`에 `standard_name` INSERT. 이미 있으면 기존 row 재사용 (`on conflict (standard_name) do nothing`)
2. 생성/재사용된 ingredient 조회
3. `synonym`이 비어 있거나 `lower(trim(synonym)) === lower(trim(standard_name))`이면 synonym 저장 skip
4. 같은 normalized synonym이 다른 ingredient에 이미 있으면 best-effort advisory query로 skip하고 `skipped_ambiguous` 반환
5. 안전한 경우 `ingredient_synonyms` INSERT (`on conflict (ingredient_id, synonym) do nothing`)

> `ingredient_synonyms`에는 global `UNIQUE(synonym)`을 추가하지 않는다. 경합으로 같은 synonym이 여러 ingredient에 연결돼도 기존 ingredient matching은 multi-candidate를 `needs_review`로 반환한다.
> `youtube_extraction_sessions.draft_json`은 원본 추출 snapshot/provenance로 유지하고 이 API에서 update하지 않는다.

**응답 (200)**

```json
{
  "ingredient": {
    "ingredient_id": "uuid",
    "standard_name": "연겨자",
    "category": "양념",
    "default_unit": null,
    "resolution_status": "resolved"
  },
  "synonym_status": "attached",
  "warnings": []
}
```

`synonym_status` 값:

| 값 | 의미 |
| --- | --- |
| `attached` | synonym이 현재 ingredient에 연결됨 |
| `already_attached` | 이미 같은 ingredient에 연결돼 있었음 |
| `skipped_same_as_standard` | normalized synonym이 normalized standard_name과 같아 저장하지 않음 |
| `skipped_ambiguous` | 같은 synonym이 다른 ingredient에 이미 연결돼 있어 저장하지 않음 |
| `not_requested` | synonym 입력이 없음 |

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | BAD_REQUEST | JSON 형식 오류 |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 404 | NOT_FOUND | 세션 없음 또는 소유자 불일치 |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | CONFLICT | session 상태 불일치, draft row 불일치, 이미 resolved row |
| 410 | SESSION_EXPIRED | 세션 만료 |
| 422 | VALIDATION_ERROR | 표준명/카테고리/default_unit/synonym 입력 오류 |
| 500 | INTERNAL_ERROR | DB/RPC 실패 |

### 6-3b. 다중 레시피 후보 초안 생성 (Step 3 후보 선택)

```
POST /api/v1/recipes/youtube/candidate-drafts
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | extraction_id | string | `multi_parent` 추출 세션 ID |
| Body | candidate_id | string | extract 응답의 `recipe_candidates[].candidate_id` |

**처리**: parent session 소유권/만료/status 검증 → `youtube_extraction_candidates` 후보 확인 → parent `draft_json.recipe_candidates[]`에서 후보 하나를 선택 → `candidate_child` 추출 세션 생성 → 후보 ledger를 `promoted`로 갱신 → 기존 YT_IMPORT 검수 화면이 소비할 단일 `YoutubeRecipeExtractData` 반환

**응답 (201 또는 idempotent 200)**

```json
{
  "parent_extraction_id": "uuid",
  "candidate_id": "candidate-1",
  "draft": {
    "extraction_id": "child-session-uuid",
    "title": "김치볶음밥",
    "multi_recipe_status": "single",
    "ingredients": [],
    "steps": []
  }
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 404 | EXTRACTION_NOT_FOUND | parent/child 세션 없음 또는 cross-user |
| 404 | CANDIDATE_NOT_FOUND | 후보 없음 |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | INVALID_EXTRACTION_SESSION | `multi_parent` 세션이 아님 |
| 409 | INVALID_CANDIDATE_STATE | 선택 불가 상태 |
| 409 | EXTRACTION_ALREADY_REGISTERED | 후보 또는 child 세션이 이미 등록됨 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | VALIDATION_ERROR | body 형식 오류 |
| 500 | INTERNAL_ERROR | DB 실패 |

### 6-4. 유튜브 레시피 등록 확정 (Step 3 → Step 4)

```
POST /api/v1/recipes/youtube/register
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드          | 타입   | 설명                  |
| ---- | ------------- | ------ | --------------------- |
| Body | extraction_id | string | 추출 세션 ID          |
| Body | youtube_url   | string | 검수 화면의 원본 URL. provenance 저장값으로 쓰지 않고 session의 canonical URL/video ID와 mismatch 검증에만 사용 |
| Body | title         | string | 레시피명 (검수 후)    |
| Body | base_servings | int    | 기본 인분 (≥1)        |
| Body | ingredients   | array  | 검수/수정된 재료 목록 |
| Body | steps         | array  | 검수/수정된 스텝 목록 |

**ingredients 항목**: `{ draft_ingredient_id, ingredient_id, standard_name, amount, unit, ingredient_type, display_text, component_label, sort_order, quantity_confirmation_status }`

**steps 항목**: `{ step_number, instruction, component_label, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text }`

> `cooking_method_id`만 수신 (항상 uuid 필수).
> `component_label`은 nullable이며 YouTube register 전용이다. 빈 문자열은 `null`로 정규화한다. `display_text`와 `instruction`은 같은 섹션 라벨 prefix를 중복 포함하지 않는다.
> `draft_ingredient_id`는 session `draft_json.ingredients[]`의 서버 추출 row와 매칭되어야 한다. 클라이언트가 보낸 `quantity_review_required` 값은 신뢰하지 않는다.
> `quantity_confirmation_status`는 `not_required | confirmed_suggestion | edited_quantity | cleared_to_taste` 중 하나다.
> `not_required`는 matching draft ingredient의 `quantity_review_required=false`일 때만 허용한다.
> `confirmed_suggestion`은 사용자가 YT_IMPORT에서 제안을 명시 확인했고 body 수량/단위가 draft suggestion과 canonical match할 때만 허용한다.
> `edited_quantity`는 사용자가 유효한 `QUANT` amount/unit으로 수정하거나 비어 있던 수량을 채웠을 때 허용한다.
> `cleared_to_taste`는 `ingredient_type="TO_TASTE"`, `amount=null`, `unit=null`일 때만 허용한다.

**처리**: extraction_id로 `youtube_extraction_sessions` 조회 → 소유권 검증(user_id == current_user) → 만료/소비 검증 → `multi_parent` 세션이면 CANDIDATE_PROMOTION_REQUIRED 거부 → client body의 `youtube_url`을 파싱한 값과 session의 canonical URL/video ID를 비교해 EXTRACTION_MISMATCH 검증 → 각 ingredient의 `draft_ingredient_id`와 `quantity_confirmation_status`를 session draft 기준으로 검증 → 세션 `thumbnail_url`과 서버 생성 `tags`를 적용 → Postgres RPC `register_youtube_recipe_from_session` 원자적 실행

**RPC 원자적 INSERT 순서**:
1. `recipes` INSERT (source_type='youtube', created_by=current_user, thumbnail_url=세션값, tags=서버 생성값)
2. `recipe_sources` INSERT (youtube_url, youtube_video_id, youtube_extraction_session_id, extraction_methods, extraction_meta_json.quantity_enrichment_summary — 세션에서 복사/요약)
3. `recipe_ingredients` INSERT (복수, `component_label` 포함)
4. `recipe_steps` INSERT (복수, `component_label` 포함)
5. `youtube_extraction_sessions` UPDATE status='consumed', recipe_id=신규 recipe_id

> **Provenance**: recipe_sources의 youtube_url, youtube_video_id, extraction_methods는 **세션에서 복사** — 클라이언트 body 아님
> **Media/Tags**: YouTube register body는 `thumbnail_url`과 `tags`를 받지 않는다. 서버가 session thumbnail과 tag generator 결과만 저장한다.
> **Quantity summary**: `recipe_sources.extraction_meta_json.quantity_enrichment_summary`에는 provider, cache_hit, trigger_reason, enriched_count, review_required_count, schema_version만 저장한다. per-row durable provenance columns는 v1에서 추가하지 않는다.

**응답 (201)**

```json
{ "recipe_id": "uuid", "title": "백종원 김치찌개" }
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 404 | EXTRACTION_NOT_FOUND | extraction_id 없음 또는 cross-user (404로 숨김) |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | EXTRACTION_ALREADY_REGISTERED | 이미 등록 완료된 세션 |
| 409 | EXTRACTION_MISMATCH | immutable 필드(youtube_video_id 등) 불일치 |
| 409 | CANDIDATE_PROMOTION_REQUIRED | 여러 요리 후보 parent 세션을 직접 등록하려 함 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | VALIDATION_ERROR | base_servings < 1, ingredient_type 불일치, step_number 중복, cooking_method_id 미존재 등 |
| 422 | VALIDATION_ERROR | review-required 수량을 `not_required`로 보내거나 confirmation body가 draft와 불일치 (`fields: [{ field: "quantity_review_required" }]`) |

### 6-5. 레시피오형 빠른 가져오기 중복 확인 `2026-05-28 addendum`

```
GET /api/v1/recipes/youtube/recipio/check?youtube_url={url}
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Query | youtube_url | string | 유튜브 URL |

**처리**: URL에서 canonical `youtube_video_id`를 파싱한 뒤 `recipe_sources.youtube_video_id`에서 기존 레시피를 조회한다. 이 endpoint는 중복 확인 전용이며, YouTube provider 호출이나 추출 세션 생성을 하지 않는다.

**응답 (200 — 중복 있음)**

```json
{
  "is_duplicate": true,
  "recipe": {
    "recipe_id": "uuid",
    "title": "백종원 불어묵 꼬마김밥",
    "thumbnail_url": "https://...",
    "youtube_url": "https://www.youtube.com/watch?v=X9CqUvteeMo",
    "youtube_video_id": "X9CqUvteeMo"
  }
}
```

**응답 (200 — 중복 없음)**

```json
{
  "is_duplicate": false,
  "recipe": null
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 404 | FEATURE_DISABLED | feature flag off |
| 422 | INVALID_URL | 유튜브 URL 형식 아님 또는 video_id 파싱 실패 |
| 500 | INTERNAL_ERROR | DB 조회 실패 |

> `/recipes/new/youtube` quick import 화면은 이 endpoint로 중복 확인을 먼저 수행한 뒤, 중복이 없을 때만 기존 §6-1 validate, §6-2 extract, §6-4 register를 순차 호출한다.
> 자동 등록 조건을 만족하지 않는 draft는 기존 `YT_IMPORT` 검수 화면으로 이동한다.

---

## 7. 직접 레시피 등록 (MANUAL_RECIPE_CREATE)

> 화면: `MANUAL_RECIPE_CREATE` / Flow: ⑩ 직접 등록 여정

### 7-0. 직접 등록 이미지 업로드

```
POST /api/v1/recipes/images
```

🔒 로그인 필수

`multipart/form-data`로 단일 이미지 파일을 업로드한다. 업로드 성공 후 반환된 `thumbnail_url`은 같은 사용자의 `POST /recipes`에서만 사용할 수 있다.

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| FormData | image | File | jpeg/png/webp, 최대 5MB |

**검증**

- 인증 필수. 미인증은 401.
- MIME 타입은 `image/jpeg`, `image/png`, `image/webp`만 허용한다.
- 파일 크기는 서버 수신 기준 5MB 이하만 허용한다.
- 파일 확장자는 서버가 MIME 기준으로 결정한다.
- 저장 경로는 Supabase Storage `recipe-images/{user_id}/{uuid}.{ext}`다.
- DB에는 이미지 바이너리를 저장하지 않는다. API는 durable public Storage URL과 storage path만 반환한다.

**응답 (201)**

```json
{
  "thumbnail_url": "https://<supabase-project>.supabase.co/storage/v1/object/public/recipe-images/<user_id>/<uuid>.webp",
  "storage_path": "<user_id>/<uuid>.webp"
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | BAD_REQUEST | multipart/form-data 또는 image file 누락 |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 413 | PAYLOAD_TOO_LARGE | 5MB 초과 |
| 422 | VALIDATION_ERROR | 허용 MIME/확장자 아님 |
| 500 | INTERNAL_ERROR | Storage 저장 실패 |

### 7-1. 직접 레시피 등록

```
POST /recipes
```

🔒 로그인 필수

| 구분 | 필드          | 타입   | 설명                        |
| ---- | ------------- | ------ | --------------------------- |
| Body | title         | string | 레시피명                    |
| Body | base_servings | int    | 기본 인분                   |
| Body | thumbnail_url | string? | 7-0 업로드 API가 반환한 현재 사용자 소유 public URL. 없으면 null |
| Body | ingredients   | array  | 재료 목록. `component_label` 비허용 |
| Body | steps         | array  | 스텝 목록. `component_label` 비허용 |

**manual ingredients 항목**: `{ ingredient_id, standard_name, amount, unit, ingredient_type, display_text, sort_order, scalable }`

**manual steps 항목**: `{ step_number, instruction, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text }`

> 직접 레시피 등록은 §6-4 YouTube register body를 참조하지 않는다. `component_label`은 YouTube extract/register 전용 field이며 manual create body에는 허용하지 않는다.
> `thumbnail_url`은 `POST /api/v1/recipes/images`가 반환한 현재 사용자 소유 참조만 허용한다. 임의 외부 URL, 만료 signed URL, 다른 사용자의 Storage 경로는 422 `VALIDATION_ERROR`로 거부한다.
> `tags`는 body로 받지 않는다. 서버가 제목, 재료, 조리 과정, 조리방법 라벨에서 결정론적으로 최대 3개를 생성해 `recipes.tags`에 저장한다. 생성할 수 없으면 `[]`.

**응답 (201)**: 생성된 recipe 객체

> source_type = ‘manual’ 자동 설정. `recipes.thumbnail_url`은 업로드 참조 또는 null, `recipes.tags`는 서버 생성값이다.

## 8. 장보기 (SHOPPING_FLOW, SHOPPING_DETAIL) `v1.2 대폭 변경`

> 화면: `SHOPPING_FLOW`, `SHOPPING_DETAIL` / Flow: ④ 장보기 여정
>
> **v1.2 장보기 UX 변경 요약**
>
> - 목록 생성 → 상세 페이지 자동 이동
> - 아이템 카드형 드래그&드롭: 순서 변경 + 팬트리 제외 섹션 이동
> - 장보기 완료 후 “팬트리에 추가할 아이템 선택” 팝업

### 8-1. 장보기 대상 취합 (Step A~C)

```
GET /shopping/preview
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "date_range": {
    "start": "2026-03-01",
    "end": "2026-03-07"
  },
  "recipes": [
    {
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "meal_ids": ["uuid", "uuid"],
      "planned_servings_total": 4,
      "shopping_servings": 4,
      "is_selected": true
    }
  ]
}
```

> 대상 조건: `status='registered' AND shopping_list_id IS NULL`

### 8-2. 장보기 목록 생성 (Step D) `v1.2 변경`

```
POST /shopping/lists
```

🔒 로그인 필수

| 구분 | 필드    | 타입  | 설명                 |
| ---- | ------- | ----- | -------------------- |
| Body | recipes | array | 선택된 레시피별 인분 |

**recipes 배열 항목:**

```json
{
  "recipe_id": "uuid",
  "meal_ids": ["uuid", "uuid"],
  "shopping_servings": 4
}
```

**응답 (201)**

```json
{
  "id": "uuid",
  "title": "3/1 장보기",
  "date_range_start": "2026-03-01",
  "date_range_end": "2026-03-07",
  "is_completed": false,
  "items": [
    {
      "id": "item-uuid-1",
      "ingredient_id": "uuid",
      "standard_name": "양파",
      "category": "채소",
      "display_text": "양파 2개 + 200g",
      "amounts_json": [
        { "amount": 2, "unit": "개" },
        { "amount": 200, "unit": "g" }
      ],
      "is_pantry_excluded": false,
      "is_checked": false,
      "added_to_pantry": false,
      "sort_order": 0
    },
    {
      "id": "item-uuid-2",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "category": "양념",
      "display_text": "소금 1작은술",
      "amounts_json": [{ "amount": 1, "unit": "작은술" }],
      "is_pantry_excluded": true,
      "is_checked": false,
      "added_to_pantry": false,
      "sort_order": 100
    }
  ],
  "pantry_excluded_items": [
    {
      "item_id": "item-uuid-2",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "display_text": "소금 1작은술"
    }
  ]
}
```

> 서버 처리:

- shopping_lists, shopping_list_recipes, shopping_list_items INSERT
- 팬트리 보유 재료: `is_pantry_excluded=true` 자동 세팅
- 대상 meals에 shopping_list_id 미리 세팅 (status는 registered 유지)
- `sort_order`: 기본 정렬값 할당
- `added_to_pantry`: 초기값 false
  > **v1.2 추가**: `sort_order`, `added_to_pantry` 필드 추가. 생성 후 클라이언트는 반환된 `id`로 상세 페이지에 자동 이동.

### 8-3. 장보기 리스트 상세 조회

```
GET /shopping/lists/{list_id}
```

🔒 로그인 필수

**응답 (200)**: 8-2 응답과 동일 형식

> 아이템은 `sort_order ASC` 정렬로 반환. 동일한 sort_order일 경우 `id ASC`로 tie-break. 재진입/마이페이지 재열람 시에도 드래그 순서 유지.

### 8-4. 장보기 항목 업데이트 (체크 토글 + 제외 토글)

```
PATCH /shopping/lists/{list_id}/items/{item_id}
```

🔒 로그인 필수

| 구분 | 필드               | 타입     | 설명                       |
| ---- | ------------------ | -------- | -------------------------- |
| Body | is_checked         | boolean? | 구매 완료 체크 토글        |
| Body | is_pantry_excluded | boolean? | 팬트리 제외 섹션 이동 토글 |

> **제외 섹션 이동 규칙** `v1.2 추가is_pantry_excluded=true`로 변경 시 서버가 `is_checked=false`로 자동 정리.
> 제외 섹션 = “안 사는 항목”이므로 구매 체크가 의미 없기 때문.

**응답 (200)**: 업데이트된 item 객체

> **완료 후 수정 불가** `v1.2.1 추가shopping_lists.is_completed=true`인 리스트의 아이템은 수정할 수 없다. 409 CONFLICT 반환. 장보기 아이템 순서 변경 (드래그&드롭) `v1.2 신규`

```
PATCH /shopping/lists/{list_id}/items/reorder
```

🔒 로그인 필수

| 구분 | 필드   | 타입  | 설명           |
| ---- | ------ | ----- | -------------- |
| Body | orders | array | 순서 변경 목록 |

**orders 배열 항목:**

```json
{ "item_id": "uuid", "sort_order": 10 }
```

**응답 (200)**

```json
{ "updated": 5 }
```

> 서버는 해당 list_id 소속 item인지 검증 후 sort_order 업데이트.
> 재진입/마이페이지 재열람 시에도 순서 유지.
>
> **완료 후 수정 불가** `v1.2.1 추가shopping_lists.is_completed=true`인 리스트는 순서 변경도 불가. 409 CONFLICT 반환.

### 8-5. 장보기 완료 (팬트리 반영 선택 가능) `v1.2 변경`

```
POST /shopping/lists/{list_id}/complete
```

🔒 로그인 필수

| 구분 | 필드                   | 타입    | 설명                           |
| ---- | ---------------------- | ------- | ------------------------------ |
| Body | add_to_pantry_item_ids | uuid[]? | 팬트리에 추가할 아이템 ID 목록 |

> **미전달 vs 빈배열 구분** `v1.2.1 추가`
>
> - `add_to_pantry_item_ids`가 **미전달(null/undefined)**: 기본값 정책 적용 (`is_checked=true AND is_pantry_excluded=false` 전부 추가)
> - `add_to_pantry_item_ids: []` **(빈 배열)**: 팬트리 반영을 수행하지 않는다 (`pantry_added=0`)

> **프론트 구현 흐름:**

1. 유저가 [장보기 완료] 버튼 클릭
2. 팝업: 구매 완료 체크(`is_checked=true`)된 아이템 목록 표시
3. 유저가 팬트리에 추가할 아이템을 체크/체크해제로 선택
4. [팬트리에 추가] 클릭 → 8-5 호출 (`add_to_pantry_item_ids` 전달)
5. 전부 해제하고 [추가 안 함] 클릭 → 8-5 호출 (`add_to_pantry_item_ids: []`)
   >

**응답 (200)**

```json
{
  "completed": true,
  "meals_updated": 4,
  "pantry_added": 3,
  "pantry_added_item_ids": ["item-uuid-1", "item-uuid-3", "item-uuid-5"]
}
```

> `v1.2.1 수정`: `pantry_added` = `pantry_added_item_ids`의 길이와 항상 일치.
> `pantry_added`는 이번 요청에서 팬트리 반영 처리된 shopping_list_item의 개수이다.
> pantry_items에 이미 존재하여 INSERT가 발생하지 않더라도, 사용자가 선택한 항목은 `added_to_pantry=true`로 마킹되며 `pantry_added_item_ids`에 포함된다.

> **서버 검증/필터 규칙** `v1.2.1 추가`
>
> 서버는 `add_to_pantry_item_ids`에 대해 다음을 검증/정리한다:
>
> 1. 모든 item_id가 해당 list_id 소속인지 확인 (아니면 무시)
> 2. `is_pantry_excluded=true`인 항목은 무시 (제외 섹션 아이템)
> 3. `is_checked=false`인 항목은 무시 (미구매 아이템)
> 4. 이미 `added_to_pantry=true`인 항목은 중복 반영하지 않음 (멱등)
>
> **무효 항목 처리 정책: 무시하고 진행** (409 실패 아님). 유효한 항목만 처리. 모든 item_id가 무효여도 200 반환 (`pantry_added=0`).

> 서버 처리:

- **항상**: meals 전이(shopping_done) + shopping_lists.is_completed = true
- **선택**: 유효한 `add_to_pantry_item_ids`에 해당하는 항목만 pantry_items INSERT + `added_to_pantry=true`
  > **멱등성**: 이미 완료면 200 + 동일 결과 반환

### 8-6. 장보기 공유용 텍스트 `v1.2 보완`

```
GET /shopping/lists/{list_id}/share-text
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "text": "📋 3/1 장보기\n\n☐ 양파 2개 + 200g\n☐ 김치 400g\n☐ 두부 1모\n..."
}
```

> **v1.2 추가**: `is_pantry_excluded=false` 항목만 포함. 제외 섹션 항목은 공유 대상에서 제외.

---

## 9. 요리하기 (COOK_READY_LIST, COOK_MODE)

> 화면: `COOK_READY_LIST`, `COOK_MODE`, `MEAL_SCREEN`(개별 식사 단축) / Flow: ⑤ 요리하기(플래너 경유), ⑤-b 개별 식사 단축, ⑧ 독립 요리

### 9-1. 요리하기 준비 리스트 조회

```
GET /cooking/ready
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "date_range": {
    "start": "2026-03-01",
    "end": "2026-03-07"
  },
  "recipes": [
    {
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "meal_ids": ["uuid", "uuid"],
      "total_servings": 4
    }
  ]
}
```

### 9-2. 요리 세션 생성 (레시피별 [요리하기] 클릭)

```
POST /cooking/sessions
```

🔒 로그인 필수

| 구분 | 필드             | 타입   | 설명              |
| ---- | ---------------- | ------ | ----------------- |
| Body | recipe_id        | uuid   | 레시피 ID         |
| Body | meal_ids         | uuid[] | 대상 meal ID 목록 |
| Body | cooking_servings | int    | 요리 인분         |

**응답 (201)**

```json
{
  "session_id": "uuid",
  "recipe_id": "uuid",
  "status": "in_progress",
  "cooking_servings": 4,
  "meals": [{ "meal_id": "uuid", "is_cooked": false }]
}
```

> **서버 검증**: meal_ids 소유자, status='shopping_done', recipe_id 일치 확인
>
> **허용 호출자** `v1.2.5 명시`
>
> | 호출자 | meal_ids 패턴 | 설명 |
> | --- | --- | --- |
> | `COOK_READY_LIST` | 동일 레시피의 `shopping_done` meals 복수 | 일괄/레시피 그룹 요리 (기존) |
> | `MEAL_SCREEN` | 선택된 `shopping_done` meal 1건 | 개별 식사 요리 단축 경로 `v1.2.5 추가` |
>
> `MEAL_SCREEN`에서 호출할 때도 서버 검증 규칙은 동일하게 적용된다:
> - `meal_ids`에 `registered` 상태 meal이 포함되면 409 CONFLICT (기존 `status='shopping_done'` 검증으로 자연 차단)
> - `meal_ids`에 `cook_done` 상태 meal이 포함되면 409 CONFLICT
> - 장보기를 우회하여 `registered` → `cook_done` 전이는 불가능하다
>
> `meal_ids`의 최소 길이 제한은 1이다. 빈 배열은 422 VALIDATION_ERROR.

### 9-3. 요리모드 데이터 조회 — 플래너 경유 (세션 기반)

```
GET /cooking/sessions/{session_id}/cook-mode
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "session_id": "uuid",
  "recipe": {
    "id": "uuid",
    "title": "김치찌개",
    "cooking_servings": 4,
    "ingredients": [
      {
        "ingredient_id": "uuid",
        "standard_name": "김치",
        "amount": 400,
        "unit": "g",
        "display_text": "김치 400g",
        "component_label": "찌개 재료",
        "ingredient_type": "QUANT",
        "scalable": true
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "instruction": "김치를 한입 크기로 썬다",
        "component_label": "재료 손질",
        "cooking_method": {
          "code": "prep",
          "label": "손질",
          "color_key": "gray"
        },
        "ingredients_used": [...],
        "heat_level": null,
        "duration_seconds": null,
        "duration_text": null
      }
    ]
  }
}
```

### 9-3b. 요리모드 데이터 조회 — 독립 요리 (레시피 기반)

```
GET /recipes/{recipe_id}/cook-mode
```

🔓 비로그인

| 구분  | 필드     | 타입 | 설명      |
| ----- | -------- | ---- | --------- |
| Query | servings | int  | 요리 인분 |

**응답 (200)**

```json
{
  "recipe": {
    "id": "uuid",
    "title": "김치찌개",
    "cooking_servings": 2,
    "ingredients": [
      /* servings 기준 스케일링 */
    ],
    "steps": [
      /* 동일 형식 */
    ]
  }
}
```

> cook-mode의 ingredient/step `component_label`은 nullable이며 recipe detail과 같은 의미다. UI는 인접 항목의 label 변경 지점에만 섹션 소제목을 표시한다.

### 9-4. 요리 완료 (플래너 경유)

```
POST /cooking/sessions/{session_id}/complete
```

🔒 로그인 필수

| 구분 | 필드                    | 타입   | 설명                     |
| ---- | ----------------------- | ------ | ------------------------ |
| Body | consumed_ingredient_ids | uuid[] | 소진 체크한 재료 ID 목록 |

**응답 (200)**

```json
{
  "session_id": "uuid",
  "status": "completed",
  "meals_updated": 2,
  "leftover_dish_id": "uuid",
  "pantry_removed": 3,
  "cook_count": 90
}
```

> **멱등성**: 이미 completed면 200 + 동일 결과 반환

### 9-5. 요리 취소

```
POST /cooking/sessions/{session_id}/cancel
```

🔒 로그인 필수

**응답 (200)**

```json
{ "session_id": "uuid", "status": "cancelled" }
```

> **멱등성**: 이미 cancelled면 200 + 동일 결과 반환

### 9-6. 독립 요리 완료 (플래너 미경유)

```
POST /cooking/standalone-complete
```

🔒 로그인 필수

| 구분 | 필드                    | 타입   | 설명                     |
| ---- | ----------------------- | ------ | ------------------------ |
| Body | recipe_id               | uuid   | 레시피 ID                |
| Body | cooking_servings        | int    | 요리한 인분              |
| Body | consumed_ingredient_ids | uuid[] | 소진 체크한 재료 ID 목록 |

**응답 (200)**

```json
{
  "leftover_dish_id": "uuid",
  "pantry_removed": 3,
  "cook_count": 91
}
```

---

## 10. 남은요리 (LEFTOVERS, ATE_LIST)

> 화면: `LEFTOVERS`, `ATE_LIST` / Flow: ⑥ 남은요리 관리 여정

### 10-1. 남은요리 목록 조회

```
GET /leftovers
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명                       |
| ----- | ------ | ------- | -------------------------- |
| Query | status | string? | `leftover`(기본) / `eaten` |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "source_meal_label": "저녁",
      "source_planned_servings": 2,
      "cooking_servings": 2,
      "status": "leftover",
      "cooked_at": "2026-03-01T18:00:00Z",
      "eaten_at": null
    }
  ]
}
```

> `source_meal_label`과 `source_planned_servings`는 남은요리가 플래너 요리에서 만들어졌거나 이후 플래너에 다시 추가된 경우 최신 연결 meal 기준으로 내려준다. 독립 요리처럼 연결 meal이 없으면 `null`일 수 있다.
> `cooking_servings`는 남은요리가 만들어진 요리 인분이다.

### 10-2. 다먹음 처리

```
POST /leftovers/{leftover_id}/eat
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "status": "eaten",
  "eaten_at": "2026-03-03T12:00:00Z",
  "auto_hide_at": "2026-04-02T12:00:00Z"
}
```

### 10-3. 덜먹음 처리

```
POST /leftovers/{leftover_id}/uneat
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "status": "leftover",
  "eaten_at": null,
  "auto_hide_at": null
}
```

### 10-4. 남은요리 → 플래너 추가

> 2-5 `POST /meals` (leftover_dish_id 포함) 재사용

---

## 11. 팬트리 (PANTRY, PANTRY_BUNDLE_PICKER)

> 화면: `PANTRY`, `PANTRY_BUNDLE_PICKER` / Flow: ⑦ 팬트리 관리 여정

### 11-1. 팬트리 목록 조회

```
GET /pantry
```

🔒 로그인 필수

| 구분  | 필드     | 타입    | 설명          |
| ----- | -------- | ------- | ------------- |
| Query | q        | string? | 재료명 검색   |
| Query | category | string? | 카테고리 필터 |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "양파",
      "category": "채소",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

### 11-2. 팬트리 재료 추가

```
POST /pantry
```

🔒 로그인 필수

| 구분 | 필드           | 타입   | 설명                |
| ---- | -------------- | ------ | ------------------- |
| Body | ingredient_ids | uuid[] | 추가할 재료 ID 목록 |

**응답 (201)**

```json
{ "added": 3, "items": [...] }
```

### 11-3. 팬트리 재료 삭제

```
DELETE /pantry
```

🔒 로그인 필수

| 구분 | 필드           | 타입   | 설명                |
| ---- | -------------- | ------ | ------------------- |
| Body | ingredient_ids | uuid[] | 삭제할 재료 ID 목록 |

**응답 (200)**

```json
{ "removed": 2 }
```

### 11-4. 묶음 목록 조회

```
GET /pantry/bundles
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "bundles": [
    {
      "id": "uuid",
      "name": "조미료 모음",
      "display_order": 1,
      "ingredients": [
        {
          "ingredient_id": "uuid",
          "standard_name": "소금",
          "is_in_pantry": true
        }
      ]
    }
  ]
}
```

### 11-5. 묶음으로 팬트리 추가

> 11-2 `POST /pantry` 재사용

---

## 12. 마이페이지 (MYPAGE) `v1.2 변경`

> 화면: `MYPAGE`, `RECIPEBOOK_DETAIL` / Flow: ⑪ 저장/관리 여정

### 12-1. 내 정보 조회

```
GET /users/me
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "nickname": "집밥러",
  "email": "user@example.com",
  "profile_image_url": "https://...",
  "social_provider": "kakao",
  "settings": {
    "screen_wake_lock": true
  }
}
```

### 12-2. 레시피북 목록 조회 `v1.2 변경`

```
GET /recipe-books
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "books": [
    {
      "id": "uuid",
      "name": "내가 추가한 레시피",
      "book_type": "my_added",
      "recipe_count": 12,
      "sort_order": 0
    },
    {
      "id": "uuid",
      "name": "저장한 레시피",
      "book_type": "saved",
      "recipe_count": 8,
      "sort_order": 1
    },
    {
      "id": "uuid",
      "name": "좋아요한 레시피",
      "book_type": "liked",
      "recipe_count": 25,
      "sort_order": 2
    },
    {
      "id": "uuid",
      "name": "주말 파티",
      "book_type": "custom",
      "recipe_count": 5,
      "sort_order": 3
    }
  ]
}
```

> **v1.2 변경**: 모든 recipe_books의 `id`는 **uuid로 통일**. 시스템/커스텀 구분은 `book_type`으로만 한다.

> **시스템 레시피북 = 가상 책 정책**
>
> | book_type  | 조회 소스 (Source of Truth)                                                   |
> | ---------- | ----------------------------------------------------------------------------- |
> | `my_added` | `recipes WHERE created_by = user_id AND source_type IN ('youtube', 'manual')` |
> | `saved`    | `recipe_book_items WHERE book_id = saved 책의 uuid`                           |
> | `liked`    | `recipe_likes WHERE user_id = user_id`                                        |
> | `custom`   | `recipe_book_items WHERE book_id = 해당 커스텀 책 uuid`                       |

### 12-3. 레시피북 생성

```
POST /recipe-books
```

🔒 로그인 필수

| 구분 | 필드 | 타입   | 설명          |
| ---- | ---- | ------ | ------------- |
| Body | name | string | 레시피북 이름 |

**응답 (201)**: 생성된 book 객체 (book_type = ‘custom’)

### 12-4. 레시피북 수정

```
PATCH /recipe-books/{book_id}
```

🔒 로그인 필수

| 구분 | 필드 | 타입    | 설명        |
| ---- | ---- | ------- | ----------- |
| Body | name | string? | 변경할 이름 |

> 시스템 레시피북(my_added/saved/liked) 이름 변경 불가 → 403

### 12-5. 레시피북 삭제

```
DELETE /recipe-books/{book_id}
```

🔒 로그인 필수

> 시스템 레시피북 삭제 불가 → 403

### 12-6. 레시피북 상세 조회 (레시피 목록)

```
GET /recipe-books/{book_id}/recipes
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "recipe_id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "tags": ["한식", "찌개"],
      "view_count": 1520,
      "total_duration_seconds": 1200,
      "total_duration_text": "20분",
      "base_servings": 2,
      "added_at": "2026-03-01T10:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

> 서버는 `book_type`에 따라 조회 소스 분기 (12-2 가상 책 정책 참조)
> `total_duration_seconds`는 해당 레시피 step의 `duration_seconds` 합산값이다. 합산 가능한 값이 없으면 `null`.
> `total_duration_text`는 `total_duration_seconds`를 화면 표시용으로 변환한 값이며, 값이 없으면 `null`.

### 12-7. 레시피북에서 레시피 제거 `v1.2 역할 확대`

```
DELETE /recipe-books/{book_id}/recipes/{recipe_id}
```

🔒 로그인 필수

> **타입별 삭제 동작:**

- `liked` 책에서 제거 = 좋아요 해제 (recipe_likes DELETE)
- `my_added` 책에서는 제거 불가 → 403
- `saved` / `custom` = recipe_book_items DELETE
  > **레시피 저장 해제도 이 엔드포인트 사용** (v1.2에서 2-4 삭제됨)
  >
  > **비정규화 카운트 갱신** `v1.2.1 추가`
  > 서버는 삭제 동작에 따라 비정규화 카운트를 갱신한다:
  >
  > - `liked` 책에서 제거 → `recipes.like_count -= 1`
  > - `saved` / `custom` 책에서 제거 → `recipes.save_count -= 1`

### 12-8. 장보기 기록 목록 조회

```
GET /shopping/lists
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "3/1 장보기",
      "date_range_start": "2026-03-01",
      "date_range_end": "2026-03-07",
      "is_completed": true,
      "completed_at": "2026-03-01T18:30:00Z",
      "item_count": 12,
      "created_at": "2026-03-01T09:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

> `completed_at`은 `is_completed=true`인 항목에서 필수이며, `is_completed=false`인 항목에서는 `null`이다. 마이페이지는 이 값을 사용해 완료 기록을 `다시열기` read-only 카드로 표시할 수 있다.

---

## 13. 설정 (SETTINGS)

> 화면: `SETTINGS`

### 13-1. 설정 업데이트

```
PATCH /users/me/settings
```

🔒 로그인 필수

| 구분 | 필드             | 타입     | 설명           |
| ---- | ---------------- | -------- | -------------- |
| Body | screen_wake_lock | boolean? | 화면 꺼짐 방지 |

### 13-2. 닉네임 변경

```
PATCH /users/me
```

🔒 로그인 필수

| 구분 | 필드     | 타입   | 설명               |
| ---- | -------- | ------ | ------------------ |
| Body | nickname | string | 새 닉네임 (2~30자) |

### 13-3. 회원 탈퇴

```
DELETE /users/me
```

🔒 로그인 필수

> 계정 삭제 확인 후 사용자 개인 데이터를 삭제한다. 직접/유튜브로 등록한 레시피는 삭제하지 않고, 작성자 정보 없이 남긴다.

**서버 동작**

1. 인증된 사용자 ID로 `delete_user_private_data(p_user_id)` RPC를 호출한다.
2. `recipe_books`, `meals`, `shopping_lists`, `pantry_items`, `cooking_sessions`, `leftover_dishes`, `recipe_likes` 등 사용자 소유 데이터는 삭제된다.
3. `recipes.created_by = p_user_id`인 레시피는 삭제하지 않는다. `created_by`는 `null`이 될 수 있다.
4. 삭제된 저장/좋아요 row가 반영되도록 `recipes.save_count`, `recipes.like_count`를 재계산한다.
5. 같은 소셜 계정으로 다시 로그인하면 새 사용자 bootstrap 상태로 시작한다.

**응답 (200)**

```json
{
  "deleted": true
}
```

**에러**

| Status | code | 설명 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 500 | INTERNAL_ERROR | DB cleanup 실패 |

---

## 14. 조리방법 마스터 (보조)

> `GET /cooking-methods` v1 shape는 유지한다. 조리방법 category가 필요하면 기존 소비자를 깨지 않는 optional additive metadata로만 검토하며, `label`에 taxonomy 코드/분류 의미를 싣지 않는다.

### 14-1. 조리방법 목록 조회

```
GET /cooking-methods
```

🔓 비로그인

**응답 (200)**

```json
{
  "methods": [
    {
      "id": "uuid",
      "code": "stir_fry",
      "label": "볶기",
      "color_key": "orange",
      "is_system": true
    },
    {
      "id": "uuid",
      "code": "boil",
      "label": "끓이기",
      "color_key": "red",
      "is_system": true
    },
    {
      "id": "uuid",
      "code": "auto_1710000000",
      "label": "절이기",
      "color_key": "unassigned",
      "is_system": false
    }
  ]
}
```

---

---

# 15. Admin Foundation (내부 운영 관리) `v1.2.12 신규`

> 화면: `ADMIN_DASHBOARD` / `ADMIN_USERS` / `ADMIN_EVENTS` / `ADMIN_AUDIT_LOGS`
>
> Admin API는 내부 운영용 read-only surface다. 모든 endpoint는 OAuth 인증 후 `admin_members` 등록 여부를 서버에서 확인하고, cross-user/admin 조회에는 `createServiceRoleClient()`를 사용한다. service role이 없으면 fail closed 하며, `routeClient` fallback을 금지한다.
>
> 모든 Admin API read는 `admin_audit_logs`에 감사 로그를 남긴다. `request_path`는 pathname만 저장하고 query string은 저장하지 않는다. OAuth code/next/error, raw YouTube URL/source text, admin search term/email/nickname, private shopping/pantry detail은 `request_path` 또는 `metadata_json`에 저장하지 않는다.

## 15-1. 관리자 사용자 목록 조회

```http
GET /api/v1/admin/users
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| q | string | 선택. 이메일/닉네임 검색어. 감사 로그에는 저장하지 않음 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "email_masked": "us***@example.com",
        "social_provider": "google",
        "nickname": "집밥러",
        "created_at": "2026-05-27T00:00:00Z",
        "counts": {
          "recipe_books": 2,
          "meals": 8,
          "shopping_lists": 3,
          "pantry_items": 12
        },
        "status": "active"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**감사 로그**

- action: `list_users`
- target_type: `user_search`
- target_id: `null`
- 검색어, 이메일, 닉네임은 감사 로그에 저장하지 않는다.

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 15-2. 운영 이벤트 목록 조회

```http
GET /api/v1/admin/operational-events
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| event_type | string | 선택 |
| severity | string | 선택: info/warn/error/critical |
| source | string | 선택: auth/youtube/admin/api 등 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "event_type": "youtube_provider_failure",
        "severity": "error",
        "source": "youtube",
        "actor_user_id": "uuid",
        "target_user_id": null,
        "request_path": "/api/v1/recipes/youtube/extract",
        "http_status": 502,
        "error_code": "PROVIDER_ERROR",
        "message_summary": "YouTube provider request failed",
        "metadata_json": {},
        "created_at": "2026-05-27T00:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**최소 event source**

- OAuth/auth callback failures
- YouTube validate/extract/register provider failures
- account delete success/failure
- Admin API service-role-missing failures
- selected route-handler unhandled server errors

**감사 로그**

- action: `list_operational_events`
- target_type: `operational_event_list`
- target_id: `null`

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 15-3. 관리자 감사 로그 목록 조회

```http
GET /api/v1/admin/audit-logs
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| action | string | 선택 |
| actor_admin_user_id | uuid | 선택 |
| target_type | string | 선택 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "actor_admin_user_id": "uuid",
        "action": "list_users",
        "target_type": "user_search",
        "target_id": null,
        "request_path": "/api/v1/admin/users",
        "result": "success",
        "ip_hash": "sha256:...",
        "user_agent_hash": "sha256:...",
        "created_at": "2026-05-27T00:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**감사 로그**

- action: `list_audit_logs`
- target_type: `audit_log_list`
- target_id: `null`

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 엔드포인트 전체 목록 (61개) `v1.2.15`

| #        | Method     | Path                                   | 화면                     | 인증   | v1.2 변경                        |
| -------- | ---------- | -------------------------------------- | ------------------------ | ------ | -------------------------------- |
| 0-4      | POST       | /auth/logout                           | -                        | 🔒     |                                  |
| 1-1      | GET        | /recipes                               | HOME                     | 🔓     |                                  |
| 1-2      | GET        | /recipes/themes                        | HOME                     | 🔓     |                                  |
| 1-3      | GET        | /ingredients                           | HOME (필터)              | 🔓     |                                  |
| 2-1      | GET        | /recipes/{id}                          | RECIPE_DETAIL            | 🔓     |                                  |
| 2-2      | POST       | /recipes/{id}/like                     | RECIPE_DETAIL            | 🔒     |                                  |
| 2-3      | POST       | /recipes/{id}/save                     | RECIPE_DETAIL            | 🔒     | book_type 제한 추가              |
| ~~2-4~~  | ~~DELETE~~ | ~~/recipes/{id}/save~~                 | -                        | -      | **삭제** → 12-7 사용             |
| 2-5      | POST       | /meals                                 | RECIPE_DETAIL / MENU_ADD | 🔒     |                                  |
| 3-1      | GET        | /planner                               | PLANNER_WEEK             | 🔒     |                                  |
| 3-2      | GET        | /planner/columns                       | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-3      | POST       | /planner/columns                       | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-4      | PATCH      | /planner/columns/{id}                  | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-5      | DELETE     | /planner/columns/{id}                  | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 4-1      | GET        | /meals                                 | MEAL_SCREEN              | 🔒     |                                  |
| 4-2      | PATCH      | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 4-3      | DELETE     | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 5-4      | GET        | /recipes/pantry-match                  | MENU_ADD                 | 🔒     |                                  |
| 6-1      | POST       | /recipes/youtube/validate              | YT_IMPORT                | 🔒     |                                  |
| 6-2      | POST       | /recipes/youtube/extract               | YT_IMPORT                | 🔒     | v1.2.15 quantity fields          |
| 6-3      | POST       | /recipes/youtube/ingredient-registration | YT_IMPORT              | 🔒     | v1.2.7 신규                      |
| 6-3b     | POST       | /recipes/youtube/candidate-drafts      | YT_IMPORT                | 🔒     | 2026-05-30 addendum              |
| 6-4      | POST       | /recipes/youtube/register              | YT_IMPORT                | 🔒     | v1.2.15 quantity confirmation    |
| 6-5      | GET        | /recipes/youtube/recipio/check         | YT_IMPORT quick          | 🔒     | 2026-05-28 addendum              |
| 7-0      | POST       | /recipes/images                        | MANUAL_RECIPE_CREATE     | 🔒     | v1.2.14 신규                     |
| 7-1      | POST       | /recipes                               | MANUAL_RECIPE_CREATE     | 🔒     | thumbnail_url 참조 + tags 서버 생성 |
| 8-1      | GET        | /shopping/preview                      | SHOPPING_FLOW            | 🔒     |                                  |
| 8-2      | POST       | /shopping/lists                        | SHOPPING_FLOW            | 🔒     | sort_order, added_to_pantry 추가 |
| 8-3      | GET        | /shopping/lists/{id}                   | SHOPPING_DETAIL          | 🔒     | tie-breaker 명시                 |
| 8-4      | PATCH      | /shopping/lists/{id}/items/{id}        | SHOPPING_DETAIL          | 🔒     | 완료 후 409 추가                 |
| **8-4b** | **PATCH**  | **/shopping/lists/{id}/items/reorder** | **SHOPPING_DETAIL**      | **🔒** | **신규**                         |
| 8-5      | POST       | /shopping/lists/{id}/complete          | SHOPPING_DETAIL          | 🔒     | 검증 규칙 + null/[] 구분         |
| 8-6      | GET        | /shopping/lists/{id}/share-text        | SHOPPING_DETAIL          | 🔒     | 제외 항목 미포함 명시            |
| 9-1      | GET        | /cooking/ready                         | COOK_READY_LIST          | 🔒     |                                  |
| 9-2      | POST       | /cooking/sessions                      | COOK_READY_LIST / MEAL_SCREEN | 🔒 | MEAL_SCREEN 단축 호출 추가 (v1.2.5) |
| 9-3      | GET        | /cooking/sessions/{id}/cook-mode       | COOK_MODE                | 🔒     |                                  |
| 9-3b     | GET        | /recipes/{id}/cook-mode                | COOK_MODE                | 🔓     |                                  |
| 9-4      | POST       | /cooking/sessions/{id}/complete        | COOK_MODE                | 🔒     |                                  |
| 9-5      | POST       | /cooking/sessions/{id}/cancel          | COOK_MODE                | 🔒     |                                  |
| 9-6      | POST       | /cooking/standalone-complete           | COOK_MODE                | 🔒     |                                  |
| 10-1     | GET        | /leftovers                             | LEFTOVERS / ATE_LIST     | 🔒     |                                  |
| 10-2     | POST       | /leftovers/{id}/eat                    | LEFTOVERS                | 🔒     |                                  |
| 10-3     | POST       | /leftovers/{id}/uneat                  | ATE_LIST                 | 🔒     |                                  |
| 11-1     | GET        | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-2     | POST       | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-3     | DELETE     | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-4     | GET        | /pantry/bundles                        | PANTRY_BUNDLE_PICKER     | 🔒     |                                  |
| 12-1     | GET        | /users/me                              | MYPAGE                   | 🔒     |                                  |
| 12-2     | GET        | /recipe-books                          | MYPAGE                   | 🔒     | id uuid 통일                     |
| 12-3     | POST       | /recipe-books                          | MYPAGE                   | 🔒     |                                  |
| 12-4     | PATCH      | /recipe-books/{id}                     | MYPAGE                   | 🔒     |                                  |
| 12-5     | DELETE     | /recipe-books/{id}                     | MYPAGE                   | 🔒     |                                  |
| 12-6     | GET        | /recipe-books/{id}/recipes             | RECIPEBOOK_DETAIL        | 🔒     |                                  |
| 12-7     | DELETE     | /recipe-books/{id}/recipes/{id}        | RECIPEBOOK_DETAIL        | 🔒     | 카운트 갱신 명시                 |
| 12-8     | GET        | /shopping/lists                        | MYPAGE (장보기 기록)     | 🔒     |                                  |
| 13-1     | PATCH      | /users/me/settings                     | SETTINGS                 | 🔒     |                                  |
| 13-2     | PATCH      | /users/me                              | SETTINGS                 | 🔒     |                                  |
| 13-3     | DELETE     | /users/me                              | SETTINGS                 | 🔒     |                                  |
| 14-1     | GET        | /cooking-methods                       | 전역 (드롭다운)          | 🔓     |                                  |
| 15-1     | GET        | /api/v1/admin/users                    | ADMIN_USERS              | 🔐     | v1.2.12 신규                     |
| 15-2     | GET        | /api/v1/admin/operational-events       | ADMIN_EVENTS             | 🔐     | v1.2.12 신규                     |
| 15-3     | GET        | /api/v1/admin/audit-logs               | ADMIN_AUDIT_LOGS         | 🔐     | v1.2.12 신규                     |

> **v1.2.15 총계**: 61개 (YouTube visual quantity enrichment contract, 신규 endpoint 없음)
> **v1.2.14 총계**: 61개 (`POST /recipes/images` 이미지 업로드 endpoint 1개 추가, thumbnail_url/tags field 계약 보강)
> **v1.2.13 총계**: 60개 (2026-05-30 다중 후보 초안 endpoint 1개 추가)
> **v1.2.12 총계**: 58개 (Admin Foundation read-only endpoint 3개 추가)
> **v1.2.11 총계**: 55개 (slice27 taxonomy contract lock, 신규 endpoint 없음)
> **v1.2.10 총계**: 55개 (`DELETE /users/me` 회원 탈퇴 데이터 정리 정책 변경, 신규 endpoint 없음)
> **v1.2.9 총계**: 55개 (`POST /auth/login`, `PATCH /auth/profile` 제거. `PATCH /auth/profile` 대체는 `PATCH /users/me`)
> **v1.2.5 총계**: 51개 (신규 엔드포인트 없음, 기존 9-2 호출자 확장)
> **v1.2.5 변경**: `MEAL_SCREEN`에서 `shopping_done` 개별 식사의 `[요리하기]` 단축 경로를 `POST /cooking/sessions`(9-2)로 공식화. 서버 검증·DB 계약 변경 없음
> **v1.2.3 총계**: 51개 (`/planner/columns` 조회/추가/이름변경/삭제 4개 추가)
> **v1.2.3 변경**: `PLANNER_WEEK` 끼니 컬럼을 기본 3개 + 사용자 설정 관리로 정리하고 planner column 관리 API를 재도입
> **DB 연쇄 수정 필요**: shopping_list_items에 `sort_order` 컬럼 추가 (DB v1.3에서 반영)
