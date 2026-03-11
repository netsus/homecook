# API\_설계\_v1.2.1

상태: 공식문서
담당자: 킴실장
날짜: 3월 5

# 집밥 서비스 — API 설계 v1.2.1

> 기준 문서: 요구사항 기준선 v1.6 / 화면정의서 v1.2 / DB 설계 v1.3 / 유저 Flow맵 v1.2
> 작성: 킴실장
> v1.1 → v1.2: 채실장 2차 리뷰 A1~A4 + 장보기 구현 아이디어 반영
> v1.2 → v1.2.1: 채실장 3차 리뷰 P0 4건 + P1 3건 (예시 수정 + 정책 문구 추가, 엔드포인트 변경 없음)

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

### 0-1. 소셜 로그인

```
POST /auth/login
```

🔓 비로그인

| 구분 | 필드         | 타입   | 설명                         |
| ---- | ------------ | ------ | ---------------------------- |
| Body | provider     | string | `kakao` / `naver` / `google` |
| Body | access_token | string | 소셜 제공자에서 받은 토큰    |

**응답 (200)**

```json
{
  "token": "jwt-access-token",
  "refresh_token": "jwt-refresh-token",
  "user": {
    "id": "uuid",
    "nickname": "집밥러",
    "email": "user@example.com",
    "profile_image_url": "https://...",
    "is_new_user": false
  }
}
```

### 0-2. 닉네임 설정 (신규 회원)

```
PATCH /auth/profile
```

🔒 로그인 필수

| 구분 | 필드     | 타입   | 설명            |
| ---- | -------- | ------ | --------------- |
| Body | nickname | string | 닉네임 (2~30자) |

**응답 (200)**: 업데이트된 user 객체

> 회원가입 완료 시 서버 자동 생성: meal_plan_columns ×3, recipe_books ×3

### 0-3. 토큰 갱신

```
POST /auth/refresh
```

🔓 비로그인

| 구분 | 필드          | 타입   | 설명          |
| ---- | ------------- | ------ | ------------- |
| Body | refresh_token | string | 리프레시 토큰 |

**응답 (200)**

```json
{
  "token": "new-jwt-access-token",
  "refresh_token": "new-jwt-refresh-token"
}
```

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
| Query | sort           | string? | `view_count`(기본) / `like_count` / `save_count` / `plan_count` |
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
      "source_type": "youtube"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": true
}
```

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
      "id": "uuid",
      "title": "이번 주 인기 레시피",
      "recipes": [
        /* 레시피 카드 배열 (최대 10개) */
      ]
    }
  ]
}
```

### 1-3. 재료 목록 조회 (재료 필터용)

```
GET /ingredients
```

🔓 비로그인

| 구분  | 필드     | 타입    | 설명                          |
| ----- | -------- | ------- | ----------------------------- |
| Query | q        | string? | 재료명 검색 (표준명 + 동의어) |
| Query | category | string? | 카테고리 필터                 |

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
      "scalable": false,
      "sort_order": 5
    }
  ],
  "steps": [
    {
      "id": "uuid",
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
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

> 비로그인 시 `user_status`는 null. 조회 시 view_count += 1.

### 2-2. 좋아요 토글

```
POST /recipes/{recipe_id}/like
```

🔒 로그인 필수

**응답 (200)**

```json
{ "is_liked": true, "like_count": 341 }
```

### 2-3. 레시피 저장 (레시피북에 추가)

```
POST /recipes/{recipe_id}/save
```

🔒 로그인 필수

| 구분 | 필드    | 타입 | 설명               |
| ---- | ------- | ---- | ------------------ |
| Body | book_id | uuid | 저장할 레시피북 ID |

**응답 (200)**

```json
{ "saved": true, "save_count": 211, "book_id": "uuid" }
```

> **저장 가능 book_type 제한** `v1.2.1 추가book_type`이 `saved` 또는 `custom`인 레시피북만 허용한다.
> `book_type='my_added'` 또는 `'liked'`에 저장 시 **409 CONFLICT** 반환.
> (my_added는 레시피 생성 시 자동 포함, liked는 좋아요 토글로만 관리)

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

### 3-2. 끼니 컬럼 추가

```
POST /planner/columns
```

🔒 로그인 필수

| 구분 | 필드 | 타입   | 설명   |
| ---- | ---- | ------ | ------ |
| Body | name | string | 컬럼명 |

> 최대 5개 제한. 초과 시 409 CONFLICT

### 3-3. 끼니 컬럼 수정

```
PATCH /planner/columns/{column_id}
```

🔒 로그인 필수

| 구분 | 필드       | 타입    | 설명        |
| ---- | ---------- | ------- | ----------- |
| Body | name       | string? | 변경할 이름 |
| Body | sort_order | int?    | 변경할 순서 |

### 3-4. 끼니 컬럼 삭제

```
DELETE /planner/columns/{column_id}
```

🔒 로그인 필수

> 소속 meals 1개 이상 존재 시 **409 CONFLICT**. 식사 먼저 삭제/이동 후 컬럼 삭제.

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

## 6. 유튜브 레시피 등록 (YT_IMPORT)

> 화면: `YT_IMPORT` / Flow: ⑨ 유튜브 등록 여정

### 6-1. 유튜브 URL 검증 (Step 1 + Step 1.5)

```
POST /recipes/youtube/validate
```

🔒 로그인 필수

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**응답 (200) — 레시피 영상 확인**

```json
{
  "is_valid_url": true,
  "is_recipe_video": true,
  "video_info": {
    "video_id": "abc123",
    "title": "백종원 김치찌개",
    "channel": "백종원의 요리비책",
    "thumbnail_url": "https://..."
  }
}
```

**응답 (200) — 레시피 아님 판정**

```json
{
  "is_valid_url": true,
  "is_recipe_video": false,
  "video_info": { ... },
  "message": "이 영상은 요리 레시피가 아닌 것 같아요"
}
```

### 6-2. 유튜브 레시피 추출 (Step 2)

```
POST /recipes/youtube/extract
```

🔒 로그인 필수

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**응답 (200)**

```json
{
  "extraction_id": "uuid",
  "title": "백종원 김치찌개",
  "base_servings": 2,
  "extraction_methods": ["description", "ocr"],
  "ingredients": [
    {
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "ingredient_id": "uuid",
      "confidence": 0.95
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "cooking_method": {
        "id": "uuid",
        "code": "prep",
        "label": "손질",
        "color_key": "gray",
        "is_new": false
      },
      "duration_text": null
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
  ]
}
```

> 미분류 조리방법은 이 단계에서 즉시 INSERT → id 포함 반환.
> `color_key: "unassigned"`: 프론트는 fallback 색상(회색 계열) 적용.

### 6-3. 유튜브 레시피 등록 확정 (Step 3 → Step 4)

```
POST /recipes/youtube/register
```

🔒 로그인 필수

| 구분 | 필드          | 타입   | 설명                  |
| ---- | ------------- | ------ | --------------------- |
| Body | extraction_id | string | 추출 ID               |
| Body | title         | string | 레시피명              |
| Body | base_servings | int    | 기본 인분             |
| Body | youtube_url   | string | 유튜브 URL            |
| Body | ingredients   | array  | 검수/수정된 재료 목록 |
| Body | steps         | array  | 검수/수정된 스텝 목록 |

**ingredients 항목**: `{ ingredient_id, standard_name, amount, unit, ingredient_type, display_text, sort_order }`

**steps 항목**: `{ step_number, instruction, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text }`

> `cooking_method_id`만 수신 (항상 uuid 필수).

**응답 (201)**

```json
{ "recipe_id": "uuid", "title": "백종원 김치찌개" }
```

---

## 7. 직접 레시피 등록 (MANUAL_RECIPE_CREATE)

> 화면: `MANUAL_RECIPE_CREATE` / Flow: ⑩ 직접 등록 여정

### 7-1. 직접 레시피 등록

```
POST /recipes
```

🔒 로그인 필수

| 구분 | 필드          | 타입   | 설명                        |
| ---- | ------------- | ------ | --------------------------- |
| Body | title         | string | 레시피명                    |
| Body | base_servings | int    | 기본 인분                   |
| Body | ingredients   | array  | 재료 목록 (6-3과 동일 형식) |
| Body | steps         | array  | 스텝 목록 (6-3과 동일 형식) |

**응답 (201)**: 생성된 recipe 객체

> source_type = ‘manual’ 자동 설정

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

> 화면: `COOK_READY_LIST`, `COOK_MODE` / Flow: ⑤ 요리하기(플래너 경유), ⑧ 독립 요리

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

> **서버 검증**: meal_ids 소유자, status=‘shopping_done’, recipe_id 일치 확인

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
        "ingredient_type": "QUANT",
        "scalable": true
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "instruction": "김치를 한입 크기로 썬다",
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
      "status": "leftover",
      "cooked_at": "2026-03-01T18:00:00Z",
      "eaten_at": null
    }
  ]
}
```

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
      "added_at": "2026-03-01T10:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

> 서버는 `book_type`에 따라 조회 소스 분기 (12-2 가상 책 정책 참조)

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
      "item_count": 12,
      "created_at": "2026-03-01T09:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

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

> 소프트 삭제 (deleted_at 세팅)

---

## 14. 조리방법 마스터 (보조)

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

## 엔드포인트 전체 목록 (50개) `v1.2.1 업데이트`

| #        | Method     | Path                                   | 화면                     | 인증   | v1.2 변경                        |
| -------- | ---------- | -------------------------------------- | ------------------------ | ------ | -------------------------------- |
| 0-1      | POST       | /auth/login                            | LOGIN                    | 🔓     |                                  |
| 0-2      | PATCH      | /auth/profile                          | LOGIN                    | 🔒     |                                  |
| 0-3      | POST       | /auth/refresh                          | -                        | 🔓     |                                  |
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
| 3-2      | POST       | /planner/columns                       | PLANNER_WEEK             | 🔒     |                                  |
| 3-3      | PATCH      | /planner/columns/{id}                  | PLANNER_WEEK             | 🔒     |                                  |
| 3-4      | DELETE     | /planner/columns/{id}                  | PLANNER_WEEK             | 🔒     |                                  |
| 4-1      | GET        | /meals                                 | MEAL_SCREEN              | 🔒     |                                  |
| 4-2      | PATCH      | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 4-3      | DELETE     | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 5-4      | GET        | /recipes/pantry-match                  | MENU_ADD                 | 🔒     |                                  |
| 6-1      | POST       | /recipes/youtube/validate              | YT_IMPORT                | 🔒     |                                  |
| 6-2      | POST       | /recipes/youtube/extract               | YT_IMPORT                | 🔒     |                                  |
| 6-3      | POST       | /recipes/youtube/register              | YT_IMPORT                | 🔒     |                                  |
| 7-1      | POST       | /recipes                               | MANUAL_RECIPE_CREATE     | 🔒     |                                  |
| 8-1      | GET        | /shopping/preview                      | SHOPPING_FLOW            | 🔒     |                                  |
| 8-2      | POST       | /shopping/lists                        | SHOPPING_FLOW            | 🔒     | sort_order, added_to_pantry 추가 |
| 8-3      | GET        | /shopping/lists/{id}                   | SHOPPING_DETAIL          | 🔒     | tie-breaker 명시                 |
| 8-4      | PATCH      | /shopping/lists/{id}/items/{id}        | SHOPPING_DETAIL          | 🔒     | 완료 후 409 추가                 |
| **8-4b** | **PATCH**  | **/shopping/lists/{id}/items/reorder** | **SHOPPING_DETAIL**      | **🔒** | **신규**                         |
| 8-5      | POST       | /shopping/lists/{id}/complete          | SHOPPING_DETAIL          | 🔒     | 검증 규칙 + null/[] 구분         |
| 8-6      | GET        | /shopping/lists/{id}/share-text        | SHOPPING_DETAIL          | 🔒     | 제외 항목 미포함 명시            |
| 9-1      | GET        | /cooking/ready                         | COOK_READY_LIST          | 🔒     |                                  |
| 9-2      | POST       | /cooking/sessions                      | COOK_READY_LIST          | 🔒     |                                  |
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

> **v1.2.1 총계**: 50개 (엔드포인트 변경 없음)
> **v1.2.1 변경**: 예시 수정 + 정책 문구 추가 (P0 4건 + P1 3건)
> **DB 연쇄 수정 필요**: shopping_list_items에 `sort_order` 컬럼 추가 (DB v1.3에서 반영)
