# Current Source of Truth

## Official Files
- `docs/요구사항기준선-v1.7.11.md`
- `docs/화면정의서-v1.5.18.md`
- `docs/유저flow맵-v1.3.18.md`
- `docs/db설계-v1.3.16.md`
- `docs/api문서-v1.2.20.md`

## Notes
- 위 5개 파일이 현재 공식 기준 문서다.
- `docs/reference/wireframes/`는 보조 참고 자료다.
- 구현 중 문서 충돌이 보이면 먼저 충돌 항목을 정리하고 작업 범위를 다시 확정한다.
- 사용자 승인으로 공식 계약을 바꾸는 경우에도 구현보다 문서가 먼저다. 관련 공식 문서와 이 파일의 버전/경로를 같은 `contract-evolution` PR에서 먼저 갱신한다.

## Shopping Already-Have Pantry Reflection Addendum `2026-06-20`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | 장보기 완료 시 팬트리 반영 후보에 구매 체크 항목뿐 아니라 `이미있음`으로 표시한 팬트리 제외 항목을 포함 |
| 화면정의서 v1.5.18 | `SHOPPING_DETAIL` 완료 팝업 표시 대상을 구매 체크 항목 + `이미있음` 항목으로 갱신하고 버튼/설명을 팬트리 “반영” 용어로 정리 |
| 유저플로우 v1.3.18 | 장보기 완료 flow에서 `is_pantry_excluded=true` 항목도 기본 반영 후보가 되며 기존 pantry row는 중복 INSERT하지 않는 흐름 추가 |
| DB v1.3.16 | `shopping_list_items.added_to_pantry` CHECK 의미를 구매 체크 항목 또는 `이미있음` 항목의 반영 처리로 완화 |
| API v1.2.20 | `POST /shopping/lists/{list_id}/complete`의 `add_to_pantry_item_ids` 기본값/선택값 후보 규칙에 `is_pantry_excluded=true` 항목 포함 |

> 이 변경은 manual UI/UX review plan 17번에 대한 사용자 승인 기반 contract-evolution addendum이다.
> `add_to_pantry_item_ids: []`는 계속 명시적 팬트리 미반영을 뜻한다.
> `is_checked=false AND is_pantry_excluded=false`인 미구매 구매 섹션 항목은 계속 반영 후보가 아니다.

## Recipe Tags Contract-Evolution `36a-recipe-tags-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | 레시피 태그를 서버 자동 추천 + 사용자 검수 기능으로 승격. P0 의미 태그 36개, 사용자 자유 태그와 시스템 의미 태그 경계, HOME theme eligibility 정책 추가 |
| 화면정의서 v1.5.18 | HOME 제목+태그 검색, tag chip 정확 필터, MANUAL_RECIPE_CREATE/YT_IMPORT 태그 추천·검수 UI 추가 |
| 유저플로우 v1.3.18 | YouTube/manual 등록 중 서버 추천 태그 생성 → 사용자 검수 → canonical tag 저장 → `recipes.tags` projection 흐름 추가 |
| DB v1.3.16 | `tags`, `recipe_tags` additive table target 추가. `recipes.tags`는 projection으로 유지. projection writer와 search/theme index 기준 추가. 테이블 수 33→35 |
| API v1.2.20 | `GET /tags`, `POST /recipes/tag-suggestions` 추가. `GET /recipes?tag=<normalized_key>`, 제목+승인 tag 검색, YouTube/manual reviewed `tags` body 확장. 엔드포인트 수 69→71 |

> 이 변경은 `36a-recipe-tags-contract-evolution` contract-evolution이다.
> 서버 자동 태그 추천 기능은 유지한다. 사용자가 태그를 수정하지 않으면 서버 추천값을 저장한다.
> 사용자 자유 tag는 표시/검색 가능하지만 HOME theme seed로 자동 승격하지 않는다. HOME theme는 public/approved/theme_eligible system semantic/source tag만 사용한다.
> `recipes.tags`는 카드/레거시 응답용 projection이며 canonical truth는 `tags` / `recipe_tags`다.
> P0 `normalized_key`는 한글 key를 그대로 사용하고 자동 romanization을 하지 않는다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후 36b~36e로 분리해 시작한다.

## Planner Column Reorder Addendum `2026-06-16`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.10 | SETTINGS 끼니 컬럼 관리 범위에 이름 변경/추가/삭제뿐 아니라 순서 변경을 포함 |
| 화면정의서 v1.5.17 | SETTINGS 컬럼 목록에서 드래그 핸들 또는 위/아래 이동 컨트롤로 순서 변경 가능, PLANNER_WEEK 표시 순서 반영 |
| 유저플로우 v1.3.17 | SETTINGS 순서 변경 flow와 `meal_plan_columns.sort_order` 업데이트 흐름 추가 |
| DB v1.3.15 | 신규 schema 없이 기존 `meal_plan_columns.sort_order`로 사용자별 0부터 연속 정렬 유지 |
| API v1.2.19 | `PATCH /planner/columns/{column_id}` body에 optional `sort_order` 허용. 신규 endpoint 없음, 엔드포인트 수 67 유지 |

> 이 변경은 사용자 승인에 따라 기존 구현과 공식 문서의 불일치를 닫는 contract-evolution addendum이다.
> `planner-column-customization` workpack은 순서 변경을 1차 범위 밖으로 보던 이전 문구를 철회하고, 이미 구현된 SETTINGS reorder를 공식 범위로 동기화한다.

## Growth Achievement Album Contract-Evolution `35a-growth-achievement-album-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.10 | §2-16 성장/업적 앨범 정책 추가: 퀘스트를 튜토리얼 전용으로 축소, tutorial category, category별 achievement threshold, achievement no-XP, `Clay`→`Titanium` 등급명 |
| 화면정의서 v1.5.17 | §19 MYPAGE 성장 UI를 profile header 내부 action button 구조로 갱신. 등급/업적/튜토리얼/알림 modal/bottom sheet, stamp grid, spoon grade asset 기준 추가 |
| 유저플로우 v1.3.17 | ⑪-b에 튜토리얼 업적 플로우, 업적 앨범 확인 플로우, notification priority 확장, silent backfill 흐름 추가 |
| DB v1.3.15 | `user_achievement_awards` additive table target 추가. `user_quest_progress`는 tutorial 호환 surface로 축소. notification type에 `achievement_unlocked` 추가. 테이블 수 32→33 |
| API v1.2.19 | `GET /users/me/gamification`에 `achievement_album`, tutorial category summary, spoon grade image fields additive 확장. 신규 endpoint 없음. 엔드포인트 수 67 유지 |

> 이 변경은 `35a-growth-achievement-album-contract-evolution` contract-evolution이다.
> 퀘스트는 신규/초기 사용자 튜토리얼 surface로 축소하고, 장기 목표는 업적 앨범으로 전환한다.
> 업적 달성은 XP를 추가 지급하지 않는다. XP source와 cap은 34b 성장 backend model 계약을 유지한다.
> 기존 `quests` API field는 호환성을 위해 유지하되 standard quest expansion은 중단한다.
> 35c review-loop amendment: 퀘스트 완료는 업적 앨범 tutorial 상태로만 표시하고 `quest_completed` notification row/toast는 만들지 않는다. 기존 `quest_completed` notification row는 cleanup migration으로 제거한다.
> 기존 유저 backfill은 achievement state만 조용히 반영하고 historical toast/archive row를 만들지 않는다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후 35b/35c로 분리해 시작한다.

## Growth Leveling Follow-up Contract-Evolution `34a-growth-model-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.9 | §2-16 성장/레벨링 v2 정책 추가: `planner_registered` XP source, 첫/반복 XP 분리와 cap, non-XP activity ledger, level curve v2, 등급명, 알림 우선순위, backfill no-toast, 장보기 list/bundle count 분리 |
| 화면정의서 v1.5.16 | §19 MYPAGE 성장 UI를 프로필 영역 통합 방향으로 갱신, toast stack/archive preview/locked badge hint/badge shape/장보기 안내 문구 추가 |
| 유저플로우 v1.3.16 | ⑪-a/⑪-b에 플래너 등록 XP, non-XP activity, priority toast stack, archive 조회, 장보기 리스트 기준/끼니 묶음 기준 분리 흐름 추가 |
| DB v1.3.14 | `user_progress_events` 확장, `user_growth_activity_events` 추가, `user_progress_summary.level_curve_version`, notification priority/channel/group/archive 필드 추가. 테이블 수 31→32 |
| API v1.2.18 | `GET /users/me/gamification` additive 확장, `GET /users/me/gamification/archive` 추가. `GET /users/me`와 `GET /users/me/progress` 경계 유지. 엔드포인트 수 66→67 |

> 이 변경은 `34a-growth-model-contract-evolution` contract-evolution이다.
> 33c의 “새 XP source 없음 / XP 배점 변경 없음” 제약은 34 시리즈 범위에서 명시적으로 대체된다.
> `GET /users/me`는 계속 profile/settings-only 계약을 유지한다. `GET /users/me/progress`는 progress-only 계약을 유지하며 badge/quest/toast/archive field를 포함하지 않는다.
> `user_growth_activity_events`는 XP를 주지 않는 배지/퀘스트/최근 성장 기록용 activity ledger이며, `user_progress_events`는 XP 지급 ledger로 유지한다.
> historical/backfill recompute는 기존 유저 레벨/상태 반영만 수행하고 toast/notification/archive row를 만들지 않는다.
> 경쟁 랭킹, 전체 순위, pressure streak, season reset, XP decay, loot-box/random reward는 계속 scope 밖이다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후에 시작한다.

## User Progress Gamification Contract-Evolution `33c-gamification`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.8 | §2-16-a 사용자 성장/배지/퀘스트 정책 추가: 33a canonical XP source 유지, badge/quest/tutorial/notification server authority, XP toast failure isolation, competitive/pressure/loot 제외 |
| 화면정의서 v1.5.15 | §19 MYPAGE §1-b 사용자 성장/배지/퀘스트 표시 추가: 대표 배지 row, badge guide modal/bottom sheet, active quest, tutorial quest, XP toast 위치/상태/금지사항 |
| 유저플로우 v1.3.15 | §⑪-b gamification 확인/XP toast 흐름 추가: MYPAGE surface, source action 후 notification refresh, soft-fail/seen 처리 |
| DB v1.3.13 | §11-2c~e 테이블 3종 추가: `user_badge_awards`, `user_quest_progress`, `user_progress_notifications`. unique/idempotency/seen 인덱스 추가. 테이블 수 28→31 |
| API v1.2.17 | §12-10~12 `GET /users/me/gamification`, `POST /users/me/gamification/notifications/seen`, `POST /users/me/gamification/tutorial-quests/{quest_key}/dismiss` 추가. 엔드포인트 수 63→66 |

> 이 변경은 `33c-badges-quests-toasts-tutorial` Stage 2/4 구현의 선행 contract-evolution이다.
> `GET /users/me`는 프로필/설정-only 계약을 유지한다. `GET /users/me/progress`는 33a response shape를 유지하며 badge/quest/toast/tutorial field를 포함하지 않는다.
> 33c는 33a의 4개 canonical event만 XP source로 사용한다. 새 XP source, 경쟁 랭킹, pressure streak, season reset, loot-box/random reward는 포함하지 않는다.
> badge/quest/notification projection 실패는 원래 source action 성공을 실패로 바꾸지 않는다.
> 구현(Stage 2)은 이 contract-evolution이 main에 merge된 후에 시작한다.

## User Progress Foundation Contract-Evolution `user-progress 예정`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | §2-16 사용자 진도 추적 정책 추가: 4개 canonical event, 전용 ledger/read model, `GET /users/me/progress` 전용 API, soft-fail, survivor-only backfill, leaderboard/streak/loot 제외 |
| 화면정의서 v1.5.14 | §19 MYPAGE §1-a 사용자 진도 표시(compact) 추가: progress subtitle/bar, soft-fail, 하드코딩 레벨 문구 제거, compact-only 제약 |
| 유저플로우 v1.3.14 | §⑪-a 사용자 진도 확인 서브플로우 추가: MYPAGE 계정 섹션 내 progress compact display, XP source events, 에러 처리, 화면↔여정 매핑 갱신 |
| DB v1.3.12 | §11-2 사용자 진도 테이블 2종 추가: `user_progress_events`(전용 ledger), `user_progress_summary`(projection/read model). canonical event map, backfill policy, 인덱스 추가. 테이블 수 26→28 |
| API v1.2.16 | §12-9 `GET /users/me/progress` 추가. `GET /users/me`는 profile/settings-only 유지. 33a response shape 확정. 33a non-fields(badge/quest/toast/timeline) 명시. 엔드포인트 수 v1.2.17 예정: 62→63 (1개 추가) |

> 이 변경은 `33a-user-progress-foundation`, `33b-mypage-progress-ui`, `33c-badges-quests-toasts-tutorial` 3개 slice의 선행 contract-evolution이다.
> `GET /users/me`는 프로필/설정-only 계약을 유지한다. progress 필드를 `/users/me`에 섞지 않는다.
> `operational_events`는 운영 로그이며, 사용자 보상 truth로 재사용하지 않는다.
> legacy backfill은 surviving rows 기준 lower-bound이다. 삭제된 활동은 복원됐다고 주장하지 않는다.
> 33a에 badge, quest, toast, tutorial, timeline, public backfill API는 포함하지 않는다.
> 구현(Stage 2)은 이 contract-evolution이 main에 merge된 후에 시작한다.

## Recipebook Diary Addendum (2026-06-10)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | 레시피북 리더에서 소유 레시피북의 재료/만들기를 읽기 전용으로 표시하고, 리더 상세 조회는 `view_count`를 증가시키지 않는 기준 추가 |
| 화면정의서 v1.5.14 | 마이페이지 레시피북 책장/인라인 상세, 커스텀 책 색상/커버 이미지 변경, 모바일 목차 중심 상세 기준 추가 |
| 유저플로우 v1.3.14 | 레시피북 리더가 목차 선택 후 재료/만들기를 표시하는 흐름으로 갱신 |
| DB v1.3.12 | `recipe_books.cover_color_key`, `recipe_books.cover_image_url` additive metadata 추가 |
| API v1.2.16 | `GET /recipe-books/{book_id}/recipes/{recipe_id}` read-only 리더 상세 endpoint와 레시피북 커버 메타데이터 필드 추가 |

> 이 변경은 사용자 승인(2026-06-10)에 따른 레시피북 다이어리/리더 contract-evolution이다.
> 레시피북 리더 상세 조회는 `GET /recipes/{id}`를 대체 호출하지 않으며 조회수를 증가시키지 않는다.
> 커버 메타데이터는 UI 표시용이며 저장 가능한 레시피북 타입과 권한 정책을 변경하지 않는다.

## v1.7.6 / v1.5.13 / v1.3.13 → v1.7.7 / v1.5.14 / v1.3.14 변경 이력 (2026-06-09)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | COOK_MODE를 현재 단계 중심에서 전체 재료 + 전체 조리순서 whole-board 모드로 변경. 단계 이동, 현재 단계 재료량 보드, 단계별 재료/불세기/조리시간 기본 표시 제거 |
| 화면정의서 v1.5.14 | COOK_MODE 재료 보드/조리순서 보드, 브랜드 파란색 수량·번호 박스, 조리방법 태그 위치, 실제 wake lock 활성 상태 표시 기준 추가 |
| 유저플로우 v1.3.14 | 플래너 경유와 독립 요리 COOK_MODE 흐름을 whole-board 확인 흐름으로 갱신 |
| DB v1.3.12 | 변경 없음 |
| API v1.2.16 | 변경 없음 |

> 이 변경은 사용자 승인(2026-06-09)에 따른 COOK_MODE whole-board UI contract-evolution이다.
> 기존 cook-mode 조회/완료/취소 API와 DB 상태 전이 계약은 변경하지 않는다.

## v1.7.5 / v1.5.12 / v1.3.12 / DB v1.3.11 / API v1.2.15 → v1.7.6 / v1.5.13 / v1.3.13 / DB v1.3.12 / API v1.2.16 변경 이력 (2026-06-09)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.6 | 재료 taxonomy v2 목표를 8대분류/21소분류로, 조리방법 taxonomy v2 목표를 6그룹/20대표 method로 확정. v1 category label 8종 호환 유지 |
| 화면정의서 v1.5.13 | HOME/PANTRY/직접등록/YT_IMPORT/상세/요리모드의 v2 표시 기준과 v1 label fallback, `씻기` 제외/`에어프라이어` 포함 표시 기준 추가 |
| 유저플로우 v1.3.13 | 재료 등록·검색·필터와 조리방법 선택·검수 흐름에 v2 mapping과 migration fallback 추가 |
| DB v1.3.12 | `ingredient_category_groups`, `ingredient_categories`, `ingredients.category_code`, `cooking_method_categories`, `cooking_methods.category_code`, `cooking_method_synonyms` additive migration target 추가 |
| API v1.2.16 | `GET /ingredients`, `POST /recipes/youtube/ingredient-registration`, `GET /cooking-methods`에 v2 optional field 계약 추가. 기존 endpoint 수와 v1 query/body/응답 shape 호환 유지 |

> 이 변경은 `docs/workpacks/taxonomy-v2-contract-evolution` contract-evolution이다.
> 계획대로 진행하면 전체 재료 카테고리는 사용자-facing 대분류 8개, 내부 소분류 21개가 된다.
> 조리방법은 6그룹, 20대표 method가 된다.
> `씻기`는 canonical method에서 제외하고, `에어프라이어`는 canonical method에 포함한다.
> v2 taxonomy는 additive migration으로 시작한다. `ingredients.category`, `GET /ingredients?category=<v1 label>`, YouTube ingredient registration의 v1 `category` body는 migration 동안 유지한다.
> 운영 DB 재분류는 idempotent migration과 review 가능한 mapping 근거가 있을 때만 수행하며, 외부 데이터 production 직적재는 계속 금지한다.

## Ingredient Fruit Category Addendum (2026-06-08)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.5 | 재료 카테고리 v1 canonical을 기존 7종에서 `과일` 포함 8종으로 확장 |
| 화면정의서 v1.5.12 | HOME/PANTRY/YT_IMPORT/직접등록 재료 category 선택지에 `과일` 추가 |
| 유저플로우 v1.3.12 | YouTube/직접등록/팬트리/HOME 흐름의 재료 category 확인 기준을 8종으로 갱신 |
| DB v1.3.11 | `ingredients.category` 허용 설명에 `과일` 추가, 기존 과일 seed/운영 row는 `과일`로 재분류 |
| API v1.2.15 | `GET /ingredients?category=`와 YouTube ingredient registration category 계약에 `과일` 추가 |

> 이 변경은 사용자 승인 요청(2026-06-08)에 따른 category expansion follow-up이다.
> 신규 `ingredient_categories` DB table/FK 전환은 계속 scope 밖이며, 기존 `ingredients.category` 문자열과 shared mapping source를 유지한다.
> 기존 DB에 `딸기`, `생딸기`, `사과`, `바나나`, `레몬`, `라임`, `오렌지`, `귤`, `배`, `키위`, `복숭아`, `포도`, `블루베리`, `망고`가 있으면 `과일`로 재분류한다.

## v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14 → v1.7.5 / v1.5.12 / v1.3.12 / DB v1.3.11 / API v1.2.15 변경 이력 (2026-06-02)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.5 | 공개 텍스트 추출 이후 조건부 `visual_quantity_extractor` enrichment 단계 추가, `YoutubeQuantitySource` enum, `quantity_confirmation_status` register 검증, `recipe_sources.extraction_methods` mismatch 정리 |
| 화면정의서 v1.5.12 | YT_IMPORT 검수 화면에 수량 provenance 배지, confirm/edit/clear 인터랙션, quick import 수량 리뷰 차단 추가 |
| 유저플로우 v1.3.12 | extract 후 visual quantity enrichment 흐름, 검수 화면 수량 확인 인터랙션, quick import review-required fallback 분기 추가 |
| DB v1.3.11 | `youtube_visual_extraction_cache`, `youtube_visual_extraction_events` 서버 전용 테이블 추가, `recipe_sources.extraction_methods` 설명을 실제 YouTube session 값에 맞게 정리 |
| API v1.2.15 | extract 응답 `ingredients[]`에 `quantity_*` review fields 추가, register에 `quantity_confirmation_status` 검증 추가, `source_providers`에 `visual_quantity_extractor` 계약 추가 |

> 이 변경은 `docs/workpacks/32-youtube-visual-quantity-enrichment` contract-evolution이다.
> visual enrichment는 원천 extraction method가 아니라 보조 enrichment이므로 `extraction_methods`는 `description | comment | caption`만 유지한다.
> `recipe_inferred` 수량은 사용자 확인 없이 register/quick auto-register할 수 없다.
> raw video, raw frame, raw provider response, API key, secret, 레시피오 data는 저장/반환하지 않는다.
> selected-frame OCR, Cloud Vision, ASR/STT는 v1 out of scope이다.

## v1.7.3 / v1.5.10 / v1.3.10 / DB v1.3.9 / API v1.2.13 → v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14 변경 이력 (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.4 | YouTube 등록 시 세션 썸네일을 `recipes.thumbnail_url`에 서버 측 복사, 직접 등록 이미지 업로드 정책, 공유 결정론 태그 생성기 정책 추가 |
| 화면정의서 v1.5.11 | RECIPE_DETAIL 썸네일 source note/placeholder, HOME/상세 태그 표시, MANUAL_RECIPE_CREATE 이미지 업로드, YT_IMPORT 썸네일/태그 preview 추가 |
| 유저플로우 v1.3.11 | YouTube register와 직접 등록에서 `thumbnail_url`/`tags`가 `recipes`에 저장되는 흐름 추가 |
| DB v1.3.10 | 기존 `recipes.thumbnail_url`/`recipes.tags` 활용 계약, `recipe-images` Storage bucket/policy 추가. 신규 recipe image/tag table은 scope 밖 |
| API v1.2.14 | `POST /api/v1/recipes/images` 추가, YouTube extract/register thumbnail/tags 계약, manual `POST /recipes` image reference 검증과 server-generated tags 계약 추가 |

> 이 변경은 `docs/workpacks/31-recipe-media-tags` contract-evolution이다.
> YouTube 썸네일은 다운로드/리호스팅하지 않고 원본 URL을 보존한다.
> 이미지 바이너리는 DB에 저장하지 않으며, 생성/AI 이미지 fallback과 정규화 tag table은 MVP scope 밖이다.

## YouTube Multi-Recipe Caption Addendum (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | 한 영상에 여러 요리가 있는 경우 공개 자막/설명/작성자 댓글에서 후보를 분리하고 사용자가 저장할 후보를 선택해야 함을 추가 |
| 화면정의서 v1.5.10 | YT_IMPORT 검수 화면에 요리 후보 목록과 후보 선택 로딩/오류 상태 추가 |
| 유저플로우 v1.3.10 | extract에서 `multi_parent` 세션과 후보 ledger를 만들고, 후보 선택 후 `candidate_child` 세션으로 register하는 흐름 추가 |
| DB v1.3.9 | `youtube_extraction_sessions.session_kind`, parent 참조 컬럼, `youtube_extraction_candidates` 후보 ledger 추가 |
| API v1.2.13 | extract 응답에 `multi_recipe_status`, `recipe_candidates[]`, source segment metadata 추가, `POST /recipes/youtube/candidate-drafts` 추가 |

> v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14는 이 addendum을 포함한 v1.7.3 계열 문서를 기준으로 작성한다.
> 특정 video_id별 결과 fixture, 레시피오 결과 반환은 금지한다. 공개 텍스트 provider/parser를 우선 사용하고, 아래 Gemini addendum의 조건을 만족하는 경우에만 구조화 fallback을 허용한다.

## Gemini YouTube Structured Fallback Addendum (2026-06-01)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.4 | 설명란/작성자 댓글/caption parser가 재료 또는 조리 단계를 충분히 만들지 못하거나 자막/전사 parser 결과가 대화 파편 중심으로 저품질일 때 env/한도/cache/근거 검증 기반 Gemini structured fallback 허용 |
| 화면정의서 v1.5.11 | YT_IMPORT 처리 파이프라인에 Gemini 구조화 보조 단계를 추가하되 source label은 설명란/작성자 댓글/자막으로 유지 |
| 유저플로우 v1.3.11 | extract 단계에서 공개 텍스트 파싱 후 부족한 경우 Gemini JSON 구조화 보조를 거치는 흐름 추가 |
| DB v1.3.10 | `youtube_llm_extraction_cache`, `youtube_llm_extraction_events` 서버 전용 cache/event 테이블 추가 |
| API v1.2.14 | `source_providers`의 `gemini_structured_extractor`, `gemini_structured_extractor_cache`와 `extraction_meta_json.llm_extractor.parser_quality` 포함 provenance 계약 추가 |

> Gemini는 원천 source가 아니라 이미 수집한 공개 텍스트를 정리하는 보조 extractor다. `extraction_methods`는 `description` / `comment` / `caption`만 유지한다.
> API key, provider raw response, secret, 레시피오 결과, 영상별 fixture는 저장하거나 반환하지 않는다.

## v1.7.2 / v1.5.9 / v1.3.9 / DB v1.3.8 / API v1.2.12 → v1.7.3 / v1.5.10 / v1.3.10 / DB v1.3.9 / API v1.2.13 변경 이력 (2026-05-28)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | YouTube 추출/등록의 ingredient/step `component_label` 영속화, 상세/요리모드 섹션 소제목 표시, manual create 비확장 명시 |
| 화면정의서 v1.5.10 | YT_IMPORT 검수, RECIPE_DETAIL, COOK_MODE의 인접 label heading 규칙과 중복 prefix 억제 규칙 추가 |
| 유저플로우 v1.3.10 | extract → review → register → DB → detail/cook-mode까지 `component_label` 보존 흐름 추가 |
| DB v1.3.9 | `recipe_ingredients.component_label`, `recipe_steps.component_label` nullable 컬럼 추가 |
| API v1.2.13 | `POST /recipes/youtube/extract`, `POST /recipes/youtube/register`, recipe detail, cook-mode 응답에 nullable `component_label` 추가. `POST /recipes` manual body는 no-`component_label`로 분리 |

> 이 변경은 `docs/workpacks/28-youtube-section-label-persistence` contract-evolution이다.
> `component_label`은 표시용 metadata이며 shopping aggregation, manual create authoring, pantry consumed checklist semantics는 변경하지 않는다.

## Low-cost YouTube Transcript Fallback Addendum (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | YouTube extract가 설명란/작성자 댓글만으로 부족할 때 transcript cache → 공개 timedtext → cookie retry → 제한적 Apify fallback 순서로 자막/전사를 보완할 수 있음을 명시. paid fallback은 env/일일 한도 없이는 비활성화 |
| API v1.2.13 | §6 공통 정책에 transcript fallback 순서, Apify env, secret logging 금지, `source_providers`/`transcript_provider` provenance 계약 추가 |
| DB v1.3.9 | `youtube_transcript_cache`, `youtube_transcript_fetch_events` 서버 전용 테이블 추가. 90일 TTL cache와 provider/user daily limit 집계를 지원 |

> 이 addendum은 무료 공개 텍스트를 먼저 쓰고 실패 시에만 제한적 유료 transcript API를 쓰기 위한 contract-evolution이다.
> 오디오 STT/Whisper, 로그인/소유자 전용 caption download, 영상 ID별 fixture 반환은 범위 밖이다.

## Recipio-style YouTube Import Parity Addendum (2026-05-28)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.2 | §2-4에 레시피오형 빠른 유튜브 가져오기 모드 추가: 중복 확인 → 미리보기 → 비동기 진행률 → 자동 등록, 단 검수 필요 draft는 기존 YT_IMPORT 검수 화면으로 fallback |
| 화면정의서 v1.5.9 | §10에 `/recipes/new/youtube` 별도 진입면, 추천 영상 카드, 중복 카드, 진행률, 검수 fallback 상태 추가 |
| 유저플로우 v1.3.9 | ⑨에 Quick Import 분기 추가: `GET /recipes/youtube/recipio/check`로 중복 확인 후 기존 validate/extract/register 계약 재사용 |
| API v1.2.12 | §6-5 `GET /api/v1/recipes/youtube/recipio/check` 추가. 새 저장 계약은 만들지 않고 기존 §6-1/6-2/6-4를 순차 소비 |
| DB v1.3.8 | 변경 없음. `recipe_sources.youtube_video_id`와 기존 `youtube_extraction_sessions`/RPC를 재사용 |

> 이 addendum은 사용자가 승인한 레시피오형 UX flow parity 구현이다.
> 신규 LLM/이미지 생성/유료 provider 계약은 추가하지 않는다.
> quick import는 기존 YouTube import feature flag/auth guard를 그대로 따른다.
> 2026-05-29 clarification: 여기서 parity는 UX flow parity만 의미한다. 특정 YouTube video_id별로 레시피오 생성 데이터를 코드 fixture로 반환하는 shortcut은 금지하며, 중복 확인을 제외한 신규 추출은 항상 provider/parser 경로를 거친다.

## v1.7.1 / v1.5.8 / v1.3.8 / DB v1.3.7 / API v1.2.11 → v1.7.2 / v1.5.9 / v1.3.9 / DB v1.3.8 / API v1.2.12 변경 이력 (2026-05-27)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.2 | §1-11 내부 운영 관리 (Admin Foundation) 추가: 읽기 전용 MVP 범위, admin_members 기반 접근 제어, PII 최소화, 운영 이벤트/감사 로깅 정책. §2-14 관리자 접근 정책 추가 |
| 화면정의서 v1.5.9 | Admin Foundation 화면 4종 추가: ADMIN_DASHBOARD, ADMIN_USERS, ADMIN_EVENTS, ADMIN_AUDIT_LOGS. 각 화면 loading/empty/error/read-only/unauthorized/forbidden(403) 상태 정의 |
| 유저플로우 v1.3.9 | ⑫ 내부 운영 관리 플로우 추가: 관리 대시보드 진입, 사용자 목록 조회, 운영 이벤트 조회, 감사 로그 조회. 화면↔여정 매핑 테이블에 Admin 4화면 추가 |
| DB v1.3.8 | §12 Admin Foundation 테이블 3종 추가: admin_members (관리자 신원), operational_events (시스템 운영 이벤트), admin_audit_logs (관리자 감사 로그). service-role 전용 RLS, 인덱스 정의 |
| API v1.2.12 | Admin Foundation 엔드포인트 3종 추가: `GET /api/v1/admin/users`, `GET /api/v1/admin/operational-events`, `GET /api/v1/admin/audit-logs`. createServiceRoleClient() 필수, 감사 로그 기록, PII 최소화. 엔드포인트 수 55 → 58 |

> 이 변경은 Admin Foundation (내부 운영 관리 기반) contract-evolution이다.
> 런칭 초기 운영에 필요한 최소한의 내부 관리 기반을 공식 문서 5종에 추가한다.
> MVP 범위는 읽기 전용이며, 파괴적 관리 동작(사용자 정지·삭제·수정, 레시피 삭제 등)은 scope 밖이다.
> 모든 admin API는 `createServiceRoleClient()` 필수, `routeClient` 폴백 금지, service-role 부재 시 fail closed.
> admin_members 최초 등록은 Supabase SQL/service-role로 직접 수행하며, 환경변수 허용목록 우회 없음.
> 구현(Stage 2)은 별도 Stage 1 workpack/acceptance re-lock PR이 main에 merge되고 pending recheck가 해소될 때까지 시작하지 않는다.

## v1.7.0 / v1.5.7 / v1.3.7 / DB v1.3.6 / API v1.2.10 → v1.7.1 / v1.5.8 / v1.3.8 / DB v1.3.7 / API v1.2.11 변경 이력 (2026-05-25)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.1 | slice27 선행 taxonomy contract lock: legacy 7 ingredient category freeze, additive shadow taxonomy 원칙, cooking method optional metadata, `label` non-overload, external data staging-only gate 명시 |
| 화면정의서 v1.5.8 | HOME/PANTRY/YT_IMPORT 화면의 category 선택지는 legacy 7종 label 유지, 조리방법 label/color_key 소비 유지, 외부 데이터 자동 직수입 금지 명시 |
| 유저플로우 v1.3.8 | YouTube/직접등록/팬트리/HOME 흐름에서 legacy category와 shared mapping source 원칙, 외부 데이터 staging/review/approved seed gate 명시 |
| DB v1.3.7 | schema DDL 없이 `ingredients.category` legacy 7종 유지, ingredient registry/FK cutover 제외, `cooking_methods.label` taxonomy 과적재 금지, 외부 raw data production 직적재 금지 명시 |
| API v1.2.11 | `GET /ingredients?category=`와 `POST /recipes/youtube/ingredient-registration.category`는 legacy 7종 label 계약 유지. `GET /cooking-methods` v1 shape 유지, endpoint 수 55개 유지 |

> 이 변경은 `pre-27-taxonomy-consumer-alignment` Phase 1 Contract Lock 보강이다.
> slice27 YouTube 개선 전까지 “현재 MVP 소비 경로는 legacy 7 category + shared mapping/helper를 사용한다”는 계약을 공식 문서 5종에 고정한다.
> 2026-06-08 Ingredient Fruit Category Addendum이 category count만 `과일` 포함 8종으로 supersede한다. shared mapping/helper, 신규 DB registry table 제외, 외부 데이터 staging-only 원칙은 그대로 유지한다.
> 식약처/농식품올바로 등 외부 데이터 ingestion runtime은 이 변경의 범위 밖이며, production 직적재는 금지된다.

## v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.9 → v1.7.0 / v1.5.7 / v1.3.7 / DB v1.3.6 / API v1.2.10 변경 이력 (2026-05-24)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.0 | §2-9 회원 탈퇴 정책: 사용자 개인 기록은 삭제하고, 직접/유튜브로 등록한 레시피는 작성자 정보 없이 보존. 동일 소셜 계정 재로그인 시 이전 개인 기록이 보이지 않아야 함 |
| 화면정의서 v1.5.7 | SETTINGS 회원 탈퇴 확인 문구와 성공 후 HOME 이동/재로그인 기대 결과를 새 삭제 정책에 맞게 정리 |
| 유저플로우 v1.3.7 | MYPAGE → SETTINGS → 회원탈퇴 flow에 private data cleanup, authored recipe anonymize 보존, 새 bootstrap 재로그인 상태 추가 |
| DB v1.3.6 | `delete_user_private_data(p_user_id)` RPC 추가. `users` 삭제 cascade로 개인 데이터 정리, `recipes.created_by`는 `ON DELETE SET NULL`, save/like count 재계산 |
| API v1.2.10 | `DELETE /users/me` 동작을 soft-delete에서 private data cleanup으로 변경. 엔드포인트 수 55개 유지 |

> 이 변경은 RC-MO-06 account deletion/rejoin evidence에서 확인된 “탈퇴 후 재로그인 시 기존 저장/플래너 데이터가 유지됨” 문제를 닫기 위한 contract-evolution이다.
> release 전 visible delete-account action의 안내 문구와 실제 데이터 정책을 일치시킨다.

## API v1.2.8 → API v1.2.9 변경 이력 (2026-05-23)

| 문서 | 변경 내용 |
|------|----------|
| API v1.2.9 | `POST /auth/login`, `PATCH /auth/profile` 제거. 현재 웹 로그인은 Supabase OAuth callback을 사용하고, 닉네임 설정/변경은 `PATCH /users/me`가 담당한다. 엔드포인트 전체 목록 active method/path 수를 55개로 정리 |

> 이 변경은 MVP 1 계약 위험 잠금 중 `CR-002` contract-evolution이다.
> 두 endpoint는 route와 테스트는 있었지만 현재 웹 화면에서 직접 소비하지 않았다.
> 구현을 보존해 unused public auth surface를 늘리는 대신 공식 API 계약과 route/test를 함께 정리한다.

## API v1.2.7 → API v1.2.8 변경 이력 (2026-05-22)

| 문서 | 변경 내용 |
|------|----------|
| API v1.2.8 | `POST /auth/refresh` 제거. 현재 인증 세션 갱신은 Supabase SDK / `@supabase/ssr` 세션 관리에 위임하며, 실제 route/화면/테스트 소비자가 없는 public refresh endpoint를 새로 만들지 않음. 엔드포인트 전체 목록 active method/path 수를 57개로 정리 |

> 이 변경은 MVP 1 계약 위험 잠금 중 `CR-001` contract-evolution이다.
> `docs/api문서-v1.2.7.md`에는 `POST /auth/refresh`가 남아 있었지만 `app/api/v1/auth/refresh/route.ts`, 화면 호출, 테스트가 없었다.
> 구현을 추가하지 않고 공식 API 계약에서 제거해 실제 인증 구조와 문서 계약을 맞춘다.

## v1.6.8 / v1.5.5 / v1.3.5 / DB v1.3.4 / API v1.2.6 → v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.7 변경 이력 (2026-05-22)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.9 | §2-4 유튜브 레시피 추출 정책: DB에 없는 재료를 사용자 확인 후 새 표준 재료로 등록하는 흐름, `draft_ingredient_id`, RPC 기반 ingredient/synonym 등록, client-side resolved 전환 정책 추가 |
| 화면정의서 v1.5.6 | §10 YT_IMPORT: unresolved / needs_review 재료 row에 [새 재료로 등록] fallback 추가, 등록 sheet/modal, 성공/실패 상태, `draft_json` 불변 정책 명시 |
| 유저플로우 v1.3.6 | ⑨ 유튜브 등록 여정: 검수 단계의 검색 교체 / 새 재료 등록 분기, `POST /recipes/youtube/ingredient-registration`, 데이터 변화에 ingredients/ingredient_synonyms 추가 |
| DB v1.3.5 | `youtube_extraction_sessions.draft_json.ingredients[]`의 `draft_ingredient_id` 계약, `register_youtube_ingredient(...)` RPC, ambiguous synonym best-effort skip 정책 추가 |
| API v1.2.7 | §6: extract ingredient 응답에 `draft_ingredient_id` 추가, §6-3 `POST /recipes/youtube/ingredient-registration` 신규, 기존 register를 §6-4로 이동, 엔드포인트 목록 갱신 |

> 이 변경은 슬라이스 22 YouTube 미등록 재료 등록 contract-evolution이다.
> 매번 migration으로 신규 재료를 추가하지 않고, YT_IMPORT 검수 단계에서 사용자 확인 후 `ingredients` / `ingredient_synonyms`를 안전하게 갱신하는 경로를 공식화한다.
> 새 등록은 자동 실행하지 않으며, session 소유권·만료·`draft_ingredient_id`를 검증한다. registration API는 session `draft_json`을 수정하지 않고, 클라이언트가 현재 검수 row를 `resolved`로 전환한다.

## v1.6.7 / v1.5.4 / v1.3.4 / DB v1.3.3 / API v1.2.5 → v1.6.8 / v1.5.5 / v1.3.5 / DB v1.3.4 / API v1.2.6 변경 이력 (2026-05-21)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.8 | §2-4 유튜브 레시피 등록: oEmbed 미리보기 후 extract 단계에서 3-way classification(recipe/uncertain/non_recipe), YouTube Data API videos.list 기반 실제 추출, 서버 세션 관리(24h TTL), ingredient resolution_status, step incomplete detection, 원자적 RPC 등록, provenance session FK |
| 화면정의서 v1.5.5 | §10 YT_IMPORT: oEmbed 미리보기, extract 단계 3-way classification UI(uncertain 경고/non_recipe 차단), indeterminate progress, ingredient resolution_status 배지, step incomplete_fields blocking/warning, 저장 활성화 조건, 세션 기반 원자적 등록 |
| 유저플로우 v1.3.5 | ⑨ 유튜브 등록 여정: oEmbed 미리보기, extract 단계 classification 분기, description-first 추출 + 세션 생성, resolution/incomplete 검수, RPC 등록 + 소유권 검증, 데이터 변화 테이블에 youtube_extraction_sessions 추가 |
| DB v1.3.4 | §4-2 youtube_extraction_sessions 신규 테이블 추가(classification, extracted_data, status, 24h TTL). §4-3 recipe_sources에 youtube_extraction_session_id FK 추가 |
| API v1.2.6 | §6 전면 개정: validate는 oEmbed 미리보기 + uncertain 반환, extract는 videos.list 기반 classification/session_id/resolution_status/incomplete_fields/draft_warnings, register는 session_id 기반 소유권/만료/소비 검증 + 에러 코드(404/409/410/422), provider 에러(502/429), feature flag(404 FEATURE_DISABLED) |

> 이 변경은 슬라이스 20 YouTube 실제 API description-first 추출 contract-evolution이다.
> 슬라이스 19의 deterministic stub 추출을 실제 YouTube Data API videos.list 기반으로 교체하고, validate 단계는 quota를 쓰지 않는 oEmbed 미리보기로 제한하며, 서버 세션 관리·ingredient resolution·step incomplete·원자적 RPC 등록·provenance session FK를 도입한다.
> 공개 작성자 댓글과 공개 caption timedtext는 description-first 보조 source로 허용하며, extraction_methods 배열에는 `description`, `comment`, `caption`만 기록한다. ASR/LLM/OCR/추정 레이어는 scope 밖이다.

## v1.6.6 / v1.5.3 / v1.3.3 / API v1.2.4 → v1.6.7 / v1.5.4 / v1.3.4 / API v1.2.5 변경 이력 (2026-05-18)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.7 | PL-03: `MEAL_SCREEN`에서 `shopping_done` 상태 개별 식사에 `[요리하기]` 단축 경로 추가. `registered` 상태는 대상 제외(장보기 우회 불가). 독립 요리 시맨틱 변경 없음 |
| 화면정의서 v1.5.4 | `MEAL_SCREEN` §6에 개별 식사 `[요리하기]` 버튼 정의 추가. `COOK_MODE` §14에 MEAL_SCREEN 복귀 경로 추가 |
| 유저플로우 v1.3.4 | ③ 식단 계획 여정에 `MEAL_SCREEN → COOK_MODE → MEAL_SCREEN` 경로 추가. ⑤ 요리하기 여정에 ⑤-b 개별 식사 단축 경로 추가 |
| DB v1.3.3 (유지) | 변경 없음 — 기존 `cooking_sessions`, `cooking_session_meals`, `meals` 테이블 구조 그대로 사용 |
| API v1.2.5 | 9-2 `POST /cooking/sessions`의 허용 호출자에 `MEAL_SCREEN` 추가. 단일 `meal_id`로 호출하는 사용 패턴 공식화. 신규 엔드포인트 없음, 서버 검증 변경 없음 |

> 이 변경은 사용자 승인(2026-05-18)을 기반으로 한 PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로 contract-evolution이다.
> 기존 `POST /cooking/sessions` 계약을 `MEAL_SCREEN`에서 단일 meal_id로 호출하는 planner 세션 단축 경로를 공식화한다.
> `registered` → `cook_done` 전이는 금지되며, `shopping_done`을 거친 식사만 대상이다.

## v1.6.5 / v1.5.2 / v1.3.2 / DB v1.3.2 / API v1.2.3 → v1.6.6 / v1.5.3 / v1.3.3 / DB v1.3.3 / API v1.2.4 변경 이력 (2026-05-12)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.6 | Wave1 prototype parity 결정 반영: HOME 최신순, SavePopup multi-save, 장보기 기록 다시열기, 남은요리/레시피북 상세 메타 확장, prototype visual 우선 |
| 화면정의서 v1.5.3 | HOME 정렬 옵션, SavePopup multi-select, LoginGateModal visual/behavior 경계, 장보기 기록 `다시열기`, LEFTOVERS/ATE_LIST/RECIPEBOOK_DETAIL 카드 메타 확정 |
| 유저플로우 v1.3.3 | 탐색 정렬, multi-save, 장보기 기록 read-only reopen, 남은요리/레시피북 상세 메타 flow 갱신 |
| DB v1.3.3 | `leftover_dishes.cooking_servings` 추가, HOME 최신순/남은요리 메타 조회 인덱스 추가, 기존 `completed_at` 재사용 명시 |
| API v1.2.4 | `GET /recipes sort=latest`, `POST /recipes/{id}/save book_ids[]`, `/shopping/lists completed_at`, `/leftovers` 카드 메타, `/recipe-books/{id}/recipes` 메타 확장 |

> 이 변경은 사용자 승인(2026-05-12)을 기반으로 한 Wave1 prototype parity contract-evolution이다.
> Phase4 재진행 전에 official MVP 기능 계약과 fixed prototype visual 기준의 충돌을 줄이기 위한 선행 문서 잠금이다.

## v1.6.4 / v1.5.1 / v1.3.1 / DB v1.3.1 / API v1.2.2 → v1.6.5 / v1.5.2 / v1.3.2 / DB v1.3.2 / API v1.2.3 변경 이력 (2026-05-10)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.5 | 기본 끼니 컬럼을 `아침 / 점심 / 저녁` 3개로 변경하고, 설정에서 이름 변경/추가/삭제 가능하도록 승인 |
| 화면정의서 v1.5.2 | `PLANNER_WEEK`는 사용자별 동적 끼니 컬럼을 표시하고, `SETTINGS`에 끼니 컬럼 관리 섹션을 추가 |
| 유저플로우 v1.3.2 | 신규 회원 bootstrap은 `meal_plan_columns ×3`, 설정에서 컬럼 관리 flow 추가 |
| DB v1.3.2 | `meal_plan_columns` 공개 정책을 기본 3개 + 사용자 관리 1~5개로 변경, 빈 컬럼만 삭제 가능 |
| API v1.2.3 | `GET/POST/PATCH/DELETE /planner/columns` 계약 추가, 중복명/최대개수/최소개수/식사 연결 삭제 제한 명시 |

> 이 변경은 사용자 승인(2026-05-10)을 기반으로 한 planner column customization contract-evolution이다.
> 기존 사용자에게 이미 생성된 컬럼은 자동 삭제하지 않고, 설정 화면에서 사용자가 직접 정리할 수 있게 한다.

## v1.6.3 / v1.5.0 / v1.3.0 → v1.6.4 / v1.5.1 / v1.3.1 변경 이력 (2026-04-27)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.4 | PLANNER_WEEK의 "가로 스크롤 없음" 잠금을 제거하고 Baemin prototype planner reference를 우선 기준으로 채택 |
| 화면정의서 v1.5.1 | PLANNER_WEEK §5: H2/H4의 vertical-only day-card overview, planner-level no-horizontal-scroll, 기존 slot-row layout lock을 prototype parity 범위에서 supersede |
| 유저플로우 v1.3.1 | §③ 식단 계획 여정: prototype reference와 동일한 localized scroll/swipe/peek affordance를 허용 |
| API (v1.2.2 유지) | 변경 없음 — `GET /planner`, planner-related mutation 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 — `meal_plan_columns`, `meals` 구조 동일 |

> 이 변경은 사용자 승인(2026-04-27)을 기반으로 한 Baemin prototype parity contract-evolution이다.
> `PLANNER_WEEK` 구현은 prototype reference를 우선하되, 의도치 않은 page-level horizontal overflow는 계속 UI 결함으로 본다.

## v1.2.3 → v1.3.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.0 | PLANNER_WEEK §5: day card 본문을 2×2 grid → 세로 slot row 방식으로 변경, 가로 스크롤 전면 제거, 5-column 정보 축약 원칙 추가 |
| 유저플로우 v1.3.0 | §③ 식단 계획 여정: 세로 스크롤 중심 탐색 명시, 가로 스크롤 없음 선언 |
| API (v1.2.2 유지) | 변경 없음 — `GET /planner` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 — `meal_plan_columns`, `meals` 구조 동일 |

> 이 변경은 H4 gate 승인(2026-04-16)을 기반으로 한 H2 Stage 1 contract-evolution이다.
> H2 FE 구현(`feature/fe-planner-week-v2`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.0 → v1.3.1 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.1 | RECIPE_DETAIL §3: PlannerAddPopup UX 확정 — 성공 후 토스트만 표시(PLANNER_WEEK 이동 없음), 토스트 텍스트 `N월 D일 끼니에 추가됐어요`, 이후 follow-up에서 선택 날짜는 활성 칩으로만 확인하도록 단순화 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H3 planner-add-sync Stage 1 사용자 승인(2026-04-17)을 기반으로 한 contract-evolution이다.
> H3 FE 구현(`feature/fe-h3-planner-add-sync`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.1 → v1.4.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.4.0 | HOME §1: 테마 섹션을 2열 카드 그리드에서 compact horizontal carousel strip(1.5장 peek, ~130px)으로 변경 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `GET /recipes`, `GET /themes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H1 home-first-impression Stage 1 사용자 승인(2026-04-17, D1/D2/D3/D4)을 기반으로 한 contract-evolution이다.
> 정렬 컨트롤 위치·재료 필터 위치는 현행 유지. 테마 섹션 형태만 변경.
> H1 FE 구현(`feature/fe-h1-home-first-impression`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.4.0 follow-up note (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.4.0 | RECIPE_DETAIL PlannerAddPopup: 선택 날짜를 보여주는 별도 확인 라벨 제거. 날짜 선택 상태는 활성 날짜 칩으로만 확인. |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 사용자 승인 하의 H3 planner-add 후속 UI polish를 반영한 경미한 contract follow-up이다.
> 성공 토스트 포맷과 이동 정책은 그대로 유지되며, 날짜 선택 확인 방식만 단순화됐다.

## v1.4.0 → v1.5.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.5.0 | `PlannerAddPopup`, `SavePopup`, `INGREDIENT_FILTER_MODAL`, HOME 정렬 선택 UI를 Quiet Kitchen Sheets 기준으로 재정의. eyebrow 제거, icon-only close, `olive base + thin orange highlight`, PlannerAdd 날짜 chip `요일 + 4/17`, Save 제목 `레시피 저장` 확정 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals`, `POST /recipes/{id}/save`, `GET /ingredients`, `GET /recipes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H5 modal-system-direction Stage 1 사용자 승인(2026-04-17, D1~D6)을 기반으로 한 contract-evolution이다.
> h5 modal system redesign FE 구현(`feature/fe-h5-modal-system-redesign`)은 이 문서 갱신 이후에 시작할 수 있다.
