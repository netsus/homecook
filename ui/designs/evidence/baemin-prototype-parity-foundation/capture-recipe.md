# 3-Way Capture Recipe

Every scored parity slice uses a **3-way comparison** per state:

| Layer | Meaning |
| --- | --- |
| `current` | Production baseline **before** the parity slice branch |
| `after` | Candidate implementation on the parity slice branch |
| `prototype` | Approved prototype reference (`ui/designs/prototypes/homecook-baemin-prototype.html`) |

## Fixed Capture Conditions

All three layers must share:

1. **Viewport width**: `390px` (mobile default) and `320px` (narrow sentinel)
2. **Viewport height**: `844px` for 390px, `568px` for 320px
3. **Fixture data**: identical across layers (see `fixture-route-matrix.md`)
4. **Route entry**: identical entry point per surface (see `fixture-route-matrix.md`)
5. **Scroll position**: identical (initial unless state specifies "scrolled")
6. **Active/open state**: identical (e.g., "sort-open" means the sort sheet is visible)
7. **Auth state**: logged-in unless the state is `unauthorized` or `login-gate-open`

## Capture File Naming

```
qa/visual/parity/<slice>/<viewport>-<surface>-<state>-<layer>.png
```

Examples:
```
qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-current.png
qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-after.png
qa/visual/parity/baemin-prototype-home-parity/390-HOME-initial-prototype.png
qa/visual/parity/baemin-prototype-home-parity/320-HOME-initial-current.png
```

Parts:
- `<slice>`: parity slice ID (e.g., `baemin-prototype-home-parity`)
- `<viewport>`: `390` or `320`
- `<surface>`: uppercase surface ID (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, `PlannerAddSheet`, `SaveModal`, `IngredientFilterModal`, `SortSheet`, `LoginGateModal`)
- `<state>`: kebab-case state from `fixture-route-matrix.md` (e.g., `initial`, `scrolled-to-recipes-entry`, `sort-open`)
- `<layer>`: `current`, `after`, or `prototype`

## Prototype Layer Capture

The `prototype` layer is captured from `ui/designs/prototypes/homecook-baemin-prototype.html` opened in a browser at the matching viewport width. Use the prototype's built-in navigation to reach the target screen/state. If the prototype does not support a required state (e.g., loading, error), the prototype layer for that state is omitted and the verdict notes "prototype N/A".

## Capture Order

1. Capture `current` on the base branch (master or the branch point) before any parity changes.
2. Capture `prototype` from the HTML prototype at the same viewport.
3. Implement parity changes.
4. Capture `after` on the parity branch.
5. All three captures for the same state must use the same fixture seed and route entry.

## Completeness Rule

Every required state in `fixture-route-matrix.md` must have captures at both viewports before scoring can begin. Missing captures block the visual verdict.
