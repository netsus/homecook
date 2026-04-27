# Slice: baemin-prototype-planner-week-parity

## Goal

PLANNER_WEEK 화면의 시각적 구현을 Baemin prototype 기준 near-100% parity로 끌어올린다.
h7 direction gate가 정의한 3-way capture, visual-verdict scoring, required-state matrix에 따라 PLANNER_WEEK body 점수 >= 94, authority blocker 0을 달성한다.
기존 PLANNER_WEEK 정보 구조(브랜드 헤더, compact toolbar, 주간 컨텍스트 바, 요일 스트립, day card, 4-slot 구조)와 API/상태/권한 계약은 변경하지 않으며, skin·layout·interaction·assets/copy·state fidelity 5축의 시각 처리만 prototype에 맞춘다.

선행 contract slice `baemin-prototype-planner-week-parity-contract`가 H2/H4 conflict resolution, scroll policy, kept contracts, evidence target을 확정했다. 이 슬라이스는 해당 계약을 상속하여 시각 구현을 수행한다.

## Branches

- 문서/기반: `docs/baemin-prototype-planner-week-parity`
- 프론트엔드: `feature/fe-baemin-prototype-planner-week-parity`

## In Scope

- 화면: `PLANNER_WEEK` body (`app/planner/page.tsx`, `components/planner/planner-week-screen.tsx`)
- 공유 스타일/컴포넌트: planner parity에 필요한 경우에만 기존 공유 프리미티브 소비 (동작 drift 없이)
- API: 없음 (기존 `GET /planner`, `POST /meals`, `GET /meals`, `PATCH /meals/{meal_id}`, `DELETE /meals/{meal_id}` 계약 그대로 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### Parity 구현 범위

1. **Skin**: prototype 기준 색상 토큰 적용, typography scale 조정, radius/shadow/spacing tone 정합. Day card surface, slot row 스타일, CTA 버튼, 주간 바 스타일
2. **Layout**: compact toolbar 배치, 주간 컨텍스트 바 geometry, 요일 스트립 배치, day card geometry, slot row 높이/간격, empty pill 배치를 prototype에 맞춤. Planner 내부 localized scroll/swipe affordance는 prototype 기준으로 허용
3. **Interaction affordance**: 주간 이동(스와이프), 이번주로 가기, 셀 탭 → MEAL_SCREEN, CTA 버튼(장보기/요리하기/남은요리), empty slot 탭 — 기존 동작 유지하되 시각 표현을 prototype에 맞춤
4. **Assets/Copy**: 아이콘, 라벨, status chip copy, empty state copy를 prototype 수준으로 조정 (production scope 내)
5. **State fidelity**: 7개 required states (initial, prototype-overview, scrolled, loading, empty, unauthorized, error) 각각이 prototype과 시각적으로 일치

### Visual evidence 산출물

- 3-way capture: foundation `capture-recipe.md` 규칙에 따라 42 evidence slots (7 states × 2 viewports × 3 layers): capture files + documented prototype N/A slots
- `ui/designs/evidence/baemin-prototype-planner-week-parity/visual-verdict.md` + `.json`
- Authority report: `ui/designs/authority/PLANNER_WEEK-parity-authority.md`

## Out of Scope

- PLANNER_WEEK 정보 구조(섹션 위계, 네비게이션 흐름) 변경
- API endpoint, field, table, status value 추가
- `/planner/columns` CRUD 재도입 — 이미 삭제되었으며 visual parity를 위해 복원하지 않음
- `Jua` 또는 새 폰트 의존성 도입
- Prototype-only Pantry coupling (planner-pantry 연동)
- Prototype-only bottom tab behavior
- Prototype-only illustration, image, emoji, or marketing asset
- 공식 문서에 없는 production functionality
- 공식 source-of-truth 문서 변경 (contract slice에서 drift 없음 확인 완료)
- `HOME`, `RECIPE_DETAIL` 화면 변경
- Modal/sheet overlay parity (별도 `baemin-prototype-modal-overlay-parity` slice 범위)
- 새 npm 의존성 추가

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-prototype-parity-foundation` | merged | [x] |
| `baemin-prototype-home-parity` | merged | [x] |
| `baemin-prototype-recipe-detail-parity` | merged | [x] |
| `baemin-prototype-planner-week-parity-contract` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `baemin-style-planner-week-retrofit` | merged / superseded in part | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 기존 API 계약을 그대로 소비한다:

- `GET /planner?start_date=&end_date=` → `{ success, data: { columns, meals }, error }`
- `POST /meals` → `{ success, data: Meal, error }` (식사 추가)
- `GET /meals?plan_date=&column_id=` → `{ success, data: Meal[], error }` (끼니 조회)
- `PATCH /meals/{meal_id}` → `{ success, data: Meal, error }` (식사 수정)
- `DELETE /meals/{meal_id}` → `{ success, error }` (식사 삭제)
- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- 끼니 슬롯: 아침/점심/간식/저녁 4개 고정. `meal_plan_columns`는 내부 슬롯 식별 테이블
- `/planner/columns` CRUD: 삭제됨, 재도입 금지
- 권한: 플래너 전체가 로그인 필요. 비로그인 시 unauthorized 상태
- meals.status: `registered -> shopping_done -> cook_done`
- 독립 요리는 meals.status를 변경하지 않음
- 완료된 장보기 리스트는 read-only, mutation API는 409 반환
- visual parity를 위해 endpoint, field, table, status value를 추가하지 않음

## Frontend Delivery Mode

- Stage 4에서 PLANNER_WEEK body의 시각적 구현을 prototype parity 수준으로 변경
- 필수 상태:
  - `loading`: 플래너 데이터 로딩 중 skeleton 표시
  - `empty`: meals가 0건인 주간 (빈 day card + empty state 컴포넌트)
  - `error`: fetch 실패 시 error state 컴포넌트
  - `read-only`: N/A — PLANNER_WEEK 자체는 read-only 대상이 아님. 완료된 장보기의 read-only는 SHOPPING_DETAIL 범위이며, planner body에서는 status chip으로 시각 표시만 함
  - `unauthorized`: 비로그인 시 전체 planner 접근 차단, SocialLoginButtons 포함 unauthorized gate
- 로그인 보호: 플래너 전체가 로그인 필요. 비로그인 시 unauthorized 상태, 로그인 성공 후 planner로 return

## Design Authority

- UI risk: `anchor-extension` (PLANNER_WEEK anchor screen의 시각 처리 전면 변경)
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: `ui/designs/authority/PLANNER_WEEK-parity-authority.md` (Stage 4에서 screenshot evidence 포함)
- Authority status: `reviewed`
- Notes: h7 parity program의 scored body slice. Stage 5 Codex review와 Claude final authority gate가 PASS했고, score 96.99 / blocker 0으로 confirmed 상태다.
- Design addendum: `ui/designs/PLANNER_WEEK.md` (기존 문서에 prototype parity supersession 기록 있음)
- Design critique: `ui/designs/critiques/PLANNER_WEEK-critique.md` (기존 critique 활용)

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

> Stage 5 Codex 디자인 리뷰와 Claude final authority gate 통과. Stage 6 closeout 기준 confirmed.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/baemin-prototype-parity-foundation/README.md`
- `docs/workpacks/baemin-prototype-planner-week-parity-contract/README.md`
- `docs/workpacks/baemin-prototype-home-parity/README.md` (선행 parity 슬라이스 참고)
- `docs/workpacks/baemin-prototype-recipe-detail-parity/README.md` (선행 parity 슬라이스 참고)
- `ui/designs/PLANNER_WEEK.md`
- `ui/designs/critiques/PLANNER_WEEK-critique.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/capture-recipe.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/fixture-route-matrix.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/visual-verdict-schema.json`
- `ui/designs/evidence/baemin-prototype-parity-foundation/token-material-mapping.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/prototype-exclusion-inventory.md`
- `ui/designs/prototypes/homecook-baemin-prototype.html`
- `ui/designs/prototypes/baemin-redesign/`
- `docs/화면정의서-v1.5.1.md` §5 PLANNER_WEEK
- `docs/요구사항기준선-v1.6.4.md`
- `docs/api문서-v1.2.2.md` §3 GET /planner

## QA / Test Data Plan

- fixture baseline: >= 3 days with meals across breakfast/lunch/dinner, at least 1 empty slot. Foundation의 `fixture-route-matrix.md` PLANNER_WEEK 섹션 참조.
- real DB smoke 경로: `pnpm dev` 또는 `pnpm dev:local-supabase`로 브라우저에서 PLANNER_WEEK 실제 동작 확인
- seed / reset 명령: 기존 seed 데이터 사용. `meal_plan_columns` ×4 (아침/점심/간식/저녁) bootstrap row 필요 — 회원가입 시 서버 자동 생성
- bootstrap 시스템 row: `meal_plan_columns` ×4 (회원가입 시 자동 생성, 이미 선행 슬라이스에서 해결됨)
- blocker 조건: 없음 (모든 선행 슬라이스 merged)

### 이 슬라이스의 검증

- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack`
- `git diff --check`
- 390px + 320px screenshot evidence (7 states × 2 viewports)
- visual-verdict score >= 94, blocker count 0
- exploratory QA (high-risk anchor-extension 필수)

## Key Rules

1. **정보 구조 불변**: PLANNER_WEEK의 브랜드 헤더, compact toolbar, 주간 컨텍스트 바, 요일 스트립, day card, 4-slot 구조를 변경하지 않는다.
2. **API/DB/status 불변**: endpoint, field, table, status value를 추가하지 않는다. `/planner/columns` CRUD를 재도입하지 않는다.
3. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다.
4. **Contract slice 상속**: `baemin-prototype-planner-week-parity-contract`의 H2/H4 conflict table, scroll policy, kept contracts, evidence target을 그대로 따른다.
5. **Scroll policy**: planner 내부 localized horizontal scroll은 prototype 기준으로 허용. Page-level horizontal overflow만 금지.
6. **Prototype-only exclusions 보존**: Pantry coupling, bottom tab behavior, Jua font, prototype-only assets는 제외 상태를 유지한다. 이들이 prototype capture에 보이더라도 after layer에서 부재를 deficit으로 채점하지 않는다.
7. **Foundation 규칙 준수**: `capture-recipe.md`, `fixture-route-matrix.md`, `visual-verdict-schema.json`의 규칙에 따라 evidence를 생성한다.
8. **Token mapping 준수**: `token-material-mapping.md`에 정의된 prototype→production 토큰 매핑을 따른다. Approved production divergences (brand color, background tone, foreground tone, font stack, olive vs teal)는 deficit으로 채점하지 않는다.
9. **Authority review 필수**: Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority report를 생성한다. Authority blocker 0 확인 후 pending-review로 전환한다.
10. **Mobile UX rules 준수**: `docs/design/mobile-ux-rules.md`의 Planner 추가 규칙을 따른다. 첫 화면에서 2일 이상 요약 가시, 4끼를 한 day card에 표시, 컨트롤과 대상 근접 배치.

## Contract Evolution Decision

**Visual implementation, no contract-evolution required.**

분석:
- Stage 4 계획은 공식 PLANNER_WEEK 정보 구조(화면정의서 v1.5.1 §5)를 보존한다: 브랜드 헤더, compact toolbar, 주간 컨텍스트 바, 요일 스트립, day card, 4-slot 구조.
- 선행 contract slice에서 공식 문서(v1.5.1/v1.6.4/v1.3.1)가 이미 prototype-priority 계약을 포함하고 있음을 확인했다.
- 차이는 skin·layout·interaction affordance의 시각 처리에 한정된다.
- Prototype-only 요소(Pantry coupling, bottom tab behavior)는 exclusion inventory에 의해 제외된다.
- 공식 문서 변경 없이 Stage 4를 진행할 수 있다.

## Primary User Path

1. 사용자가 로그인 후 PLANNER_WEEK (`/planner`)에 진입한다
2. 주간 컨텍스트 바, 요일 스트립, day card가 prototype과 near-100% 일치하는 시각으로 표시된다
3. 요일 스트립을 스와이프하여 이전 주 / 다음 주로 이동한다
4. Day card에서 slot row를 탭하여 MEAL_SCREEN으로 이동한다
5. CTA 버튼(장보기/요리하기/남은요리)으로 해당 흐름에 진입한다

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 스킵), Stage 4에서 PLANNER_WEEK body parity를 구현한다.

- [x] PLANNER_WEEK body skin parity (색상, typography, radius, shadow, spacing) <!-- omo:id=pw-parity-skin;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK body layout parity (toolbar, 주간 바, 요일 스트립, day card, slot row geometry) <!-- omo:id=pw-parity-layout;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK body interaction affordance parity (주간 이동, 셀 탭, CTA 버튼, empty slot 시각 표현) <!-- omo:id=pw-parity-interaction;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK body assets/copy parity (아이콘, 라벨, status chip, empty copy) <!-- omo:id=pw-parity-assets-copy;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK body state fidelity (7 required states 각각 prototype 시각 일치) <!-- omo:id=pw-parity-state-fidelity;stage=4;scope=frontend;review=5,6 -->
- [x] 3-way capture evidence 완성 (42 evidence slots) <!-- omo:id=pw-parity-capture-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Visual-verdict artifact 생성 (visual-verdict.md + .json) <!-- omo:id=pw-parity-verdict-artifact;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report 생성 (screenshot evidence 기반) <!-- omo:id=pw-parity-authority-report;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score >= 94, blocker count 0 <!-- omo:id=pw-parity-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions가 deficit으로 채점되지 않음 확인 <!-- omo:id=pw-parity-exclusions-check;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 PLANNER_WEEK 기능 regression 없음 (주간 이동, 셀 탭, CTA 버튼, unauthorized gate, loading/empty/error) <!-- omo:id=pw-parity-no-regression;stage=4;scope=frontend;review=5,6 -->
- [x] Runtime app code에서 API/DB/status 변경 없음 확인 <!-- omo:id=pw-parity-no-contract-change;stage=4;scope=frontend;review=5,6 -->
- [x] `/planner/columns` CRUD가 재도입되지 않음 확인 <!-- omo:id=pw-parity-no-column-crud;stage=4;scope=frontend;review=5,6 -->
