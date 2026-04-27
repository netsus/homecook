# Slice: baemin-prototype-planner-week-parity-contract

## Goal

PLANNER_WEEK prototype parity 구현(follow-up slice `baemin-prototype-planner-week-parity`) 전에 공식 계약 문서와 evidence target이 정합되었는지 확인하고, 남은 drift가 있으면 기록한다.
이 슬라이스는 docs-only이며 runtime app code를 변경하지 않는다.

핵심 산출물:
- H2/H4 supersession과 h7 prototype-priority 계약 간의 conflict table
- PLANNER_WEEK scroll policy 확인 (가로 스크롤 금지 lock 제거 반영 확인)
- 공식 문서(v1.5.1/v1.6.4/v1.3.1) 동기화 상태 확인
- follow-up implementation slice의 evidence target과 scoring 기준 기록

## Branches

- 문서: `docs/baemin-prototype-planner-week-parity-contract`

## In Scope

- PLANNER_WEEK 관련 H2/H4/h6/h7 계약 간 conflict 정리 및 supersession 확인
- 공식 문서(화면정의서 v1.5.1, 요구사항기준선 v1.6.4, 유저flow맵 v1.3.1)의 prototype-priority 반영 상태 확인
- follow-up `baemin-prototype-planner-week-parity` slice를 위한 evidence target 기록
- workpack docs, acceptance, automation-spec, workflow-v2 work item 생성
- Schema Change:
  - [x] 없음 (docs-only)
  - [ ] 있음

## Out of Scope

- Runtime app code 변경 (components, routes, API, styles)
- PLANNER_WEEK 시각적 parity 구현 (follow-up slice 범위)
- 3-way capture evidence 생성 (follow-up slice 범위)
- Visual-verdict scoring 실행 (follow-up slice 범위)
- Authority report 생성 (follow-up slice 범위)
- 공식 source-of-truth 문서 변경 (이미 v1.5.1/v1.6.4/v1.3.1에서 반영 완료)
- HOME, RECIPE_DETAIL 화면 변경
- API endpoint, field, table, status value 추가
- 새 npm 의존성 추가

## H2/H4 Conflict Table

| Surface | Prior lock source | Lock description | Status | Notes |
| --- | --- | --- | --- | --- |
| PLANNER_WEEK scroll | H2/H4 direction | "가로 스크롤 없음" vertical-only day-card | **Superseded** | 사용자 승인 (2026-04-27), v1.6.4에서 lock 제거, v1.5.1 §5에서 prototype-priority 기록 |
| PLANNER_WEEK day-card IA | H2/H4 direction | Day-card interaction model | **Superseded in part** | h7이 prototype layout을 priority로 지정. Day-card 자체는 보존하되 slot-row layout lock 해제 |
| PLANNER_WEEK slot structure | H4 direction | 4-slot fixed grid | **Kept** | Prototype도 4끼(아침/점심/간식/저녁) 구조 사용 |
| PLANNER_WEEK API/DB | 05-planner-week-core | meals CRUD, 4 fixed meal slots, status transitions | **Kept** | API/DB/status 계약 불변. `/planner/columns` CRUD는 이미 삭제됨 — 재도입 금지 |
| PLANNER_WEEK auth/empty/error | 05-planner-week-core | loading/empty/error/unauthorized 상태 | **Kept** | 상태 shell 계약 불변 |
| PLANNER_WEEK baemin-style retrofit | h6/baemin-style-planner-week-retrofit | 배민 스타일 토큰, 컴포넌트 시각 처리 | **Superseded** | h7 prototype parity가 h6 retrofit을 대체 |

## Scroll Policy

- `docs/요구사항기준선-v1.6.4.md`: PLANNER_WEEK planner-level "가로 스크롤 없음" lock **이미 제거됨**
- `docs/화면정의서-v1.5.1.md` §5: PLANNER_WEEK은 Baemin prototype을 **priority basis**로 명시
- `docs/유저flow맵-v1.3.1.md`: Planner prototype scroll/affordance **허용**
- `docs/design/mobile-ux-rules.md`: page-level horizontal scroll은 금지하되, planner 내부 localized scroll container는 허용. Planner 추가 규칙 참조.
- 결론: planner 내부 가로 스크롤은 prototype 기준으로 구현 가능. Page-level overflow만 금지.

## Kept Contracts

follow-up implementation slice에서 반드시 보존해야 하는 계약:

1. **API response envelope**: `{ success, data, error }` / error shape `{ code, message, fields[] }`
2. **meals.status**: `registered -> shopping_done -> cook_done`
3. **독립 요리 상태 분리**: 독립 요리는 meals.status를 변경하지 않음
4. **완료된 장보기 리스트 read-only**: mutation API는 409 반환
5. **add_to_pantry_item_ids**: `null`, `[]`, 선택값 3-way 구분 유지
6. **4 fixed meal slots**: 4끼 고정 슬롯 정책 유지. `/planner/columns` CRUD는 삭제된 상태이며 visual parity를 위해 재도입하지 않음. `meal_plan_columns`는 내부 슬롯 식별 테이블로만 유지
7. **로그인 게이트**: 비로그인 시 unauthorized 상태, 보호 액션에 LoginGateModal
8. **4-slot 구조**: 아침/점심/간식/저녁 고정 구조 보존
9. **No endpoint/field/table/status addition**: visual parity를 위해 데이터 계약을 추가하지 않음

## Official Docs Update Path

**추가 공식 문서 변경 불필요.**

분석:
- `docs/화면정의서-v1.5.1.md` §5 PLANNER_WEEK: 이미 Baemin prototype을 priority basis로 명시
- `docs/요구사항기준선-v1.6.4.md`: "가로 스크롤 없음" lock 이미 제거
- `docs/유저flow맵-v1.3.1.md`: Planner prototype scroll/affordance 이미 허용
- h7 direction gate의 Supersession Matrix에서 PLANNER_WEEK row: "Already updated in v1.6.4 / v1.5.1 / v1.3.1; further drift needs docs sync"
- 현재 drift 없음 확인 → 추가 docs sync 불필요

## Evidence Target (Follow-up Slice)

follow-up `baemin-prototype-planner-week-parity` slice가 달성해야 하는 target:

| Metric | Target |
| --- | --- |
| Slice score (390px × 70% + 320px × 30%) | >= 94 |
| Authority blocker count | 0 |
| Required states | initial, prototype-overview, scrolled, loading, empty, unauthorized, error |
| Viewports | 390×844 (70%), 320×568 (30%) |
| Score composition | skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15 |
| 3-way capture | current + after + prototype per state per viewport |
| Evidence path | `qa/visual/parity/baemin-prototype-planner-week-parity/` |
| Visual-verdict artifact | `ui/designs/evidence/baemin-prototype-planner-week-parity/visual-verdict.md` + `.json` |
| Authority report | `ui/designs/authority/PLANNER_WEEK-parity-authority.md` |

### Prototype-Only Exclusions (PLANNER_WEEK)

h7 `prototype-exclusion-inventory.md` 기준:
- `Jua` 또는 새 폰트 의존성
- Prototype-only Pantry coupling
- Prototype-only bottom tab behavior
- Prototype-only illustration, image, emoji, or marketing asset
- 공식 문서에 없는 production functionality

### Approved Production Divergences

`token-material-mapping.md` 기준:
- Brand color: `#ED7470` (warm coral) vs prototype `#2AC1BC` (mint)
- Background tone: `#fff9f2` (warm cream) vs prototype `#FFFFFF`
- Foreground tone: `#1a1a2e` vs prototype `#212529`
- Font stack: Avenir Next / Pretendard vs system-only
- Olive vs teal: `#1f6b52` vs prototype `#12B886`

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-prototype-parity-foundation` | merged | [x] |
| `baemin-prototype-home-parity` | merged | [x] |
| `baemin-prototype-recipe-detail-parity` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `baemin-style-planner-week-retrofit` | merged / superseded in part | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. Docs-only 슬라이스다.
follow-up implementation slice는 기존 API 계약을 그대로 소비한다 (Kept Contracts 섹션 참조).

## Frontend Delivery Mode

이 슬라이스는 docs-only다. Frontend 구현 없음.
follow-up `baemin-prototype-planner-week-parity` slice가 PLANNER_WEEK body의 시각적 구현을 prototype parity 수준으로 변경한다.

## Design Authority

- UI risk: `not-required` (docs-only)
- Anchor screen dependency: none
- Authority status: `not-required`
- Notes: Docs-only contract sync slice. Follow-up `baemin-prototype-planner-week-parity`에서 authority-required (anchor-extension).

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A

> Docs-only 슬라이스이므로 Design Status N/A.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/baemin-prototype-parity-foundation/README.md`
- `docs/workpacks/baemin-prototype-home-parity/README.md`
- `docs/workpacks/baemin-prototype-recipe-detail-parity/README.md`
- `docs/workpacks/baemin-style-planner-week-retrofit/README.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/fixture-route-matrix.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/visual-verdict-schema.json`
- `ui/designs/evidence/baemin-prototype-parity-foundation/token-material-mapping.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/prototype-exclusion-inventory.md`
- `docs/화면정의서-v1.5.1.md` §5 PLANNER_WEEK
- `docs/요구사항기준선-v1.6.4.md`
- `docs/유저flow맵-v1.3.1.md`
- `docs/design/mobile-ux-rules.md`

## QA / Test Data Plan

- fixture baseline: 없음 (docs-only)
- real DB smoke: 없음 (docs-only)
- browser smoke: 없음 (docs-only)
- required local checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack`

## Key Rules

1. **Docs-only**: 이 슬라이스는 runtime app code를 변경하지 않는다.
2. **공식 문서 추가 변경 불필요**: v1.5.1/v1.6.4/v1.3.1에서 이미 prototype-priority 계약이 반영되었다.
3. **H2/H4 supersession 기록**: 가로 스크롤 lock 제거와 slot-row layout lock 해제를 conflict table에 명시한다.
4. **Kept contracts 명시**: follow-up implementation slice가 보존해야 하는 API/DB/status/auth 계약을 기록한다.
5. **Evidence target 기록**: follow-up slice의 score threshold, required states, evidence paths를 기록한다.
6. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다.

## Contract Evolution Decision

**Docs-only contract verification, no contract-evolution required.**

분석:
- 이 슬라이스는 기존 공식 문서(v1.5.1/v1.6.4/v1.3.1)가 이미 prototype-priority 계약을 포함하고 있음을 확인한다.
- 가로 스크롤 lock 제거도 이미 v1.6.4에서 반영되었다.
- 추가 공식 문서 변경 없이 follow-up implementation slice를 시작할 수 있다.
- 이 workpack은 conflict table과 evidence target만 기록하며, 계약 변경 PR이 아니다.

## Delivery Checklist

> 이 체크리스트는 docs-only slice이므로 Stage 1 문서 작성으로 완료된다.

- [x] H2/H4 conflict table 작성 (superseded / kept 구분) <!-- omo:id=pw-contract-conflict-table;stage=4;scope=frontend;review=5,6 -->
- [x] Scroll policy 확인 (가로 스크롤 lock 제거 반영 확인) <!-- omo:id=pw-contract-scroll-policy;stage=4;scope=frontend;review=5,6 -->
- [x] Kept contracts 목록 작성 <!-- omo:id=pw-contract-kept-contracts;stage=4;scope=frontend;review=5,6 -->
- [x] Official docs update path 확인 (추가 변경 불필요 확인) <!-- omo:id=pw-contract-docs-update-path;stage=4;scope=frontend;review=5,6 -->
- [x] Evidence target 기록 (score threshold, required states, evidence paths) <!-- omo:id=pw-contract-evidence-target;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions 기록 <!-- omo:id=pw-contract-exclusions;stage=4;scope=frontend;review=5,6 -->
- [x] Approved production divergences 기록 <!-- omo:id=pw-contract-approved-divergences;stage=4;scope=frontend;review=5,6 -->
- [x] Runtime app code 변경 없음 확인 <!-- omo:id=pw-contract-no-runtime-change;stage=4;scope=frontend;review=5,6 -->
