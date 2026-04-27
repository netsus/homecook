# Fixture and Route-Entry Matrix

This matrix defines the fixture baseline, route entry, and required states for each parity surface. Scored parity slices must capture every listed state at both `390px` and `320px` viewports.

## Shared Fixture Rules

- Use the same demo/seed data across all three capture layers (current, after, prototype).
- Fixture should include enough recipes, meals, and shopping data to populate non-empty views.
- Auth state defaults to logged-in unless the state explicitly says otherwise.
- The prototype layer uses its own built-in demo data; differences in demo content are not scored.

## HOME

| Field | Value |
| --- | --- |
| Route entry | `/` |
| Auth state | logged-in (default) |
| Fixture needs | >= 6 recipes, >= 1 theme with recipes, ingredient categories |

### Required states (7)

| State ID | Description | Notes |
| --- | --- | --- |
| `initial` | First viewport on page load | No scroll, no filter active |
| `scrolled-to-recipes-entry` | Scrolled to "all recipes" section entry | Section header + first recipe card visible |
| `sort-open` | Sort sheet open | SortSheet overlay visible |
| `filter-active` | Ingredient filter active | At least one ingredient chip selected, list filtered |
| `loading` | Loading skeleton | Simulated slow fetch or Suspense boundary |
| `empty` | No recipes match | Empty state component visible |
| `error` | Fetch error | Error state component visible |

## RECIPE_DETAIL

| Field | Value |
| --- | --- |
| Route entry | `/recipe/[id]` (use a fixture recipe with cooking steps, ingredients, and image) |
| Auth state | logged-in (default); `login-gate-open` uses logged-out |
| Fixture needs | 1 recipe with >= 3 ingredients, >= 2 cooking steps, image/emoji |

### Required states (7)

| State ID | Description | Notes |
| --- | --- | --- |
| `initial` | Hero visible, no scroll | Full hero image + meta visible |
| `scrolled` | Scrolled past hero | Sticky AppBar title visible, ingredients/steps in view |
| `planner-add-open` | PlannerAddSheet open | Overlay visible over detail |
| `save-open` | SaveModal open | Overlay visible |
| `login-gate-open` | LoginGateModal open | Logged-out user tapped a protected action |
| `loading` | Loading skeleton | Detail page loading state |
| `error` | Fetch error | Error state component visible |

## PLANNER_WEEK

| Field | Value |
| --- | --- |
| Route entry | `/planner` |
| Auth state | logged-in (default); `unauthorized` uses logged-out |
| Fixture needs | >= 3 days with meals across breakfast/lunch/dinner, at least 1 empty slot |

### Required states (7)

| State ID | Description | Notes |
| --- | --- | --- |
| `initial` | Default view on page load | Today's column active/highlighted |
| `prototype-overview` | Prototype's day-card overview mode | Match prototype's default planner overview |
| `scrolled` | Scrolled within the planner | Vertical scroll position showing lower content |
| `loading` | Loading skeleton | Planner loading state |
| `empty` | No meals registered | Empty state for brand-new planner |
| `unauthorized` | Logged-out planner view | Unauthorized gate visible |
| `error` | Fetch error | Error state component visible |

## Modal Family

Each modal is captured as an open overlay on its host screen.

| Modal | Host route | Auth state | Fixture needs |
| --- | --- | --- | --- |
| `PlannerAddSheet` | `/recipe/[id]` | logged-in | Recipe fixture + planner columns |
| `SaveModal` | `/recipe/[id]` | logged-in | Recipe fixture + recipe books |
| `IngredientFilterModal` | `/` | logged-in | Ingredient categories |
| `SortSheet` | `/` | logged-in | Recipes to sort |
| `LoginGateModal` | `/recipe/[id]` | logged-out | Recipe fixture |

### Required states (5)

| State ID | Description | Notes |
| --- | --- | --- |
| `planner-add-open` | PlannerAddSheet fully open | Date chips, meal type selector visible |
| `save-open` | SaveModal fully open | Book list, create-new option visible |
| `ingredient-filter-open` | IngredientFilterModal fully open | Category chips, apply button visible |
| `sort-open` | SortSheet fully open | Sort options visible |
| `login-gate-open` | LoginGateModal fully open | Social login buttons, return-to-action text |
