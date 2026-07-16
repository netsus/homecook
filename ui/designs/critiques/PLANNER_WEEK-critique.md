# PLANNER_WEEK 설계 리뷰

> 검토 대상: `ui/designs/PLANNER_WEEK.md`
> 기준 문서: 화면정의서 v1.2.3 §5 / 요구사항기준선 v1.6.3 §1-4 / API v1.2.2 §3 / `05-planner-week-core` accepted contract / AGENTS.md
> 검토일: 2026-04-13
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: `PLANNER_WEEK`는 day-card + 4끼 고정 슬롯 baseline을 기준으로 slice06이 기대는 anchor 화면으로 쓸 수 있다. 다만 planner add 이후의 5-column 밀도, 작은 모바일 폭, range bar proximity는 Stage 4 authority evidence에서 다시 잠가야 한다.

---

## 크리티컬 이슈

없음.

---

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | 5-column 밀도 | slice06 이후 5-column 상태에서 slot 텍스트와 상태 메타가 급격히 빽빽해질 수 있다. | Stage 4 authority evidence에 5-column mobile/default+narrow 캡처를 포함한다. |
| 2 | range bar proximity | 주간 범위 바와 첫 day card 사이가 벌어지면 planner add 결과 확인 UX가 느려진다. | first viewport에서 range bar 바로 아래 첫 day card가 읽히도록 spacing을 유지한다. |
| 3 | 상태 뱃지 | `registered` / `shopping_done` / `cook_done`의 의미가 처음 보는 사용자에게는 낯설 수 있다. | badge 텍스트를 유지하고 색상만으로 구분하지 않는다. serving/status chip 분리 시에도 텍스트 의미를 유지한다. |
| 4 | 타이포 과밀/과대비 | HOME에서 PLANNER로 이동할 때 제목과 날짜 타이포가 갑자기 커 보이면 화면이 무겁게 느껴질 수 있다. | headline, range title, 날짜 라벨을 한 단계 절제해 홈과 스케일 격차를 줄인다. |

---

## 체크리스트 결과

- [x] `PLANNER_WEEK` 화면 범위만 다룬다
- [x] 상단 CTA 3개가 노출된다
- [x] 같은 날짜의 4끼가 같은 day card 안에서 읽힌다
- [x] planner add 이후에도 기존 planner mental model을 유지한다
- [x] 로그인 게이트가 planner 탭 진입 기준으로 명시된다
- [x] loading / empty / error / unauthorized 상태가 포함된다
- [x] unauthorized / loading 상태가 shared state shell 기준과 충돌하지 않는다
- [x] small mobile / authority evidence 보강 계획이 문서에 있다

---

## 결론

> **2026-07-16 prepared-food-planner-entry Stage 1 계약 승인:** 위 역사적 판정은 새 product entry anchor extension의 구현 화면을 승인하지 않는다. fresh independent Stage 1.5 reviewer는 설계 계약만 exact head에서 승인했으며, mobile baseline 375/구현 390, narrow 320, desktop, primary CTA, scroll containment, Recipe Meal/product 구분, workflow status 부재와 PLANNER_WEEK anchor 회귀의 실제 구현 판정은 Stage 4·5·final authority에서 pending이다.

### Independent Stage 1.5 Review Record — prepared-food-planner-entry

- reviewed head: `b137aa4e9d090827a80301ab47cc55710821a166`
- decision: `REQUEST_CHANGES` — Important 6건
- 이 화면 관련 finding: anchor extension evidence를 기존/신규 화면별로 구분하지 않아 PLANNER_WEEK before+after 390/320/desktop 보장이 충분히 machine-readable하지 않았다.
- repair disposition: PLANNER_WEEK의 before+after 6개 exact path를 유지·명시하고, MEAL_SCREEN/MENU_ADD도 같은 6-way matrix로 확장했다. 신규 picker/create는 after-only 3-way matrix로 분리했다.
- 전역 finding disposition: MEAL_SCREEN 예상 열량, picker cursor, real DB bootstrap/reset/cleanup, 5개 critique provenance, roadmap/status 정합성도 owning artifact에서 수정했다.
- repair-final은 자기 변경을 승인하지 않았다.

### Independent Exact-Head Re-review — prepared-food-planner-entry

- reviewed head: `fe210b7169094edc77b64e91a730d86720d598ae`
- decision: `DOC_GATE_APPROVED` — Blocker/Important/Suggestion `0/0/0`
- provenance: 첫 review `0/6/0`, 별도 repair-final 1회, fresh independent re-review `0/0/0`
- scope: PLANNER_WEEK product-entry anchor extension의 Stage 1 설계 계약과 future evidence 요구만 승인한다. Stage 4 실제 UI와 authority precheck/Stage 5/final authority/Stage 6은 pending이며 역사적 🟡 판정을 successor 구현 승인으로 간주하지 않는다.

위 문장은 역사적 slice06 판정에만 해당한다. `prepared-food-planner-entry` successor의 Stage 1 설계 계약은 exact-head 재검수에서 승인됐지만, Stage 2 진입은 docs PR #1016 merge 전까지 차단되고 실제 UI 권위 판정은 후속 단계에 남는다.

### Stage 5 Implementation Review — prepared-food-planner-entry

- review date: `2026-07-17`
- reviewed exact head: `737c799600647bac8faf8016f5940e12df2535a0`
- decision: `PASS` — Blocker/Major/Minor `0/0/0`
- `390`, `320`, `1280` before/after evidence에서 기존 week navigation, primary action, day-card geometry를 유지하면서 완제품 compact row가 Recipe Meal과 구분된다.
- 완제품 row에 레시피 조리 workflow status/action을 추가하지 않았고 anchor return도 보존된다.
- 이 판정은 Stage 5 구현 검수만 통과시킨다. `Design Status`는 final authority 전까지 `pending-review`이며 Stage 6은 승인하지 않았다.
