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
- **Slice A `wave1-port-foundation`**: merged.
  - Stage 1 docs PR: #372
  - Stage 4~6 frontend/closeout PR: #373
  - 결과: AppShell bottom-safe 조건부, Button/Chip 44px 터치 타겟, Card interactive cursor, ModalFooterActions min-h, SelectionChipRail px-1, SortDropdown primitive 신규 도입. Claude final authority gate pass, blocker 0.
- **Slice B `wave1-port-discovery-detail`**: merged.
  - Stage 1 docs PR: #374
  - 결과: HOME header 단순화, sort dropdown 전환, filter chip 재배치, RECIPE_DETAIL 별점 제거/행동 metric/CTA 재구성, save modal 정리, login provider 축소. Stage 2 N/A.
- **Slice C `wave1-port-planner-meal-add`**: merged.
  - Stage 1 docs PR: #376
  - 결과: PLANNER_WEEK 주간 이동/이모지·배지 제거/CTA 정리, MENU_ADD 2열 옵션, MANUAL_CREATE 재료 모달, MEAL_SCREEN 정리. Stage 2 N/A.
- **Slice D `wave1-port-shopping-cooking`**: merged.
  - Stage 1 docs PR: #378
  - Stage 4~6 frontend/closeout PR: #379
  - 결과: SHOPPING_FLOW/SHOPPING_DETAIL/COOK_MODE Wave1 UI-only 포팅, authority blocker 0.
- **Slice E `wave1-port-pantry`**: merged.
  - Stage 1 docs PR: #380
  - Stage 4~6 frontend/closeout PR: #381
  - 결과: PANTRY/add sheet/bundle picker/multi-delete Wave1 UI-only 포팅, authority blocker 0. `ingredients.image_url`은 contract-evolution 후보로 분리.
- **Slice F `wave1-port-account-library-leftovers`**: Stage 4~6 closeout projection.
  - Stage 1 docs PR: #382
  - Stage 4~6 frontend/closeout PR: #383
  - Stage 4~6 frontend/closeout branch: `feature/fe-wave1-port-account-library-leftovers`
  - Claude Stage 1 handoff attempted via resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc`; provider limit reset 13:20 Asia/Seoul blocked editing, so Codex fallback prepared Stage 1 docs and frontend closeout.
  - 결과: MYPAGE visible settings entry, LEFTOVERS/ATE_LIST clipping/copy polish, ATE_LIST uneat API preserved with `남은요리로 복귀` label, RECIPEBOOK_DETAIL custom book menu, 390/320 screenshot evidence, authority blocker 0, `pnpm verify:frontend` passed.

## Read First

새 세션은 아래 파일을 먼저 읽는다.

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. `docs/workpacks/README.md`
3. `docs/engineering/slice-workflow.md`
4. `docs/engineering/agent-workflow-overview.md`
5. `docs/engineering/product-design-authority.md`
6. `docs/design/design-tokens.md`
7. `docs/design/mobile-ux-rules.md`
8. `docs/design/anchor-screens.md`
9. `ui/designs/BAEMIN_STYLE_DIRECTION.md`
10. slice 13+ future screen이면 `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
11. `ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md`
12. `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
13. 실제 구현 대상 화면의 현재 서비스 파일

토큰 기준 주의:

- production 기준 brand token은 `docs/design/design-tokens.md`와 `app/globals.css`의 승인 값을 따른다.
- prototype의 mint/Jua/font/asset은 바로 production 계약이 아니다.
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`의 `prototype parity`, `prototype-derived design`, `out of prototype scope` 용어만 사용한다.

프로토타입 쪽 참고 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/index.html`
- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/tokens.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/*.jsx`

## Working Contract

- product slice는 Stage 1~6 흐름을 따른다.
- Stage 1은 Claude가 workpack README/acceptance/automation-spec, `.workflow-v2/work-items/<slice>.json`, `.workflow-v2/status.json` matching item을 작성하고 `docs/workpacks/README.md`에 해당 slice row와 Status를 맞춘다.
- Stage 2는 Codex가 BE 변경이 필요한 경우만 수행한다. UI-only 또는 기존 API로 가능한 slice는 `N/A` 근거를 남긴다.
- Stage 3은 BE 변경이 있었을 때 Claude review를 받는다.
- Stage 4는 Claude가 FE 포팅을 수행한다. UI가 실제로 바뀌면 관련 `ui/designs/<SCREEN_ID>.md` 또는 authority/design closeout 메모도 현재 화면 기준으로 맞춘다.
- Stage 5는 Codex가 public design review와 authority precheck를 수행한다. authority-required slice는 Claude `final_authority_gate`에서 blocker 0개 확인 후에만 `confirmed`로 닫는다.
- Stage 6은 Codex가 code review, local verification, PR checks, merge까지 닫는다.
- 사용자가 `$claude-delegate`를 명시하면 기존 Claude session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc`에 `--resume`으로 붙는다. 가능하면 `session_attach_mode=resume`, `model=opus`, `effort=xhigh` 의도로 기록한다. 로컬 CLI가 `xhigh`를 받지 않으면 `high`로 대체하고 그 사실을 artifact에 남긴다.

## Stage Flow Per Slice

각 slice는 아래 순서로 진행한다.

1. Stage 1, Claude
   - `docs/workpacks/<slice>/README.md`
   - `docs/workpacks/<slice>/acceptance.md`
   - `docs/workpacks/<slice>/automation-spec.json`
   - `.workflow-v2/work-items/<slice>.json`
   - `.workflow-v2/status.json` matching item
   - `docs/workpacks/README.md`에 해당 Wave1 slice row가 없으면 먼저 등록하고 Status를 `docs`로 기록. 이미 `planned` row가 있으면 `planned -> docs`
   - `Design Authority` 섹션과 screenshot/Figma evidence 계획
   - 신규 화면, high-risk UI change, anchor extension이면 `ui/designs/<SCREEN_ID>.md`와 `ui/designs/critiques/<SCREEN_ID>-critique.md`
   - Baemin prototype 적용 화면은 `BAEMIN_STYLE_DIRECTION.md` 용어를 사용하고, slice 13+는 h8 screen/surface matrix 반영
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
   - new-screen/high-risk UI change는 `pnpm qa:explore -- --slice <slice>`와 `pnpm qa:eval` 수행, 생략 시 PR에 low-risk skip 근거 기록
   - Draft PR Ready 전 `pnpm validate:pr-ready -- --slice <slice> --pr-body <pr-body-file> --mode frontend`

5. Stage 5, Codex
   - screenshot evidence 기반 authority precheck / public design review
   - anchor screen은 authority report와 blocker 0개 확인
   - touch target, overflow, CTA clipping, text wrapping finding 기록
   - authority-required slice는 Claude final authority gate 통과 전 merge-ready로 넘기지 않음

6. Stage 6, Codex
   - code review
   - `pnpm verify:frontend`
   - 필요 시 `pnpm qa:explore -- --slice <slice>`와 `pnpm qa:eval`
   - `pnpm validate:authority-evidence-presence`
   - exploratory QA를 실행했거나 required인 경우 `pnpm validate:exploratory-qa-evidence`
   - real DB smoke가 필요한 slice는 `pnpm validate:real-smoke-presence`
   - PR checks current head green 확인
   - merge 후 알림 채널이 설정되어 있으면 Discord 알림

## Recommended Order

| Order | Slice ID | Goal | Primary Owner Flow | Notes |
| --- | --- | --- | --- | --- |
| 0 | `planner-column-customization` | SETTINGS 끼니 컬럼 관리 + PLANNER_WEEK 동적 컬럼 | Done | PR #367~#370 merged. 다시 하지 않는다. |
| A | `wave1-port-foundation` | 공통 shell, 공용 UI 패턴, CTA/칩/카드/모달 위계 | Stage 1~6 | 가장 먼저. 단, AppShell/bottom tab은 `baemin-prototype-home-porting` 현재 상태와 충돌 여부를 Stage 1에서 먼저 잠근다. |
| B | `wave1-port-discovery-detail` | HOME, RECIPE_DETAIL, save modal, login provider display | Stage 1~6 | HOME은 기존 `baemin-prototype-home-porting`과 충돌/중복 확인 후 시작. |
| C | `wave1-port-planner-meal-add` | PLANNER, MENU_ADD, MANUAL_CREATE, MEAL_SCREEN | Stage 1~6 | 컬럼 CRUD는 완료된 `planner-column-customization` 계약을 소비한다. |
| D | `wave1-port-shopping-cooking` | SHOPPING_FLOW, SHOPPING_DETAIL, COOK_READY/COOK_MODE | Done | PR #379 merged. 장보기 read-only/exclude/add_to_pantry 규칙 유지. |
| E | `wave1-port-pantry` | PANTRY, ingredient picker, bundle picker, multi-delete | Done | PR #381 merged. 재료 이미지 URL은 계약 후보로 분리. |
| F | `wave1-port-account-library-leftovers` | MYPAGE, SETTINGS polish, LEFTOVERS, ATE_LIST, RECIPEBOOK_DETAIL | Stage 4~6 closeout | SETTINGS 컬럼 관리 완료 상태와 충돌하지 않게 조심. |
| G | `wave1-port-web-followup` | 앱 포팅 이후 웹-only 조정 | 별도 계획 | 앱 slice 완료 후 최신 프로토타입 기준으로 다시 작성. |

## Slice A: wave1-port-foundation

### Scope

- 공통 layout shell
- header / bottom tabs / top nav 대응
- Button, Chip, Card, Modal/Sheet, Dropdown 공통 스타일 정리
- 정렬 dropdown 패턴
- 공통 CTA 위계
- app-wide spacing, safe-area, sticky bottom action rules

### Stage 1 Must Resolve

- `docs/workpacks/baemin-prototype-home-porting` status와 현재 HOME/AppShell 구현을 먼저 확인한다.
- HOME 전용 bottom tab, shared `AppShell`, `components/layout/bottom-tabs.tsx` 중복 변경 가능성을 dependency로 기록한다.
- production 토큰은 `docs/design/design-tokens.md` 승인 값을 기본으로 쓰고, prototype mint/Jua/asset은 별도 승인 없이 공통 foundation으로 승격하지 않는다.
- 새 공용 primitive 도입은 high-risk UI change로 보고 design-generator/design-critic 필요 여부와 authority evidence 계획을 `automation-spec.json`에 명시한다.

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

- `pnpm verify:frontend`
- `pnpm validate:pr-ready -- --slice wave1-port-foundation --pr-body <pr-body-file> --mode frontend`
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
| 좋아요/저장수 표시 | 공식 API로 가능 | detail response의 `like_count`, `save_count` 소비. 구현 타입/fixture 정합만 확인. |
| 요리완료수 표시 | 공식 API로 가능 | detail response의 `cook_count` 소비. 플래너 등록수는 `plan_count`. |
| 조회수 제거 | UI-only | 데이터는 보존 가능, 화면에서 숨김. |
| save modal recipebook 생성 | 기존 API로 가능 | `POST /recipe-books`, save API 소비. |
| login provider 축소 | UI-only + auth config 확인 | 버튼 숨김은 FE 가능. 실제 provider disable은 운영 config 정책 확인. |

### Contract Evolution Candidates

- metric source를 기존 `view_count` / `like_count` / `save_count` / `plan_count` / `cook_count` 외 새 집계로 바꾸려 할 때
- 조회수 표시/비표시 정책을 공식 화면 계약과 다르게 바꾸려 할 때
- provider list를 실제 Supabase config에서 비활성화해야 할 때

### Verification

- HOME unit/component tests
- RECIPE_DETAIL E2E
- save modal E2E
- login provider display test
- mobile 390/320 authority evidence for HOME and RECIPE_DETAIL
- `pnpm validate:authority-evidence-presence`

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
| 남은요리에서 추가 | 공식 API로 가능 | `POST /meals`에 `leftover_dish_id` 포함. 구현 라우팅/상태만 확인. |
| 직접등록 완료 버튼 | UI-only / existing API | `POST /recipes` 후 완료 CTA. |
| 재료 선택 modal 다중 선택 | 기존 API로 가능 | ingredients API 소비. |
| 재료 양 입력 위치 변경 | UI-only | 저장 payload shape 유지. |
| MEAL_SCREEN recipe click | UI-only / existing route | `/recipe/[id]` 이동. |
| meal -> cook_done -> leftover 자동 생성 | 공식 요리 완료 API로 가능 | `POST /cooking/sessions/{id}/complete` 경유 시 공식 계약. 세션을 우회하거나 새 상태 전이를 만들면 contract candidate. |

### Contract Evolution Candidates

- `POST /meals` + `leftover_dish_id`가 아닌 별도 leftover attach API를 새로 만들려 할 때
- cooking session complete를 우회해 `meals.status`를 직접 바꾸려 할 때
- pantry 미사용 사용자 분기에서 공식 9-4/9-6 완료 흐름과 다른 상태 전이를 요구할 때

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

### Delivery Status

- Stage 1 docs/workpack PR merged as #378.
- Stage 4 frontend implementation and screenshot evidence completed on `feature/fe-wave1-port-shopping-cooking`.
- Claude resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc` was attempted for Stage 4, but provider limit blocked completion; per user instruction, Codex completed the slice directly.
- Stage 5/6 closeout is ready for PR validation and merge through the ship loop.

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
| share button | 공식 API로 가능 | `GET /shopping/lists/{id}/share-text` 소비. |
| shopping list title/date | 공식 API로 가능 | `shopping_lists.title`, `created_at` 소비. 없는 fixture/type만 보강. |
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
| delete mode UI | UI-only + 공식 API | `DELETE /pantry` + `ingredient_ids` 사용. |
| multi-delete | 공식 API로 가능 | batch delete endpoint가 이미 공식 계약에 있음. |
| ingredient image | 기존 API로 가능 여부 확인 | image field가 없으면 placeholder or contract candidate. |
| category chips | 기존 API로 가능 여부 확인 | category enum/mapping 확인. |
| hidden unowned ingredients | UI-only | pantry screen에서는 보유 items만 보여줌. |

### Design Authority Notes

- h8 기준 `PANTRY`는 screen-level `prototype parity` 후보이다.
- `PANTRY_BUNDLE_PICKER`는 별도 승격 전까지 `prototype-derived design`이다.
- prototype-only bottom tab behavior, `Jua`, prototype-only assets는 scope 밖이다.

### Contract Evolution Candidates

- ingredient image URL이 공식 API에 없을 때
- category group이 `주식/채소/단백질/양념`으로 정규화되어 있지 않을 때
- 기존 `DELETE /pantry` 계약으로 부족해 새로운 삭제 정책이 필요할 때

### Verification

- PANTRY list/search/filter E2E
- add ingredient modal E2E
- bundle add E2E
- multi-delete E2E
- mobile screenshot evidence 390/320

### Delivery Status

- Stage 1 docs branch: `docs/wave1-port-pantry-stage1`
- Stage 4/5 implementation branch: `feature/fe-wave1-port-pantry`
- Claude Stage 1 handoff: attempted with resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc`; provider limit reset was 13:20 Asia/Seoul.
- Codex fallback: Stage 1 workpack docs created because the user explicitly instructed Codex to continue directly when Claude token limit ends.
- Codex Stage 4/5 fallback: PANTRY UI, add sheet retry state, bundle picker labels, multi-delete bottom CTA, Playwright evidence, and `ui/designs/authority/WAVE1_PANTRY-authority.md` completed with blocker 0.
- Contract finding: official `category` exists on `ingredients`/`pantry` responses; official ingredient image URL does not exist and remains a contract-evolution candidate.

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
- `덜먹음` API 유지, UI label을 `남은요리로 복귀`로 조정
- `플래너에 추가` 문구 정리
- leftover/eaten meta는 현재 공식 응답에서 가능한 날짜 중심 정보만 유지
- recipebook detail kebab menu: rename/delete

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| mypage gear/saved recipes 제거 | UI-only | routes는 유지 가능. |
| settings account action copy | UI-only | existing logout/delete API 유지. |
| planner column management | Done | `planner-column-customization` merged. 다시 만들지 않음. |
| leftovers/ate button shape | UI-only | route links 유지. |
| `다먹음` 텍스트 제거 | UI-only | list source 유지. |
| `덜먹음` label 조정 | UI-only | API와 상태 전이는 유지. |
| recipebook kebab menu | 기존 API로 가능 | rename/delete endpoints 확인. |

### Design Authority Notes

- h8 기준 `MYPAGE` shell은 screen-level `prototype parity` 후보이다.
- MYPAGE sub-tabs, `SETTINGS`, `LEFTOVERS`, `ATE_LIST`, `RECIPEBOOK_DETAIL`은 별도 승격 전까지 `prototype-derived design`이다.
- shell parity가 sub-surface parity로 자동 전파되지 않게 Stage 1에서 화면별 classification을 분리한다.

### Verification

- MYPAGE E2E
- SETTINGS E2E regression
- LEFTOVERS / ATE_LIST E2E
- RECIPEBOOK_DETAIL E2E
- button clipping screenshots 320/390

### Delivery Status

- Stage 1 docs branch: `docs/wave1-port-account-library-leftovers`
- Stage 4~6 implementation branch: `feature/fe-wave1-port-account-library-leftovers`
- Stage 4~6 frontend/closeout PR: #383
- Stage 2/3: N/A, existing contracts were sufficient.
- Codex fallback: completed FE implementation after Claude provider limit blocked Stage 4 delegation.
- Authority: `ui/designs/authority/WAVE1_ACCOUNT_LIBRARY_LEFTOVERS-authority.md`, verdict pass, blocker 0.
- Verification: targeted Vitest passed 78 tests, modified Playwright bundle passed 189 tests, exploratory QA eval score 98, and `pnpm verify:frontend` passed.

## Cross-Slice Mapping Table

| Change Area | UI-only | Existing API 가능성 | Docs + BE 필요 가능성 |
| --- | --- | --- | --- |
| Header/profile/cart removal | yes | no | no |
| Filter chip position | yes | ingredients/recipes unchanged | no |
| Sort modal -> dropdown | yes | no | no |
| Recipe detail metric layout | yes | documented count fields | new metrics beyond documented fields |
| Recipe detail bottom CTA | yes | planner add/cook routes | no |
| Save modal copy/layout | yes | save/book APIs | no if existing endpoints sufficient |
| Planner weekly movement | mostly | planner range API | no if current API sufficient |
| Planner column default/customization | done | done | done in #367~#370 |
| Meal add option modal | yes | existing add flows incl. `leftover_dish_id` | no unless new attach policy |
| Manual create ingredient modal | mostly | ingredients + recipe create | unit/category contract if missing |
| Meal screen recipe click | yes | recipe route | no |
| Meal cook_done -> leftover auto | no | official cooking complete APIs | docs+BE only if bypassing official complete flow |
| Shopping excluded section | mostly | shopping detail item APIs | no if current contract sufficient |
| Shopping list title/date | yes | title/date fields documented | no unless generation policy changes |
| Shopping share | yes | share-text API | no |
| Pantry reflect on complete | yes | complete API | no, preserve 3-way rules |
| Cook mode control removal | yes | existing session APIs | no |
| Pantry category chips/images | maybe | pantry/ingredient fields 확인 | image/category contract if missing |
| Pantry multi-delete | yes | `DELETE /pantry` with ids | no unless new delete semantics |
| Mypage/settings polish | yes | existing account APIs | no |
| Leftovers/Ate copy/buttons | yes | leftovers APIs | no unless state/action removed |
| Recipebook menu | mostly | recipebook rename/delete | no if endpoints exist |
| Login provider display | FE yes | auth config 확인 | provider policy/config if disabling server-side |

## Contract Evolution Rule

다음 중 하나라도 해당하면 구현 전에 사용자 승인 기반 `contract-evolution` PR을 먼저 만든다.

- 공식 API 문서에 없는 endpoint, response field, request field가 필요하다.
- DB schema 또는 status enum을 바꿔야 한다.
- `meals.status` 전이가 `registered -> shopping_done -> cook_done` 외 흐름을 요구한다.
- shopping read-only, `exclude -> uncheck`, `add_to_pantry_item_ids` 3-way 규칙을 바꾸게 된다.
- auth provider 자체를 운영 설정에서 제거해야 한다.
- production data migration 또는 backfill이 필요하다.
- anchor screen의 header 구조, section 배치, action hierarchy 같은 공식 화면 계약을 바꾸게 된다.

## Suggested New Session Prompt

새 세션을 시작할 때 아래처럼 요청하면 된다.

```text
docs/workpacks/wave1-service-porting-plan.md를 먼저 읽고, Wave1 실제 서비스 포팅을 Slice B(wave1-port-discovery-detail)부터 진행해줘.
Slice A(wave1-port-foundation)는 merged. Slice B Stage 1 docs도 완료 — Stage 4 FE 포팅을 시작한다.
AGENTS.md 규칙에 따라 Stage 4는 Claude에게 FE 포팅을 맡기고, 필요한 경우 $claude-delegate로 기존 세션 3f4ca745-db71-4392-a3f1-4e3c4493e9bc에 --resume으로 붙어줘.
각 slice는 UI-only / 기존 API로 가능 / contract-evolution 필요 항목을 먼저 판정하고, 완료 후 $ship-pr-loop로 PR merge까지 진행해줘.
```

## First Next Action

다음 세션의 첫 실제 작업은 `wave1-port-discovery-detail` Stage 4 FE 포팅이다.

- Slice A `wave1-port-foundation`: merged (PR #372, #373).
- Slice B `wave1-port-discovery-detail`: Stage 1 docs 완료, Stage 1.5 repair 완료.

1. `pnpm branch:start -- --slice wave1-port-discovery-detail --role fe`
2. Claude에게 Stage 4 FE 포팅 위임
3. HOME header 단순화, sort dropdown 전환, filter chip 재배치
4. RECIPE_DETAIL 별점 제거, hero metric 표시, 하단 CTA 2버튼 재구성
5. save modal 프리뷰 제거 + 버튼 라벨 정리
6. login provider 카카오/Apple 숨김
7. Vitest + Playwright 테스트
8. mobile 390/320 screenshot evidence 생성
9. `pnpm verify:frontend` 통과
10. `pnpm validate:pr-ready -- --slice wave1-port-discovery-detail --pr-body <pr-body-file> --mode frontend`
