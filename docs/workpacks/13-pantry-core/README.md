# Slice: 13-pantry-core

## Goal

사용자가 집에 보유한 재료를 팬트리에서 관리(조회 / 직접 추가 / 묶음 추가 / 삭제)할 수 있도록 한다. 팬트리는 수량이 아닌 보유 여부만 저장하며, 장보기 완료 시 반영된 팬트리 항목을 이 화면에서 확인하고 관리할 수 있다.

## Branches

- 백엔드: `feature/be-13-pantry-core`
- 프론트엔드: `feature/fe-13-pantry-core`

## In Scope

- 화면: `PANTRY`, `PANTRY_BUNDLE_PICKER`
- API:
  - `GET /pantry` — 팬트리 목록 조회 (검색, 카테고리 필터)
  - `POST /pantry` — 팬트리 재료 추가 (직접 + 묶음 공용)
  - `DELETE /pantry` — 팬트리 재료 삭제
  - `GET /pantry/bundles` — 묶음 목록 조회
- 상태 전이: 없음 (CRUD only, 별도 상태 머신 없음)
- DB 영향: `pantry_items` (INSERT/DELETE), `ingredients` (READ), `ingredient_bundles` (READ), `ingredient_bundle_items` (READ)
- Schema Change:
  - [x] 공식 DB 계약 변경 없음 — `ingredient_bundles`, `ingredient_bundle_items`는 이미 `db설계-v1.3.1.md`에 정의된 테이블
  - [x] 로컬 스키마 보강 필요 — Stage 2에서 누락된 로컬 마이그레이션 `supabase/migrations/20260428143000_13_pantry_core_bundles.sql` 추가
  - [x] 로컬 seed 보강 필요 — Stage 2에서 `supabase/seed.sql` 및 `scripts/local-seed-demo-data.mjs`에 ingredients/bundles baseline 추가

## Out of Scope

- 팬트리 수량 관리 (정책상 보유 여부만 관리)
- 팬트리 기반 레시피 추천 (`GET /recipes/pantry-match`는 `08b`에서 이미 소비)
- 재료 마스터 CRUD (ingredients 테이블은 seed/admin 관리)
- `[이 재료로 레시피 보기]` → HOME 필터 이동 (화면정의서에서 "(선택)"으로 표시, 후속 슬라이스로 분리 가능)
- 장보기 완료 시 팬트리 반영 (`12b-shopping-pantry-reflect`에서 닫음)
- 요리 완료 시 팬트리 소진 (`15a/15b` 에서 닫음)
- 재료 중복 병합 / 카테고리 자동 분류 — 후속 별도 슬라이스
- 재료 유효기간 관리 — 별도 기능

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `06-recipe-to-planner` | merged | [x] |
| `07-meal-manage` | merged | [x] |
| `08a-meal-add-search-core` | merged | [x] |
| `08b-meal-add-books-pantry` | merged | [x] |
| `09-shopping-preview-create` | merged | [x] |
| `10a-shopping-detail-interact` | merged | [x] |
| `10b-shopping-share-text` | merged | [x] |
| `11-shopping-reorder` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `12b-shopping-pantry-reflect` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인함.

## Backend First Contract

### `GET /pantry`

- Query: `q` (재료명 검색, optional), `category` (카테고리 필터, optional)
- Response 200:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "uuid",
          "ingredient_id": "uuid",
          "standard_name": "string",
          "category": "string",
          "created_at": "timestamptz"
        }
      ]
    },
    "error": null
  }
  ```
- 401: 미로그인
- 빈 팬트리: `items: []`

### `POST /pantry`

- Body: `{ "ingredient_ids": ["uuid", ...] }`
- Response 201:
  ```json
  {
    "success": true,
    "data": { "added": 3, "items": [...] },
    "error": null
  }
  ```
- 401: 미로그인
- 422: `ingredient_ids`가 빈 배열이거나 없는 경우
- **중복 처리**: 이미 팬트리에 있는 재료 ID는 무시하고 신규만 추가 (멱등성 보장, `UNIQUE(user_id, ingredient_id)` 제약 활용)
- **존재하지 않는 ingredient_id**: 무시 (silent skip, 유효 항목만 추가)
- **소유자 검증**: 로그인 사용자의 팬트리에만 추가

### `DELETE /pantry`

- Body: `{ "ingredient_ids": ["uuid", ...] }`
- Response 200:
  ```json
  {
    "success": true,
    "data": { "removed": 2 },
    "error": null
  }
  ```
- 401: 미로그인
- 422: `ingredient_ids`가 빈 배열이거나 없는 경우
- **소유자 검증**: 로그인 사용자의 팬트리 항목만 삭제
- **멱등성**: 이미 없는 항목은 무시, removed count는 실제 삭제된 수

### `GET /pantry/bundles`

- Response 200:
  ```json
  {
    "success": true,
    "data": {
      "bundles": [
        {
          "id": "uuid",
          "name": "조미료 모음",
          "display_order": 1,
          "ingredients": [
            {
              "ingredient_id": "uuid",
              "standard_name": "string",
              "is_in_pantry": true
            }
          ]
        }
      ]
    },
    "error": null
  }
  ```
- 401: 미로그인
- `is_in_pantry`: 현재 사용자 팬트리 보유 여부를 join으로 표시

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI (temporary)
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - `loading`: 팬트리 목록 / 묶음 목록 로딩 중 스켈레톤
  - `empty`: 팬트리에 재료가 없을 때 안내 + 추가 CTA
  - `error`: API 실패 시 재시도 안내
  - `read-only`: 해당 없음 (팬트리에는 read-only 상태가 없으나, UI 상태 자체는 구현)
  - `unauthorized`: 미로그인 시 로그인 안내 모달 + return-to-action
- 로그인 보호: 팬트리 전체가 로그인 필수 → 미로그인 시 로그인 게이트 모달, return-to-action `/pantry`

## Design Authority

### PANTRY

- UI risk: `new-screen`
- Anchor screen dependency: 없음
- Visual artifact: Stage 4에서 screenshot evidence 제출 예정 (`ui/designs/evidence/13-pantry-core/PANTRY-mobile.png`, `ui/designs/evidence/13-pantry-core/PANTRY-mobile-narrow.png`)
- Authority status: `required`
- h8 classification: `prototype parity` — Baemin prototype를 primary visual reference로 사용
- Notes: h8 matrix에 따라 PANTRY는 screen-level prototype parity candidate. Stage 4에서 prototype reference를 기반으로 구현하되 공식 문서 계약을 우선함. Stage 4 완료 후 authority review 필요.

### PANTRY_BUNDLE_PICKER

- UI risk: `new-screen`
- Anchor screen dependency: 없음
- Visual artifact: Stage 4에서 screenshot evidence 제출 예정
- Authority status: `required`
- h8 classification: `prototype-derived design` — Baemin vocabulary/material 사용, near-100% parity 대상 아님
- Notes: h8 matrix에 따라 별도 증거 없이는 parity로 승격 불가. prototype vocabulary와 material만 사용.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` §1-8 (팬트리)
- `docs/화면정의서-v1.5.1.md` §17 (PANTRY), §18 (PANTRY_BUNDLE_PICKER)
- `docs/api문서-v1.2.2.md` §11 (팬트리 API)
- `docs/db설계-v1.3.1.md` §8-1 (pantry_items), §2-1 (ingredients), §2-3/2-4 (bundles)
- `docs/유저flow맵-v1.3.1.md` §⑦ (팬트리 관리 여정)
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`

## QA / Test Data Plan

- **fixture baseline**: `ingredients` seed (카테고리별 대표 재료), `ingredient_bundles` + `ingredient_bundle_items` seed (조미료 모음, 야채 모음 등), `pantry_items` 테스트용 기존 항목
- **real DB smoke 경로**: `pnpm dev:local-supabase` — 로컬 Supabase에 `pantry_items`, `ingredients`, `ingredient_bundles`, `ingredient_bundle_items` 테이블이 존재하는지 확인 필수
- **seed / reset 명령**: `pnpm local:reset:demo` (전체 초기화), `pnpm dev:demo` (demo dataset 포함)
- **bootstrap 시스템 row**: 없음 (팬트리는 사용자 명시 추가 방식, 자동 생성 시스템 row 없음). 단, `ingredients`와 `ingredient_bundles`는 seed data가 미리 존재해야 함.
- **blocker 조건**:
  - `ingredients` 테이블 seed가 비어 있으면 재료 추가 자체가 불가
  - `ingredient_bundles` / `ingredient_bundle_items` seed가 비어 있으면 묶음 추가 불가
  - 로컬 Supabase에 `pantry_items` 테이블이 없으면 CRUD 전체 불가

## Key Rules

- **보유 여부만 관리**: 수량 저장 X, `pantry_items`는 `(user_id, ingredient_id)` UNIQUE
- **직접 추가**: 사용자가 재료를 검색/선택하여 추가 → `POST /pantry`
- **묶음 추가**: 묶음 선택 → 재료 체크리스트에서 선택 → `POST /pantry` (동일 endpoint 재사용)
- **삭제**: 선택 삭제 → `DELETE /pantry`
- **소유자 가드**: 모든 API는 로그인 필수, 자신의 팬트리만 접근 가능
- **중복 무시**: 이미 있는 재료 추가 시 silent skip (409 아님, 멱등성)
- **invalid ingredient_id 무시**: 존재하지 않는 ID는 silent skip
- **prototype scope 제한**: h8 non-screen exclusions (Jua 폰트, prototype-only 탭 behavior, prototype-only 자산) 도입 금지
- **공식 문서 우선**: prototype reference는 시각적 참고만, 공식 API/DB/요구사항 계약이 우선

## Primary User Path

1. 사용자가 하단 탭에서 "팬트리"를 선택하여 `PANTRY` 화면 진입 (로그인 필수, 미로그인 시 로그인 게이트)
2. 현재 보유 재료 목록을 확인하고, 검색/카테고리 필터로 원하는 재료를 찾음
3. **직접 추가**: [재료 추가] → 재료 검색/선택 → `POST /pantry` → 목록 갱신
4. **묶음 추가**: [묶음 추가] → `PANTRY_BUNDLE_PICKER` → 묶음 카테고리 선택 → 재료 체크리스트에서 보유 재료 체크 → [팬트리에 추가] → `POST /pantry` → `PANTRY`로 복귀
5. **삭제**: 재료 선택 → [선택 삭제] → `DELETE /pantry` → 목록 갱신

## Delivery Checklist

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 연결 (GET/POST/DELETE /pantry, GET /pantry/bundles) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (PantryItem, PantryBundle, request/response 타입) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] PANTRY UI 연결 <!-- omo:id=delivery-pantry-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY_BUNDLE_PICKER UI 연결 <!-- omo:id=delivery-bundle-picker-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (ingredients, ingredient_bundles seed) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [ ] PANTRY design authority evidence 제출 <!-- omo:id=delivery-pantry-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY_BUNDLE_PICKER design authority evidence 제출 <!-- omo:id=delivery-bundle-picker-authority-evidence;stage=4;scope=frontend;review=5,6 -->

## Stage 2 Evidence

- TDD red: `pnpm exec vitest run tests/pantry-core.backend.test.ts` initially failed on missing pantry route modules.
- Targeted green: `pnpm exec vitest run tests/pantry-core.backend.test.ts tests/supabase-server.test.ts tests/local-demo-pantry-fixture.test.ts` → 13 tests passed.
- Local Supabase smoke without reset: `pnpm dlx supabase start` → already running, `pnpm dlx supabase migration up` → applied `20260428143000_13_pantry_core_bundles.sql`, `node scripts/local-seed-demo-data.mjs` → seeded local demo dataset.
- Seed/table smoke counts: `ingredients=6`, `ingredient_bundles=2`, `ingredient_bundle_items=5`, `pantry_items=8`.
