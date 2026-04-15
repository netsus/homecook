# RECIPE_DETAIL Authority Review

> 대상 slice: `03-recipe-like` + `04-recipe-save` baseline / `06-recipe-to-planner` Stage 4 authority_precheck
> evidence:
> - `ui/designs/evidence/authority/RECIPE_DETAIL-mobile.png`
> - `ui/designs/evidence/authority/RECIPE_DETAIL-mobile-narrow.png`
> - `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile.png` (390×844, captured 2026-04-15)
> - `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile-narrow.png` (320×568, captured 2026-04-15)
> - design reference: `ui/designs/RECIPE_DETAIL.md`
> - critique reference: `ui/designs/critiques/RECIPE_DETAIL-critique.md`
> - implementation reference: `components/recipe/recipe-detail-screen.tsx`
> - implementation reference: `components/recipe/planner-add-sheet.tsx`
> 검토일: 2026-04-15
> 검토자: product-design-authority (authority_precheck by Codex)

## Verdict

- verdict: `pass`
- 한 줄 요약: slice06 planner add sheet는 390px·320px 모두에서 날짜/끼니/인분/CTA 구조가 안정적으로 읽히고, anchor screen인 RECIPE_DETAIL에 새로운 blocker를 추가하지 않는다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 좁은 폭(320px)에서도 날짜 스트립·끼니 4버튼·인분 스텝퍼·CTA row가 한 화면에 들어온다. |
| Interaction Clarity | 4/5 | sheet 구조가 명확하다. backdrop, X 버튼, 취소/추가 CTA row가 모두 올바른 계층에서 읽힌다. |
| Visual Hierarchy | 4/5 | 날짜 선택 → 끼니 선택 → 인분 → CTA 순서가 자연스럽다. |
| Color / Material Fit | 4/5 | glass-panel 배경과 olive 토큰 적용이 RECIPE_DETAIL 기조와 일치한다. |
| Familiar App Pattern Fit | 4/5 | bottom sheet + horizontal date strip + grid 끼니 selector는 식단 앱의 익숙한 패턴이다. |

## Evidence Notes (slice06 authority_precheck)

- `RECIPE_DETAIL-planner-add-mobile.png` (390×844): planner add sheet가 열린 상태. backdrop 위에 sheet가 명확히 위치하고, 날짜 스트립·끼니 grid·인분 스텝퍼·CTA row가 모두 보인다.
- `RECIPE_DETAIL-planner-add-mobile-narrow.png` (320×568): 좁은 뷰포트에서도 sheet 레이아웃이 무너지지 않는다. 끼니 4버튼은 한 줄로 유지되고, "취소"와 "플래너에 추가" CTA가 모두 화면 안에 들어온다.
- 두 viewport 모두 page-level horizontal overflow 없이 안정적이다.
- 기존 `RECIPE_DETAIL-mobile.png`, `RECIPE_DETAIL-mobile-narrow.png`는 slice03/04 baseline으로 유지된다.

## Resolved Since Previous Review

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | internal scaffolding | `Recipe Snapshot`, `Slice Note`가 product body 안에 노출됐다. | 해소. 사용자에게 필요한 hero / actions / ingredients / steps만 남았다. |
| 2 | action hierarchy | metric pill과 primary row가 분리돼 planner add의 우선순위가 흐렸다. | 해소. `요리하기`와 `플래너에 추가`가 명확한 primary block을 이루고, like/save는 secondary engagement row로 내려갔다. |
| 3 | planner-add-sheet polish | close/stepper touch target이 44px 미만이었고 eyebrow가 영어 카피였다. | 해소. 닫기/stepper 버튼을 `h-11 w-11`로 맞추고 eyebrow를 `플래너에 추가`로 교체했다. |

## Major Follow-Ups

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | planner add flow detail | ~~anchor는 준비됐지만, 실제 slice06 interaction은 아직 구현 전이다.~~ | **해소**: bottom sheet로 확정, 구현 완료. |
| 2 | planner count pill | 현재 hero 우측의 planner count는 정보로는 유용하지만 CTA와의 관계를 더 다듬을 수 있다. | slice06 구현 후 planner state 반영 방식에 맞춰 copy/placement를 재점검한다. |
| 3 | share priority | planner add가 실체를 가진 지금, share 우선순위는 다시 낮아질 수 있다. | usage data 또는 product direction에 맞춰 overflow 처리 여부를 검토한다. |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | copy tone | hero 아래 helper copy는 안정적이지만 브랜드 캐릭터는 아직 절제된 편이다. | 기능 안정 후 tone refinement를 검토한다. |
| 2 | overview cards | `기본 인분 / 재료 / 조리 단계` 카드는 유용하지만, 더 compact하게 묶을 여지도 있다. | slice06 이후 실제 사용 흐름에 맞춰 density를 다시 본다. |

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - planner add CTA 추가 후 hero hierarchy 재확인 완료. 무너지지 않았다.
- touch target / copy polish까지 반영돼 추가 후속조치 없이 Stage 5로 넘길 수 있다.

## authority_precheck Conclusion (slice06 Stage 4)

- **신규 blocker**: 없음
- **신규 major**: 없음
- **신규 minor**: 없음
- **최종 verdict**: `pass`
- `RECIPE_DETAIL` anchor screen은 slice06 planner add sheet 추가 후에도 layout containment, CTA hierarchy, mobile UX 기준을 모두 유지한다.
