# Desktop MVP Porting Slice 1 Contracts

## Program Owner Override

This document records the program-specific owner override for the desktop prototype -> MVP porting effort.

- Claude owns design planning, pre-implementation signoff, and post-implementation authority review.
- Codex owns implementation, repair loop, verification integration, final orchestration, and closeout.
- This is limited to the desktop prototype -> MVP porting program and does not generally change `docs/engineering/slice-workflow.md` ownership.

## Auth / LoginGate

- Slice 1 owns LoginGate foundation and recipe-scoped pending action preservation.
- Existing `pending-action.ts` remains recipe-scoped for `like | save | planner`.
- Non-recipe protected actions such as shopping create, pantry update, recipebook edit, and settings update are not generalized in Slice 1.
- Later slices must either consume the existing recipe gate where applicable or explicitly document the follow-up if a non-recipe protected action needs return-to-action support.

## Cooking Ownership

- Slice 7 owns desktop `COOK_READY_LIST`, `COOK_MODE`, and `ConsumedIngredientSheet`.
- `CookNoticeDialog` can be a helper or fallback only.
- Notice-only behavior cannot close cooking parity.
- Cook mode must not include serving adjustment UI.
- Planned cooking and standalone cooking must keep separate status semantics.

## Breakpoint Ownership

- App/mobile view remains below `1024px`.
- Desktop/web presentation starts at `1024px`.
- Tailwind `lg:` is the allowed utility breakpoint for app/web surface switching.
- `md:` can remain for minor layout refinements only, not app/web surface switching.

## Component Foundation Ownership

- Slice 1 owns `components/web/*`, `--web-*` tokens, and `components/web/REFERENCE_LOCK.md`.
- Slices 2-8 must consume these primitives instead of creating one-off visual variants.
- A new variant must be backed by a prototype row or recorded explicitly in the porting ledger.
