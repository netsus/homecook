# PLANNER_WEEK Authority Review

> 대상 slice: `05-planner-week-core` baseline / `06-recipe-to-planner` Stage 4
> evidence:
> - `ui/designs/evidence/authority/PLANNER_WEEK-mobile.png`
> - `ui/designs/evidence/authority/PLANNER_WEEK-mobile-narrow.png`
> - `ui/designs/evidence/authority/PLANNER_WEEK-mobile-scrolled.png`
> - `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png`
> - design reference: `ui/designs/PLANNER_WEEK.md`
> - critique reference: `ui/designs/critiques/PLANNER_WEEK-critique.md`
> - implementation reference: `components/planner/planner-week-screen.tsx`
> 검토일: 2026-04-15
> 검토자: product-design-authority

## Verdict

- verdict: `conditional-pass`
- 한 줄 요약: `PLANNER_WEEK`는 table/grid mental model을 복원했고, 모바일 `390px` / `320px` evidence 모두에서 page-level horizontal overflow 없이 planner 내부 scroll containment만 남긴다. 다만 최대 5-column 밀도와 헤더 액션 압축은 다음 보강 대상으로 유지한다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 3/5 | 문서가 의도한 localized horizontal scroll만 남았고 page width는 안정적이다. 다만 좁은 폭에서 헤더 조작 밀도는 여전히 높다. |
| Interaction Clarity | 4/5 | 날짜 x 끼니 표 구조가 다시 분명해졌다. overflow 문제를 해결하면서 interaction model을 바꾸지 않은 점이 이번 baseline의 핵심 개선이다. |
| Visual Hierarchy | 3/5 | 내부 scaffolding은 제거됐고 표 중심 구조는 명확하다. 다만 planner 자체의 강한 시각 캐릭터는 아직 약하다. |
| Color / Material Fit | 3/5 | 토큰과 상태 뱃지 사용은 안정적이지만 planner 전용 톤은 아직 보수적이다. |
| Familiar App Pattern Fit | 4/5 | planner를 card stack으로 바꾸지 않고 grid mental model을 유지해 기대와의 어긋남을 줄였다. |

## Evidence Notes

- 이번 evidence는 planner 내부 scroller 자체를 캡처해 scroll containment를 명확히 확인했다.
- 캡처 시 browser metrics:
  - mobile `390px`: `pageScrollWidth=390`, `bodyScrollWidth=390`, `scrollerClientWidth=356`, `scrollerScrollWidth=876`
  - narrow `320px`: `pageScrollWidth=320`, `bodyScrollWidth=320`, `scrollerClientWidth=286`, `scrollerScrollWidth=876`
  - scrolled state: `scrollerScrollLeft=520`
- 핵심 확인점은 다음 두 가지다.
  - 페이지 전체 폭은 viewport를 넘지 않는다.
  - 필요한 horizontal movement는 planner 표 내부에서만 일어난다.

## Resolved Since Previous Review

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | 과교정된 interaction model | overflow를 고친다는 이유로 planner를 `column rail + day card` 구조로 바꿨다. | 해소. `ui/designs/PLANNER_WEEK.md`가 의도한 날짜 x 끼니 table/grid model로 복원했다. |
| 2 | page-level overflow 구분 실패 | localized scroll과 page-level overflow를 같은 문제처럼 취급했다. | 해소. 현재 evidence에서 document width는 viewport와 동일하고, overflow는 planner 내부 scroller에만 남는다. |
| 3 | guest small-viewport CTA | 작은 iOS viewport에서 primary login CTA가 하단 탭과 너무 가까웠다. | 해소. unauthorized shell spacing을 조정해 CTA가 하단 탭 위에서 읽힌다. |

## Major Issues

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | 최대 5-column 상태 | 현재 authority evidence는 3-column 기준이다. 5-column까지 확장되면 헤더 조작 밀도와 스캔 비용이 다시 커질 수 있다. | slice06 전 또는 slice06 QA에서 5-column mobile evidence를 추가 캡처한다. |
| 2 | 헤더 액션 압축 | `저장 / 삭제 / 순서 변경`이 좁은 모바일 폭에서 여전히 빽빽하게 느껴질 수 있다. | 필요 시 delete를 overflow 메뉴로 옮기거나, rename save affordance를 더 간결하게 압축한다. |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | planner tone | 구조는 안정적이지만 planner 전용 시각 개성은 아직 약하다. | 기능 변경과 분리된 visual polish 라운드에서 다룬다. |
| 2 | 빈 셀 반복 | 15일 범위에서는 `등록된 식사가 없어요`가 많이 반복돼 시선 피로가 생긴다. | 이후 slice에서 range window 또는 empty density 완화 패턴을 검토한다. |

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - slice06은 이 corrected planner baseline 위에서 진행한다.
  - 다만 slice06 authority review에는 `5-column mobile density` evidence를 필수로 포함한다.
  - interaction model 변경 제안이 나오면 authority 단독 판단이 아니라 별도 승인 대상으로 올린다.

## Baseline Conclusion

이 baseline의 핵심은 "가로 스크롤을 없애는 것"이 아니라
"page-level overflow는 막고, planner가 원래 가져야 할 표 구조는 보존한다"는 점이다.

이번 수정으로 `PLANNER_WEEK`는 더 이상 card shell로 우회된 화면이 아니다.
여전히 localized horizontal scroll은 남지만, 그 범위와 역할이 planner 내부로 제한됐고,
그 결과 slice06이 기대는 anchor baseline으로는 사용할 수 있는 상태가 됐다.
