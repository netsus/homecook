# COOK_MODE Authority Precheck

> 대상 slice: `15a-cook-planner-complete` Stage 4 `authority_precheck` / Stage 5 design review
> evidence:
> - mobile-default-screenshot: `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-default-screenshot.png`
> - mobile-narrow-screenshot: `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-narrow-screenshot.png`
> - mobile-steps-screenshot: `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-steps-screenshot.png`
> - desktop-reference-screenshot: `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-desktop-screenshot.png`
> - design reference: `ui/designs/COOK_MODE.md`
> - implementation reference: `components/cooking/cook-mode-screen.tsx`
> - sheet reference: `components/cooking/consumed-ingredient-sheet.tsx`
> - page entry: `app/cooking/sessions/[session_id]/cook-mode/page.tsx`
> - e2e reference: `tests/e2e/slice-15a-cook-planner-complete.spec.ts`
> 검토일: 2026-04-29
> 검토자: Codex (Stage 5 authority review)
> note: Screenshot evidence was captured from QA fixture dev mode at `http://127.0.0.1:3020` with mocked cook-mode API data and E2E auth override.

## Verdict

- verdict: `pass`
- 한 줄 요약: COOK_MODE 신규 화면은 플래너 세션 기반의 재료/과정 탭, 읽기 전용 인분, 좌우 스와이프, 하단 고정 CTA, 소진 재료 sheet를 구현했고, 390px 및 320px 모바일 캡처에서 겹침, 잘림, page-level horizontal overflow가 없다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 390px/320px 모두 title, servings, tab, content, CTA가 안정적으로 유지된다 |
| Interaction Clarity | 4/5 | 재료/과정 segmented tab과 swipe가 같은 상태를 제어하고, primary/secondary CTA 구분이 명확하다 |
| Visual Hierarchy | 4/5 | recipe title -> serving pill -> tab -> ingredient/step cards -> bottom CTA 순서가 명확하다 |
| Color / Material Fit | 4/5 | `--brand`, `--surface`, `--background`, `--muted`, cooking method accent colors를 사용한다 |
| Familiar App Pattern Fit | 4/5 | 모바일 조리 모드에서 익숙한 tabbed content + bottom action bar + bottom sheet 패턴이다 |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass` — content area is vertical-scrollable and horizontal swipe is scoped to the cook-mode content wrapper.
- Rule 3 (primary CTA): `pass` — [요리 완료] is fixed at the bottom and remains visible on 390px and 320px.
- Rule 3a (control proximity): `pass` — cancel action is adjacent to completion action in the bottom bar.
- Rule 4/4a/4b (familiar pattern + information grouping): `pass` — recipe meta, tabs, and cards are grouped by task phase.
- Rule 5 (mobile sentinel): `pass` — 320px evidence has no text clipping, CTA overlap, or touch target shrink.

## Contract / Policy Check

- 로그인 필수: `pass` (`SocialLoginButtons nextPath="/cooking/sessions/{session_id}/cook-mode"` + E2E login gate test)
- API wrapper 소비: `pass` (`lib/api/cooking.ts` consumes `{ success, data, error }`)
- 완료 mutation: `pass` (`POST /api/v1/cooking/sessions/{session_id}/complete` with `consumed_ingredient_ids`)
- 취소 mutation: `pass` (`POST /api/v1/cooking/sessions/{session_id}/cancel`)
- return-to-action: `pass` (session-specific cook-mode path is preserved in login gate)
- read-only servings: `pass` (servings pill only; no stepper or serving adjustment UI)
- planner/standalone separation: `pass` (page is session-id based; standalone path remains out of scope)

## Design Token Compliance

| 토큰/규칙 | 요구사항 | 적용 |
|-----------|----------|------|
| Primary action | `--brand` | [요리 완료] button background |
| Surface cards | `--surface` | ingredient and step cards |
| Background | `--background` | immersive cook-mode canvas |
| Muted text | `--muted` | servings pill, ingredient amounts, metadata |
| Card radius | `--radius-md` | ingredient and step cards |
| Button radius | `--radius-sm` | bottom CTA and sheet actions |
| Touch target | 44px min | CTA and sheet buttons use `min-h-11` |
| Safe area | bottom inset | bottom CTA and sheet use `env(safe-area-inset-bottom)` |

## Blockers

없음.

## Major Issues

없음.

## Minor Notes

- COOK_MODE is prototype-derived, not h8 parity-scored. The absence of prototype-only decorative details is not a deficit for this slice.
- The design spec recommends swipe affordance. The implemented tab underline provides visible state and the E2E suite verifies touch swipe in both directions.
- The consumed ingredient sheet scrolls internally with `max-h-[60vh]`, which resolves the Stage 1 design-critic minor note about long ingredient lists.
- 320px evidence keeps the bottom CTA horizontal with readable labels, so the optional narrow-width vertical stacking change is not required.

## Screenshot Evidence

- mobile-default (390px): `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-default-screenshot.png`
- mobile-narrow (320px): `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-narrow-screenshot.png`
- mobile-steps (390px): `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-mobile-steps-screenshot.png`
- desktop reference (1280px): `ui/designs/evidence/15a-cook-planner-complete/COOK_MODE-desktop-screenshot.png`

## Final Authority Gate

- reviewer: Claude
- decision: **pass**
- design_status_update_allowed: **yes**
- blocker_count: 0
- major_count: 0
- minor_count: 2
- required_repairs: none

### Gate Findings

**Minor 1 — heat_level Korean text vs emoji**
- `COOK_MODE.md` spec의 heat_level 표현에서 fire emoji(🔥) 대신 Korean text("중불")를 사용함
- COOK_MODE는 `prototype-derived` 디자인이므로 decorative detail 차이는 결함이 아님 (Codex precheck Minor Notes 첫 번째 항목과 일치)
- 조치 불요

**Minor 2 — swipe affordance visual hint 생략**
- design-critic 리뷰에서 권장한 swipe affordance dot indicator가 구현에 없음
- 탭 underline이 현재 상태를 표시하고, E2E가 양방향 swipe를 검증하므로 기능적 문제 없음
- Codex precheck에서도 동일하게 acceptable deferral로 판정

### Evidence Checked

- [x] mobile-default (390px): title, 2인분 pill, segmented tabs, 4 ingredient cards, bottom CTA 정상 렌더
- [x] mobile-narrow (320px): 겹침·잘림·overflow 없음, CTA 수평 유지, 터치 타겟 유지
- [x] mobile-steps (390px): step cards에 cooking method 색상 border, badge, heat/duration 표시
- [x] desktop (1280px): full-width 레퍼런스 정상
- [x] Codex authority precheck: verdict pass, scorecard 4–5/5
- [x] acceptance.md: 모든 비-manual Stage 4 항목 체크됨
- [x] Mobile UX Rules 1–5: 전부 pass
- [x] Design Token Compliance: 전 항목 적용 확인
- [x] Contract/Policy Check: 7개 항목 전부 pass
