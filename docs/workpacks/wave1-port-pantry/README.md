# wave1-port-pantry

> Slice E of Wave1 Service Porting Plan
> Stage: 5 authority-reviewed
> Owner: Claude (Stage 1 attempted), Codex (Stage 1 fallback because Claude provider limit reset was 13:20 Asia/Seoul)

## Goal

PANTRY와 PANTRY_BUNDLE_PICKER의 Wave1 프로토타입 개선사항을 기존 공식 API/DB/status 계약 범위 안에서 UI-first로 포팅한다. 팬트리 화면의 추가/묶음 추가 CTA, 검색/카테고리 chip rail, 보유 재료 카드, 선택 삭제 모드, bottom `제거하기` CTA를 정리하되 팬트리의 "보유 여부만 관리" 정책과 기존 `GET/POST/DELETE /pantry`, `GET /pantry/bundles`, `GET /ingredients` 계약을 유지한다.

## In Scope

### Screens

| Screen | Component File | Change Summary |
| --- | --- | --- |
| PANTRY | `components/pantry/pantry-screen.tsx` | 추가 버튼 명확화, 묶음 추가 버튼 위치/라벨 정리, 카테고리 chip rail을 보유 재료 상단에 정렬, 보유 텍스트 제거, 보유 재료 카드의 category/placeholder 정리, 선택 삭제 진입과 bottom `제거하기` CTA 정리 |
| INGREDIENT_ADD_SHEET | `components/pantry/pantry-add-sheet.tsx` | 직접 추가 sheet의 검색/카테고리/선택 CTA label과 disabled 상태 정리 |
| PANTRY_BUNDLE_PICKER | `components/pantry/pantry-bundle-picker.tsx` | 묶음 picker의 bundle label, 보유/미보유 표시, checkbox 위치, 선택 count CTA 정리 |

### APIs Consumed (no changes)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/pantry` | GET | 팬트리 목록 조회, `q`/`category` 필터 |
| `/pantry` | POST | 재료 직접 추가 및 묶음 추가 공용 |
| `/pantry` | DELETE | 선택 재료 삭제, `ingredient_ids` batch delete |
| `/pantry/bundles` | GET | 묶음 목록과 사용자별 `is_in_pantry` 조회 |
| `/ingredients` | GET | 직접 추가 sheet의 재료 검색/카테고리 필터 |

### DB / Schema Changes

None. 기존 테이블과 필드만 소비한다.

- `pantry_items`: `user_id`, `ingredient_id`, `created_at`
- `ingredients`: `id`, `standard_name`, `category`
- `ingredient_bundles`, `ingredient_bundle_items`: bundle picker read

### Status / Contract Changes

None.

- 팬트리는 상태 머신이 없고 CRUD만 수행한다.
- 수량 저장은 하지 않는다.
- 중복 추가, 이미 없는 삭제, 유효하지 않은 `ingredient_id` skip 규칙은 기존 slice 13 계약을 유지한다.

## Out of Scope

- API/DB/status/endpoint/field 추가 또는 변경
- `ingredients.image_url` 또는 pantry item image URL 필드 임의 추가
- 팬트리 수량/유통기한/재고량 관리
- 재료 마스터 CRUD
- HOME의 "이 재료로 레시피 보기" 이동
- 팬트리 기반 추천 (`GET /recipes/pantry-match`)
- 장보기 완료 후 팬트리 반영 (`12b-shopping-pantry-reflect`)
- 요리 완료 후 팬트리 소진 (`15a`, `15b`)
- MYPAGE, SETTINGS, LEFTOVERS 화면 변경 (Slice F)
- 새 npm dependency 추가
- prototype-only font/asset/bottom-tab behavior 도입

## Dependencies

| Dependency | Status | Notes |
| --- | --- | --- |
| `wave1-port-foundation` | merged | 공용 Button/Chip/Card/Modal/Dropdown 프리미티브와 safe-area 정리 |
| `wave1-port-discovery-detail` | merged | HOME/RECIPE_DETAIL 포팅 완료 |
| `wave1-port-planner-meal-add` | merged | PLANNER/MENU_ADD/MEAL_SCREEN 포팅 완료 |
| `wave1-port-shopping-cooking` | merged | SHOPPING/COOKING 포팅 완료, PR #379 merged |
| `13-pantry-core` | merged | PANTRY CRUD와 bundle picker 기본 구현 |
| `12b-shopping-pantry-reflect` | merged | 장보기 완료 후 pantry 반영 |
| `15a-cook-planner-complete` | merged | planner cook completion pantry 소진 |
| `15b-cook-standalone-complete` | merged | standalone cook completion pantry 소진 |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | PANTRY는 screen-level prototype parity candidate, PANTRY_BUNDLE_PICKER는 prototype-derived |

## Backend First Contract

### Stage 2: N/A by default

이 slice는 UI-only 포팅으로 시작한다. 현재 공식 계약과 구현이 Wave1 주요 변경을 대부분 지원한다.

근거:

- category chip/filter: `GET /pantry?category=`와 `GET /ingredients?category=`가 이미 존재한다.
- search: `GET /pantry?q=`와 `GET /ingredients?q=`가 이미 존재한다.
- multi-delete: `DELETE /pantry` body `{ ingredient_ids: uuid[] }`가 이미 batch delete 계약이다.
- hide unowned ingredients: PANTRY 화면은 `GET /pantry`의 보유 item만 표시하므로 기존 계약으로 충분하다.
- bundle add: `GET /pantry/bundles` + `POST /pantry` 재사용 계약이 있다.
- item card image position: 공식 `ingredients`/`pantry` 응답에는 image URL이 없으므로 기존 category/placeholder visual로 처리한다.

### Existing Endpoints Consumed

모든 endpoint는 기존 공식 계약대로 소비한다. API 응답은 `{ success, data, error }` wrapper 형식을 유지한다.

### Error Handling

| HTTP Status | Scenario | FE Response |
| --- | --- | --- |
| 401 | 비로그인 | login gate + return-to-action `/pantry` |
| 403 | 타인 리소스 접근 | 접근 불가 피드백 |
| 404 | 삭제된/없는 resource | empty 또는 error 안내 |
| 422 | 빈 `ingredient_ids` 등 잘못된 요청 | disabled CTA 우선, 서버 오류 시 alert |
| 500 | 서버 오류 | 재시도 안내 |

### Idempotency / Ownership

- `POST /pantry`: 이미 보유한 재료는 silent skip.
- `POST /pantry`: 존재하지 않는 `ingredient_id`는 silent skip.
- `DELETE /pantry`: 이미 없는 재료는 silent skip, `removed`는 실제 삭제 수.
- 모든 mutation은 로그인 사용자 자신의 pantry만 대상으로 한다.

## Frontend Delivery Mode

### Required UI States

| State | PANTRY | Sheet / Picker |
| --- | --- | --- |
| `loading` | pantry list skeleton | ingredient/bundle skeleton |
| `empty` | 보유 재료 없음 + 직접/묶음 추가 CTA | 검색 결과 없음, bundle 없음 |
| `error` | pantry list 재시도 | sheet/picker 오류 + 재시도 |
| `unauthorized` | login gate + `/pantry` return | parent gate에서 차단 |
| `selecting` | checkbox + selected count + bottom `제거하기` CTA | N/A |

### Pantry Selection / Delete

선택 삭제 모드에서:

- checkbox는 delete mode에서만 표시한다.
- 삭제 버튼은 화면 전환 없이 접근 가능해야 한다.
- item 선택 후 bottom CTA는 `제거하기` 중심으로 표시한다.
- `DELETE /pantry`는 선택한 `ingredient_ids`만 전송한다.
- 삭제 성공 후 선택 상태를 초기화하고 목록을 갱신한다.

### Ingredient Images

공식 `GET /pantry`와 `GET /ingredients` 응답에는 image URL이 없다. Stage 4 구현은 다음 중 하나만 허용한다.

- category 색/placeholder/swatch로 item visual을 정리한다.
- 이미 repo에 존재하는 category mapping을 재사용한다.

실제 ingredient image URL을 추가하려면 이 slice에서 구현하지 말고 contract-evolution 후보로 분리한다.

## Design Authority

- UI risk: `high-risk` — PANTRY는 screen-level prototype parity candidate이고, delete mode/bottom CTA는 주요 조작 흐름이다.
- Anchor screen dependency: `PANTRY`
- Visual artifact: Stage 4/5에서 fixed reference 대비 mobile 390px/320px screenshot evidence 생성
  - `ui/designs/evidence/wave1-port-pantry/phase4-prep.md`
  - `ui/designs/evidence/wave1-port-pantry/phase5-visual-audit.md`
  - `ui/designs/evidence/wave1-port-pantry/visual-verdict.json`
  - `ui/designs/evidence/wave1-port-pantry/claude-final-authority-gate.md`
  - `ui/designs/evidence/wave1-port-pantry/pantry-default.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-narrow.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-select-delete.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-empty.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-add-sheet.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-add-sheet-narrow.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-bundle-picker.png`
  - `ui/designs/evidence/wave1-port-pantry/pantry-bundle-picker-narrow.png`
- Authority status: `reviewed` — Phase5 fixed-reference re-audit refreshed 2026-05-13
- Notes:
  - `PANTRY`, `INGREDIENT_ADD_SHEET`, `PANTRY_BUNDLE_PICKER`는 fixed prototype 390px/320px reference가 있는 exact-reference-ready surface다.
  - Visual/layout은 fixed prototype이 기준이고 기능 동작은 MVP/공식 API 계약이 기준이다.
  - prototype-only font, image asset, bottom tab behavior는 scope 밖이다.

### UI Risk Classification

- PANTRY list/search/category: `high-risk-ui-change` (screen-level prototype parity candidate)
- PANTRY delete mode: `high-risk-ui-change` (multi-select + destructive CTA)
- INGREDIENT_ADD_SHEET: `medium-risk-ui-change` (existing sheet polish)
- PANTRY_BUNDLE_PICKER: `medium-risk-ui-change` (prototype-derived picker polish)

### Design Generator / Critic

- PANTRY screen-level parity candidate이므로 Stage 4 구현 후 authority review가 필요하다.
- 새 visual direction을 생성하기보다 `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx`, 기존 13-pantry evidence, 현재 design tokens를 기준으로 정리한다.
- 필요 시 Stage 4에서 screenshot evidence 기반 reviewer/critic pass를 수행한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — 2026-05-13 Phase5 re-audit blocker 0, unclassified visual differences 0
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.6.5.md`
- `docs/화면정의서-v1.5.2.md` §17, §18
- `docs/api문서-v1.2.3.md` §11
- `docs/db설계-v1.3.2.md` §2-1, §2-3, §2-4, §8-1
- `docs/유저flow맵-v1.3.2.md`
- `docs/workpacks/13-pantry-core/README.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx`

## Contract Evolution Candidates

아래는 Stage 4 구현에서 필요성이 확인되더라도 사용자 승인과 공식 문서 갱신 전에는 구현하지 않는다.

| Candidate | Reason | Default in this slice |
| --- | --- | --- |
| ingredient image URL | 공식 pantry/ingredient 응답에 image URL 필드가 없다. | category placeholder/swatch 사용 |
| category vocabulary remap | DB 공식 category는 `채소/육류/해산물/양념/유제품/곡류/기타`다. prototype의 다른 grouping이 필요하면 계약 후보. | 공식 category 그대로 사용 |
| delete policy change | 기존 `DELETE /pantry` batch contract로 충분하다. | 기존 `ingredient_ids` 배열 사용 |

## Non-Negotiable Rules

1. 팬트리는 수량을 저장하지 않는다.
2. `ingredient_ids`가 빈 배열이면 mutation CTA를 비활성화하고 서버 422 규칙을 유지한다.
3. 다른 사용자 pantry item을 수정할 수 없어야 한다.
4. 중복 추가와 이미 없는 삭제는 기존 멱등 정책을 유지한다.
5. 문서에 없는 image/category field를 임의 추가하지 않는다.
6. 새 dependency를 추가하지 않는다.

## Primary User Path

1. 사용자가 `/pantry`에 진입한다.
2. 보유 재료 목록, 검색, category chip rail을 확인한다.
3. [재료 추가]로 직접 추가 sheet를 열고 재료를 선택해 `POST /pantry`를 호출한다.
4. [묶음 추가]로 bundle picker를 열고 미보유 재료를 선택해 `POST /pantry`를 호출한다.
5. [삭제] 또는 선택 모드로 진입해 삭제할 재료를 고른다.
6. bottom `제거하기` CTA로 `DELETE /pantry`를 호출하고 목록을 갱신한다.

## Delivery Checklist

- [x] Stage 1 scope and source links locked <!-- omo:id=delivery-stage1-scope;stage=4;scope=frontend;review=5,6 -->
- [x] Backend N/A reasoning documented <!-- omo:id=delivery-backend-na;stage=4;scope=frontend;review=5,6 -->
- [x] Contract evolution candidates separated <!-- omo:id=delivery-contract-candidates;stage=4;scope=frontend;review=5,6 -->
- [x] PANTRY UI port implemented <!-- omo:id=delivery-pantry-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Ingredient add sheet polish implemented <!-- omo:id=delivery-add-sheet;stage=4;scope=frontend;review=5,6 -->
- [x] Bundle picker polish implemented <!-- omo:id=delivery-bundle-picker;stage=4;scope=frontend;review=5,6 -->
- [x] Multi-delete bottom CTA implemented <!-- omo:id=delivery-delete-mode;stage=4;scope=frontend;review=5,6 -->
- [x] Screenshot evidence captured <!-- omo:id=delivery-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Stage 5/6 authority and closeout complete <!-- omo:id=delivery-closeout;stage=4;scope=frontend;review=5,6 -->
