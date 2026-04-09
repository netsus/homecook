# RECIPE_DETAIL Authority Review

> 대상 slice: `03-recipe-like` + `04-recipe-save` baseline / `06-recipe-to-planner` preflight
> evidence:
> - `ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png`
> - `ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png`
> - design reference: `ui/designs/RECIPE_DETAIL.md`
> - critique reference: `ui/designs/critiques/RECIPE_DETAIL-critique.md`
> - implementation reference: `components/recipe/recipe-detail-screen.tsx`
> 검토일: 2026-04-09
> 검토자: product-design-authority

## Verdict

- verdict: `pass`
- 한 줄 요약: `RECIPE_DETAIL`은 internal scaffolding을 제거하고 action hierarchy를 정리하면서, slice06의 planner add flow를 얹을 수 있는 anchor screen 기준까지 올라왔다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 좁은 폭에서도 구조가 자연스럽고 action block이 product-first로 정리됐다. |
| Interaction Clarity | 4/5 | `요리하기`, `플래너에 추가`, `저장`의 위계가 이전보다 명확해졌다. |
| Visual Hierarchy | 4/5 | internal card가 사라지고 hero -> action -> ingredients -> steps 순서가 안정됐다. |
| Color / Material Fit | 4/5 | 현재 토큰 적용은 비교적 안정적이다. |
| Familiar App Pattern Fit | 4/5 | 모바일 레시피 상세 화면으로서 훨씬 익숙한 리듬에 가까워졌다. |

## Evidence Notes

- authority evidence는 갱신된 visual baseline과 같은 화면 기준으로 다시 동기화했다.
- `RECIPE_DETAIL-mobile.png`, `RECIPE_DETAIL-mobile-narrow.png`는 현재 mobile visual baseline을 그대로 반영한다.
- containment는 계속 안정적이고, 이번 refresh의 핵심은 **정보 구조와 action hierarchy 정리**였다.

## Resolved Since Previous Review

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | internal scaffolding | `Recipe Snapshot`, `Slice Note`가 product body 안에 노출됐다. | 해소. 사용자에게 필요한 hero / actions / ingredients / steps만 남았다. |
| 2 | action hierarchy | metric pill과 primary row가 분리돼 planner add의 우선순위가 흐렸다. | 해소. `요리하기`와 `플래너에 추가`가 명확한 primary block을 이루고, like/save는 secondary engagement row로 내려갔다. |

## Major Follow-Ups

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | planner add flow detail | anchor는 준비됐지만, 실제 slice06 interaction은 아직 구현 전이다. | planner add를 bottom sheet로 잠글지, inline modal로 잠글지 Stage 1에서 명확히 결정한다. |
| 2 | planner count pill | 현재 hero 우측의 planner count는 정보로는 유용하지만 CTA와의 관계를 더 다듬을 수 있다. | slice06 구현 후 planner state 반영 방식에 맞춰 copy/placement를 재점검한다. |
| 3 | share priority | 지금은 큰 문제는 아니지만, planner add가 실체를 가지면 share 우선순위는 다시 낮아질 수 있다. | usage data 또는 product direction에 맞춰 overflow 처리 여부를 검토한다. |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | copy tone | hero 아래 helper copy는 안정적이지만 브랜드 캐릭터는 아직 절제된 편이다. | 기능 안정 후 tone refinement를 검토한다. |
| 2 | overview cards | `기본 인분 / 재료 / 조리 단계` 카드는 유용하지만, 더 compact하게 묶을 여지도 있다. | slice06 이후 실제 사용 흐름에 맞춰 density를 다시 본다. |

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - slice06은 현재 detail anchor 위에서 planner add interaction을 닫는다.
  - 구현 후에는 planner add completion state가 hero hierarchy를 다시 무너뜨리지 않는지 한 번 더 본다.

## Baseline Conclusion

현재 baseline의 결론은 다음과 같다.

- `RECIPE_DETAIL`은 이제 planner처럼 먼저 고쳐야 할 blocker가 없다.
- anchor screen으로서 필요한 hierarchy와 product tone이 충분히 정리됐다.
- slice06은 이 baseline 위에서 진행해도 된다.
