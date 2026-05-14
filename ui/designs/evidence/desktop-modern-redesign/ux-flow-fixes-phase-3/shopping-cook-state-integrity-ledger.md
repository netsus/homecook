# Phase 3 Shopping / Cook State Integrity Ledger

## Scope

- Target: modular 260512 desktop prototype.
- Fixed flows:
  - registered meal -> shopping CTA -> active linked list reopen
  - shopping detail -> checked all -> pantry reflect -> completed read-only list
  - completed shopping -> linked meal becomes cook-ready
  - planner cook mode -> complete from in-screen ingredient checklist without second deduction dialog

## State Decisions

- `shoppingLists` is now mutable app state.
- Active linked lists are reused when a registered meal already belongs to one.
- Completing a shopping list marks only that list completed.
- Linked meals in `registered` state become `shopped`; unrelated meals/lists are not completed.
- Cook mode uses the selected ingredient ids from its rail checklist and completes directly.

## Evidence

- `phase3-shopping-cook-state-smoke.json`
- `phase3-linked-shopping-reopen-1280.png`
- `phase3-shopping-completed-readonly-1280.png`
- `phase3-cook-completed-no-duplicate-modal-1280.png`

## Result

- `비빔밥` reopened the same active linked list twice before completion.
- Completing the list checked 10 rows and rendered the read-only completed banner.
- Cooking after shopping completion did not open the old `재료 차감` modal.
- No console or page errors were captured.

## Deferred

- `장보기 다시 담기` remains for Phase 5 frozen CTA closure.
- Manual freeform shopping list creation remains for Phase 5 frozen CTA closure.
