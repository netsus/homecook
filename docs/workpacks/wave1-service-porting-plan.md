# Wave1 Service Porting Plan

> 목적: `ui/designs/prototypes/claude-design-260505-wave1`에 정리된 앱/웹 디자인 개선사항을 실제 서비스로 작은 vertical slice 단위로 포팅하기 위한 새 세션용 실행 계획이다.
> 작성일: 2026-05-10 KST
> 기준 프로토타입: `ui/designs/prototypes/claude-design-260505-wave1`
> 핵심 원칙: 공식 문서와 실제 API 계약을 넘는 변경은 먼저 contract-evolution 문서/PR로 닫고, FE는 그 계약을 그대로 소비한다.

## Current Status

- Wave1 vNext prototype은 최신 기준 프로토타입으로 사용한다.
- `planner-column-customization`은 이미 완료됐다.
  - contract-evolution PR: #367
  - Stage 1 docs PR: #368
  - Stage 2 backend PR: #369
  - Stage 4~6 frontend/closeout PR: #370
  - 결과: 신규 기본 끼니 컬럼은 `아침 / 점심 / 저녁` 3개, SETTINGS에서 1~5개 범위로 이름 변경/추가/삭제 가능.
- 따라서 이후 포팅 slice에서 플래너 컬럼 3개 기본값과 SETTINGS 컬럼 관리는 다시 만들지 말고, 이미 merged된 계약과 컴포넌트를 소비한다.
- 기존 `docs/workpacks/baemin-prototype-home-porting`과 일부 HOME 범위가 겹칠 수 있다. HOME 관련 slice 착수 전 현재 구현과 해당 workpack 상태를 먼저 확인한다.

## Read First

새 세션은 아래 파일을 먼저 읽는다.

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. `docs/workpacks/README.md`
3. `docs/engineering/slice-workflow.md`
4. `docs/engineering/agent-workflow-overview.md`
5. `docs/engineering/product-design-authority.md`
6. `docs/design/mobile-ux-rules.md`
7. `ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md`
8. `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
9. 실제 구현 대상 화면의 현재 서비스 파일

프로토타입 쪽 참고 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/index.html`
- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/tokens.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/*.jsx`

## Working Contract

- product slice는 Stage 1~6 흐름을 따른다.
- Stage 1은 Claude가 workpack README/acceptance/automation-spec을 작성하고 merge한다.
- Stage 2는 Codex가 BE 변경이 필요한 경우만 수행한다. UI-only 또는 기존 API로 가능한 slice는 `N/A` 근거를 남긴다.
- Stage 3은 BE 변경이 있었을 때 Claude review를 받는다.
- Stage 4는 Claude가 FE 포팅을 수행한다.
- Stage 5는 Codex가 디자인/authority review를 수행한다.
- Stage 6은 Codex가 code review, local verification, PR checks, merge까지 닫는다.
- 사용자가 `$claude-delegate`를 명시하면 기존 Claude session `d0277030-99a8-46ec-a6e7-3b8013bd7682`에 `--resume`으로 붙는다. 가능하면 `session_attach_mode=resume`, `model=opus`, `effort=xhigh` 의도로 기록한다. 로컬 CLI가 `xhigh`를 받지 않으면 `high`로 대체하고 그 사실을 artifact에 남긴다.

## Stage Flow Per Slice

각 slice는 아래 순서로 진행한다.

1. Stage 1, Claude
   - `docs/workpacks/<slice>/README.md`
   - `docs/workpacks/<slice>/acceptance.md`
   - 필요 시 `docs/workpacks/<slice>/automation-spec.json`
   - `Design Authority` 섹션과 screenshot/Figma evidence 계획
   - 공식 문서/API와 충돌하는 항목은 `Contract Evolution Candidate`로 분리

2. Stage 2, Codex
   - BE/API/DB/status/field 변경이 필요한 경우만 구현
   - 권한, read-only, 상태 전이, idempotency 테스트 먼저
   - UI-only slice면 `N/A` 사유를 workpack/PR body에 남김

3. Stage 3, Claude
   - BE 변경 review
   - contract drift, 테스트 누락, 공식 문서 충돌 확인

4. Stage 4, Claude
   - FE 포팅
   - 기존 API wrapper `{ success, data, error }` 유지
   - `loading / empty / error / read-only / unauthorized` 상태 유지
   - 모바일 390px/320px evidence 생성

5. Stage 5, Codex
   - screenshot evidence 기반 authority review
   - anchor screen은 blocker 0개 확인
   - 필요하면 touch target, overflow, CTA clipping, text wrapping 보완

6. Stage 6, Codex
   - code review
   - `pnpm verify:frontend`
   - 필요 시 `pnpm qa:explore -- --slice <slice>`와 `pnpm qa:eval`
   - `pnpm validate:authority-evidence-presence`
   - PR checks current head green 확인
   - merge 후 Discord 알림

## Recommended Order

| Order | Slice ID | Goal | Primary Owner Flow | Notes |
| --- | --- | --- | --- | --- |
| 0 | `planner-column-customization` | SETTINGS 끼니 컬럼 관리 + PLANNER_WEEK 동적 컬럼 | Done | PR #367~#370 merged. 다시 하지 않는다. |
| A | `wave1-port-foundation` | 공통 shell, 공용 UI 패턴, CTA/칩/카드/모달 위계 | Stage 1~6 | 가장 먼저. 뒤 slice의 중복 스타일 변경을 줄인다. |
| B | `wave1-port-discovery-detail` | HOME, RECIPE_DETAIL, save modal, login provider display | Stage 1~6 | HOME은 기존 `baemin-prototype-home-porting`과 충돌/중복 확인 후 시작. |
| C | `wave1-port-planner-meal-add` | PLANNER, MENU_ADD, MANUAL_CREATE, MEAL_SCREEN | Stage 1~6 | 컬럼 CRUD는 완료된 `planner-column-customization` 계약을 소비한다. |
| D | `wave1-port-shopping-cooking` | SHOPPING_FLOW, SHOPPING_DETAIL, COOK_READY/COOK_MODE | Stage 1~6 | 장보기 read-only/exclude/add_to_pantry 규칙을 테스트로 고정. |
| E | `wave1-port-pantry` | PANTRY, ingredient picker, bundle picker, multi-delete | Stage 1~6 | 재료 이미지/category API 유무를 먼저 확인. |
| F | `wave1-port-account-library-leftovers` | MYPAGE, SETTINGS polish, LEFTOVERS, ATE_LIST, RECIPEBOOK_DETAIL | Stage 1~6 | SETTINGS 컬럼 관리 완료 상태와 충돌하지 않게 조심. |
| G | `wave1-port-web-followup` | 앱 포팅 이후 웹-only 조정 | 별도 계획 | 앱 slice 완료 후 최신 프로토타입 기준으로 다시 작성. |

## Slice A: wave1-port-foundation

### Scope

- 공통 layout shell
- header / bottom tabs / top nav 대응
- Button, Chip, Card, Modal/Sheet, Dropdown 공통 스타일 정리
- 정렬 dropdown 패턴
- 공통 CTA 위계
- app-wide spacing, safe-area, sticky bottom action rules

### Expected Files

- `components/layout/app-header.tsx`
- `components/layout/bottom-tabs.tsx`
- `components/ui/*`
- `components/shared/*`
- `app/globals.css`
- existing app shell files discovered during Stage 1

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| header 단순화 | UI-only | API 영향 없음. 화면별 헤더 액션 제거/이동은 slice B~F에서 실제 적용. |
| bottom tab 유지 규칙 | UI-only | 상세 화면에서 하단 탭 유지 여부를 화면별 확인. |
| Button/Chip/Card radius/spacing | UI-only | 기존 design token과 충돌하지 않게 additive 중심. |
| Modal/Sheet footer label | UI-only | 기존 modal behavior 유지. |
| Sort dropdown primitive | UI-only | HOME 적용은 Slice B. |

### Verification

- `pnpm lint`
- `pnpm typecheck`
- 공통 UI unit/component test
- 모바일 320/390 screenshot evidence
- no horizontal overflow spot check

## Slice B: wave1-port-discovery-detail

### Scope

- HOME
- RECIPE_DETAIL
- recipe save modal
- login screen provider display

### Main Changes

- HOME banner click -> `/planner`
- HOME header profile/cart 제거
- HOME search/filter chip 위치 재정리
- HOME sort sheet -> inline dropdown
- RECIPE_DETAIL 별점 제거, 행동 metric 표시로 전환
- RECIPE_DETAIL 하단 save 제거, `플래너에 추가` + `요리하기` 중심
- RECIPE_DETAIL 이미지 오른쪽 또는 근접 영역에 좋아요/저장/요리완료 metric 배치
- save modal에서 recipebook 생성 흐름 유지/정리
- login에서 카카오/Apple 버튼 숨김 또는 provider 축소

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| HOME filter chip 위치 | UI-only | 기존 recipes/ingredients API 소비. |
| HOME banner -> planner | UI-only / existing route | `/planner` 라우트 존재 확인. |
| sort dropdown | UI-only | Slice A primitive 사용. |
| RECIPE_DETAIL 별점 제거 | UI-only | rating field를 추가하지 않는다. |
| 좋아요/저장수 표시 | 기존 API로 가능 여부 확인 | 현재 detail response에 count가 있으면 소비. 없으면 contract candidate. |
| 요리완료수 표시 | 기존 API로 가능 여부 확인 | `cook_count`/`plan_count` 등 실제 필드 확인. 없으면 docs+BE. |
| 조회수 제거 | UI-only | 데이터는 보존 가능, 화면에서 숨김. |
| save modal recipebook 생성 | 기존 API로 가능 | `POST /recipe-books`, save API 소비. |
| login provider 축소 | UI-only + auth config 확인 | 버튼 숨김은 FE 가능. 실제 provider disable은 운영 config 정책 확인. |

### Contract Evolution Candidates

- metric count source가 공식 API에 없을 때:
  - 좋아요수
  - 저장수
  - 요리완료수
  - 조회수 표시/비표시 정책
- provider list를 실제 Supabase config에서 비활성화해야 할 때

### Verification

- HOME unit/component tests
- RECIPE_DETAIL E2E
- save modal E2E
- login provider display test
- mobile 390/320 authority evidence for HOME and RECIPE_DETAIL

## Slice C: wave1-port-planner-meal-add

### Scope

- PLANNER
- 식사추가 modal
- recipebook/pantry/search add flows
- MANUAL_CREATE
- MEAL_SCREEN

### Main Changes

- PLANNER weekly horizontal movement or swipe support
- 끼니 컬럼 이모티콘 제거 / 텍스트 명확화
- recipe status badge 제거
- `+ 음식` 위치와 강조 정리
- `장보기 목록 만들기` -> `장보기`
- planner-level `요리하기` 버튼 제거, meal/card context action 중심
- 식사추가 option modal 2열 구성
- `남은 요리에서 추가` option 추가
- 직접등록 재료 추가 modal 흐름 정리
- MEAL_SCREEN recipe name click -> RECIPE_DETAIL
- MEAL_SCREEN status selector 제거, delete icon 정리

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| PLANNER 이모티콘/배지 제거 | UI-only | 기존 meal status는 유지하고 표시만 줄임. |
| weekly 이동 | 기존 API로 가능 | `fetchPlanner(start,end)`와 `shiftPlannerRange` 사용 가능 여부 확인. |
| `+ 음식` 위치 변경 | UI-only | route/query 유지. |
| 식사추가 option modal | UI-only + existing flows | 각 option route/modal 연결을 실제 라우트에 맞춘다. |
| 남은요리에서 추가 | 기존 API로 가능 여부 확인 | leftovers -> meal attach 경로가 있는지 확인. 없으면 contract candidate. |
| 직접등록 완료 버튼 | UI-only / existing API | `POST /recipes` 후 완료 CTA. |
| 재료 선택 modal 다중 선택 | 기존 API로 가능 | ingredients API 소비. |
| 재료 양 입력 위치 변경 | UI-only | 저장 payload shape 유지. |
| MEAL_SCREEN recipe click | UI-only / existing route | `/recipe/[id]` 이동. |
| meal -> cook_done -> leftover 자동 생성 | docs+BE 필요 가능성 높음 | 도메인 상태 전이와 leftover row 생성 정책 필요. |

### Contract Evolution Candidates

- leftover -> planner attach API가 없을 때
- meal 완료 시 leftover 자동 생성 정책
- pantry 미사용 사용자 분기에서 meal status/cook_done 처리 변경

### Verification

- PLANNER E2E mobile + narrow
- MENU_ADD option routing E2E
- MANUAL_CREATE ingredient modal and complete CTA E2E
- MEAL_SCREEN recipe click E2E
- status transition tests if BE touched

## Slice D: wave1-port-shopping-cooking

### Scope

- SHOPPING_FLOW preview/create
- SHOPPING_DETAIL
- pantry exclusion section
- share/list title
- COOK_READY_LIST / COOK_MODE

### Main Changes

- shopping preview에서 `#1`, 끼니 이모티콘 제거
- list 하단 생성 button 정리
- shopping detail title에 생성 날짜/목록명 표시
- share button과 complete button 배치 정리
- 구매 섹션 / 팬트리 제외 섹션 명확화
- `이미있음` / `되살리기` 이동 버튼
- `장보기 완료` button 하단 배치
- 완료 후 pantry 반영 modal 유지/정리
- COOK_MODE timer/note/pause/prev/next 제거
- COOK_MODE 전체 step 한 화면 스크롤
- cancel / complete button clipping 해결
- consumed ingredient screen 줄바꿈 수정

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| preview label/icon 제거 | UI-only | 데이터/계약 유지. |
| `장보기 목록 만들기` -> `장보기 완료` 등 label | UI-only | 화면 맥락별 문구만 변경. |
| pantry excluded section | 기존 API로 가능 | 현재 `is_pantry_excluded` 규칙 소비. |
| `이미있음` / `되살리기` | 기존 API로 가능 | `exclude -> uncheck` 규칙 유지. |
| share button | 기존 API로 가능 | `share-text` endpoint 확인. |
| shopping list title/date | 기존 API로 가능 여부 확인 | title/date 필드가 없으면 frontend fallback 또는 contract candidate. |
| complete 후 pantry add modal | 기존 API로 가능 | `add_to_pantry_item_ids` 3-way 규칙 유지. |
| COOK_MODE controls 제거 | UI-only | session/complete API 유지. |
| consumed ingredient wrapping | UI-only | payload 유지. |

### Non-Negotiable Rules

- completed `SHOPPING_DETAIL`은 read-only.
- completed list mutation은 409.
- `is_pantry_excluded=true`면 `is_checked=false`.
- `add_to_pantry_item_ids`: `null`, `[]`, selected ids를 구분.
- invalid pantry add ids는 무시하고 `pantry_added` 계산이 일치해야 한다.

### Verification

- shopping preview/create E2E
- shopping detail interact E2E
- shopping complete + pantry reflect E2E
- cook session/complete E2E
- read-only and 409 regression tests

## Slice E: wave1-port-pantry

### Scope

- PANTRY
- ingredient add modal
- bundle picker
- category chips
- search
- multi-delete

### Main Changes

- add ingredient button 명확화
- bundle add button 위치/라벨 정리
- category horizontal chip rail을 보유 재료 상단으로 이동
- pantry item image + checkbox 위치 정리
- 보유 텍스트 제거
- 미보유 재료 숨김
- delete button 항상 보이게
- delete mode에서 checkbox 표시
- selected items bottom `제거하기` CTA

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| chip/filter 위치 | UI-only | 기존 pantry list filtering. |
| delete mode UI | UI-only + existing API | delete endpoint가 batch인지 단건인지 확인. |
| multi-delete | 기존 API로 가능 여부 확인 | 단건 delete만 있으면 FE loop 또는 BE batch candidate. |
| ingredient image | 기존 API로 가능 여부 확인 | image field가 없으면 placeholder or contract candidate. |
| category chips | 기존 API로 가능 여부 확인 | category enum/mapping 확인. |
| hidden unowned ingredients | UI-only | pantry screen에서는 보유 items만 보여줌. |

### Contract Evolution Candidates

- ingredient image URL이 공식 API에 없을 때
- category group이 `주식/채소/단백질/양념`으로 정규화되어 있지 않을 때
- batch delete endpoint가 필요하다고 판단될 때

### Verification

- PANTRY list/search/filter E2E
- add ingredient modal E2E
- bundle add E2E
- multi-delete E2E
- mobile screenshot evidence 390/320

## Slice F: wave1-port-account-library-leftovers

### Scope

- MYPAGE
- SETTINGS polish
- LEFTOVERS
- ATE_LIST
- RECIPEBOOK_DETAIL

### Main Changes

- MYPAGE top gear 제거
- saved recipes section 제거 or recipebook로 흡수
- account info에서 withdrawal button 제거
- SETTINGS logout/withdrawal text itself as trigger
- settings account category cleanup
- 남은요리/다먹은요리 양방향 button이 잘리지 않게 정리
- 다먹은요리 description에서 `다먹음` 텍스트 제거
- `덜먹음` 제거
- `플래너에 추가` 문구 정리
- leftover/eaten meta는 `4/20 저녁 2인분`만 유지
- recipebook detail kebab menu: rename/delete

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| mypage gear/saved recipes 제거 | UI-only | routes는 유지 가능. |
| settings account action copy | UI-only | existing logout/delete API 유지. |
| planner column management | Done | `planner-column-customization` merged. 다시 만들지 않음. |
| leftovers/ate button shape | UI-only | route links 유지. |
| `다먹음` 텍스트 제거 | UI-only | list source 유지. |
| `덜먹음` 제거 | UI-only unless API action removed | API는 유지해도 숨길 수 있음. |
| recipebook kebab menu | 기존 API로 가능 | rename/delete endpoints 확인. |

### Verification

- MYPAGE E2E
- SETTINGS E2E regression
- LEFTOVERS / ATE_LIST E2E
- RECIPEBOOK_DETAIL E2E
- button clipping screenshots 320/390

## Cross-Slice Mapping Table

| Change Area | UI-only | Existing API 가능성 | Docs + BE 필요 가능성 |
| --- | --- | --- | --- |
| Header/profile/cart removal | yes | no | no |
| Filter chip position | yes | ingredients/recipes unchanged | no |
| Sort modal -> dropdown | yes | no | no |
| Recipe detail metric layout | yes | count fields 확인 | missing count fields |
| Recipe detail bottom CTA | yes | planner add/cook routes | no |
| Save modal copy/layout | yes | save/book APIs | book quick-create transaction if missing |
| Planner weekly movement | mostly | planner range API | no if current API sufficient |
| Planner column default/customization | done | done | done in #367~#370 |
| Meal add option modal | yes | existing add flows | leftover attach if missing |
| Manual create ingredient modal | mostly | ingredients + recipe create | unit/category contract if missing |
| Meal screen recipe click | yes | recipe route | no |
| Meal cook_done -> leftover auto | no | maybe existing cook complete | likely docs+BE if behavior changes |
| Shopping excluded section | mostly | shopping detail item APIs | no if current contract sufficient |
| Shopping list title/date | maybe | list title/date fields 확인 | title generation contract if missing |
| Shopping share | yes | share-text API | no |
| Pantry reflect on complete | yes | complete API | no, preserve 3-way rules |
| Cook mode control removal | yes | existing session APIs | no |
| Pantry category chips/images | maybe | pantry/ingredient fields 확인 | image/category contract if missing |
| Pantry multi-delete | maybe | delete endpoint 확인 | batch delete if required |
| Mypage/settings polish | yes | existing account APIs | no |
| Leftovers/Ate copy/buttons | yes | leftovers APIs | no unless state/action removed |
| Recipebook menu | mostly | recipebook rename/delete | no if endpoints exist |
| Login provider display | FE yes | auth config 확인 | provider policy/config if disabling server-side |

## Contract Evolution Rule

다음 중 하나라도 해당하면 구현 전에 docs-governance / contract-evolution PR을 먼저 만든다.

- 공식 API 문서에 없는 endpoint, response field, request field가 필요하다.
- DB schema 또는 status enum을 바꿔야 한다.
- `meals.status` 전이가 `registered -> shopping_done -> cook_done` 외 흐름을 요구한다.
- shopping read-only, `exclude -> uncheck`, `add_to_pantry_item_ids` 3-way 규칙을 바꾸게 된다.
- auth provider 자체를 운영 설정에서 제거해야 한다.
- production data migration 또는 backfill이 필요하다.

## Suggested New Session Prompt

새 세션을 시작할 때 아래처럼 요청하면 된다.

```text
docs/workpacks/wave1-service-porting-plan.md를 먼저 읽고, Wave1 실제 서비스 포팅을 Slice A부터 진행해줘.
AGENTS.md 규칙에 따라 Stage 1은 Claude에게 workpack/acceptance를 맡기고, 필요한 경우 $claude-delegate로 기존 세션 d0277030-99a8-46ec-a6e7-3b8013bd7682에 --resume으로 붙어줘.
각 slice는 UI-only / 기존 API로 가능 / contract-evolution 필요 항목을 먼저 판정하고, 완료 후 $ship-pr-loop로 PR merge까지 진행해줘.
```

## First Next Action

다음 세션의 첫 실제 작업은 `wave1-port-foundation` Stage 1이다.

1. `pnpm branch:start -- --slice wave1-port-foundation --role docs`
2. Claude에게 Stage 1 workpack 작성 위임
3. `docs/workpacks/wave1-port-foundation/README.md`, `acceptance.md`, 필요 시 `automation-spec.json` 생성
4. 공통 UI primitive 범위를 실제 repo 파일 기준으로 좁힘
5. Stage 1 docs PR merge

