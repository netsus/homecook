# MVP 1 계약 위험 목록표

작성일: 2026-05-22
마지막 업데이트: 2026-05-24

## 기준

공식 기준 문서는 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`에 고정된 아래 5개 파일이다.

| 구분 | 공식 문서 |
| --- | --- |
| 요구사항 | `docs/요구사항기준선-v1.6.9.md` |
| 화면 | `docs/화면정의서-v1.5.6.md` |
| 유저 flow | `docs/유저flow맵-v1.3.6.md` |
| DB | `docs/db설계-v1.3.5.md` |
| API | `docs/api문서-v1.2.9.md` |

## 대조 방법

| 항목 | 기준 |
| --- | --- |
| API 문서 endpoint | `docs/api문서-v1.2.9.md`의 `엔드포인트 전체 목록` 표 |
| 실제 route | `app/api/v1/**/route.ts`의 exported HTTP method |
| 화면에서 씀? | `app/**`, `components/**`, `lib/api/**`에서 해당 `/api/v1/...` 호출 또는 API client 연결 확인 |
| 테스트 있음? | `tests/**`에서 route import, API URL, E2E route mock, backend test 확인 |
| Manual Only? | 관련 `docs/workpacks/**/acceptance.md`의 `Manual Only` 미완료 항목 기준 |

> API 문서의 path는 Base URL 규약에 따라 `/api/v1` prefix를 붙여 대조했다.

## 요약

| 분류 | 결과 |
| --- | --- |
| API 문서 active method/path 수 | 55개 |
| 실제 `app/api/v1` method/path 수 | 55개 |
| 문서에는 있는데 route가 없는 endpoint | 0개 |
| route는 있는데 API 문서에 없는 endpoint | 0개 |
| 삭제된 endpoint 복원 여부 | `DELETE /api/v1/recipes/{id}/save` route 없음. 현재 상태 정상 |
| 문서 내부 카운트 | `docs/api문서-v1.2.9.md`에서 active 55개로 정리 |

## 우선 위험

| ID | 우선순위 | 위험 유형 | 항목 | 판단 | 다음 액션 |
| --- | --- | --- | --- | --- | --- |
| CR-001 | 완료 | `DOC_ONLY` | `POST /api/v1/auth/refresh` | API 문서에는 있었으나 route, 화면 호출, 테스트가 없었다. 현재 인증 구조는 Supabase SDK / `@supabase/ssr` 세션 관리에 의존한다. | `docs/api문서-v1.2.8.md`에서 endpoint 제거 완료. |
| CR-002 | 완료 | `NO_DIRECT_UI` | `POST /api/v1/auth/login`, `PATCH /api/v1/auth/profile` | route와 테스트는 있었으나 현재 웹 로그인 화면은 Supabase client OAuth/password 흐름을 직접 사용한다. 닉네임 변경은 `PATCH /users/me`가 담당한다. | `docs/api문서-v1.2.9.md`에서 endpoint 제거, route/test 삭제 완료. |
| CR-003 | 완료 | `DOC_META_DRIFT` | `엔드포인트 전체 목록` | v1.2.7 표 제목은 `52개`였지만 active method/path는 58개였다. | `docs/api문서-v1.2.9.md`에서 active 55개로 정리 완료. |
| CR-004 | P0/P1 | `MANUAL_ONLY_RELEASE_CHECK` | live OAuth, 실제 YouTube API, 실제 Supabase/production seed, 모바일 실기기 확인 | 구현 계약과 별개로 release 전에 사람이 확인해야 하는 항목이다. RC-MO-01 live OAuth / return-to-action, RC-MO-02 real-device mobile smoke, RC-MO-03 live YouTube registration smoke, RC-MO-04 staging DB compatibility smoke, RC-MO-05 stale Manual Only classification은 evidence로 통과했다. 원본 Manual Only 123개는 이미 확인됨, 아직 필요함, deferred, stale-candidate로 분류했다. | `docs/workpacks/beta-release-manual-checklist-2026-05-04.md`의 `CR-004 Release Candidate Tracking` 표로 이관했다. 남은 release-gate 후보는 recipebook remove/save removal, account deletion/rejoin처럼 실제로 보이는 destructive action만 안전한 테스트 계정으로 확인하거나 명시적으로 defer/hide 결정한다. |

## Endpoint 목록표

| # | API 문서 endpoint | 화면 | route 있음? | 화면에서 씀? | 테스트 있음? | Manual Only? | 위험 유형 / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0-4 | `POST /api/v1/auth/logout` | SETTINGS | 예 | 예 | 예 | 있음 | release 전 live OAuth 설정 화면 smoke 필요. |
| 1-1 | `GET /api/v1/recipes` | HOME | 예 | 예 | 예 | 없음 | OK. |
| 1-2 | `GET /api/v1/recipes/themes` | HOME | 예 | 예 | 예 | 없음 | OK. |
| 1-3 | `GET /api/v1/ingredients` | HOME / 필터 | 예 | 예 | 예 | 완료 기록 | seed/성능 수동 smoke 기록 있음. |
| 2-1 | `GET /api/v1/recipes/{id}` | RECIPE_DETAIL | 예 | 예 | 예 | 없음 | OK. |
| 2-2 | `POST /api/v1/recipes/{id}/like` | RECIPE_DETAIL | 예 | 예 | 예 | 완료 기록 | OAuth return-to-action smoke 기록 있음. |
| 2-3 | `POST /api/v1/recipes/{id}/save` | RECIPE_DETAIL | 예 | 예 | 예 | 있음 | 구 acceptance에 저장 해제/상세 노출 확인 항목이 남아 있어 stale 여부 확인 필요. |
| 2-4 | `DELETE /api/v1/recipes/{id}/save` | - | 삭제됨 | 아니오 | N/A | N/A | 삭제 endpoint. 되살리면 안 됨. 저장 해제는 12-7 사용. |
| 2-5 | `POST /api/v1/meals` | RECIPE_DETAIL / MENU_ADD | 예 | 예 | 예 | 있음 | live OAuth return-to-action, 실제 owner 검증 manual check 남음. |
| 3-1 | `GET /api/v1/planner` | PLANNER_WEEK | 예 | 예 | 예 | 완료 기록 | OK. |
| 3-2 | `GET /api/v1/planner/columns` | SETTINGS | 예 | 예 | 예 | 있음 | 기존 production 사용자 컬럼 호환성 확인 필요. |
| 3-3 | `POST /api/v1/planner/columns` | SETTINGS | 예 | 예 | 예 | 있음 | 기존 production 사용자 컬럼 호환성 확인 필요. |
| 3-4 | `PATCH /api/v1/planner/columns/{id}` | SETTINGS | 예 | 예 | 예 | 있음 | 기존 production 사용자 컬럼 호환성 확인 필요. |
| 3-5 | `DELETE /api/v1/planner/columns/{id}` | SETTINGS | 예 | 예 | 예 | 있음 | 기존 production 사용자 컬럼 호환성 확인 필요. |
| 4-1 | `GET /api/v1/meals` | MEAL_SCREEN | 예 | 예 | 예 | 있음 | live DB 상태별 end-to-end 확인 필요. |
| 4-2 | `PATCH /api/v1/meals/{id}` | MEAL_SCREEN | 예 | 예 | 예 | 있음 | live DB 상태별 end-to-end 확인 필요. |
| 4-3 | `DELETE /api/v1/meals/{id}` | MEAL_SCREEN | 예 | 예 | 예 | 있음 | live DB 상태별 end-to-end 확인 필요. |
| 5-4 | `GET /api/v1/recipes/pantry-match` | MENU_ADD | 예 | 예 | 예 | 있음 | live OAuth/system book bootstrap 확인 항목과 함께 봐야 한다. |
| 6-1 | `POST /api/v1/recipes/youtube/validate` | YT_IMPORT | 예 | 예 | 예 | 있음 | 실제 YouTube API key/live URL smoke 필요. |
| 6-2 | `POST /api/v1/recipes/youtube/extract` | YT_IMPORT | 예 | 예 | 예 | 있음 | 실제 YouTube API key/live URL smoke 필요. |
| 6-3 | `POST /api/v1/recipes/youtube/ingredient-registration` | YT_IMPORT | 예 | 예 | 예 | 있음 | 실제 YouTube API description 추출 환경에서 선택 smoke 필요. |
| 6-4 | `POST /api/v1/recipes/youtube/register` | YT_IMPORT | 예 | 예 | 예 | 있음 | 실제 YouTube API key/live URL smoke 필요. |
| 7-1 | `POST /api/v1/recipes` | MANUAL_RECIPE_CREATE | 예 | 예 | 예 | 있음 | 조리방법 색상, 운영 데이터 synonym 확인 필요. |
| 8-1 | `GET /api/v1/shopping/preview` | SHOPPING_FLOW | 예 | 예 | 예 | 있음 | 실제 Supabase seed -> planner -> shopping preview 확인 필요. |
| 8-2 | `POST /api/v1/shopping/lists` | SHOPPING_FLOW | 예 | 예 | 예 | 있음 | 실제 Supabase seed -> planner -> shopping create 확인 필요. |
| 8-3 | `GET /api/v1/shopping/lists/{id}` | SHOPPING_DETAIL | 예 | 예 | 예 | 있음 | shopping create 이후 detail load manual check와 연결. |
| 8-4 | `PATCH /api/v1/shopping/lists/{id}/items/{id}` | SHOPPING_DETAIL | 예 | 예 | 예 | 확인 필요 | workpack manual section이 placeholder 형태라 release checklist 정리 필요. |
| 8-4b | `PATCH /api/v1/shopping/lists/{id}/items/reorder` | SHOPPING_DETAIL | 예 | 예 | 예 | 확인 필요 | workpack manual section이 placeholder 형태라 release checklist 정리 필요. |
| 8-5 | `POST /api/v1/shopping/lists/{id}/complete` | SHOPPING_DETAIL | 예 | 예 | 예 | 있음 | 팬트리 반영 팝업/선택 액션 manual UI check가 남아 있다. |
| 8-6 | `GET /api/v1/shopping/lists/{id}/share-text` | SHOPPING_DETAIL | 예 | 예 | 예 | 확인 필요 | workpack manual section이 placeholder 형태라 release checklist 정리 필요. |
| 9-1 | `GET /api/v1/cooking/ready` | COOK_READY_LIST | 예 | 예 | 예 | 있음 | live OAuth 및 장보기 완료부터 이어지는 end-to-end 확인 필요. |
| 9-2 | `POST /api/v1/cooking/sessions` | COOK_READY_LIST / MEAL_SCREEN | 예 | 예 | 예 | 있음 | live OAuth 및 장보기 완료부터 이어지는 end-to-end 확인 필요. |
| 9-3 | `GET /api/v1/cooking/sessions/{id}/cook-mode` | COOK_MODE | 예 | 예 | 예 | 있음 | live OAuth, 모바일 실기기, 전체 flow 확인 필요. |
| 9-3b | `GET /api/v1/recipes/{id}/cook-mode` | COOK_MODE | 예 | 예 | 예 | 있음 | 독립 요리 live OAuth/mobile 확인 필요. |
| 9-4 | `POST /api/v1/cooking/sessions/{id}/complete` | COOK_MODE | 예 | 예 | 예 | 있음 | planner -> shopping -> cook complete end-to-end 확인 필요. |
| 9-5 | `POST /api/v1/cooking/sessions/{id}/cancel` | COOK_MODE | 예 | 예 | 예 | 있음 | cook mode live/mobile 확인과 함께 봐야 한다. |
| 9-6 | `POST /api/v1/cooking/standalone-complete` | COOK_MODE | 예 | 예 | 예 | 있음 | 독립 요리 완료 -> leftover 확인 필요. |
| 10-1 | `GET /api/v1/leftovers` | LEFTOVERS / ATE_LIST | 예 | 예 | 예 | 있음 | live OAuth, 30일 경과 숨김, 모바일 실기기 확인 필요. |
| 10-2 | `POST /api/v1/leftovers/{id}/eat` | LEFTOVERS | 예 | 예 | 예 | 있음 | live OAuth 및 모바일 터치 확인 필요. |
| 10-3 | `POST /api/v1/leftovers/{id}/uneat` | ATE_LIST | 예 | 예 | 예 | 있음 | live OAuth 및 모바일 터치 확인 필요. |
| 11-1 | `GET /api/v1/pantry` | PANTRY | 예 | 예 | 예 | 있음 | live OAuth return-to-action, production/staging seed 확인 필요. |
| 11-2 | `POST /api/v1/pantry` | PANTRY | 예 | 예 | 예 | 있음 | live OAuth return-to-action, production/staging seed 확인 필요. |
| 11-3 | `DELETE /api/v1/pantry` | PANTRY | 예 | 예 | 예 | 있음 | live OAuth return-to-action, production/staging seed 확인 필요. |
| 11-4 | `GET /api/v1/pantry/bundles` | PANTRY_BUNDLE_PICKER | 예 | 예 | 예 | 있음 | production/staging bundle seed 확인 필요. |
| 12-1 | `GET /api/v1/users/me` | MYPAGE | 예 | 예 | 예 | 있음 | live OAuth 프로필 이미지/provider 표시 확인 필요. |
| 12-2 | `GET /api/v1/recipe-books` | MYPAGE | 예 | 예 | 예 | 있음 | live OAuth/mobile tab UX 확인 필요. |
| 12-3 | `POST /api/v1/recipe-books` | MYPAGE | 예 | 예 | 예 | 있음 | live OAuth/mobile tab UX 확인 필요. |
| 12-4 | `PATCH /api/v1/recipe-books/{id}` | MYPAGE | 예 | 예 | 예 | 있음 | live OAuth/mobile tab UX 확인 필요. |
| 12-5 | `DELETE /api/v1/recipe-books/{id}` | MYPAGE | 예 | 예 | 예 | 있음 | live OAuth/mobile tab UX 확인 필요. |
| 12-6 | `GET /api/v1/recipe-books/{id}/recipes` | RECIPEBOOK_DETAIL | 예 | 예 | 예 | 있음 | 실 OAuth/실기기 recipebook detail 진입 확인 필요. |
| 12-7 | `DELETE /api/v1/recipe-books/{id}/recipes/{id}` | RECIPEBOOK_DETAIL | 예 | 예 | 예 | 있음 | 실 OAuth/실기기 제거 동작 확인 필요. |
| 12-8 | `GET /api/v1/shopping/lists` | MYPAGE / 장보기 기록 | 예 | 예 | 예 | 있음 | live OAuth/mobile tab UX 확인 필요. |
| 13-1 | `PATCH /api/v1/users/me/settings` | SETTINGS | 예 | 예 | 예 | 있음 | live OAuth, 실기기 화면 꺼짐 방지 UX 확인 필요. |
| 13-2 | `PATCH /api/v1/users/me` | SETTINGS | 예 | 예 | 예 | 있음 | live OAuth 설정 화면 확인 필요. |
| 13-3 | `DELETE /api/v1/users/me` | SETTINGS | 예 | 예 | 예 | 있음 | 회원 탈퇴 후 동일 소셜 계정 재가입 가능 여부 확인 필요. |
| 14-1 | `GET /api/v1/cooking-methods` | 전역 / 드롭다운 | 예 | 예 | 예 | 있음 | 조리방법 색상 시각 확인과 연결. |

## 해결된 계약 위험

| ID | 이전 항목 | 처리 | 근거 |
| --- | --- | --- | --- |
| CR-001 | `POST /api/v1/auth/refresh` | `docs/api문서-v1.2.8.md`에서 제거 | 현재 앱은 Supabase OAuth callback, browser/server Supabase client, `getSession()`, `onAuthStateChange()`로 세션을 관리한다. 별도 public refresh route 소비자가 없다. |
| CR-002 | `POST /api/v1/auth/login`, `PATCH /api/v1/auth/profile` | `docs/api문서-v1.2.9.md`에서 제거, route/test 삭제 | 현재 웹 LOGIN은 Supabase OAuth callback을 사용한다. `PATCH /auth/profile` 대체는 `PATCH /users/me`다. |
| CR-003 | `엔드포인트 전체 목록 (52개)` | `docs/api문서-v1.2.9.md`에서 active 55개로 정리 | CR-001/CR-002 제거 후 공식 API endpoint 수와 실제 `app/api/v1` method/path 수가 55개로 일치한다. |

## Manual Only 묶음

Manual Only는 구현 누락과 다르다. 하지만 release 전에 사람이 확인해야 하는 검증 구멍이므로 `Release Candidate 체크`에 포함한다.

실행표 위치: `docs/workpacks/beta-release-manual-checklist-2026-05-04.md`의 `CR-004 Release Candidate Tracking`.

| 묶음 | 관련 endpoint | 남은 확인 |
| --- | --- | --- |
| live OAuth / return-to-action | auth, like/save, meals, pantry, cooking, leftovers, mypage/settings | RC-MO-01 통과. 실제 소셜 로그인, return-to-action, logout/re-login stale session check, Playwright Live OAuth run 확인 완료. |
| 실제 YouTube API | `POST /recipes/youtube/*` | RC-MO-03 통과. staging에서 실제 YouTube 레시피 등록까지 완료. URL shape matrix, quota, classification accuracy는 YouTube hardening backlog로 분리. |
| 실제 DB / 운영 seed | ingredients, pantry bundles, planner columns, shopping, recipe books | RC-MO-04 통과. staging schema/seed와 실제 Google 계정 데이터 호환 smoke 확인 완료. production-only cutover 확인은 production 전용 deferred 항목. |
| 모바일 실기기 / visual | shopping complete popup, cook mode, leftovers, settings wake lock, cooking method color | RC-MO-02 통과. 막히는 화면, 안 눌리는 버튼, 하단 CTA 가림, 서버 에러, 무한 로딩 없음. 세부 visual/taste/animation은 design backlog로 분리. |
| 오래된 acceptance 정리 | recipe save, shopping 10a/10b/11 일부, `_template`, 과거 wave/design polish 항목 | RC-MO-05 통과. placeholder는 stale-candidate, 디자인/미래방향은 deferred, 진짜 남은 destructive action은 별도 release-gate 후보로 분리. |

## A 담당 다음 순서

1. 완료(2026-05-23): `Manual Only 묶음`을 RC 체크리스트로 옮기고, 각 항목에 owner/date/status/evidence 칸을 붙였다.
2. 완료(2026-05-23): `RC-MO-01 live OAuth / return-to-action`은 staging URL, Google OAuth, logout/re-login stale session check, GitHub `Playwright Live OAuth` run evidence로 통과했다.
3. 완료(2026-05-24): `RC-MO-02 real-device mobile / visual`은 실제 모바일 smoke에서 blocking screen, unclickable button, bottom CTA overlap, server error, infinite loading 없이 통과했다.
4. 완료(2026-05-24): `RC-MO-03 live YouTube API`는 Vercel YouTube import env 활성화 후 staging에서 실제 YouTube 레시피 등록까지 통과했다.
5. 완료(2026-05-24): `RC-MO-04` shopping/pantry/leftovers/기존 데이터 호환 smoke는 staging에서 통과했다.
6. 완료(2026-05-24): `RC-MO-05`에서 원본 Manual Only 123개를 already-covered, still-required, deferred, stale-candidate로 분류했다.
7. 다음: public beta 전에 보이는 destructive action만 안전한 테스트 계정으로 확인한다. 우선 후보는 recipebook remove/save removal, account deletion/rejoin이다.
8. 다음: YouTube import의 조리방법 분류가 모두 `절이기`로 잡히는 품질 문제는 별도 개선 작업으로 분리한다.
