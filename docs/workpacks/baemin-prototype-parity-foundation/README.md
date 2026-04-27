# Slice: baemin-prototype-parity-foundation

## Goal

후속 scored parity 슬라이스(`baemin-prototype-home-parity`, `baemin-prototype-recipe-detail-parity`, `baemin-prototype-planner-week-parity`, `baemin-prototype-modal-overlay-parity`)가 공유하는 비교/증거/채점 기반을 잠근다.
h7 direction gate가 정의한 3-way capture, visual-verdict scoring, required-state matrix를 실행 가능한 수준의 규칙과 artifact schema로 구체화하되, 앱 화면을 직접 리라이트하지 않는다.

## Branches

- 문서/기반: `docs/baemin-prototype-parity-foundation`
- 프론트엔드 (Stage 4 evidence harness/template 등): `feature/fe-baemin-prototype-parity-foundation`

## In Scope

- 화면: 없음 (runtime 화면 변경 없음)
- API: 없음
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### Foundation 산출물 (Stage 4에서 생성)

1. **3-way capture recipe**: current / after / prototype 비교를 위한 캡처 규칙 문서
   - viewport: `390px` mobile default + `320px` narrow sentinel
   - fixture data, route entry, scroll position, active/open state 일치 요건
   - 캡처 파일 경로 규칙 (`qa/visual/parity/<slice>/<viewport>-<surface>-<state>.png`)
2. **Fixture 및 route-entry 규칙**: scored parity 슬라이스에서 사용하는 공통 fixture baseline, route entry point 목록
3. **Required viewport 및 state evidence 규약**: h7에서 정의한 surface별 required states를 캡처 체크리스트로 구체화
4. **Artifact schema/location**: visual-verdict artifact의 파일 구조, 필드 정의, 저장 경로 규약
5. **Token/material/reference mapping scope**: 프로토타입 토큰 → 현재 프로젝트 토큰 매핑 범위 문서 (HANDOFF.md 기반, parity 범위 한정)
6. **Prototype-only asset/font exclusion inventory**: 프로토타입에만 존재하고 production에서 제외되는 자산/폰트의 구체 목록
7. **Evidence harness 또는 preview foundation 설계**: Stage 4에서 docs/evidence template, script, 또는 non-runtime harness artifact 생성이 필요하면 여기서 설계

## Out of Scope

- 앱 전체 화면 리라이트 (HOME, RECIPE_DETAIL, PLANNER_WEEK 화면 코드 변경 금지)
- runtime route, component, API handler, DB schema, seed data 변경
- 새 npm 의존성 추가
- `Jua` 또는 새 폰트 의존성 도입
- `RECIPE_DETAIL` tabs/reviews를 production 기능으로 추가
- `PANTRY`, `MYPAGE` production 동작
- prototype-only bottom tab 동작
- visual-verdict scoring의 실제 점수 산출 (scored parity 슬라이스 책임)
- 공식 source-of-truth 문서 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-style-tokens-additive` | merged | [x] |
| `baemin-style-token-values` | merged | [x] |
| `baemin-style-shared-components` | merged | [x] |
| `baemin-style-home-retrofit` | merged | [x] |
| `baemin-style-recipe-detail-retrofit` | merged | [x] |
| `baemin-style-planner-week-retrofit` | merged | [x] |
| `baemin-style-modal-system-fit` | merged | [x] |

> `h7-baemin-prototype-parity-direction`은 PR #253으로 merge 완료 (2026-04-27). 이 선행 조건은 충족되었다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 후속 parity 슬라이스에서 지켜야 할 계약은 h7 direction gate의 Backend First Contract를 그대로 상속한다:

- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- `meals.status`: `registered -> shopping_done -> cook_done`
- independent cooking does not mutate `meals.status`
- completed shopping lists remain read-only, mutation APIs return `409`
- `add_to_pantry_item_ids`: `null`, `[]`, selected IDs remain distinct
- visual parity를 위해 endpoint, field, table, status value를 추가하지 않음

## Frontend Delivery Mode

- Stage 4에서 생성하는 것은 **docs/evidence template, script, non-runtime harness artifact**이다
- runtime UI 변경 없음
- 필수 상태: 해당 없음 (화면 구현 없음)
- 로그인 보호 액션: 해당 없음

## Design Authority

- UI risk: `not-required` (runtime UI 변경 없음)
- Anchor screen dependency: 없음
- Visual artifact: 해당 없음 (이 슬라이스에서 화면 구현 없음)
- Authority status: `not-required`
- Notes: 이 슬라이스는 evidence 기반(capture rule, artifact schema 등)을 잠그는 foundation이다. Design authority review는 후속 scored parity 슬라이스에서 수행한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — 이 슬라이스에서 runtime UI 변경 없음. Stage 4에서 생성하는 것은 docs/evidence harness artifact만 해당.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/acceptance.md`
- `ui/designs/prototypes/homecook-baemin-prototype.html`
- `ui/designs/prototypes/baemin-redesign/HANDOFF.md`

## QA / Test Data Plan

- fixture baseline: 이 슬라이스 자체는 fixture 변경 없음. Stage 4에서 scored parity 슬라이스용 공통 fixture baseline 규칙을 정의한다.
- real DB smoke 경로: 해당 없음 (runtime 코드 없음)
- seed / reset 명령: 해당 없음
- bootstrap 시스템 row: 해당 없음
- blocker 조건: 없음 (`h7-baemin-prototype-parity-direction`은 PR #253으로 merge 완료)

### 이 슬라이스의 검증

- `git diff --check`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack`

## Key Rules

1. **앱 화면 리라이트 금지**: 이 슬라이스는 foundation이다. HOME, RECIPE_DETAIL, PLANNER_WEEK, modal의 화면 코드를 직접 변경하지 않는다.
2. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다. 이 슬라이스에서 정의를 바꾸지 않는다.
3. **Prototype-only exclusions 보존**: `Jua`, RECIPE_DETAIL tabs/reviews, PANTRY/MYPAGE production 동작, prototype-only assets, bottom tabs, 미지원 기능은 제외 상태를 유지한다.
4. **공식 문서 변경 없음**: `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`나 공식 5종 문서를 변경하지 않는다.
5. **API/DB/status 불변**: endpoint, field, table, status value를 추가하지 않는다.
6. **캡처 규칙 확정**: 3-way comparison(current/after/prototype)의 viewport, fixture, route entry, state 조건을 이 슬라이스에서 확정한다. 후속 scored parity 슬라이스는 이 규칙을 따른다.
7. **artifact schema 확정**: visual-verdict artifact의 파일 구조, 필드, 저장 경로를 이 슬라이스에서 확정한다.

## Primary User Path

1. 개발자가 scored parity 슬라이스를 시작하려 한다
2. 이 foundation이 정의한 3-way capture recipe, fixture 규칙, artifact schema를 확인한다
3. 정해진 viewport/state/route-entry 조건에 따라 current/after/prototype 캡처를 수행하고, artifact schema에 맞춰 visual-verdict를 산출한다

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 스킵), Stage 4에서 docs/evidence foundation을 생성한다.

- [x] 3-way capture recipe 문서 확정 (viewport, fixture, route entry, scroll, state 조건) <!-- omo:id=found-capture-recipe;stage=4;scope=frontend;review=5,6 -->
- [x] Fixture 및 route-entry 규칙 확정 <!-- omo:id=found-fixture-route-rules;stage=4;scope=frontend;review=5,6 -->
- [x] Required viewport 및 state evidence 규약 확정 (surface별 required states 체크리스트) <!-- omo:id=found-viewport-state-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Artifact schema/location 규약 확정 (visual-verdict 파일 구조, 필드, 경로) <!-- omo:id=found-artifact-schema;stage=4;scope=frontend;review=5,6 -->
- [x] Token/material/reference mapping scope 문서 확정 <!-- omo:id=found-token-mapping-scope;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only asset/font exclusion inventory 확정 <!-- omo:id=found-exclusion-inventory;stage=4;scope=frontend;review=5,6 -->
- [x] Evidence harness 또는 preview foundation 설계 완료 (필요 시) <!-- omo:id=found-evidence-harness;stage=4;scope=frontend;review=5,6 -->
- [x] Runtime app code 변경 없음 확인 <!-- omo:id=found-no-runtime-change;stage=4;scope=frontend;review=5,6 -->
