# Slice: baemin-prototype-recipe-detail-parity

## Goal

RECIPE_DETAIL 화면의 시각적 구현을 Baemin prototype 기준 near-100% parity로 끌어올린다.
h7 direction gate가 정의한 3-way capture, visual-verdict scoring, required-state matrix에 따라 RECIPE_DETAIL body 점수 >= 95, authority blocker 0을 달성한다.
기존 RECIPE_DETAIL 정보 구조(공통 헤더, 미디어, breadcrumb+제목+태그, overview meta, 보조 액션, primary CTA, 인분 조절, 재료 리스트, 스텝 리스트)와 API/상태/권한 계약은 변경하지 않으며, skin·layout·interaction·assets/copy·state fidelity 5축의 시각 처리만 prototype에 맞춘다.

## Branches

- 문서/기반: `docs/baemin-prototype-recipe-detail-parity`
- 프론트엔드: `feature/fe-baemin-prototype-recipe-detail-parity`

## In Scope

- 화면: `RECIPE_DETAIL` body (`app/recipe/[id]/page.tsx`, `components/recipe/*`)
- API: 없음 (기존 `GET /recipes/{id}`, `POST /meals`, `POST /recipes/{id}/save`, `POST /recipes/{id}/like` 계약 그대로 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### Parity 구현 범위

1. **Skin**: prototype 기준 색상 토큰 적용, typography scale 조정, radius/shadow/spacing tone 정합. Hero image 4:3 aspect, title block 레이아웃, meta row 스타일
2. **Layout**: hero image geometry, title block 배치, 인분 조절 stepper 배치, 재료 리스트/스텝 리스트 geometry, bottom CTA bar 배치를 prototype에 맞춤
3. **Interaction affordance**: planner add sheet, save modal, login gate modal, 좋아요 토글, 공유, 인분 stepper, 요리 모드 진입 — 기존 동작 유지하되 시각 표현을 prototype에 맞춤
4. **Assets/Copy**: 아이콘 (뒤로가기, 좋아요, 저장, 별점, 시계, 불꽃), 라벨, CTA copy를 prototype 수준으로 조정 (production scope 내)
5. **State fidelity**: 7개 required states (initial, scrolled, planner-add-open, save-open, login-gate-open, loading, error) 각각이 prototype과 시각적으로 일치

### Visual evidence 산출물

- 3-way capture: foundation `capture-recipe.md` 규칙에 따라 42 evidence slots (7 states × 2 viewports × 3 layers): capture files + documented prototype N/A slots (loading/error — static prototype는 이 상태를 재현할 수 없음)
- `ui/designs/evidence/baemin-prototype-recipe-detail-parity/visual-verdict.md` + `.json`
- Authority report: `ui/designs/authority/RECIPE_DETAIL-parity-authority.md`

## Out of Scope

- RECIPE_DETAIL 정보 구조(섹션 위계, 네비게이션 흐름) 변경
- API endpoint, field, table, status value 추가
- `Jua` 또는 새 폰트 의존성 도입
- Prototype-only tabs (`재료/조리법/리뷰` 탭 스위처) — production은 단일 스크롤 뷰
- Prototype-only 리뷰 섹션/카드 — production에 리뷰 기능 없음
- Prototype-only 리뷰 수 배지 — production에 리뷰 카운트 없음
- Prototype-only 별점 입력 — production에 별점 기능 없음
- `DELETE /recipes/{id}/save` 복원 (삭제된 엔드포인트)
- 새 npm 의존성 추가
- 공식 source-of-truth 문서 변경
- `HOME`, `PLANNER_WEEK` 화면 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-prototype-parity-foundation` | merged | [x] |
| `baemin-prototype-home-parity` | merged | [x] |
| `baemin-style-tokens-additive` | merged | [x] |
| `baemin-style-token-values` | merged | [x] |
| `baemin-style-shared-components` | merged | [x] |
| `baemin-style-recipe-detail-retrofit` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 기존 API 계약을 그대로 소비한다:

- `GET /recipes/{id}` → `{ success, data: Recipe, error }`
- `POST /meals` → `{ success, data: Meal, error }` (PlannerAdd)
- `POST /recipes/{id}/save` → `{ success, data, error }` (Save)
- `POST /recipes/{id}/like` → `{ success, data, error }` (Like toggle)
- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- 권한: 조회/공유/요리모드 진입은 비로그인 가능. 좋아요/저장/플래너 추가는 로그인 필요.
- 로그인 게이트: 보호 액션 탭 → LoginGateModal → 로그인 성공 후 return-to-action
- 상태 전이: 없음
- visual parity를 위해 endpoint, field, table, status value를 추가하지 않음

## Frontend Delivery Mode

- Stage 4에서 RECIPE_DETAIL body의 시각적 구현을 prototype parity 수준으로 변경
- 필수 상태: `loading` / `error` (이미 구현됨, parity 수준으로 시각 조정)
- `empty`: 해당 없음 (상세 화면은 단일 레시피를 보여주므로 empty state가 아닌 error/404로 처리)
- `read-only`: 해당 없음 (RECIPE_DETAIL 자체는 read-only 대상 아님)
- `unauthorized`: 보호 액션에 LoginGateModal로 처리 (기존 동작 유지)
- 로그인 보호 액션: 좋아요, 저장, 플래너 추가 — return-to-action 포함 (기존 동작 유지)

## Design Authority

- UI risk: `anchor-extension` (RECIPE_DETAIL anchor screen의 시각 처리 전면 변경)
- Anchor screen dependency: `RECIPE_DETAIL`
- Visual artifact: `ui/designs/authority/RECIPE_DETAIL-parity-authority.md` (Stage 4에서 screenshot evidence 포함)
- Authority status: `reviewed`
- Notes: h7 parity program의 scored body slice. Stage 5 public review와 Claude final authority gate 모두 통과. Design Status confirmed.
- Design addendum: `ui/designs/RECIPE_DETAIL.md` §Baemin-Style Visual Retrofit Addendum (기존 addendum 활용, 필요 시 parity addendum 추가)
- Design critique: `ui/designs/critiques/RECIPE_DETAIL-critique.md` (🟢 통과, blocker 0 — 기존 critique 활용)

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — Stage 5 Codex design review + Claude final authority gate 통과 (blocker 0, score 96.56)
- [ ] N/A

> Design Status 전이 완료: `temporary` → `pending-review` → `confirmed`

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/baemin-prototype-parity-foundation/README.md`
- `docs/workpacks/baemin-prototype-home-parity/README.md` (선행 parity 슬라이스 참고)
- `ui/designs/RECIPE_DETAIL.md` §Baemin-Style Visual Retrofit Addendum
- `ui/designs/critiques/RECIPE_DETAIL-critique.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/capture-recipe.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/fixture-route-matrix.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/visual-verdict-schema.json`
- `ui/designs/evidence/baemin-prototype-parity-foundation/token-material-mapping.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/prototype-exclusion-inventory.md`
- `ui/designs/prototypes/homecook-baemin-prototype.html`
- `ui/designs/prototypes/baemin-redesign/screens/detail.jsx`
- `docs/화면정의서-v1.5.1.md` §3 RECIPE_DETAIL
- `docs/요구사항기준선-v1.6.4.md` §1-2

## QA / Test Data Plan

- fixture baseline: 기존 RECIPE_DETAIL fixture 유지 (1 recipe with >= 3 ingredients, >= 2 cooking steps, image/emoji). Foundation의 `fixture-route-matrix.md` RECIPE_DETAIL 섹션 참조.
- real DB smoke 경로: `pnpm dev` 또는 `pnpm dev:local-supabase`로 브라우저에서 RECIPE_DETAIL 실제 동작 확인
- seed / reset 명령: 기존 seed 데이터 사용
- bootstrap 시스템 row: 해당 없음 (RECIPE_DETAIL 조회는 bootstrap 의존 없음. PlannerAdd는 `meal_plan_columns` bootstrap에 의존하나 이미 선행 슬라이스에서 해결됨)
- blocker 조건: 없음 (모든 선행 슬라이스 merged)

### 이 슬라이스의 검증

- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack`
- `git diff --check`
- 390px + 320px screenshot evidence (7 states × 2 viewports)
- visual-verdict score >= 95, blocker count 0

## Key Rules

1. **정보 구조 불변**: RECIPE_DETAIL의 공통 헤더, 미디어, breadcrumb+제목+태그, overview meta, 보조 액션, primary CTA, 인분 조절, 재료 리스트, 스텝 리스트 구조를 변경하지 않는다.
2. **API/DB/status 불변**: endpoint, field, table, status value를 추가하지 않는다.
3. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다.
4. **Prototype-only exclusions 보존**: tabs (재료/조리법/리뷰), 리뷰 섹션/카드, 리뷰 수 배지, 별점 입력은 제외 상태를 유지한다. 이들이 prototype capture에 보이더라도 after layer에서 부재를 deficit으로 채점하지 않는다.
5. **Foundation 규칙 준수**: `capture-recipe.md`, `fixture-route-matrix.md`, `visual-verdict-schema.json`의 규칙에 따라 evidence를 생성한다.
6. **Token mapping 준수**: `token-material-mapping.md`에 정의된 prototype→production 토큰 매핑을 따른다. Approved production divergences (brand color, background tone, foreground tone, font stack, olive vs teal)는 deficit으로 채점하지 않는다.
7. **Authority review 필수**: Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority report를 생성한다. Authority blocker 0 확인 후 pending-review로 전환한다.
8. **로그인 게이트 보존**: 좋아요/저장/플래너 추가의 로그인 게이트와 return-to-action은 기존 동작을 그대로 유지한다.
9. **인분 stepper 동작 보존**: 상세에서만 인분 조절 가능, 요리모드에서는 조절 불가 원칙을 유지한다.
10. **저장 대상 제한 보존**: saved/custom 레시피북만 저장 대상으로 허용한다.
11. **삭제된 endpoint 미복원**: `DELETE /recipes/{id}/save`는 삭제된 상태를 유지한다.
12. **독립 요리 상태 분리**: 상세에서 바로 요리하기는 meals 상태를 변경하지 않는다.

## Contract Evolution Decision

**Visual implementation, no contract-evolution required.**

분석:
- Stage 4 계획은 공식 RECIPE_DETAIL 정보 구조(화면정의서 v1.5.1 §3)를 보존한다: 공통 헤더, 미디어, breadcrumb+제목+태그, overview meta, 보조 액션, primary CTA, 인분 조절, 재료 리스트, 스텝 리스트.
- Prototype의 RECIPE_DETAIL (`detail.jsx`)은 같은 핵심 섹션을 포함하되 tabs/reviews가 추가되어 있다. 이는 exclusion inventory에 의해 제외된다.
- 차이는 skin·layout·interaction affordance의 시각 처리에 한정된다.
- Prototype-only 요소(tabs, reviews, review badge, star rating)는 exclusion inventory에 의해 제외된다.
- 공식 문서 변경 없이 Stage 4를 진행할 수 있다.

## Primary User Path

1. 사용자가 HOME에서 레시피 카드를 탭하여 RECIPE_DETAIL (`/recipe/[id]`)에 진입한다
2. Hero image, 제목, 태그, overview meta, 보조 액션, primary CTA가 prototype과 near-100% 일치하는 시각으로 표시된다
3. 인분 조절 stepper로 인분을 변경하면 재료량이 즉시 업데이트된다
4. 재료 리스트와 스텝 리스트가 prototype 스타일로 표시된다
5. `[플래너에 추가]` 또는 `[저장]` 등 보호 액션을 탭하면 기존 로그인 게이트/모달 흐름이 정상 동작한다

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 스킵), Stage 4에서 RECIPE_DETAIL body parity를 구현한다.

- [x] RECIPE_DETAIL body skin parity (색상, typography, radius, shadow, spacing) <!-- omo:id=rd-parity-skin;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL body layout parity (hero geometry, title block, meta row, CTA bar, ingredients, steps) <!-- omo:id=rd-parity-layout;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL body interaction affordance parity (planner add, save, login gate, like, share, stepper, cook mode 시각 표현) <!-- omo:id=rd-parity-interaction;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL body assets/copy parity (아이콘, 라벨, CTA copy) <!-- omo:id=rd-parity-assets-copy;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL body state fidelity (7 required states 각각 prototype 시각 일치) <!-- omo:id=rd-parity-state-fidelity;stage=4;scope=frontend;review=5,6 -->
- [x] 3-way capture evidence 완성 (42 evidence slots) <!-- omo:id=rd-parity-capture-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Visual-verdict artifact 생성 (visual-verdict.md + .json) <!-- omo:id=rd-parity-verdict-artifact;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report 생성 (screenshot evidence 기반) <!-- omo:id=rd-parity-authority-report;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score >= 95, blocker count 0 <!-- omo:id=rd-parity-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions가 deficit으로 채점되지 않음 확인 <!-- omo:id=rd-parity-exclusions-check;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 RECIPE_DETAIL 기능 regression 없음 (좋아요, 저장, 플래너 추가, 로그인 게이트, 인분 조절, 공유, 요리하기) <!-- omo:id=rd-parity-no-regression;stage=4;scope=frontend;review=5,6 -->
- [x] Runtime app code에서 API/DB/status 변경 없음 확인 <!-- omo:id=rd-parity-no-contract-change;stage=4;scope=frontend;review=5,6 -->
