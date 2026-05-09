# Slice: wave1-port-discovery-detail

## Goal

HOME과 RECIPE_DETAIL 화면의 Wave1 프로토타입 개선사항을 실제 서비스에 포팅하고, recipe save modal과 login provider display를 정리한다. HOME의 header 단순화, sort sheet->inline dropdown 전환, filter chip 재배치, 배너->플래너 링크를 적용하고, RECIPE_DETAIL의 별점 제거/행동 metric 전환, 하단 CTA 재구성, image-adjacent metric 배치를 구현한다. 모든 변경은 기존 공식 API 계약과 승인 토큰 범위 안에서 수행하며, 새 endpoint/field/DB 변경 없이 UI-only 포팅이다.

## Branches

- 프론트엔드: `feature/fe-wave1-port-discovery-detail`

## In Scope

- 화면: HOME, RECIPE_DETAIL, recipe save modal, login screen
- API: 없음 (기존 API 변경 없음, 기존 응답 필드만 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### HOME 변경

- HOME header에서 프로필/장바구니 아이콘 제거 (AppBar 단순화)
- HOME 이번주 식단 배너 클릭 시 `/planner` 탭 이동
- HOME 정렬: sort sheet (바텀시트) -> inline `SortDropdown` primitive 전환 (Slice A에서 도입된 `SortDropdown` 소비)
- HOME 재료 검색 칩 위치를 테마별 레시피 아래, "모든 레시피" 섹션 바로 아래로 정리
- HOME "재료로 거르기" 문구를 "재료로 검색"으로 변경

### RECIPE_DETAIL 변경

- 별점/rating 표시 제거 (rating field를 추가하지 않음)
- 행동 metric 표시: `like_count`, `save_count`, `cook_count` 를 이미지 근접 영역(hero 우상단)에 배치. `plan_count`는 이미 공식 필드이므로 포함 가능.
- `view_count`는 데이터 보존하되 화면에서 숨김 (현재 sort option에서도 제거)
- 하단 저장 버튼 제거 → 이미지 옆 북마크/저장 토글로 흡수
- 하단 sticky 액션바: `플래너에 추가` (secondary) + `요리하기` (primary) 2버튼 레이아웃
- 재료 탭 카테고리 헤더 제거 (정렬 순서는 유지)
- 조리법 탭 폰트 크기 키움 (14px -> 16px 기준)

### Recipe Save Modal 변경

- 모달 제목 유지: "레시피 저장"
- 레시피 정보 프리뷰 섹션 제거 (레시피북 선택 목록만)
- 하단 버튼 문구: "저장" (기존 "저장취소" -> "저장")
- 새 레시피북 만들기 인라인 UI 유지 (기존 `POST /recipe-books` API 소비)
- 기존 `{ success, data, error }` 래퍼 유지

### Login Provider Display 변경

- 카카오/Apple 시작하기 버튼 FE에서 숨김 (네이버/Google만 표시)
- 실제 Supabase provider disable은 이 슬라이스 범위 밖 (Contract Evolution Candidate)

## Out of Scope

- PLANNER_WEEK, SHOPPING, COOK_MODE 화면 변경 (Slice C~D)
- PANTRY, MYPAGE, SETTINGS 화면 변경 (Slice E~F)
- API/DB/status/endpoint/field 추가 또는 변경
- 새 npm dependency 추가
- prototype mint/Jua/asset 도입 (production 승인 토큰만 사용)
- `view_count` sort option 완전 삭제 (API 계약 영향 → 별도 확인 필요 시 후속 처리)
- Supabase auth provider config 변경 (운영 정책 변경)
- 플래너 컬럼 CRUD (이미 `planner-column-customization`에서 완료)
- `baemin-prototype-home-porting` 소유의 HOME 전용 bottom tab / hero / promo strip 구조 변경 (해당 slice가 이미 merged)
- 레시피 카드 컴포넌트의 구조적 변경 (recipe-card.tsx의 정보 구조 유지, 시각 정리만)
- RECIPE_DETAIL 리뷰 탭 별점 → 행동 metric 전환 (데이터 소스 부재 → 별도 계약 검토 필요 시)
- `RecipeHeroStats` 수준의 이미지 오버레이 UI가 프로토타입처럼 좋아요/저장/요리완료 3개를 묶는 compact widget일 때, 새 shared 컴포넌트 도입이 필요하면 Stage 4에서 판단

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
| `wave1-port-foundation` | merged | [x] PR #372, #373 |

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

이 슬라이스는 UI-only이며 backend 변경이 없다.

- API 변경: 없음
- 기존 `{ success, data, error }` 래퍼: 유지 (소비측 변경 없음)
- 권한 / 소유자 검증: 해당 없음 (기존 보호 로직 유지)
- 상태 전이: 해당 없음
- 멱등성: 해당 없음
- Stage 2: N/A — UI-only slice. 근거: HOME/RECIPE_DETAIL/save modal/login의 UI 포팅만 수행하며, route handler, DB, status transition 변경이 없다. 기존 API 응답의 공식 필드만 소비한다.

## Frontend Delivery Mode

- 기존 공식 API 응답 필드를 그대로 소비하는 UI-only 포팅
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - HOME: loading (skeleton), empty (결과 없음), error (fetch 실패) — 기존 구현 유지
  - RECIPE_DETAIL: loading, error, unauthorized (로그인 게이트) — 기존 구현 유지
  - save modal: loading, ready, error — 기존 구현 유지
  - login: auth error 표시 — 기존 구현 유지
- 로그인 보호 액션: 기존 return-to-action 흐름 유지 (like, save, planner add, cook)

## Design Authority

- UI risk: `anchor-extension` — HOME과 RECIPE_DETAIL 두 anchor screen의 정보 구조, CTA hierarchy, section 배치를 동시에 변경
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`
- Visual artifact: Stage 4/5에서 mobile 390px/320px screenshot evidence 생성
  - `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-default.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-narrow.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/home-sort-dropdown-open.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-default.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-narrow.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-hero-stats.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/save-modal.png`
  - `ui/designs/evidence/wave1-port-discovery-detail/login-screen.png`
- Authority status: `reviewed`
- Notes:
  - HOME + RECIPE_DETAIL은 anchor screen이므로 authority review 필수
  - `design-generator` / `design-critic` 사용 여부는 Stage 4에서 판단. anchor screen의 레이아웃 변경이므로 기본적으로 required이나, 변경이 프로토타입 기준의 정리(정보 밀도 축소, CTA 재배치)이므로 screenshot evidence 기반 authority로 충분할 수 있음
  - authority report: `ui/designs/authority/WAVE1_DISCOVERY_DETAIL-authority.md`
  - Claude final authority gate 통과 필수 (blocker 0개 확인 후 `confirmed`)

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

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

- production 토큰은 `docs/design/design-tokens.md` 승인 값을 기본으로 쓴다.
- prototype mint/Jua/asset은 별도 승인 없이 사용하지 않는다.
- 기존 API 응답의 공식 필드(`like_count`, `save_count`, `cook_count`, `plan_count`, `view_count`, `user_status`)만 소비한다.
- `view_count` sort option 제거는 API 계약 영향 확인 후 진행. 확인 없이는 UI에서 숨기기만.
- recipe save modal은 기존 `POST /recipes/{id}/save`, `POST /recipe-books`, `GET /recipe-books` API를 그대로 소비한다.
- login provider 숨김은 FE-only. Supabase provider config 변경은 contract evolution candidate.
- 기존 `{ success, data, error }` API 래퍼를 유지한다.
- HOME의 sort option 변경 시 `useDiscoveryFilterStore` 등 기존 상태 관리를 유지한다.
- 카드 border-radius 16px, 터치 타겟 44px, 모달/바텀시트 20px radius 기준을 준수한다.

## Contract Evolution Candidates (Optional)

| 후보 | 현재 계약 | 제안 계약 | 기대 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| Supabase auth provider disable | FE에서 버튼 숨김만 | Supabase dashboard에서 카카오/Apple provider 비활성화 | 불필요 provider 보안 표면 축소 | API 문서, Supabase config | 미승인 |
| `view_count` sort option 공식 제거 | `view_count` 정렬 가능 | HOME sort에서 `view_count` option 제거 | 행동 metric 중심 탐색으로 전환 | 화면정의서 HOME §1 | 미승인 — Stage 4에서 UI 숨김만 우선 적용 |
| RECIPE_DETAIL metric 표시 정책 공식화 | 화면정의서에 metric 4종 명세 부재 | `like_count`/`save_count`/`cook_count` 표시를 공식 화면 계약에 추가 | 행동 metric 표시의 공식 근거 확보 | 화면정의서 RECIPE_DETAIL §3 | 미승인 — 기존 필드 소비는 가능하나 공식 명세화는 별도 |

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

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2는 N/A (UI-only slice). Stage 4~6에서 프론트/QA/디자인/closeout 항목을 닫는다.

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
