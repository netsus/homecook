# Phase 1 Planner Target Preservation Ledger

## Scope

- Target: modular 260512 desktop prototype.
- Fixed flow: `PLANNER_WEEK -> slot -> MENU_ADD -> recipe picker -> servings confirm`.
- Branches replayed:
  - recipe search
  - recipebook picker
  - pantry match picker

## Wave1 Parity

- Wave1 keeps `presetDate` and `presetSlot` from the planner slot.
- When both preset values exist, Wave1 hides target date/meal selection and asks only for servings.
- 260512 desktop now follows the same rule for the three Phase 1 picker branches.

## Desktop Presentation Decision

- The selected planner target is shown as a locked context badge.
- Date chip rail and meal segmented control are hidden when the planner slot is preset.
- Servings remains editable.

## Evidence

- `phase1-planner-target-smoke.json`
- `phase1-search-locked-servings-modal-1280.png`
- `phase1-recipebook-locked-servings-modal-1280.png`
- `phase1-pantry-locked-servings-modal-1280.png`

## Result

- All three picker branches preserve `화 5/12 · 저녁`.
- All three picker branches report `dateChipCount: 0`.
- All three picker branches report `segmentedCount: 0`.
- No console or page errors were captured.
