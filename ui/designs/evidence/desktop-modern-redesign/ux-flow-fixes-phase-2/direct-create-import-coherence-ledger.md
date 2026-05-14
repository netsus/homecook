# Phase 2 Direct Create / Import Coherence Ledger

## Scope

- Target: modular 260512 desktop prototype.
- Fixed flows:
  - `PLANNER_WEEK -> slot -> MENU_ADD -> 직접 만들기 -> 등록하기`
  - `PLANNER_WEEK -> slot -> MENU_ADD -> 유튜브 가져오기 -> 가져오기 -> 등록하기`

## Wave1 Parity

- Wave1 adds a manually created or imported recipe directly to the preset planner slot when `presetDate` and `presetSlot` exist.
- 260512 desktop now follows the same planner-origin rule.

## Desktop Presentation Decision

- Manual create and YouTube import still show the selected planner slot in their page header.
- On submit, planner-origin entries return to `PLANNER_WEEK` directly.
- No second `끼니로 추가` confirmation modal appears for these two branches.
- The Phase 1 search picker regression path still opens the locked servings modal with the selected slot badge only.

## Evidence

- `phase2-direct-create-import-smoke.json`
- `phase2-manual-create-direct-planner-1280.png`
- `phase2-youtube-import-direct-planner-1280.png`
- `phase2-search-locked-slot-regression-1280.png`

## Result

- Manual create added `테스트 된장국` directly to the planner.
- YouTube import added `김치볶음밥` directly to the planner.
- Both direct-create/import branches reported `modalCount: 0`.
- Phase 1 regression check preserved `화 5/12 · 저녁` with `phase1DateChips: 0`.
- No console or page errors were captured.
