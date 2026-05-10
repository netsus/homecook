# wave1-port-account-library-leftovers

> Slice F of Wave1 Service Porting Plan
> Stage: Stage 6 frontend closeout
> Owner: Codex fallback after Claude provider limit reset was 13:20 Asia/Seoul

## Goal

`MYPAGE`, `SETTINGS`, `LEFTOVERS`, `ATE_LIST`, `RECIPEBOOK_DETAIL`의 Wave1 프로토타입 개선사항을 기존 공식 API/DB/status 계약 범위 안에서 UI-first로 포팅한다. 마이페이지 계정/레시피북/장보기 기록의 시각 위계, 설정 화면의 계정 액션, 남은요리/다먹은요리 카드와 버튼 잘림, 레시피북 상세의 book-level 메뉴를 정리하되 `16-leftovers`, `17a`, `17b`, `17c`, `planner-column-customization`에서 이미 확정된 계약은 다시 만들지 않는다.

## In Scope

### Screens

| Screen | Component File | Change Summary |
| --- | --- | --- |
| MYPAGE | `components/mypage/mypage-screen.tsx` | top gear icon 제거 또는 계정/설정 진입을 텍스트형 row로 정리, saved recipes standalone section이 있으면 레시피북 탭으로 흡수, 계정 정보 영역에서 withdrawal action 제거, tab/card density와 320px overflow 점검 |
| SETTINGS | `components/settings/settings-screen.tsx` | 로그아웃/회원탈퇴 텍스트 자체를 명확한 trigger로 사용, account/action category cleanup, 닉네임 sheet/confirm dialog visual polish, planner column management 계약은 유지하고 시각 정리만 허용 |
| LEFTOVERS | `components/leftovers/leftovers-screen.tsx` | 남은요리 카드의 양방향 CTA가 320px에서 잘리지 않게 정리, `다먹음`/`플래너에 추가` action hierarchy와 문구 정리, meta 노출 축소 |
| ATE_LIST | `components/leftovers/ate-list-screen.tsx` | description/meta에서 반복 `다먹음` 텍스트 제거, `덜먹음` action은 API 유지 전제로 숨김/보조화/문구 조정 중 Stage 4에서 결정, 320px button clipping 방지 |
| RECIPEBOOK_DETAIL | `components/recipebook/recipebook-detail-screen.tsx` | custom book에서 book-level kebab menu로 이름 변경/삭제 진입을 제공할 수 있는지 확인, system book은 rename/delete 미노출, recipe remove 정책은 기존 17b 계약 유지 |

### APIs Consumed (no changes)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/users/me` | GET / PATCH / DELETE | 프로필 조회, 닉네임 변경, 회원 탈퇴 |
| `/users/me/settings` | PATCH | screen wake lock 설정 저장 |
| `/auth/logout` | POST | 로그아웃 |
| `/planner/columns` | GET / POST | SETTINGS의 끼니 컬럼 목록/추가 |
| `/planner/columns/{column_id}` | PATCH / DELETE | SETTINGS의 끼니 컬럼 이름 변경/삭제 |
| `/recipe-books` | GET / POST | MYPAGE 레시피북 목록/생성 |
| `/recipe-books/{book_id}` | PATCH / DELETE | custom 레시피북 이름 변경/삭제 |
| `/recipe-books/{book_id}/recipes` | GET | RECIPEBOOK_DETAIL 목록 조회 |
| `/recipe-books/{book_id}/recipes/{recipe_id}` | DELETE | 레시피북에서 레시피 제거 또는 liked 해제 |
| `/shopping/lists` | GET | MYPAGE 장보기 기록 |
| `/leftovers` | GET | LEFTOVERS / ATE_LIST 목록 |
| `/leftovers/{leftover_id}/eat` | POST | 남은요리 다먹음 처리 |
| `/leftovers/{leftover_id}/uneat` | POST | 다먹은요리 덜먹음 복귀. API는 유지한다. |
| `/meals` | POST | leftover_dish_id 기반 플래너 추가 |

### DB / Schema Changes

None. 기존 테이블과 필드만 소비한다.

- `users`
- `recipe_books`, `recipe_book_items`, `recipe_likes`
- `shopping_lists`
- `leftover_dishes`
- `meals`
- `meal_plan_columns`

### Status / Contract Changes

None.

- `leftover_dishes.status`는 `leftover` / `eaten`만 유지한다.
- `POST /leftovers/{id}/eat`, `POST /leftovers/{id}/uneat`의 멱등성은 기존 계약을 유지한다.
- `meal_plan_columns`는 기본 3개, 사용자 관리 1~5개, 빈 컬럼만 삭제 가능 계약을 유지한다.
- system recipe book(`my_added`, `saved`, `liked`) rename/delete 금지, `custom`만 허용 정책을 유지한다.
- `RECIPEBOOK_DETAIL`의 `my_added` recipe removal 금지, `liked`는 좋아요 해제, `saved/custom`은 book item 제거 정책을 유지한다.

## Out of Scope

- API/DB/status/endpoint/field 추가 또는 변경
- `leftover_dishes` 응답에 끼니명/인분/meal column 정보를 임의 추가
- `덜먹음` API 삭제 또는 상태 전이 제거
- 회원 탈퇴, 로그아웃, 닉네임 변경, planner column management 정책 변경
- system recipe book rename/delete 허용
- `DELETE /recipes/{id}/save` 복구
- MYPAGE 외 HOME/PLANNER/PANTRY/SHOPPING/COOKING 화면 변경
- 새 npm dependency 추가
- prototype-only font/asset/bottom-tab behavior 도입

## Dependencies

| Dependency | Status | Notes |
| --- | --- | --- |
| `wave1-port-foundation` | merged | 공용 shell, Button/Chip/Card/Modal, safe-area 기반 |
| `wave1-port-discovery-detail` | merged | HOME/RECIPE_DETAIL/Login/save modal 포팅 완료 |
| `wave1-port-planner-meal-add` | merged | PLANNER/MENU_ADD/MEAL_SCREEN 포팅 완료 |
| `wave1-port-shopping-cooking` | merged | SHOPPING/COOKING 포팅 완료, PR #379 merged |
| `wave1-port-pantry` | merged | PANTRY 포팅 완료, PR #381 merged |
| `16-leftovers` | merged | LEFTOVERS/ATE_LIST API와 기본 UI |
| `17a-mypage-overview-history` | merged | MYPAGE shell, recipebook tab, shopping history |
| `17b-recipebook-detail-remove` | merged | RECIPEBOOK_DETAIL 조회/레시피 제거 |
| `17c-settings-account` | merged | SETTINGS, logout, nickname, delete account, planner column management |
| `planner-column-customization` | merged | SETTINGS 끼니 컬럼 관리 계약 완료. 다시 구현하지 않음 |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | MYPAGE shell parity candidate, sub-surfaces prototype-derived |

## Backend First Contract

### Stage 2: N/A by default

이 slice는 UI-only 포팅으로 시작한다. 현재 공식 계약과 구현이 Wave1 주요 변경을 지원한다.

근거:

- MYPAGE top gear 제거/설정 진입 위치 변경은 route/API 변경 없이 가능하다.
- saved recipes standalone section 제거 또는 recipebook 흡수는 `GET /recipe-books`의 system book(`saved`) 카드로 충분하다.
- SETTINGS logout/withdrawal 텍스트 trigger와 account category cleanup은 기존 `POST /auth/logout`, `DELETE /users/me`를 그대로 호출한다.
- SETTINGS planner column management는 이미 `GET/POST/PATCH/DELETE /planner/columns` 계약으로 완료됐다.
- LEFTOVERS/ATE_LIST 카드/CTA clipping, copy, meta 축소는 `GET /leftovers`, eat/uneat/move-to-planner API를 유지한 UI 변경이다.
- RECIPEBOOK_DETAIL의 custom book rename/delete menu는 기존 `PATCH/DELETE /recipe-books/{book_id}`로 가능하다.

### Stage 2 Escalation Conditions

아래 중 하나가 확인되면 Stage 4 구현 전에 contract-evolution 또는 별도 BE slice로 분리한다.

- LEFTOVERS meta에 `저녁`, `2인분` 같은 정보가 필요한데 현재 `GET /leftovers` 응답과 공식 문서에 없다.
- `덜먹음` action을 제품에서 제거하려면 공식 화면/flow 계약을 함께 바꿔야 한다.
- RECIPEBOOK_DETAIL에서 system book rename/delete를 허용하려는 요구가 생긴다.
- 회원 탈퇴/로그아웃 confirm 정책, 삭제 복구 정책, provider/account policy를 바꾸려 한다.
- MYPAGE/SETTINGS의 planner column management 최소/최대/삭제 제한을 완화하려 한다.

### Error Handling

| HTTP Status | Scenario | FE Response |
| --- | --- | --- |
| 401 | 비로그인 | login gate + return-to-action 유지 |
| 403 | 타인 리소스 또는 system book rename/delete | forbidden 피드백, 버튼 미노출 우선 |
| 404 | 삭제된 recipebook/leftover/shopping list | empty/error 안내 후 목록 복귀 |
| 409 | 연관된 meal이 있는 planner column 삭제 제한 등 | inline 설명, 기존 계약 유지 |
| 422 | 빈 이름, nickname 길이, invalid status 등 | 입력 validation 및 inline error |
| 500 | 서버 오류 | 재시도 또는 dialog 내 error 유지 |

## Frontend Delivery Mode

### Required UI States

| State | MYPAGE | SETTINGS | LEFTOVERS / ATE_LIST | RECIPEBOOK_DETAIL |
| --- | --- | --- | --- | --- |
| `loading` | profile/books/shopping skeleton | profile/columns skeleton | list skeleton | recipe list skeleton |
| `empty` | custom book/shopping empty | N/A | leftover/eaten empty | recipe empty |
| `error` | retry content state | inline/screen retry | retry content state | retry content state |
| `unauthorized` | login gate + `/mypage` return | login gate + `/settings` return | current route return | detail route return |
| `destructive-confirm` | custom book delete | logout/delete account/column delete | N/A unless hidden recovery action kept | custom book delete if added |

### MYPAGE

- Top gear icon은 제거하거나 profile 영역의 주된 action에서 내려 `설정` 텍스트 row로 정리한다.
- 계정 정보 영역에는 회원 탈퇴 CTA를 두지 않는다. destructive account action은 SETTINGS에만 둔다.
- saved recipes가 별도 section으로 중복 노출되면 system recipebook card `저장한 레시피`로 흡수한다.
- `MYPAGE_TAB_RECIPEBOOK`과 `MYPAGE_TAB_SHOPPINGLISTS`는 shell parity에서 자동 승격하지 않고 prototype-derived로 유지한다.
- 320px에서 tab label, card count, custom book kebab menu가 잘리지 않아야 한다.

### SETTINGS

- `로그아웃`, `회원탈퇴` 텍스트 자체가 명확한 trigger여야 한다.
- account/action category를 정리하되 기존 confirm dialog와 failure recovery는 유지한다.
- planner column management는 완료된 계약을 소비한다. 컬럼 기본값, 1~5개 제한, 빈 컬럼만 삭제 가능 정책을 바꾸지 않는다.
- 닉네임 변경 sheet와 column add/rename/delete sheet/dialog가 320px에서 CTA clipping 없이 보여야 한다.

### LEFTOVERS / ATE_LIST

- 두 action button이 320px에서 잘리지 않게 layout을 조정한다.
- `다먹음` 텍스트는 action label로만 필요할 때 쓰고, ATE_LIST meta/description에서는 반복 노출을 제거한다.
- `덜먹음`은 API를 삭제하지 않는다. Stage 4는 다음 중 하나를 선택하고 근거를 authority report에 남긴다.
  - action을 보조 메뉴/secondary action으로 낮춘다.
  - label을 사용자 친화적으로 바꾼다.
  - 화면에서 숨기되 기존 API/E2E 정책 변화가 필요한지 별도 후보로 남긴다.
- meta는 현재 공식 응답에서 안정적으로 제공되는 값만 사용한다. `4/20 저녁 2인분` 전체가 필요하면 contract-evolution 후보로 분리한다.
- `플래너에 추가` 문구와 CTA hierarchy를 정리하되 `POST /meals`의 `leftover_dish_id` 경로는 유지한다.

### RECIPEBOOK_DETAIL

- 기존 recipe removal 정책은 유지한다.
- custom book에서만 book-level kebab menu로 `이름 변경`, `삭제`를 제공할 수 있다.
- system book(`my_added`, `saved`, `liked`)은 book rename/delete menu를 표시하지 않는다.
- recipe card action과 book-level action이 시각적으로 충돌하지 않아야 한다.
- drift proof가 없으면 RECIPEBOOK_DETAIL 전체 재디자인은 하지 않고 low-risk reused로 둔다.

## Design Authority

- UI risk: `high-risk` — MYPAGE는 h8 기준 screen-level prototype parity candidate이고, LEFTOVERS/ATE_LIST/SETTINGS는 기존 confirmed 화면을 다시 다루는 Wave1 visual port이다.
- Classification:
  - `MYPAGE`: screen-level `prototype parity` candidate
  - `MYPAGE_TAB_RECIPEBOOK`, `MYPAGE_TAB_SHOPPINGLISTS`: `prototype-derived design`
  - `SETTINGS`: `prototype-derived design`
  - `LEFTOVERS`, `ATE_LIST`: `prototype-derived design`
  - `RECIPEBOOK_DETAIL`: `confirmed-low-risk-reused` unless drift proof exists
- Visual artifact: Stage 4/5에서 mobile 390px/320px screenshot evidence 생성
  - `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-default.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-narrow.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/settings-default.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/settings-narrow.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-default.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-narrow.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-default.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-narrow.png`
  - `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-default.png` if touched
  - `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-narrow.png` if touched
- Authority report path:
  - `ui/designs/authority/WAVE1_ACCOUNT_LIBRARY_LEFTOVERS-authority.md`
- Authority status: `reviewed`

### Design Generator / Critic

- 새 visual direction을 생성하지 않고 기존 Wave1 prototype, existing authority docs, current service screenshots를 기준으로 포팅한다.
- `MYPAGE`는 screen-level candidate이므로 Stage 4 구현 후 authority review가 필요하다.
- `LEFTOVERS`, `ATE_LIST`, `SETTINGS`는 기존 authority docs가 있어도 Wave1에서 실제 화면을 수정하면 새 evidence와 authority report를 남긴다.
- `RECIPEBOOK_DETAIL`은 drift proof 없이 redesign하지 않는다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — Codex fallback authority report blocker 0
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.6.5.md`
- `docs/화면정의서-v1.5.2.md`
- `docs/api문서-v1.2.3.md`
- `docs/db설계-v1.3.2.md`
- `docs/유저flow맵-v1.3.2.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/workpacks/16-leftovers/README.md`
- `docs/workpacks/17a-mypage-overview-history/README.md`
- `docs/workpacks/17b-recipebook-detail-remove/README.md`
- `docs/workpacks/17c-settings-account/README.md`
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/MYPAGE.md`
- `ui/designs/LEFTOVERS.md`
- `ui/designs/ATE_LIST.md`
- `ui/designs/authority/MYPAGE-authority.md`
- `ui/designs/authority/LEFTOVERS-authority.md`
- `ui/designs/authority/ATE_LIST-authority.md`
- `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
- `ui/designs/prototypes/claude-design-260505-wave1/COVERAGE_REVIEW.md`
- `ui/designs/prototypes/claude-design-260505-wave1/uploads/baemin-full-port-ledger.md`

## Contract Evolution Candidates

아래는 Stage 4 구현에서 필요성이 확인되더라도 사용자 승인과 공식 문서 갱신 전에는 구현하지 않는다.

| Candidate | Reason | Default in this slice |
| --- | --- | --- |
| LEFTOVERS meta 확장 | 현재 `GET /leftovers`는 `cooked_at`, `eaten_at`, recipe title/thumbnail 중심이다. `저녁`, `2인분`을 안정적으로 표시하려면 공식 응답 확장이 필요할 수 있다. | 현재 응답으로 가능한 날짜 중심 meta만 표시 |
| `덜먹음` action 제거 | 공식 API와 기존 ATE_LIST 복구 흐름이 존재한다. 제품 정책에서 제거하려면 flow/screen 계약 sync 필요. | API 유지, UI에서 보조화/label 조정 우선 |
| SETTINGS account policy 변경 | logout/delete account confirm, 소프트 삭제, auth cleanup 정책은 보안/계정 계약이다. | 기존 동작 유지 |
| system recipe book rename/delete | 공식 정책상 system book은 이름 변경/삭제 불가다. | custom book만 menu 제공 |

## Non-Negotiable Rules

1. `planner-column-customization` 계약을 다시 만들거나 완화하지 않는다.
2. `leftover_dishes.status` 전이는 `leftover` / `eaten`만 유지한다.
3. `덜먹음` API를 삭제하지 않는다.
4. 회원 탈퇴는 소프트 삭제와 confirm dialog를 유지한다.
5. system recipe book rename/delete는 허용하지 않는다.
6. 문서에 없는 leftover meta field를 임의 추가하지 않는다.
7. 새 dependency를 추가하지 않는다.

## Primary User Path

1. 사용자가 `/mypage`에 진입해 계정 정보와 레시피북/장보기 기록을 본다.
2. 설정 진입은 icon-only gear 대신 이해하기 쉬운 account/settings row 또는 명확한 위치에서 진행한다.
3. `/settings`에서 화면 꺼짐 방지, 닉네임, 끼니 컬럼, 로그아웃, 회원탈퇴를 기존 계약대로 사용한다.
4. `/leftovers`에서 남은요리를 확인하고 `다먹음` 또는 `플래너에 추가`를 수행한다.
5. `/leftovers/ate`에서 다먹은 기록을 확인한다.
6. `/mypage/recipe-books/{book_id}`에서 레시피북 상세를 보고, custom book이면 book-level rename/delete menu를 사용할 수 있다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [x] Stage 1 docs fallback completed by Codex after Claude provider limit <!-- omo:id=delivery-stage1-docs;stage=1;scope=docs;review=1.5,6 -->
- [x] Stage 2 N/A 근거 confirmed or backend escalation separated <!-- omo:id=delivery-stage2-na;stage=2;scope=backend;review=3,6 -->
- [x] MYPAGE polish implemented without changing recipebook/shopping APIs <!-- omo:id=delivery-mypage-ui;stage=4;scope=frontend;review=5,6 -->
- [x] SETTINGS polish implemented without changing planner column/account contracts <!-- omo:id=delivery-settings-ui;stage=4;scope=frontend;review=5,6 -->
- [x] LEFTOVERS / ATE_LIST button clipping and copy polish implemented <!-- omo:id=delivery-leftovers-ate-ui;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPEBOOK_DETAIL scope either low-risk reused or custom-book menu implemented with existing endpoints <!-- omo:id=delivery-recipebook-detail-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Targeted Vitest and Playwright coverage updated <!-- omo:id=delivery-tests;stage=4;scope=frontend;review=5,6 -->
- [x] Screenshot evidence generated for 390px and 320px touched surfaces <!-- omo:id=delivery-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report has blocker 0 before Design Status confirmed <!-- omo:id=delivery-authority-report;stage=5;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` passed before merge-ready <!-- omo:id=delivery-verify-frontend;stage=6;scope=frontend;review=6 -->

## Stage 4/5 Evidence

- Stage 4 implementation kept the slice UI-only: no API, DB, endpoint, status, dependency, or public contract changes.
- ATE_LIST keeps the existing uneat API but relabels the recovery action to `남은요리로 복귀`; this is the chosen policy because the documented backend flow remains valid.
- Screenshot evidence was generated for MYPAGE, SETTINGS, LEFTOVERS, ATE_LIST, and touched RECIPEBOOK_DETAIL at 390px and 320px.
- Authority report: `ui/designs/authority/WAVE1_ACCOUNT_LIBRARY_LEFTOVERS-authority.md` — verdict `pass`, blocker 0, major 0, minor 2.
- Exploratory QA: `.artifacts/qa/wave1-port-account-library-leftovers/2026-05-10T04-43-48-093Z/exploratory-report.json` — desktop/mobile/small viewport coverage, findings 0.
- QA eval: `.artifacts/qa/wave1-port-account-library-leftovers/2026-05-10T04-43-48-093Z/eval-result.json` — score 98, pass.

## Stage 6 Verification Evidence

- `pnpm verify:frontend` — passed: lint, typecheck, 624 product tests, production build, smoke E2E 758 passed / 4 skipped, a11y 6 passed, visual 12 passed, security 9 passed, Lighthouse autorun passed for 2 URLs / 6 runs.
- `pnpm exec vitest run tests/mypage-screen.test.tsx tests/settings-screen.test.tsx tests/leftovers.frontend.test.tsx tests/recipe-book-detail-screen.test.tsx` — passed, 78 tests.
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17c-settings.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts` — passed, 189 tests.
- `pnpm exec playwright test tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts --project=desktop-chrome` — passed, generated 10 evidence screenshots.
