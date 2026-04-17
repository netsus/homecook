# H3: planner-add-sync — RECIPE_DETAIL Planner-Add × Day-Card Sync

> **분류**: Anchor-Extension Follow-up
> **대상 화면**: `RECIPE_DETAIL` (anchor screen), `PLANNER_WEEK` (anchor screen)
> **선행 workpack**: `06-recipe-to-planner` (merged), `H2-planner-week-v2-redesign` (merged)
> **선행 gate**: `H4-planner-week-v2-direction` 승인 완료 (2026-04-16)
> **단계**: Stage 1 — Design + Contract-Evolution Draft
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
| A. 토스트만 | 팝업 닫힘 + 토스트 "플래너에 추가됐어요" (현재) | 화면 유지로 레시피 탐색 흐름 방해 없음 | 사용자가 결과를 즉시 확인할 수 없음 |
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
| 날짜 표현 | 달력 캘린더 UI | 요일 배지 + M월 D일 |
| 요일 표현 | 캘린더 헤더(일~토) | 2자 요일 배지 |
| 주간 단위 | 월간 캘린더 | 7일 week context bar |

정합성 검토 결론: **바텀시트 캘린더를 day-card 형식으로 바꿀 필요 없다.**  
캘린더 UI는 날짜 선택 도구이고, day-card는 날짜 표시 방식이다. 역할이 다르다.  
단, 바텀시트 내 선택된 날짜 확인 텍스트(확인 버튼 위)에 day-card와 동일한 `요일 + M월 D일` 포맷을 사용하면 전환 충격이 없다.

**방향**: 바텀시트 캘린더 UI 유지 + 선택된 날짜 표시 포맷을 `요일 M월 D일`로 통일 (예: `목 4월 17일`).

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
| 바텀시트 날짜 확인 텍스트 | 미명시 | `요일 M월 D일` 포맷 명시 (D2 확정 후) |

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
  → 성공 후 토스트 텍스트 포맷 (`요일 M월 D일 끼니에 추가됐어요`)
  → 바텀시트 날짜 확인 텍스트 포맷 (`요일 M월 D일`) 명시
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
  - `PlannerAddPopup` (바텀시트) — 날짜 확인 텍스트 포맷
  - planner-add 성공 toast 텍스트 — date/끼니 포함 포맷

---

## Design Authority

- UI risk: `anchor-extension` (RECIPE_DETAIL은 anchor screen)
- **왜 high-risk인가**:
  - RECIPE_DETAIL은 가장 트래픽이 많은 핵심 탐색 화면이다.
  - `[플래너에 추가]` + `[요리하기]` primary CTA 위계는 slice05~06 authority에서 잠긴 계약이다. 바텀시트 UX 변경이 CTA 위계나 화면 scroll position을 건드리면 authority 재검토가 필요하다.
  - planner-add 성공 후 PLANNER_WEEK 이동(Option B) 선택 시, PLANNER_WEEK도 anchor screen이므로 두 anchor screen이 동시에 영향을 받는다 — 이중 anchor 위험.
- 이번 Stage 1에서 D1을 Option A로 확정하면 PLANNER_WEEK authority 재검토 불필요.
- D1을 Option B/C로 선택하면 PLANNER_WEEK authority precheck가 추가로 필요하다.

### Stage 4 Evidence Plan

| artifact | 경로 | 설명 |
|----------|------|------|
| RECIPE_DETAIL 기준선 | `ui/designs/evidence/h3-planner-add-sync/RECIPE_DETAIL-baseline.png` | 구현 전 현행 상태 |
| planner-add 바텀시트 (390px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-sheet-mobile.png` | 날짜 선택 중 상태 |
| 날짜 선택 확인 텍스트 | `ui/designs/evidence/h3-planner-add-sync/planner-add-sheet-date-label.png` | 요일+날짜 포맷 확인 |
| 바텀시트 narrow (320px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-sheet-narrow.png` | 잘림/가림 없음 확인 |
| 성공 토스트 (390px) | `ui/designs/evidence/h3-planner-add-sync/planner-add-toast-mobile.png` | 날짜/끼니 포함 텍스트 |
| RECIPE_DETAIL CTA 위계 유지 | `ui/designs/evidence/h3-planner-add-sync/recipe-detail-cta-hierarchy.png` | primary CTA 위계 확인 |

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
- `docs/화면정의서-v1.3.0.md` §3 RECIPE_DETAIL, §5 PLANNER_WEEK
- `docs/workpacks/H4-planner-week-v2-direction/README.md` — 방향 결정 gate

---

## Stage 1 Delivery Checklist

- [x] In Scope / Out of Scope 정의
- [x] UX 결정 사항 D1/D2/D3 옵션 정리
- [x] 계약 영향도 분석 (API/DB 불변 확인)
- [x] contract-evolution 경로 정리
- [x] authority 위험도 분류 + evidence plan 잠금
- [x] Slice ID / Branch slug policy 명시
- [x] 사용자 승인 (D1: A 토스트만, D2: `요일 M월 D일`, D3: `N월 D일 끼니에 추가됐어요`) — 2026-04-17
- [ ] contract-evolution PR (화면정의서 v1.3.1)
- [ ] feature/fe-h3-planner-add-sync 구현 시작 허가
