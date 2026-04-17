# H3: planner-add-sync — RECIPE_DETAIL Planner-Add × Day-Card Sync

> **분류**: Anchor-Extension Follow-up
> **대상 화면**: `RECIPE_DETAIL` (anchor screen), `PLANNER_WEEK` (anchor screen)
> **선행 workpack**: `06-recipe-to-planner` (merged), `H2-planner-week-v2-redesign` (merged)
> **선행 gate**: `H4-planner-week-v2-direction` 승인 완료 (2026-04-16)
> **단계**: Stage 6 — FE closeout ready
> **작성일**: 2026-04-17

---

## Slice ID / Branch 정책

| 항목 | 값 |
|------|----|
| Slice ID (workpack 폴더) | `h3-planner-add-sync` |
| FE 브랜치 | `feature/fe-h3-planner-add-sync` |
| Docs 브랜치 | `docs/h3-planner-add-sync-stage1` |
| Policy slug (check-workpack-docs) | `h3-planner-add-sync` |

> **H2 반면교사**: 대문자 포함 workpack ID(`H2-…`)는 policy slug 불일치를 유발한다.  
> 이번부터 workpack 폴더명 / branch slug / slug 검사 경로를 **동일한 lowercase**로 고정한다.

---

## 목표

`06-recipe-to-planner` (slice06)는 planner-add 바텀시트와 `POST /meals` 계약을 잠갔다.  
그러나 당시 PLANNER_WEEK baseline은 **2×2 grid** 였고, H2에서 **day-card vertical slot row**로 전환됐다.

이 슬라이스는 두 가지를 닫는다:

1. **바텀시트 날짜 표현 sync** — planner-add 바텀시트의 날짜 선택 UI를 H2 day-card 기준과 정합성 있게 맞춘다.
2. **성공 후 동작 확정** — planner-add 성공 후 토스트만 띄울지, PLANNER_WEEK로 이동할지, 이동 시 target date day-card로 scroll/focus anchoring을 할지 결정하고 잠근다.

이 두 결정이 닫히지 않으면 `07-meal-manage` 이후 슬라이스에서 혼선이 생긴다.

---

## 선행 상태 요약

| 항목 | 현재 상태 |
|------|----------|
| planner-add 바텀시트 | slice06에서 구현됨. 날짜 선택 캘린더 UI. 성공 시 토스트만 표시 |
| PLANNER_WEEK baseline | H2 완료 — day-card vertical slot row, 390px 2일 overview, 가로 스크롤 없음 |
| POST /meals 계약 | slice06에서 잠김 — 변경하지 않는다 |
| 공식 화면정의서 | v1.3.0 — PLANNER_WEEK §5 day-card 기준으로 갱신됨 |
| RECIPE_DETAIL 화면정의서 | v1.3.0 §3 — PlannerAddPopup 구조 잠금 (slice06 기준) |

---

## In Scope

- **RECIPE_DETAIL**:
  - `PlannerAddPopup` 바텀시트 날짜 표현 — H2 day-card 요일/날짜 표현 방식과 정합성 검토
  - 성공 후 동작 확정 — 토스트 유지 vs PLANNER_WEEK 이동 + anchor 결정
  - mobile 390px / 320px에서 바텀시트 안정성 확인
  - RECIPE_DETAIL primary CTA 위계 유지 확인

- **PLANNER_WEEK** (수신 측):
  - planner-add 성공 후 PLANNER_WEEK로 이동하는 경우, target date day-card로 scroll anchor 동작 정의
  - 이동하지 않는 경우, 토스트 텍스트에 target date/끼니 정보를 충분히 담을지 여부

- **공식 문서 영향도 확인**:
  - 화면정의서 §3 RECIPE_DETAIL PlannerAddPopup 갱신 필요 여부
  - 유저플로우 §② 또는 §③ 변경 필요 여부

---

## Out of Scope

- `POST /meals` 계약 변경 — 금지. slice06 계약 그대로.
- `meal_plan_columns`, `meals` DB 구조 변경 — 금지.
- PLANNER_WEEK의 layout/interaction model 추가 변경 — H2에서 잠김.
- `07-meal-manage` (MEAL_SCREEN 조회/수정/삭제) 범위 — 별도 slice.
- `08a/08b` MENU_ADD 경로 — 별도 slice.
- 요리/장보기 상태 전이 — 별도 slice.

---

## UX 결정 사항 (Stage 1에서 확정 필요)

### D1 — 성공 후 동작

| 옵션 | 동작 | 장점 | 단점 |
|------|------|------|------|
| A. 토스트만 | 팝업 닫힘 + 토스트 `"N월 D일 끼니에 추가됐어요"` | 화면 유지로 레시피 탐색 흐름 방해 없음 | 사용자가 결과를 즉시 확인할 수 없음 |
| B. PLANNER_WEEK 이동 | 팝업 닫힘 + PLANNER_WEEK로 push, target date day-card로 scroll anchor | 결과 즉시 확인 가능 | 탐색 흐름 끊김. back 시 상세로 복귀해야 함 |
| C. 토스트 + 링크 | 토스트에 "플래너 보기" 버튼 포함 → 선택적 이동 | 양쪽 선택 가능 | 토스트 UI 복잡도 증가 |

**기본 방향**: Option A (토스트만) 유지를 권장한다. 이유:
- RECIPE_DETAIL는 탐색 화면 — planner add는 보조 액션이므로 primary CTA(요리하기) 위계를 건드리지 않는 것이 원칙.
- 사용자가 여러 날짜에 연속으로 추가하는 시나리오에서 PLANNER_WEEK 이동이 반복되면 UX 마찰.
- 토스트 텍스트에 `"N월 D일 아침에 추가됐어요"` 형식으로 target day/끼니를 명시하면 즉시 확인 니즈 충족.

> **결정 전 사용자 승인 필요** — D1은 Stage 1에서 잠근다.

### D2 — 바텀시트 날짜 표현

slice06 바텀시트는 달력(월간 캘린더) 형태로 날짜를 선택한다.  
H2 day-card는 요일 배지 + `M월 D일` 포맷을 사용한다.

| 항목 | 현재 (slice06) | H2 baseline |
|------|---------------|-------------|
| 날짜 표현 | 달력 캘린더 UI + 활성 날짜 칩 | 요일 배지 + M월 D일 |
| 요일 표현 | 캘린더 헤더(일~토) + 날짜 칩 내 요일 | 2자 요일 배지 |
| 주간 단위 | 월간 캘린더 | 7일 week context bar |

정합성 검토 결론: **바텀시트 캘린더를 day-card 형식으로 바꿀 필요 없다.**  
캘린더 UI는 날짜 선택 도구이고, day-card는 날짜 표시 방식이다. 역할이 다르다.  
후속 polish 기준에서는 선택된 날짜를 별도 문장으로 한 번 더 반복하지 않고, 활성 날짜 칩의 상태만으로 확인하게 단순화한다.

**방향**: 바텀시트 캘린더 UI 유지 + 선택된 날짜는 활성 칩으로만 확인.

> **결정 전 사용자 승인 필요** — D2는 Stage 1에서 잠근다.

### D3 — 토스트 텍스트에 target date/끼니 포함

D1 Option A 선택 시, 토스트 텍스트 포맷:

| 포맷 | 예시 |
|------|------|
| 현행 | "플래너에 추가됐어요" |
| 제안 | "N월 D일 아침에 추가됐어요" |
| 대안 | "플래너에 추가됐어요 (N월 D일 아침)" |

**기본 방향**: 제안 포맷 — target date + 끼니명 포함. 이유: D1 Option A 선택 시 사용자가 결과를 혼동 없이 확인하는 유일한 방법.

---

## 계약 영향도

### 화면정의서 v1.3.0 §3 RECIPE_DETAIL 변경

| 항목 | 현재 (slice06 기준) | 변경 방향 |
|------|-------------------|----------|
| 성공 후 동작 | 토스트 "플래너에 추가됐어요" | 토스트 텍스트에 날짜/끼니 추가 (D1/D3 확정 후) |
| 바텀시트 날짜 확인 방식 | 별도 문구 미명시 | 활성 날짜 칩 상태만으로 확인 |

→ **contract-evolution 필요 여부**: 마이너 변경이므로 화면정의서 §3 업데이트(v1.3.0 → v1.3.1)가 필요하다.

### 유저플로우 §② 레시피 탐색 여정

- 성공 후 PLANNER_WEEK 이동(Option B/C)을 선택하지 않으면 플로우 자체 변경 없음.
- Option A 선택 시: 토스트 텍스트 변경만 — 플로우 변경 없음.

→ **유저플로우 변경 불필요** (D1 = Option A 기준).

### API/DB

- `POST /meals` 계약 — 변경 없음.
- `GET /planner` 계약 — 변경 없음.
- DB 구조 — 변경 없음.

---

## Contract-Evolution 실행 순서

```
Stage 1 문서 확정 (이 README)
  ↓ 사용자 승인 (D1/D2/D3)
화면정의서 v1.3.1 §3 RECIPE_DETAIL PlannerAddPopup 갱신
  → 성공 후 토스트 텍스트 포맷 (`N월 D일 끼니에 추가됐어요`)
  → 바텀시트 선택 날짜는 활성 날짜 칩으로만 확인하도록 명시
  ↓ contract-evolution PR (화면정의서 v1.3.1 + CURRENT_SOURCE_OF_TRUTH.md)
  ↓
feature/fe-h3-planner-add-sync 구현 시작 허가
```

---

## Frontend Delivery Mode

- 공식 계약 변경(contract-evolution PR) **이후** 구현 시작
- FE-only — API/DB 변경 없음
- 브랜치: `feature/fe-h3-planner-add-sync`
- 변경 대상 컴포넌트 (Stage 4 시):
  - `PlannerAddPopup` (바텀시트) — 중복 날짜 라벨 제거, 헤더/날짜 칩 타이포 정리
  - planner-add 성공 toast 텍스트 — date/끼니 포함 포맷

---

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact: `ui/designs/evidence/h3-planner-add-sync/*`
- Authority status: `reviewed`
- Notes:
  - `RECIPE_DETAIL`의 `[플래너에 추가]`는 anchor CTA row에 걸린 보조 액션이라 성공 피드백/바텀시트 변화가 primary CTA 위계를 깨지 않아야 한다.
  - D1을 Option A로 확정했으므로 `PLANNER_WEEK` 이동 자체는 없지만, day-card baseline과의 날짜 표현 sync는 authority evidence로 계속 확인한다.
  - Stage 5 authority review (2026-04-17): 핵심 evidence 재확인 결과 신규 blocker 0개, verdict `pass`.

### Stage 4 Evidence Plan

| artifact | 경로 | 설명 |
|----------|------|------|
| RECIPE_DETAIL 기준선 | `ui/designs/evidence/h3-planner-add-sync/RECIPE_DETAIL-baseline.png` | 구현 전 현행 상태 |
| planner-add 바텀시트 (390px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-sheet-mobile.png` | 날짜 선택 중 상태 |
| 바텀시트 narrow (320px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-sheet-narrow.png` | 잘림/가림 없음 확인 |
| 성공 토스트 (390px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-toast-mobile.png` | 날짜/끼니 포함 텍스트 |
| RECIPE_DETAIL CTA 위계 유지 | `ui/designs/evidence/h3-planner-add-sync/recipe-detail-cta-hierarchy.png` | primary CTA 위계 확인 |

---

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현 완료, Stage 5 디자인/authority review 대기
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> `h3-planner-add-sync`는 2026-04-17 Stage 5 authority review에서 `pass`를 받아 현재 상태를 `confirmed`로 올린다.

---

## Dependencies

| 선행 | 상태 | 확인 |
|------|------|------|
| `06-recipe-to-planner` | merged | ✅ |
| `H2-planner-week-v2-redesign` | merged | ✅ |
| `H4-planner-week-v2-direction` (승인) | 승인 완료 2026-04-16 | ✅ |

---

## Source Links

- `docs/workpacks/06-recipe-to-planner/README.md` — planner-add 구현 기준
- `ui/designs/RECIPE_DETAIL.md` §PlannerAddPopup — 현행 바텀시트 명세
- `ui/designs/PLANNER_WEEK.md` — H2 day-card baseline
- `ui/designs/authority/PLANNER_WEEK-authority.md` — H2 authority (day-card 기준)
- `ui/designs/authority/RECIPE_DETAIL-authority.md` — RECIPE_DETAIL CTA 위계 기준
- `docs/화면정의서-v1.4.0.md` §3 RECIPE_DETAIL PlannerAddPopup, §5 PLANNER_WEEK
- `docs/workpacks/H4-planner-week-v2-direction/README.md` — 방향 결정 gate

---

## Stage 1 Delivery Checklist

- [x] In Scope / Out of Scope 정의
- [x] UX 결정 사항 D1/D2/D3 옵션 정리
- [x] 계약 영향도 분석 (API/DB 불변 확인)
- [x] contract-evolution 경로 정리
- [x] authority 위험도 분류 + evidence plan 잠금
- [x] Slice ID / Branch slug policy 명시
- [x] 사용자 승인 (D1: A 토스트만, D2: 선택 날짜는 활성 칩으로만 확인, D3: `N월 D일 끼니에 추가됐어요`) — 2026-04-17
- [x] contract-evolution PR (화면정의서 v1.3.1) — PR #136 merged 2026-04-17
- [x] feature/fe-h3-planner-add-sync 구현 시작 허가 — PR #136 merge 완료
- [x] Stage 5 authority review `pass` — `ui/designs/authority/RECIPE_DETAIL-authority.md` (2026-04-17)
- [x] PR #137 closeout review 준비 완료 — all current head checks green

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> `automation-spec.json`이 있는 슬라이스이므로 각 항목의 `omo:id / stage / scope / review` metadata를 유지한다.

- [x] 백엔드 계약 고정 (`POST /meals` 계약 불변, planner-add는 기존 API 재사용) <!-- omo:id=h3-delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (기존 `createMeal`, `fetchPlanner` adapter 재사용) <!-- omo:id=h3-delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (planner-add sheet / 성공 토스트 포맷 타입 경계 유지) <!-- omo:id=h3-delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (`POST /meals` 계약 불변, 로그인 게이트 return-to-action 유지) <!-- omo:id=h3-delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 (slice06 baseline + H3 추가 evidence 기준으로 수동 검증 경로 유지) <!-- omo:id=h3-delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (기존 planner column / meal baseline 재사용) <!-- omo:id=h3-delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 (planner-add sheet 중복 날짜 라벨 제거 + 성공 토스트 포맷 유지) <!-- omo:id=h3-delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 (unit 포맷 검증 + slice06 smoke expectation 갱신) <!-- omo:id=h3-delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 (sheet open/submit/loading, success toast, login-gate fallback 유지) <!-- omo:id=h3-delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 (320px/390px sheet, CTA hierarchy, return-to-action) <!-- omo:id=h3-delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] anchor-extension authority evidence 계획 고정 (핵심 planner-add evidence 경로 잠금) <!-- omo:id=h3-delivery-authority-plan;stage=4;scope=frontend;review=5,6 -->
- [x] Stage 4 authority report / screenshot 경로 동기화 (`ui/designs/evidence/h3-planner-add-sync/`) <!-- omo:id=h3-delivery-authority-evidence-plan;stage=4;scope=frontend;review=5,6 -->
