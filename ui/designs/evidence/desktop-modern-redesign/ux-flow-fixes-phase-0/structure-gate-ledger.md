# UX Flow Fixes Phase 0 Structure Gate Ledger

## Scope

- Target prototype: `ui/designs/prototypes/claude-design-260512-desktop/project/`
- Phase: `0 - Structure Gate / Mutable State Boundary`
- Source plan: `.omx/plans/desktop-prototype-ux-flow-fixes-260512-ralplan.md`

## Live State Ownership

| Surface | Source after Phase 0 | Notes |
| --- | --- | --- |
| planner meals | existing `meals` state in `app.jsx` | remains authoritative; status mutation must not read back from static `DA.MEALS` |
| shopping lists | `shoppingLists` state in `app.jsx` | initialized from `DA.SHOPPING_LISTS` with `origin` |
| active shopping cursor | `activeShoppingListId` state in `app.jsx` | explicit cursor first, latest active fallback |
| leftovers | `leftovers` state in `app.jsx` | initialized with `servings`, `sourceMealId`, `sourceDate`, `sourceCol` |
| ate list | `ateItems` state in `app.jsx` | initialized with source metadata shape |
| recipebooks | `recipebooks` state in `app.jsx` | initialized with `recipeIds`; unknown/custom empty books do not fallback to all recipes |
| meal columns | static `DA.MEAL_COLUMNS` | deliberately deferred by RALPLAN |

## Screen Data Boundary

- `ShoppingFlowScreen` receives the selected active shopping list from `app.jsx`.
- `ShoppingListsScreen` receives live `shoppingLists` and sorts active lists before completed lists.
- `ShoppingDetailScreen` receives the selected list from live `shoppingLists`.
- `LeftoversScreen` receives live `leftovers`.
- `AteListScreen` receives live `ateItems`.
- `RecipebooksScreen`, recipebook picker, save modal, and recipebook detail receive live `recipebooks`.
- `recipesForBook` returns an empty list for unknown/new recipebooks instead of falling back to all recipes.

## Acceptance Mapping

- `meals` is the existing authoritative live state: satisfied.
- `SHOPPING_LISTS`, `LEFTOVERS`, `ATE`, and `RECIPEBOOKS` are hoisted into app-level state: satisfied.
- shopping active-list model supports multiple active lists via selected cursor: satisfied.
- recipebook custom empty-state model is explicit through `recipeIds` and no unknown fallback: satisfied.
- `MEAL_COLUMNS` remains static/deferred: satisfied.
