# Current Source of Truth

## Official Files
- `docs/요구사항기준선-v1.7.3.md`
- `docs/화면정의서-v1.5.10.md`
- `docs/유저flow맵-v1.3.10.md`
- `docs/db설계-v1.3.9.md`
- `docs/api문서-v1.2.13.md`

## Notes
- 위 5개 파일이 현재 공식 기준 문서다.
- `docs/reference/wireframes/`는 보조 참고 자료다.
- 구현 중 문서 충돌이 보이면 먼저 충돌 항목을 정리하고 작업 범위를 다시 확정한다.
- 사용자 승인으로 공식 계약을 바꾸는 경우에도 구현보다 문서가 먼저다. 관련 공식 문서와 이 파일의 버전/경로를 같은 `contract-evolution` PR에서 먼저 갱신한다.

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

## Recipio-style YouTube Import Parity Addendum (2026-05-28)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.2 | §2-4에 레시피오형 빠른 유튜브 가져오기 모드 추가: 중복 확인 → 미리보기 → 비동기 진행률 → 자동 등록, 단 검수 필요 draft는 기존 YT_IMPORT 검수 화면으로 fallback |
| 화면정의서 v1.5.9 | §10에 `/recipes/new/youtube` 별도 진입면, 추천 영상 카드, 중복 카드, 진행률, 검수 fallback 상태 추가 |
| 유저플로우 v1.3.9 | ⑨에 Quick Import 분기 추가: `GET /recipes/youtube/recipio/check`로 중복 확인 후 기존 validate/extract/register 계약 재사용 |
| API v1.2.12 | §6-5 `GET /api/v1/recipes/youtube/recipio/check` 추가. 새 저장 계약은 만들지 않고 기존 §6-1/6-2/6-4를 순차 소비 |
| DB v1.3.8 | 변경 없음. `recipe_sources.youtube_video_id`와 기존 `youtube_extraction_sessions`/RPC를 재사용 |

> 이 addendum은 사용자가 승인한 레시피오 parity 구현이다.
> 신규 LLM/이미지 생성/유료 provider 계약은 추가하지 않는다.
> quick import는 기존 YouTube import feature flag/auth guard를 그대로 따른다.

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
> Caption/ASR/LLM/OCR/추정 레이어는 scope 밖이며, extraction_methods 배열에 `description`만 기록한다.

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
