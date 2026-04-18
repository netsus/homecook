# MODAL_SYSTEM Authority Review

> 대상 slice: `h5-modal-system-redesign` Stage 5 authority review
> evidence:
> - `ui/designs/evidence/h5-modal-system-redesign/E1-planner-add-sheet-mobile.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E2-planner-add-date-chip.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E3-save-modal-mobile.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E4-save-modal-book-selected.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E5-ingredient-filter-modal.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E6-ingredient-filter-category-selected.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E7-sort-sheet-mobile.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E8-sort-sheet-selected.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E9a-planner-add-chrome.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E9b-save-chrome.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E9c-ingredient-filter-chrome.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E9d-sort-chrome.png`
> - `ui/designs/evidence/h5-modal-system-redesign/E10-planner-add-narrow-320.png`
> - design reference: `ui/designs/MODAL_SYSTEM-wireframes.md`
> - implementation reference:
>   - `components/recipe/planner-add-sheet.tsx`
>   - `components/recipe/save-modal.tsx`
>   - `components/home/ingredient-filter-modal.tsx`
>   - `components/home/home-screen.tsx`
>   - `components/shared/modal-header.tsx`
>   - `components/shared/modal-footer-actions.tsx`
>   - `components/shared/option-row.tsx`
>   - `components/shared/selection-chip-rail.tsx`
>   - `components/shared/numeric-stepper-compact.tsx`
> 검토일: 2026-04-18
> 검토자: product-design-authority (Stage 5 review by Codex)

## Verdict

- verdict: `pass`
- 한 줄 요약: PlannerAdd / Save / IngredientFilter / Sort 4개 modal은 이제 eyebrow, close affordance, helper copy, 선택 상태 언어가 같은 패밀리로 맞춰져 이전보다 훨씬 조용하고 세련된 제품 톤으로 읽힌다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 390px와 320px 모두에서 핵심 CTA와 close button, 선택 rail이 안정적이다. |
| Interaction Clarity | 4/5 | helper copy가 짧게 붙으며 제목과 선택 UI의 역할이 분명해졌다. |
| Visual Hierarchy | 4/5 | eyebrow 제거로 장식성 카피가 빠지고, title → helper → control 순서가 명료해졌다. |
| Color / Material Fit | 4/5 | olive base + thin orange highlight 방향이 과한 색놀이 없이 통일감을 만든다. |
| Familiar App Pattern Fit | 4/5 | four-sheet family가 같은 제품 안의 같은 계열 interaction처럼 읽힌다. |

## Evidence Notes

- `E1/E2/E10`은 PlannerAdd가 compact 날짜 chip(`요일 + 4/17`)과 stepper 균형을 유지하면서도 320px에서 무너지지 않음을 보여준다.
- `E3/E4`는 Save modal이 `레시피 저장`이라는 짧은 제목과 helper copy, olive tint 선택 상태로 더 가볍고 일관된 chrome을 가지게 되었음을 보여준다.
- `E5/E6`은 IngredientFilter가 bespoke category button 집합이 아니라 shared rail 기반 system으로 정리되었고, 초기 scrollbar보다 fade/peek affordance가 앞서 읽히게 됐음을 보여준다.
- `E7/E8`은 Sort가 기존 badge/eyebrow 조합 없이도 충분히 읽히며, selected state가 다른 modal과 같은 olive family 언어를 공유함을 보여준다.
- `E9a~E9d` 4-up chrome 비교에서는 close button, panel tone, title/helper 구조가 같은 family라는 점이 가장 분명하게 드러난다.

## Resolved Since Previous Baseline

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | chrome drift | modal마다 eyebrow, close button, title tone이 제각각이었다. | 해소. 네 modal 모두 icon-only close + eyebrow 제거 + helper copy 구조로 통일됐다. |
| 2 | accent drift | olive / orange / dark fill이 modal마다 섞여 family 일관성이 약했다. | 해소. selected state는 olive family 중심, orange는 얇은 포인트로만 제한됐다. |
| 3 | PlannerAdd 밀도 | 날짜/끼니/인분 정보가 상대적으로 무겁고 반복이 있었다. | 해소. compact 날짜 chip과 lighter helper 구조로 과한 반복이 줄었다. |
| 4 | Save heading tone | 제목과 설명이 뒤섞여 문장형 heading처럼 읽혔다. | 해소. 제목 `레시피 저장` + helper copy 구조로 분리됐다. |
| 5 | Sort / Ingredient bespoke UI | bespoke header/button 구현이 남아 modal family 목표와 어긋났다. | 해소. `ModalHeader`, `OptionRow`, `SelectionChipRail`로 공통화됐다. |

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | IngredientFilter rail | fade affordance는 보이지만, 실제 많은 카테고리 데이터에서 rail의 길이가 더 길어지면 첫 인상이 약간 빽빽해질 수 있다. | 후속 데이터 확대 시 rail gap과 chip width를 한 번 더 검토한다. |
| 2 | Save create block | 이전보다 정리됐지만 custom book create 블록은 여전히 list 영역보다 약간 눈에 띈다. | 후속 polish에서 input row padding을 한 단계 줄이는 것을 검토할 수 있다. |

## Decision

- Stage 4 진행 가능 여부: `완료`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - workpack `Design Status`를 `confirmed`로 올린다.
  - `acceptance`의 authority visual 판정 항목을 닫고, Stage 6 FE PR review로 넘어간다.
  - PR current head 기준 전체 checks green이면 merge한다.

## Stage 5 Conclusion (H5)

- **신규 blocker**: 없음
- **신규 major**: 없음
- **신규 minor**: 2개
- **잔존 major**: 없음
- **최종 verdict**: `pass`
- H5 modal family redesign은 공식 계약(v1.5.0), evidence, 구현이 서로 일치하며 merge 가능한 수준이다.
