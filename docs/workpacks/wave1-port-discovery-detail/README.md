# Slice: wave1-port-discovery-detail

## Goal

HOME과 RECIPE_DETAIL 화면, recipe save modal, login provider display를 Wave1 fixed prototype 기준으로 다시 Phase4 prep한 뒤 Phase5에서 실제 서비스에 재포팅한다. Historical closeout(PR #374)은 보존하지만, 현재 완료 근거로 재사용하지 않는다. 이번 재진입 기준은 fixed reference 대비 100% mobile visual/layout parity이며, 기능 동작은 현재 MVP 구현과 official docs가 source of truth다.

Phase4 prep의 목표는 구현이 아니라 준비 산출물을 잠그는 것이다: current service screenshots, fixed reference mapping, prototype-vs-service diff table, computed-style/geometry audit plan, MVP regression lock, PR-ready evidence checklist. Phase5에서만 UI repair를 시작한다.

## Branches

- 프론트엔드: `feature/fe-wave1-port-discovery-detail`

## In Scope

- 화면: HOME, RECIPE_DETAIL, recipe save modal, login screen
- API: official API v1.2.4 계약 확인 필요
  - `GET /api/v1/recipes?sort=latest`
  - `POST /api/v1/recipes/{id}/save` with `book_ids[]`
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### HOME Phase4 Prep / Phase5 Repair Scope

- fixed reference 대비 current service 390px/320px screenshot 비교
- HOME header, hero/search, theme carousel, sort dropdown/open state, filter chip rail, recipe card density, HOME-owned bottom tab을 diff table에 기록
- HOME 정렬은 official `latest` sort를 포함한다. 노출 옵션은 `조회수순 / 최신순 / 저장순 / 플래너 등록순` 기준으로 검증한다.
- Slice A에서 정비한 `SortDropdown` primitive를 화면 문맥에서 소비하되, HOME placement/copy는 Slice B에서 검증한다.
- HOME 기존 MVP 기능: 검색, 재료 필터, theme carousel, sort query, recipe card navigation, planner banner navigation을 보존한다.

### RECIPE_DETAIL Phase4 Prep / Phase5 Repair Scope

- fixed reference 대비 current service 390px/320px screenshot 비교
- hero image, title/meta, action metric cluster, bookmark/save affordance, tab layout, ingredients/method sections, sticky CTA bar를 diff table에 기록
- official detail response의 `like_count`, `save_count`, `plan_count`, `cook_count`, `user_status.saved_book_ids`를 그대로 소비한다.
- `view_count`는 데이터 보존하되 화면 노출 정책이 fixed reference와 official docs에 맞는지 Phase4에서 재확인한다.
- 기존 MVP 기능: like/save/planner-add/cook entry, tab switching, serving controls where allowed, login gate return-to-action을 보존한다.

### Recipe Save Modal Phase4 Prep / Phase5 Repair Scope

- fixed reference 대비 current service screenshot 비교
- multi-select save flow는 official `book_ids[]` 계약을 사용한다. Prototype multi-save를 기능 divergence로 분류하지 않는다.
- 새 레시피북 만들기 인라인 UI와 기존 `{ success, data, error }` wrapper를 유지한다.
- duplicate/already-saved 상태는 API response의 `already_saved_book_ids`와 UI 안내가 서로 맞아야 한다.

### Login Provider Display Phase4 Prep / Phase5 Repair Scope

- fixed reference와 current service login/login-gate provider display를 비교한다.
- FE 표시 기준은 네이버/Google만 유지한다.
- 실제 Supabase provider disable은 이 슬라이스 범위 밖이다. 운영 config 변경이 필요하면 Contract Evolution Candidate로 분리한다.

## Out of Scope

- PLANNER_WEEK, SHOPPING, COOK_MODE 화면 변경 (Slice C~D)
- PANTRY, MYPAGE, SETTINGS 화면 변경 (Slice E~F)
- API/DB/status/endpoint/field 임의 추가 또는 변경
- 새 npm dependency 추가
- fixed prototype에 없는 새 visual concept 추가
- 기존 global legacy token 값을 Wave1 mobile repair 명목으로 전역 교체
- `view_count` sort option 완전 삭제 또는 official sort 계약 변경
- Supabase auth provider config 변경 (운영 정책 변경)
- 플래너 컬럼 CRUD (이미 `planner-column-customization`에서 완료)
- `baemin-prototype-home-porting` 소유의 HOME 전용 bottom tab / hero / promo strip 구조 변경 (해당 slice가 이미 merged)
- 레시피 카드 컴포넌트의 구조적 변경 (recipe-card.tsx의 정보 구조 유지, 시각 정리만)
- RECIPE_DETAIL 리뷰 탭 별점 → 행동 metric 전환 (데이터 소스 부재 → 별도 계약 검토 필요 시)
- 화면별 state UI 전체 리디자인. fixed reference가 없는 상태는 `wave1-derived-state-ui-prep` 기준을 Slice B 범위 안에서 필요한 만큼만 확산한다.

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` ~ `19-youtube-import` | merged | [x] |
| `planner-column-customization` | merged | [x] |
| `baemin-prototype-home-porting` | merged | [x] PR #297 |
| `baemin-prototype-home-parity` | merged | [x] |
| `baemin-prototype-recipe-detail-parity` | merged | [x] |
| `baemin-style-home-retrofit` | merged | [x] |
| `baemin-style-recipe-detail-retrofit` | merged | [x] |
| `wave1-port-foundation` | merged | [x] PR #372, #373, Phase4 foundation re-audit PR #432 |

### baemin-prototype-home-porting 충돌 분석

- **현재 상태**: `merged` (PR #297). HOME에 prototype AppBar, hero, search pill, inline chip rail, theme carousel, promo strip, HOME 전용 bottom tab이 도입됐다.
- **충돌 위험**: 이 슬라이스는 HOME의 header 단순화, 정렬 dropdown 교체, 재료 칩 위치 재배치를 수행한다. `baemin-prototype-home-porting`이 이미 merged이므로 해당 slice의 결과물 위에서 additive하게 작업한다.
- **잠금 규칙**: HOME hero/promo strip의 기본 구조는 유지하고, 정렬 UI와 filter chip 위치만 Wave1 기준으로 재배치한다. HOME 전용 bottom tab은 건드리지 않는다.

### baemin-style-home/recipe-detail-retrofit 충돌 분석

- **현재 상태**: 둘 다 `merged`. 토큰 교체와 공용 컴포넌트 소비가 완료됐다.
- **충돌 위험**: 낮음. 이 슬라이스는 retrofit 결과물 위에서 Wave1 UI 개선을 추가로 적용한다.

### recipe-detail API 필드 확인

- `GET /api/v1/recipes/{id}`가 반환하는 metric 필드: `view_count`, `like_count`, `save_count`, `plan_count`, `cook_count`
- `user_status`: `{ is_liked, is_saved, saved_book_ids }`
- 이 슬라이스에서 사용하는 필드는 모두 이미 공식 API에 존재. 새 필드 추가 없음.

## Backend First Contract

이 슬라이스의 Phase5 UI repair는 화면 중심이지만, 2026-05-12 official contract update 이후 Slice B는 더 이상 단순 UI-only로 분류하지 않는다. Phase4 prep에서 아래 backend/API 계약이 현재 master에 구현되어 있고 테스트로 잠겨 있는지 먼저 확인한다.

- `GET /api/v1/recipes?sort=latest`
  - 최신순은 `created_at DESC`, tie-break는 deterministic `id` 기준을 따른다.
  - HOME sort 노출 옵션과 query state가 official API 계약과 맞아야 한다.
- `POST /api/v1/recipes/{id}/save` with `book_ids[]`
  - multi-save request는 `book_ids[]`를 사용한다.
  - response는 `book_ids`, `created_book_ids`, `already_saved_book_ids`를 구분한다.
  - 기존 `{ success, data, error }` wrapper를 유지한다.
- 권한 / 소유자 검증: 기존 보호 로직 유지
- 상태 전이: 해당 없음
- DB schema: 새 migration 없음. 기존 저장 관계를 소비한다.
- Stage 2 status: current master 기준 구현/테스트가 존재한다. Slice B Phase4 prep은 이 계약을 재검증하고 evidence를 기록한다. mismatch가 발견될 때만 BE repair를 별도 작은 commit/PR 범위로 분리한다.

## Frontend Delivery Mode

- Phase4 prep 완료 전에는 UI repair를 시작하지 않는다.
- 기존 공식 API 응답 필드를 그대로 소비하고, visual/layout만 fixed prototype 기준으로 repair한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - HOME: loading (skeleton), empty (결과 없음), error (fetch 실패) — 기존 구현 유지
  - RECIPE_DETAIL: loading, error, unauthorized (로그인 게이트) — 기존 구현 유지
  - save modal: loading, ready, error — 기존 구현 유지
  - login: auth error 표시 — 기존 구현 유지
- 로그인 보호 액션: 기존 return-to-action 흐름 유지 (like, save, planner add, cook)

## Design Authority

- UI risk: `anchor-extension` — HOME과 RECIPE_DETAIL 두 anchor screen의 정보 구조, CTA hierarchy, section 배치를 동시에 변경
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`
- Visual artifact: Phase4 prep에서 reference/current mapping을 먼저 만들고, Phase5에서 after screenshot + diff/audit evidence를 생성한다.
  - fixed reference screenshots: `ui/designs/reference/wave1-fixed-prototype/manifest.json`에 등록된 HOME / RECIPE_DETAIL / HOME_SORT_OPEN_STATE / GLOBAL::LoginGateModal / save popup 관련 390px/320px PNG
  - current service screenshots: `ui/designs/evidence/wave1-port-discovery-detail/` 아래에 HOME / RECIPE_DETAIL / save modal / login surfaces별 390px/320px
  - required audit evidence: screenshot diff, computed-style audit, DOM geometry audit, remaining-difference ledger with blocker 0 and unclassified visual difference 0
- Authority status: `reviewed`
- Notes:
  - HOME + RECIPE_DETAIL은 anchor screen이므로 authority review 필수.
  - historical authority report `ui/designs/authority/WAVE1_DISCOVERY_DETAIL-authority.md`는 과거 closeout evidence다. Slice B re-audit에서 fixed reference/current/after 비교 결과로 갱신한다.
  - screenshot 존재만으로 pass하지 않는다. reference와 service generated screenshot을 실제로 비교하고, remaining-difference ledger가 0 unclassified visual differences인지 확인한다.
  - Claude final authority gate 통과 필수 (blocker 0개 확인 후 `confirmed`).

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> Historical status: PR #374 closeout 당시 confirmed. 2026-05-13 Phase4 re-audit 기준으로는 new reference/current/after evidence와 authority gate가 refresh될 때까지 pending-review로 취급한다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md`
- `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/home.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/detail.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- **fixture baseline**: HOME과 RECIPE_DETAIL은 기존 QA fixture (`HOMECOOK_ENABLE_QA_FIXTURES=1`)로 테스트 가능. save modal은 recipe book fixture 필요.
- **real DB smoke 경로**: `pnpm dev:demo` 또는 `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev` — 기존 fixture로 HOME/상세/저장 흐름 검증
- **seed / reset 명령**: 해당 없음 (기존 fixture 재사용)
- **bootstrap 시스템 row**: 해당 없음
- **blocker 조건**: 없음. 모든 선행 슬라이스가 merged.

## Key Rules

- Wave1 mobile exact-ready surface의 visual/layout 목표값은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`와 fixed prototype reference를 따른다.
- 기존 global legacy token 값은 전역 교체하지 않는다. Wave1 repair는 Slice A의 additive `--wave1-*` aliases 또는 화면-local/class-level 적용으로 제한한다.
- fixed prototype에 보이는 색상, 폰트 크기, spacing, radius, shadow, icon geometry는 completion escape hatch로 임의 divergence 처리하지 않는다.
- fixed prototype에 직접 없는 loading/skeleton/empty/error/unauthorized/not-found/submitting 상태는 `prototype-derived design`으로 분류하고 `wave1-derived-state-ui-prep` 기준을 확산한다.
- 기존 API 응답의 공식 필드(`like_count`, `save_count`, `cook_count`, `plan_count`, `view_count`, `user_status`)만 소비한다.
- `view_count` sort option 제거 또는 official sort contract 변경은 API 계약 영향 확인 후 진행한다. 확인 없이는 화면 노출만 fixed reference와 맞춘다.
- recipe save modal은 official `POST /recipes/{id}/save` `book_ids[]`, `POST /recipe-books`, `GET /recipe-books` API를 그대로 소비한다.
- login provider 숨김은 FE-only. Supabase provider config 변경은 contract evolution candidate.
- 기존 `{ success, data, error }` API 래퍼를 유지한다.
- HOME의 sort option 변경 시 `useDiscoveryFilterStore` 등 기존 상태 관리를 유지한다.
- 카드 border-radius 16px, 터치 타겟 44px, 모달/바텀시트 20px radius 기준을 준수한다.

## Contract Evolution Candidates (Optional)

| 후보 | 현재 계약 | 제안 계약 | 기대 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| Supabase auth provider disable | FE에서 버튼 숨김만 | Supabase dashboard에서 카카오/Apple provider 비활성화 | 불필요 provider 보안 표면 축소 | API 문서, Supabase config | 미승인 |
| `view_count` sort option 공식 제거 | API v1.2.4는 `latest`를 포함하고 기존 sort 계약은 보존 | HOME sort에서 `view_count` option을 완전히 제거 | fixed reference와 행동 metric 중심 탐색을 더 강하게 일치 | 화면정의서 HOME, API 문서 | 미승인 — Phase4에서 official contract와 fixed reference를 재확인 |
| RECIPE_DETAIL metric 표시 정책 추가 변경 | official docs/API v1.2.4의 existing metric fields | 새 집계/표시 정책 추가 | 화면 의미 강화 | 화면정의서 RECIPE_DETAIL, API 문서 | 미승인 — 기존 필드 소비만 허용 |

## Primary User Path

1. 사용자가 HOME에 진입한다.
2. 단순화된 header (로고만)를 보고, 테마 카루셀 탐색, 배너 클릭으로 플래너 이동 가능.
3. "모든 레시피" 섹션에서 inline SortDropdown으로 정렬을 변경한다.
4. 재료 검색 칩을 눌러 ingredient filter modal을 열 수 있다.
5. 레시피 카드를 탭해 RECIPE_DETAIL로 이동한다.
6. hero 이미지 우상단에서 좋아요/저장/요리완료 metric을 확인한다.
7. 하단 sticky 액션바에서 `플래너에 추가` 또는 `요리하기`를 선택한다.
8. 이미지 옆 북마크 아이콘으로 레시피를 저장한다 → save modal에서 레시피북 선택/생성.
9. 비로그인 상태에서 보호 액션 시도 시 로그인 게이트 → 네이버/Google 버튼만 표시.

## Phase4 Re-Audit Prep Contract

다음 세션은 아래 prep artifacts를 먼저 만든 뒤 Phase5 UI repair로 넘어간다.

- Current service screenshots: HOME initial/scrolled/sort-open, RECIPE_DETAIL initial/scrolled/action states, save modal, login/login-gate provider surfaces at 390px and 320px.
- Fixed reference mapping: 각 current screenshot이 `ui/designs/reference/wave1-fixed-prototype/manifest.json`의 어떤 surface/state/viewport와 비교되는지 표로 기록한다.
- Prototype-vs-service diff table: color, font, spacing, radius, shadow, layout/geometry, icon/asset, copy/hierarchy, MVP-governed behavior differences를 분리한다.
- Contract verification: `GET /recipes sort=latest`, `POST /recipes/{id}/save book_ids[]`, recipe detail metrics/user_status, login return-to-action을 targeted tests로 잠근다.
- Derived state scope: loading/skeleton/empty/error/unauthorized/not-found/submitting은 fixed pixel parity가 아니라 `prototype-derived design`으로 기록하고, `wave1-derived-state-ui-prep` 기준에서 벗어나지 않는다.
- Phase5 entry condition: blocker 0을 주장하기 전에 PR body에 reference screenshot, service screenshot, screenshot diff, computed-style audit, DOM geometry audit, remaining-difference ledger를 연결할 수 있어야 한다.

Prep artifact:

- `ui/designs/evidence/wave1-port-discovery-detail/phase4-prep.md` — current service screenshots, fixed reference mapping, diff table, audit plan, MVP regression lock, PR-ready evidence checklist

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Historical PR #374에서는 Stage 2가 N/A였지만, 2026-05-12 contract update 이후 Slice B는 `latest` sort와 `book_ids[]` save 계약을 Phase4 prep에서 먼저 재검증한다.
> 아래 체크박스는 PR #374 historical closeout 상태를 보존한다. 2026-05-13 re-audit에서는 위 `Phase4 Re-Audit Prep Contract`를 먼저 충족한 뒤 필요한 항목을 새 evidence로 갱신한다.

- [x] HOME header 프로필/장바구니 제거 <!-- omo:id=discovery-home-header-cleanup;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 배너 클릭 -> `/planner` 이동 <!-- omo:id=discovery-home-banner-planner;stage=4;scope=frontend;review=5,6 -->
- [x] HOME sort sheet -> SortDropdown 전환 <!-- omo:id=discovery-home-sort-dropdown;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 재료 검색 칩 위치 재배치 <!-- omo:id=discovery-home-filter-chip-position;stage=4;scope=frontend;review=5,6 -->
- [x] HOME "재료로 거르기" -> "재료로 검색" 문구 변경 <!-- omo:id=discovery-home-filter-label;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 별점/rating 제거 <!-- omo:id=discovery-detail-rating-removal;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL hero 영역 행동 metric 표시 (like/save/cook) <!-- omo:id=discovery-detail-hero-metrics;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 하단 저장 버튼 제거 + 이미지 북마크 흡수 <!-- omo:id=discovery-detail-save-to-bookmark;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 하단 CTA 2버튼 (플래너에 추가 + 요리하기) <!-- omo:id=discovery-detail-bottom-cta;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 재료 탭 카테고리 헤더 제거 <!-- omo:id=discovery-detail-ingredient-header-removal;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 조리법 폰트 키움 <!-- omo:id=discovery-detail-step-font;stage=4;scope=frontend;review=5,6 -->
- [x] save modal 프리뷰 섹션 제거 + "저장" 버튼 문구 <!-- omo:id=discovery-save-modal-cleanup;stage=4;scope=frontend;review=5,6 -->
- [x] login provider 카카오/Apple 숨김 <!-- omo:id=discovery-login-provider-hide;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / unauthorized` 상태 점검 <!-- omo:id=discovery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 이 슬라이스의 Vitest / Playwright 자동화 범위 구분 <!-- omo:id=discovery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 390/320 HOME screenshot evidence <!-- omo:id=discovery-home-screenshot;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 390/320 RECIPE_DETAIL screenshot evidence <!-- omo:id=discovery-detail-screenshot;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=discovery-verify-frontend;stage=4;scope=frontend;review=6 -->
