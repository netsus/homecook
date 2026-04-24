# MENU_ADD Authority Review

> 대상 slice: `08a-meal-add-search-core` Stage 4 authority_precheck
> evidence:
> - `ui/designs/evidence/08a/MENU_ADD-mobile.png`
> - `ui/designs/evidence/08a/MENU_ADD-mobile-narrow.png`
> - design reference: `ui/designs/MENU_ADD.md`
> - implementation reference: `components/planner/menu-add-screen.tsx`
> - page entry: `app/menu-add/page.tsx`
> - e2e reference: `tests/e2e/slice-08a-meal-add-search.spec.ts`
> 검토일: 2026-04-24
> 검토자: Codex (Stage 4 authority_precheck)

## Verdict

- verdict: `conditional-pass`
- 한 줄 요약: MENU_ADD는 mobile default와 narrow sentinel 모두에서 검색 중심 진입 구조가 안정적이고, placeholder CTA도 화면 위계를 해치지 않지만 Stage 5에서 disabled affordance의 최종 톤 정리는 한 번 더 확인하는 편이 안전하다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 390px와 320px 모두에서 앱바, 검색창, 안내 문구, placeholder CTA 묶음이 한 화면 안에서 자연스럽게 읽힌다. |
| Interaction Clarity | 4/5 | primary path가 검색창에 명확히 모이고, out-of-scope 버튼은 disabled 상태로 오해를 줄인다. |
| Visual Hierarchy | 4/5 | 검색 입력 영역이 가장 먼저 읽히고, 하단 placeholder 묶음은 보조 행동군으로 분리된다. |
| Color / Material Fit | 4/5 | 기존 planner surface 토큰과 충돌 없이 sheet-like neutral surface를 유지한다. |
| Familiar App Pattern Fit | 4/5 | 모바일 meal-add 진입 화면으로 익숙한 검색 우선 패턴을 따른다. |

## Evidence Notes

- `MENU_ADD-mobile.png`는 390px 기본 뷰포트에서 제목, 검색창, 검색 CTA, placeholder 버튼 묶음이 안정적으로 보이는 상태를 보여준다.
- `MENU_ADD-mobile-narrow.png`는 320px 좁은 폭에서도 검색 입력과 placeholder 버튼 묶음이 수평 overflow 없이 유지되는 것을 보여준다.
- 두 evidence 모두 page-level horizontal overflow 없이 검색 우선 위계를 유지한다.

## Major Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | placeholder CTA affordance | disabled 버튼 묶음은 범위 밖 기능을 잘 드러내지만, Stage 5에서는 "준비 중" 톤과 disabled contrast가 실제 앱 톤에 충분히 자연스러운지 최종 확인이 필요하다. | public design review에서 비활성 affordance 대비와 copy tone을 최종 점검한다. |

## Minor Issues

없음.

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - 현재 evidence를 authority precheck 산출물로 사용한다.
  - Stage 5에서 disabled placeholder affordance의 최종 톤과 강조 균형을 확인한다.
