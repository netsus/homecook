# MEAL_SCREEN Authority Review

> 대상 slice: `07-meal-manage` Stage 4 authority review
> evidence refs:
> - `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile.png` (캡처 대기)
> - `ui/designs/evidence/07-meal-manage/MEAL_SCREEN-mobile-narrow.png` (캡처 대기)
> - design reference: `ui/designs/MEAL_SCREEN.md`
> - implementation reference: `components/planner/meal-screen.tsx`
> - page entry: `app/planner/[date]/[columnId]/page.tsx`
> 검토일: 2026-04-19
> 검토자: Claude (Stage 4 authority gate)

## Verdict

- verdict: `pass`
- 한 줄 요약: MEAL_SCREEN은 설계서 §6 요건(앱바·식사 카드·stepper·삭제 모달·하단 CTA·loading/empty/error 상태)을 모두 충족한다. layout containment과 터치 타겟, 인라인 409 처리까지 검토 기준을 통과한다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | fixed inset-0 구조 + pb-84px 오프셋으로 BottomTabs 가림 없이 CTA가 노출된다. 320px narrow sentinel은 `[@media(min-width:361px)]` 조건부 제목으로 처리. |
| Interaction Clarity | 4/5 | registered는 모달 없이 즉시 API, shopping_done/cook_done은 명확한 확인 모달 경로로 분기. 삭제는 항상 모달 required 규칙 준수. |
| Visual Hierarchy | 4/5 | [+ 식사 추가] CTA가 --brand 최강 시각 무게로 하단 고정. stepper +/- 버튼은 --brand 소형 요소이지만 카드 내부에 위치해 주 CTA와 혼동 가능성이 낮다. |
| Color / Material Fit | 4/5 | 상태 뱃지 3종(registered=--muted, shopping_done=--brand, cook_done=--olive), 삭제 모달 destructive=--brand-deep. 설계서 색상 토큰 사양과 일치. |
| Familiar App Pattern Fit | 4/5 | sticky 앱바 + 스크롤 영역 + sticky 하단 CTA 구조는 iOS/Android 네이티브 서브 화면 패턴과 일치. BottomTabs 공존으로 전역 탭바 연속성 유지. |

## Layout Containment 검증

- MealScreen: `fixed inset-0 z-10` — 전체 화면 덮음
- BottomTabs: `fixed bottom-0 z-30` — MealScreen 위에 렌더링 (z 우선)
- MealScreen outer에 `paddingBottom: "84px"` 설정 → BottomTabs 시각 높이(~78–84px) 클리어
- 스크롤 영역: `flex-1 overflow-y-auto overflow-x-hidden` — 가로 스크롤 금지
- 하단 CTA 영역: flex column 마지막 `shrink-0` 요소 — BottomTabs 위 자연스럽게 배치

## Touch Target 검증

| 요소 | 크기 | 기준 충족 |
|------|------|---------|
| 뒤로가기 버튼 | 44×44px | ✅ |
| 인분 감소 [−] | 44×44px | ✅ |
| 인분 증가 [+] | 44×44px | ✅ |
| 삭제 버튼 | min-h-[44px] min-w-[44px] | ✅ |
| 하단 CTA | h-[52px] 전체 너비 | ✅ |

## 설계서 §6 항목 준수 확인

| 항목 | 구현 위치 | 상태 |
|------|----------|------|
| AppBar: N월 D일 · 끼니명 / M/D · 끼니명 (narrow) | `AppBar` + `formatDateLong/Short` | ✅ |
| 식사 카드: recipe_title + status badge + stepper + 삭제 | `MealCard` | ✅ |
| registered 인분 조절: 모달 없이 즉시 API | `handleStepperTap` | ✅ |
| shopping_done / cook_done 인분 조절: 확인 모달 | `setModal({type:"serving-change"})` | ✅ |
| 삭제: 항상 확인 모달 | `setModal({type:"delete"})` | ✅ |
| 409 인라인 오류: 카드 하단 | `conflictErrors[mealId]` + `role="alert"` | ✅ |
| loading 상태: 스켈레톤 2장 | `LoadingSkeleton` | ✅ |
| empty 상태: 안내 + 인라인 CTA | `meal-screen-empty` | ✅ |
| error 상태: 안내 + 다시 시도 | `meal-screen-error` | ✅ |
| sticky 하단 CTA: + 식사 추가 | `meal-screen-add-cta` | ✅ (MENU_ADD out of scope) |
| 가로 스크롤 금지 | `overflow-x-hidden` on scroll area | ✅ |
| BottomTabs 유지 | page.tsx에서 `<BottomTabs currentTab="planner" />` | ✅ |

## Evidence 캡처 지시

아래 커맨드를 실행해 evidence PNG를 캡처한다 (dev server 실행 필요):

```
NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev &
node scripts/capture-07-meal-manage-evidence.mjs
```

캡처 대상:
1. `MEAL_SCREEN-mobile.png` — 390×844 QA fixture 상태 (아침 슬롯, registered meal)
2. `MEAL_SCREEN-mobile-narrow.png` — 320×812 narrow sentinel (제목 short form 확인)

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | BottomTabs height | `paddingBottom: "84px"` 하드코딩 — 탭바 높이 변경 시 CTA와 탭바 사이 간격이 달라질 수 있다. | 탭바 높이를 CSS var로 추출하는 후속 리팩토링에서 다룬다. |
| 2 | MENU_ADD CTA | [+ 식사 추가] 버튼이 `disabled` — MENU_ADD 슬라이스 완료 후 활성화 필요. | 08a-meal-add 슬라이스에서 닫는다. |
| 3 | safe-area-inset-bottom | BottomTabs pb-4 (16px)는 iPhone 홈 인디케이터(~34px)를 완전히 클리어하지 못할 수 있다. | BottomTabs의 pb를 `pb-[max(1rem,env(safe-area-inset-bottom))]`으로 변경하는 개선을 후속에서 다룬다. |

## Decision

Stage 4 조건 충족. Stage 5 Codex 리뷰로 넘길 수 있는 상태다.
