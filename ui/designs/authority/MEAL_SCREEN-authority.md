# MEAL_SCREEN Authority Review

> 대상 slice: `07-meal-manage` Stage 4 authority_precheck
> evidence:
> - `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile.png` (390×844, captured 2026-04-19)
> - `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile-narrow.png` (320×812, captured 2026-04-19)
> - design reference: `ui/designs/MEAL_SCREEN.md`
> - implementation reference: `components/planner/meal-screen.tsx`
> - page entry: `app/planner/[date]/[columnId]/page.tsx`
> - test reference: `tests/planner-meal-screen.test.tsx`
> - e2e reference: `tests/e2e/slice-07-meal-manage.spec.ts`
> 검토일: 2026-04-19
> 검토자: Codex (Stage 4 authority_precheck)

## Verdict

- verdict: `pass`
- 한 줄 요약: MEAL_SCREEN은 신규 화면 authority precheck 기준에서 모바일 기본 폭과 narrow sentinel 모두 안정적이며, primary CTA 위계·모달 분기·로그인 게이트·하단 탭 공존 구조가 문서 계약과 일치한다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 390px evidence에서 앱바 → 식사 카드 → 하단 CTA → 탭바 구조가 자연스럽고, 320px에서도 제목 short form과 stepper 44px 타겟이 유지된다. |
| Interaction Clarity | 4/5 | registered는 즉시 mutation, shopping_done/cook_done은 확인 모달, 삭제는 항상 확인 모달로 분기돼 행동 규칙이 명확하다. |
| Visual Hierarchy | 4/5 | 하단 `+ 식사 추가` CTA가 가장 강한 행동으로 유지되고, 카드 내부 stepper/삭제는 보조 조작으로 읽힌다. |
| Color / Material Fit | 4/5 | 상태 뱃지 3종과 브랜드 버튼, 패널/서피스 톤이 design tokens 및 설계서 기준과 일치한다. |
| Familiar App Pattern Fit | 4/5 | sticky app bar + scroll body + bottom tabs 조합이 익숙한 모바일 서브 화면 패턴을 유지한다. |

## Evidence Notes

- `MEAL_SCREEN-mobile.png`는 authenticated fixture 상태에서 `4월 18일 · 아침` 제목, registered meal card, 하단 `+ 식사 추가` CTA, BottomTabs 공존을 보여준다.
- `MEAL_SCREEN-mobile-narrow.png`는 320px sentinel에서 제목이 short form으로 전환되고, stepper와 삭제 버튼이 한 카드 안에서 무너지지 않음을 보여준다.
- 두 evidence 모두 page-level horizontal overflow 없이 고정 app bar / 본문 / 하단 CTA 계층이 유지된다.
- 현재 evidence는 기본 진입 상태 기준이며, 긴 목록 스크롤 상태 캡처는 후속 authority refresh에서 추가해도 된다.

## Layout Containment 검증

- page entry는 `app/planner/[date]/[columnId]/page.tsx`에서 `MealScreen`과 `BottomTabs`를 함께 렌더링한다.
- `MealScreen` 본문은 `overflow-y-auto` / `overflow-x-hidden` 기반이라 page-level horizontal scroll이 생기지 않는다.
- 하단 CTA와 BottomTabs가 동시에 보이는 구조이며, CTA가 탭바 아래로 가려지지 않는다.

## Touch Target 검증

| 요소 | 크기 | 기준 충족 |
|------|------|---------|
| 뒤로가기 버튼 | 44×44px | ✅ |
| 인분 감소 [−] | 44×44px | ✅ |
| 인분 증가 [+] | 44×44px | ✅ |
| 삭제 버튼 | 44px 이상 | ✅ |
| 하단 CTA | 52px 높이 | ✅ |

## 설계서 §6 항목 준수 확인

| 항목 | 구현 위치 | 상태 |
|------|----------|------|
| AppBar: 날짜 + 끼니명 / narrow short form | `AppBar`, `formatDateLong`, `formatDateShort` | ✅ |
| 식사 카드: 제목 + 상태 뱃지 + stepper + 삭제 | `MealCard` | ✅ |
| registered 인분 조절: 모달 없이 즉시 API | `handleStepperTap` 경로 | ✅ |
| shopping_done / cook_done: 확인 모달 | `serving-change` modal state | ✅ |
| 삭제: 항상 확인 모달 | `delete` modal state | ✅ |
| 409 인라인 오류 | `conflictErrors` + card alert | ✅ |
| loading / empty / error 상태 | `LoadingSkeleton`, empty/error sections | ✅ |
| sticky 하단 CTA | `meal-screen-add-cta` | ✅ |
| BottomTabs 유지 | page.tsx `BottomTabs currentTab="planner"` | ✅ |

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | BottomTabs spacing | CTA 하단 여백이 탭바 높이에 의존해 다소 보수적으로 잡혀 있다. | 탭바 높이를 CSS 변수로 추출하는 후속 리팩토링에서 정리한다. |
| 2 | `+ 식사 추가` CTA | CTA는 권한 위계상 적절하지만 현재 disabled 상태라 Stage 4 evidence에서 affordance가 완전하지 않다. | `08a-meal-add-search-core`에서 실제 진입 흐름 연결 후 authority refresh를 권장한다. |
| 3 | 긴 목록 스크롤 evidence | 현재 precheck evidence는 기본 진입/좁은 폭만 포함하고, long-list scroll state는 별도 캡처하지 않았다. | Stage 5 전 또는 follow-up evidence refresh에서 스크롤 중 상태를 1장 추가 캡처한다. |

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - 이 authority report와 mobile/narrow evidence 2장을 Stage 4 authority_precheck 산출물로 묶는다.
  - Stage 5 디자인 리뷰는 blocker 없이 시작 가능하다.
  - `MENU_ADD` 연결 이후 CTA enabled 상태와 long-list scroll evidence를 follow-up으로 보강하면 더 안전하다.
