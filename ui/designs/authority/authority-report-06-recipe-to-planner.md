# Authority Report: 06-recipe-to-planner

> subphase: `authority_precheck` (Codex)
> slice: `06-recipe-to-planner`
> stage: 4
> date: 2026-04-15

## Reviewed Screens

- `RECIPE_DETAIL` → `ui/designs/authority/RECIPE_DETAIL-authority.md`
- `PLANNER_WEEK` → `ui/designs/authority/PLANNER_WEEK-authority.md`

## Summary

| 화면 | verdict | blocker | major (신규) | minor (신규) |
|------|---------|---------|-------------|-------------|
| RECIPE_DETAIL | pass | 0 | 0 | 0 (eyebrow copy 한국어 수정 완료) |
| PLANNER_WEEK | pass | 0 | 0 | 0 (major #2 헤더 액션 압축 → deferred, slice06 out-of-scope) |

## Changes Since precheck

- `RECIPE_DETAIL` minor: 영어 eyebrow "Add to Planner" → "플래너에 추가" 수정 (`planner-add-sheet.tsx:86`)
- `RECIPE_DETAIL` touch targets: 닫기 버튼 `h-9 w-9`(36px) → `h-11 w-11`(44px), 인분 stepper `h-10 w-10`(40px) → `h-11 w-11`(44px)
- `PLANNER_WEEK` major #2: column CRUD 기능이 slice06에 미구현임을 확인, conditional-pass → pass로 업데이트

## Evidence

- `test-results/screenshots/RECIPE_DETAIL-planner-add-mobile.png` (390×844)
- `test-results/screenshots/RECIPE_DETAIL-planner-add-mobile-narrow.png` (320×568)
- `test-results/screenshots/PLANNER_WEEK-5-column-mobile.png` (390×844)

## Verdict

`pass` — 신규 blocker 0, 신규 major 0, 신규 minor 0. 터치 타겟·copy 수정 완료. slice06 anchor screen 변경은 clean하다.
