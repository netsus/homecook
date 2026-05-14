# Phase 6 Design Handoff: Pantry & Shopping

VERDICT: **READY_FOR_CODEX**

Date: 2026-05-14
Phase: 6 of 8
Plan: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
Ledger: `PHASE0_PARITY_LEDGER.md`
CSS target: `styles-phase6.css` (loaded after `styles-phase5.css`)
Evidence target: `ui/designs/evidence/desktop-modern-redesign/phase-6/`

## 1. Phase 6 Rows To Close (11 rows)

### Screens (4)

| Row | Current status | Phase 6 action |
| --- | --- | --- |
| `screen:PANTRY` | `verified-foundation` | Full redesign — fix category tabs, polish cards/grid, search toolbar, empty/held/out states |
| `screen:SHOPPING_FLOW` | `verified-foundation` | Polish entry flow chooser — clean up card structure, no nested `<button>` |
| `screen:SHOPPING_LISTS` | `open` | Redesign as proper history list with status badges, timestamps, progress indicators |
| `screen:SHOPPING_DETAIL` | `open` | Full redesign — completed read-only, pantry reflect, progress card, sidebar, 409 semantics |

### Surfaces (4)

| Row | Current status | Phase 6 action |
| --- | --- | --- |
| `surface:PANTRY::PantrySearchToolbar` | `verified-foundation` | Polish toolbar — search, filter toggle, count summary, no collapse at any width |
| `surface:PANTRY::PantryBundlePicker` | `open` | Bundle picker modal with held/missing counts and ingredient tags |
| `surface:PANTRY::PantryAddIngredient` | `open` | Add ingredient modal with category tabs, search, duplicate prevention |
| `surface:MYPAGE::ShoppingHistory` | `open` | Shopping history entry from MyPage saved tab quick-nav area |

### Modals (3)

| Row | Current status | Phase 6 action |
| --- | --- | --- |
| `modal:PANTRY::PantryAddIngredientModal` | `open` | Already implemented in `modals.jsx`; redesign CSS for Phase 6 quality, verify screenshot |
| `modal:PANTRY::PantryAddBundleModal` | `open` | Already implemented in `modals.jsx`; redesign CSS for Phase 6 quality, verify screenshot |
| `modal:SHOPPING_DETAIL::PantryReflectModal` | `open` | Already implemented in `modals.jsx`; verify 3-way semantics, verify screenshot |

---

## 2. User-Reported Problem: Pantry Category Tabs

### Current bug

The pantry category tabs render as concatenated plain text:

```
채소·과일3/9육류·해산물1/5양념·소스8/9곡물·기타2/3
```

There is no visual separation between tabs, no hover/focus states visible to the user, and the count badges merge into the text making the entire row unreadable.

### Root cause

The `.pantry-tabs` container from `styles-phase1.css` (line 347) uses `display: flex; gap: 8px` and the `.pantry-tab` class has `border: 1px solid var(--line)` and `border-radius: var(--r-pill)`. These styles ARE defined correctly in the CSS, but the actual rendering in the browser shows collapsed pill-shaped buttons that touch each other because:

1. The gap is too tight at `8px` for pill-shaped tabs containing both a category name and a count badge.
2. The count badge (`.pantry-tab-count`) uses a small `12px` font inside a `22px` pill that merges visually with the tab text.
3. There is no clear separator or spacing between the tab label and count — they appear concatenated.
4. At narrower desktop widths, the overflow scrolling hides the scroll affordance (`scrollbar-width: none`), giving no hint that more tabs exist.

### Required fix — Phase 6 Pantry Tabs

Replace the current pill-button tabs with a proper **underline tab bar** pattern (matching the `mypage-tabs` established in Phase 5):

1. Full-width tab bar with bottom border baseline, matching `.mypage-tabs` visual language.
2. Each tab shows: **category title** + **count badge** (e.g., `채소·과일` then `3/9` in a distinct badge).
3. Active tab gets `border-bottom: 2px solid var(--brand)` and `color: var(--brand-deep)`.
4. Tab count badge uses a separate styled `<span>` with its own background pill.
5. Adequate `gap` and `padding` so no two tabs visually merge.
6. Arrow key navigation between tabs (matching MyPage tab keyboard pattern).

This creates visual consistency with MyPage tabs and solves the concatenated-text problem.

---

## 3. Exact UX Design Per Row

### 3.1 `screen:PANTRY` — Full Pantry Redesign

**Layout:** Page header row (title + action buttons), then underline tab bar for categories, then toolbar (search + filter toggle + summary), then ingredient card grid.

**Component:** `PantryScreen` in `screens-2.jsx` — rewrite the tab bar and polish the toolbar/grid.

**Page header:**
- `h1`: "팬트리"
- `p.screen-lead`: "현재 갖고 있는 재료를 표시해 두면 장보기·레시피에서 자동으로 반영됩니다."
- Right side actions: `Button variant="tertiary" leftIcon="copy"` "번들로 추가" and `Button variant="primary" leftIcon="plus"` "재료 추가"

**Tab bar (`.pantry-cat-tabs`):**

| Tab key | Label | Dynamic count |
| --- | --- | --- |
| `veg` | 채소·과일 | `{heldHere}/{totalHere}` |
| `meat` | 육류·해산물 | `{heldHere}/{totalHere}` |
| `sauce` | 양념·소스 | `{heldHere}/{totalHere}` |
| `grain` | 곡물·기타 | `{heldHere}/{totalHere}` |

**Tab bar markup pattern:**

```jsx
<div className="pantry-cat-tabs" role="tablist" aria-label="팬트리 카테고리">
  {PANTRY_GROUPS.map(g => (
    <button
      key={g.id}
      className={`pantry-cat-tab ${tab === g.id ? "active" : ""}`}
      role="tab"
      aria-selected={tab === g.id}
      aria-controls="pantry-panel"
      data-pantry-tab={g.id}
      onClick={() => setTab(g.id)}
      onKeyDown={(e) => onTabKeyDown(e, g.id)}
    >
      <span className="pantry-cat-tab-label">{g.title}</span>
      <span className="pantry-cat-tab-count tabular">{heldHere}/{totalHere}</span>
    </button>
  ))}
</div>
```

**Tab keyboard handler:** Arrow left/right cycles between tabs, matching `MyPageScreen.onTabKeyDown` from Phase 5.

**Toolbar (`.pantry-toolbar`):** Keep current structure — search input on left, toggle + summary on right. Polish sizing/spacing only.

**Ingredient grid (`.pantry-grid`):** Keep current 4-column grid (6 at 1280px+). Each `.pantry-card` keeps current structure: tag pill (보유/없음), icon, name, category meta. No structural changes needed — the cards look correct.

**Empty state:** Keep existing `StatePanel` with fridge icon.

**CSS class rename:** The old `.pantry-tabs` and `.pantry-tab` classes become `.pantry-cat-tabs` and `.pantry-cat-tab` to avoid collision with generic tab patterns. The old classes in `styles-phase1.css` remain but are overridden by Phase 6 CSS.

---

### 3.2 `surface:PANTRY::PantrySearchToolbar`

**Location:** Inside `PantryScreen`, between the tab bar and the ingredient grid.

**Structure:** Already implemented. The `.pantry-toolbar` from `styles-phase1.css` (line 406) is a row with search input + toggle + count summary. Phase 6 CSS polishes this:

- Search bar: `min-width: 280px`, `max-width: 400px`, pill-shaped, icon + input + clear button.
- Toggle: "없는 재료도 표시" checkbox label.
- Summary: "보유 N · 부족 M" text.
- Focus styles on search input: `outline: 2px solid var(--brand); outline-offset: -2px`.

No structural JSX changes needed. CSS polish only.

---

### 3.3 `surface:PANTRY::PantryAddIngredient` / `modal:PANTRY::PantryAddIngredientModal`

**Component:** `PantryAddIngredientModal` in `modals.jsx` — already fully implemented.

**Current state:** Uses `Dialog wide` with category chip row, search, and filter grid. Filters out ingredients already in pantry. Multi-select with count in footer button.

**Phase 6 action:** Verify CSS quality (check `styles-phase6.css` polishes the `.filter-modal-body` and `.filter-grid` within pantry context). Take screenshot. No JSX changes.

**Acceptance:**
- Only shows ingredients NOT already in pantry.
- Multi-select works (picked count in footer CTA).
- Search filters by name.
- Category tabs filter by category.
- Empty state: "모든 재료가 이미 팬트리에 있어요."

---

### 3.4 `surface:PANTRY::PantryBundlePicker` / `modal:PANTRY::PantryAddBundleModal`

**Component:** `PantryAddBundleModal` in `modals.jsx` — already fully implemented.

**Current state:** Uses `Dialog` (non-wide) with 3 bundle cards. Each card shows title, "N / M 추가" count, and ingredient tag pills. Single-select (radio-like). Footer: "번들 추가" button.

**Phase 6 action:** Verify CSS quality. Polish `.bundle-card` styling in `styles-phase6.css`:
- Card: border, rounded, hover elevation.
- Selected card (`.bundle-card.on`): brand border + brand-wash background.
- Tags: held ingredients get muted style, missing ingredients get default style.
- Take screenshot.

No JSX changes.

---

### 3.5 `screen:SHOPPING_FLOW` — Entry Flow Chooser

**Component:** `ShoppingFlowScreen` in `screens-3.jsx` — already implemented.

**Current state:** Breadcrumb + ScreenHeader + 3 flow cards (진행 중, 과거 목록, 직접 만들기). Cards use `role="button" tabIndex={0}` with `onKeyDown` handler. The `currentList` card gets `.shopping-flow-card.primary` class.

**Phase 6 action:** Verify no nested `<button>` warnings. The current implementation uses `<div role="button">` wrapping a `<Button>` inside — this is a `<button>` inside a `role="button"` `<div>`, which is semantically ok because `<div>` is not a `<button>`. However, verify in console.

**CSS polish in `styles-phase6.css`:**
- Tighten `.shopping-flow-grid` gap.
- Ensure `.shopping-flow-card` focus-visible outline.
- Ensure `.shopping-flow-card.primary` has a brand left-border accent or brand-wash background to distinguish it.

No JSX changes needed unless console shows nested button warnings.

---

### 3.6 `screen:SHOPPING_LISTS` — Shopping History List

**Component:** `ShoppingListsScreen` in `screens-3.jsx` — currently a minimal `meta-list` rendering.

**Phase 6 redesign:**

The current implementation is too sparse — just a flat list of `meta-row` buttons with a cart icon and "N개 항목 · 진행 중/완료" text. Phase 6 needs:

**New structure for each list row (`.shopping-history-row`):**

```jsx
<button className="shopping-history-row" onClick={() => onOpen(l.id)}>
  <div className="shopping-history-status">
    <span className={`shopping-history-dot ${l.completed ? "done" : "active"}`} />
  </div>
  <div className="shopping-history-body">
    <div className="shopping-history-title">{l.title}</div>
    <div className="shopping-history-meta tabular">
      {l.items.length}개 항목 · {l.mealIds.length}끼
      {l.completed && ` · ${l.createdAt}`}
    </div>
  </div>
  {l.completed ? (
    <Tag>완료</Tag>
  ) : (
    <Tag variant="brand">진행 중</Tag>
  )}
  <Icon name="chevR" size={16} color="var(--text-4)" />
</button>
```

**Group by status:** Show "진행 중" section first (if any in-progress lists), then "완료된 장보기" section.

**CSS for `.shopping-history-row`:**
- `display: flex; align-items: center; gap: 16px`
- `padding: 16px 20px`
- `border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface)`
- Hover: `border-color: rgba(0,0,0,.16); box-shadow: var(--shadow-card); transform: translateY(-1px)`
- Status dot: 8px circle, `active` = `var(--brand)`, `done` = `var(--success)`
- Title: `font-size: 15px; font-weight: 700; color: var(--text-1)`
- Meta: `font-size: 13px; color: var(--text-3); margin-top: 2px`

**Section layout:**

```jsx
<section className="shopping-history-section">
  <h2 className="my-section-title">진행 중</h2>
  <div className="shopping-history-list">
    {inProgress.map(l => <ShoppingHistoryRow .../>)}
  </div>
</section>
<section className="shopping-history-section">
  <h2 className="my-section-title">완료된 장보기</h2>
  <div className="shopping-history-list">
    {completed.map(l => <ShoppingHistoryRow .../>)}
  </div>
</section>
```

---

### 3.7 `screen:SHOPPING_DETAIL` — Shopping Detail (Active + Read-Only)

**Component:** `ShoppingDetailScreen` in `screens-3.jsx` — already implemented with progress card, checklist, and sidebar.

**Phase 6 polish and verification:**

**Two modes:**
1. **Active list** (`!list.completed && !readOnly`): Checkable items, progress bar, "장보기 완료" button enabled when all checked.
2. **Completed/read-only list** (`list.completed || readOnly`): All items shown as checked, no checkbox interaction, "다시 장보기" button in header right, eyebrow says "완료된 장보기".

**Read-only visual contract (server 409 semantics):**
- The prototype does not actually make API calls, but the UI must clearly communicate that completed lists cannot be edited.
- The `readOnly` prop from `app.jsx` (line 429: `readOnly={list?.completed}`) correctly passes down.
- Disabled checkboxes: `disabled={list.completed || readOnly}` on each `check-row`.
- Lead text: "완료된 장보기는 읽기 전용이에요."
- CSS: `.check-row:disabled` should show `cursor: not-allowed; opacity: 0.7`.

**Pantry reflect trigger:**
- When all items are checked and user clicks "장보기 완료", `onOpenPantryReflect(reflectables)` fires first.
- `reflectables` = items that are checked, have an `ing-*` id, and are NOT already in pantry.
- This is already implemented at line 762-782 of `screens-3.jsx`.

**CSS polish in `styles-phase6.css`:**
- `.shopping-progress-card`: Add subtle brand-wash background, rounded corners.
- `.check-row`: Clean up spacing, ensure 2-column layout works at all widths.
- `.check-row.on .check-name`: `text-decoration: line-through; color: var(--text-3)`.
- `.check-row:disabled`: `cursor: not-allowed; opacity: 0.7`.
- `.shopping-side-card`: Better visual separation with border and rounded corners.
- `.pantry-include-list`: Clean up row spacing.

**Read-only state visual indicator:**
Add a `.shopping-readonly-banner` at the top of the detail when `readOnly`:

```jsx
{readOnly && (
  <div className="shopping-readonly-banner">
    <Icon name="lock" size={15} />
    <span>이 장보기는 완료되어 수정할 수 없어요.</span>
  </div>
)}
```

CSS:
```css
.shopping-readonly-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--r-md);
  background: var(--bg-alt);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 20px;
}
```

---

### 3.8 `modal:SHOPPING_DETAIL::PantryReflectModal`

**Component:** `PantryReflectModal` in `modals.jsx` — already fully implemented.

**3-way `add_to_pantry_item_ids` semantics:**

| Value | Meaning | How to trigger in UI |
| --- | --- | --- |
| `null` | Default — no reflection happened | User closes modal without confirming, or modal never opens because there are no reflectable items |
| `[]` (empty array) | Explicitly reflect nothing | User unchecks all items in the modal and confirms with 0 selected |
| `[id1, id2, ...]` | Reflect only these selected checked items | User selects specific items and confirms |

**Current implementation verification:**
- Line 506-508 of `modals.jsx`: On open, `picked` initializes to all item `ing` ids — this represents the "all selected" default.
- User can toggle individual items off (uncheck them).
- Confirming with 0 items = `onConfirm([])` = reflect nothing.
- `onClose` (clicking "나중에") doesn't call `onConfirm` at all = `null` semantics.

This is correct. No JSX changes needed.

**`is_pantry_excluded=true` semantics:**
- Items with `is_pantry_excluded=true` force unchecked state.
- In the current data fixtures, `list.excluded` items represent pantry-held items that were excluded from the shopping list.
- These items do NOT appear in the reflect modal because `reflectables` (line 762) already filters for items NOT in pantry.
- This is semantically correct: excluded items are already in pantry, so they don't need to be reflected.

**Phase 6 action:** Verify CSS quality, take screenshot. No JSX changes.

---

### 3.9 `surface:MYPAGE::ShoppingHistory`

**Location:** Inside `MyPageScreen` saved tab panel as a quick-nav link, AND as a dedicated `ShoppingListsScreen` accessible from MyPage navigation.

**Current state:** `MyPageScreen` at line 381 passes `onGoShoppingLists` which pushes `{ screen: "SHOPPING_LISTS" }`. The connection exists but is only available as a prop — it's not rendered as a visible quick-nav in any MyPage tab panel.

**Phase 6 action:** Add a shopping history quick-nav button to the `MyPageSavedPanel` (alongside the existing recipebook quick-nav), so users can reach shopping history from MyPage:

```jsx
<button className="mypage-quick-nav" type="button" onClick={onGoShoppingLists}>
  <span className="meta-icon"><Icon name="cart" size={16} /></span>
  <span className="mypage-quick-nav-body">
    <span className="mypage-quick-nav-title">장보기 내역</span>
    <span className="mypage-quick-nav-desc">진행 중 · 완료된 장보기 {SHOPPING_LISTS.length}개</span>
  </span>
  <Icon name="chevR" size={16} color="var(--text-4)" />
</button>
```

This requires passing `onGoShoppingLists` down to `MyPageSavedPanel` and rendering the button after the existing recipebook quick-nav.

---

## 4. Route / State Model Changes in `app.jsx`

### Existing routes (no new routes needed)

All 4 screen routes already exist in `app.jsx`:
- `PANTRY` (line 360-374)
- `SHOPPING_FLOW` (line 405-412)
- `SHOPPING_LISTS` (line 413-416)
- `SHOPPING_DETAIL` (line 418-430)

### Existing modal state (no new state needed)

All 3 modals already have state in `app.jsx`:
- `pantryAddIng` (line 45)
- `pantryAddBundle` (line 46)
- `pantryReflect` (line 47)

### Props change: `MyPageSavedPanel`

`MyPageSavedPanel` needs to receive `onGoShoppingLists` prop. In `app.jsx` line 376-389, `MyPageScreen` already receives `onGoShoppingLists`. Pass it through to `MyPageSavedPanel`:

```jsx
// In MyPageScreen render (screens-2.jsx)
{activeTab === "saved" && (
  <MyPageSavedPanel
    savedSet={savedSet}
    onSaveToggle={onSaveToggle}
    onOpenRecipe={onOpenRecipe}
    onGoRecipebooks={onGoRecipebooks}
    onGoShoppingLists={onGoShoppingLists}  // ADD THIS
  />
)}
```

And in the `MyPageSavedPanel` function signature, add `onGoShoppingLists` and render the quick-nav.

### No other app.jsx changes needed

All pantry/shopping state management (toggle, modal open/close, confirm handlers) is already wired correctly.

---

## 5. Component Additions/Modifications by File

### `screens-2.jsx` — PantryScreen rewrite

**Scope:** Rewrite tab bar only. Keep toolbar, grid, and cards as-is.

1. **Remove** old `<div className="pantry-tabs">` block (lines 198-213).
2. **Replace** with new `<div className="pantry-cat-tabs" role="tablist">` block using the markup from section 3.1.
3. **Add** `onTabKeyDown` handler (copy pattern from `MyPageScreen.onTabKeyDown`).
4. **Add** `id="pantry-panel"` to the grid/content area and `role="tabpanel"`.

### `screens-2.jsx` — MyPageSavedPanel

1. **Add** `onGoShoppingLists` to destructured props.
2. **Add** shopping history quick-nav button after the existing recipebook quick-nav button.

### `screens-3.jsx` — ShoppingListsScreen rewrite

**Scope:** Replace flat `meta-list` with grouped, styled history list.

1. **Split** `SHOPPING_LISTS` into `inProgress` and `completed` arrays.
2. **Render** two sections with `my-section-title` headers.
3. **Replace** `meta-row` with `shopping-history-row` component.
4. **Add** status dot, progress indicator, and brand/default tags.

### `screens-3.jsx` — ShoppingDetailScreen polish

**Scope:** Add read-only banner. CSS improvements handled in stylesheet.

1. **Add** `.shopping-readonly-banner` element when `readOnly` is true, positioned after breadcrumb and before ScreenHeader.
2. No other JSX changes. CSS handles line-through, disabled states, card polish.

### `modals.jsx` — No changes

All three modals are already implemented and functionally correct. CSS polish handled in `styles-phase6.css`.

### `components.jsx` — No changes

No new primitives needed for Phase 6.

### `data.jsx` — No changes

All pantry data (`PANTRY_GROUPS`, `PANTRY_BUNDLES`, `PANTRY_HELD`, `INGREDIENTS`) and shopping data (`SHOPPING_LISTS` with `items`, `excluded`, `completed`, `mealIds`) are already present and sufficient.

### `app.jsx` — Minimal change

Only change: ensure `onGoShoppingLists` is available in `MyPageSavedPanel` scope (it's already passed to `MyPageScreen`; just needs threading).

---

## 6. CSS: `styles-phase6.css`

Load after `styles-phase5.css` in the HTML:

```html
<link rel="stylesheet" href="styles-phase6.css"/>
```

### 6.1 Pantry Category Tabs (replaces old pill tabs)

```css
/* ============================================
   Phase 6 — Pantry & Shopping
   ============================================ */

/* --- Pantry category tabs (underline pattern) --- */
.pantry-cat-tabs {
  display: flex;
  gap: 0;
  margin: 0 -32px;
  padding: 0 32px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}

.pantry-cat-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 20px;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.pantry-cat-tab:hover {
  color: var(--text-1);
}

.pantry-cat-tab.active {
  color: var(--brand-deep);
  border-bottom-color: var(--brand);
}

.pantry-cat-tab:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

.pantry-cat-tab-label {
  /* inherits font from parent */
}

.pantry-cat-tab-count {
  min-width: 34px;
  height: 22px;
  padding: 0 7px;
  border-radius: var(--r-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
}

.pantry-cat-tab.active .pantry-cat-tab-count {
  color: var(--brand-deep);
  background: rgba(0, 161, 255, 0.12);
}

@media (min-width: 1440px) {
  .pantry-cat-tabs {
    margin: 0 -40px;
    padding: 0 40px;
  }
}
```

### 6.2 Shopping History List

```css
/* --- Shopping history list --- */
.shopping-history-section {
  margin-bottom: 32px;
}

.shopping-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shopping-history-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.shopping-history-row:hover {
  border-color: rgba(0, 0, 0, 0.16);
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}

.shopping-history-row:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.shopping-history-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.shopping-history-dot.active {
  background: var(--brand);
}

.shopping-history-dot.done {
  background: var(--success);
}

.shopping-history-body {
  flex: 1;
  min-width: 0;
}

.shopping-history-title {
  color: var(--text-1);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shopping-history-meta {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.45;
}
```

### 6.3 Shopping Detail Polish

```css
/* --- Shopping read-only banner --- */
.shopping-readonly-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--r-md);
  background: var(--bg-alt);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 20px;
}

/* --- Check-row disabled state --- */
.check-row:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.check-row.on .check-name {
  text-decoration: line-through;
  color: var(--text-3);
}

/* --- Shopping progress card polish --- */
.shopping-progress-card {
  background: var(--brand-wash);
  border: 1px solid rgba(0, 161, 255, 0.15);
}

/* --- Shopping sidebar card polish --- */
.shopping-side-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

/* --- Pantry include row polish --- */
.pantry-include-row {
  padding: 12px 0;
}

.pantry-include-btn {
  border-radius: var(--r-sm);
}

.pantry-include-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
```

### 6.4 Shopping Flow Card Polish

```css
/* --- Shopping flow card focus --- */
.shopping-flow-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.shopping-flow-card.primary {
  border-left: 3px solid var(--brand);
}
```

### 6.5 Bundle Card Polish

```css
/* --- Bundle card polish --- */
.bundle-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 16px 20px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.bundle-card:hover {
  border-color: rgba(0, 0, 0, 0.16);
}

.bundle-card.on {
  border-color: var(--brand);
  background: var(--brand-wash);
}

.bundle-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.bundle-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.bundle-card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

.bundle-card-meta {
  font-size: 13px;
  color: var(--text-3);
}

.bundle-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bundle-tag {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  background: var(--bg-alt);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.bundle-tag.have {
  color: var(--success);
  background: rgba(26, 174, 57, 0.08);
}
```

---

## 7. Data / Fixture Assumptions

No new data fixtures are needed. Phase 6 uses existing data from `data.jsx`:

| Data | Location | Usage |
| --- | --- | --- |
| `PANTRY_GROUPS` | line 289-294 | 4 category groups for tab bar |
| `PANTRY_BUNDLES` | line 295-299 | 3 bundles for bundle picker |
| `PANTRY_HELD` | line 284-288 | Initial pantry state (14 held ingredients) |
| `INGREDIENTS` | line 37-64 | 26 ingredients across 7 categories |
| `SHOPPING_LISTS` | line 302-338 | 2 lists: 1 active (sl1), 1 completed (sl2) |
| `SHOPPING_LISTS[0].items` | line 307-318 | 10 purchase items with ing/name/amount/note |
| `SHOPPING_LISTS[0].excluded` | line 319-326 | 6 pantry-excluded items |
| `SHOPPING_LISTS[1]` | line 329-337 | Completed list with 2 checked items |

---

## 8. Desktop Visual System Guidance

### Breakpoints

| Width | Behavior |
| --- | --- |
| 1024px (base) | Pantry grid 4 cols, shopping grid 2-col (items + sidebar), tab padding 32px |
| 1280px | Pantry grid 6 cols, shopping checklist 2 cols |
| 1440px | Tab padding 40px, card/mosaic sizes bump slightly |

### Visual consistency rules

- Pantry category tabs use the same visual pattern as MyPage tabs (underline, not pill).
- Shopping history rows use the same card pattern as recipebook cards (border, hover elevation, chevron right).
- Read-only states use muted colors + lock icon banner + `cursor: not-allowed` on interactive elements.
- All focus-visible states use `outline: 2px solid var(--brand); outline-offset: 2px`.

---

## 9. Accessibility and Keyboard/Focus Requirements

### Pantry tabs

| Feature | Implementation |
| --- | --- |
| ARIA role | `role="tablist"` on container, `role="tab"` on each button |
| `aria-selected` | `true` on active tab |
| `aria-controls` | Points to `id="pantry-panel"` on the grid/content area |
| Arrow key nav | Left/right cycles between tabs, matching MyPage pattern |
| `role="tabpanel"` | On the grid container below tabs |
| Focus management | After arrow key switch, `requestAnimationFrame` → `focus()` on new tab |

### Shopping checkboxes

| Feature | Implementation |
| --- | --- |
| Disabled state | `disabled={list.completed \|\| readOnly}` attribute on button |
| `aria-checked` | Not needed; using visual check-box pattern with button semantics |
| Read-only indicator | `.shopping-readonly-banner` with lock icon |

### Modal focus

All three modals already use `Dialog` which handles:
- Escape key closes
- Click-outside-scrim closes
- Focus trap (via manual tab management in Lightbox pattern)

### Shopping flow cards

| Feature | Implementation |
| --- | --- |
| `role="button"` | On `<div>` wrapper (already implemented) |
| `tabIndex={0}` | Already implemented |
| Enter/Space key | `onKeyDown` handler (already implemented) |
| Focus-visible | `outline: 2px solid var(--brand)` via Phase 6 CSS |

---

## 10. Screenshot / Visual QA Matrix

### Required evidence files at `ui/designs/evidence/desktop-modern-redesign/phase-6/`

| File | Description | Width | Key checks |
| --- | --- | --- | --- |
| `pantry-veg-1024.png` | Pantry with 채소·과일 tab active | 1024 | Tabs not concatenated, 4-col grid, toolbar visible |
| `pantry-veg-1280.png` | Pantry with 채소·과일 tab active | 1280 | 6-col grid, toolbar doesn't collapse |
| `pantry-sauce-1280.png` | Pantry with 양념·소스 tab active | 1280 | Different tab active, count badges correct |
| `pantry-empty-1280.png` | Pantry with empty search result | 1280 | StatePanel with "재료가 없어요" |
| `pantry-search-1280.png` | Pantry with search query active | 1280 | Search bar focused, filtered results |
| `pantry-add-modal-1280.png` | PantryAddIngredientModal open | 1280 | Category tabs, search, multi-select |
| `pantry-bundle-modal-1280.png` | PantryAddBundleModal with selection | 1280 | Bundle card selected (brand border), tags |
| `shopping-flow-1024.png` | ShoppingFlowScreen | 1024 | 3 cards, primary card brand-accent, no nested button |
| `shopping-flow-1280.png` | ShoppingFlowScreen | 1280 | Wider layout, cards well-spaced |
| `shopping-lists-1280.png` | ShoppingListsScreen | 1280 | Grouped by status, dot indicators, tags |
| `shopping-detail-active-1024.png` | Active shopping detail | 1024 | Progress bar, checkable items, sidebar |
| `shopping-detail-active-1280.png` | Active shopping detail | 1280 | 2-col checklist, sidebar, excluded section |
| `shopping-detail-complete-1280.png` | Completed read-only detail | 1280 | Read-only banner, line-through items, "다시 장보기" button |
| `shopping-detail-reflect-1280.png` | PantryReflectModal open | 1280 | Pre-completion reflect, all items pre-checked |
| `mypage-shopping-nav-1280.png` | MyPage saved tab with shopping quick-nav | 1280 | Both recipebook and shopping quick-nav visible |
| `visual-qa-report.json` | Structured QA report | — | Console errors, visual checks, accessibility |

Total: 15 PNGs + 1 JSON = **16 evidence files**

---

## 11. Ledger Evidence Expectations

### Rows to mark `verified` after Phase 6

Each row must have:
- Route/component path
- Screenshot evidence at ≥2 widths
- Console/page-error check (clean)
- Accessibility note (keyboard, ARIA)
- Any known divergence or follow-up

### Ledger updates

```markdown
| `screen:PANTRY` | ... | Phase 6 | `verified` | Evidence: pantry-veg-1024.png, pantry-veg-1280.png, pantry-sauce-1280.png, ... |
| `screen:SHOPPING_FLOW` | ... | Phase 6 | `verified` | Evidence: shopping-flow-1024.png, shopping-flow-1280.png, ... |
| `screen:SHOPPING_LISTS` | ... | Phase 6 | `verified` | Evidence: shopping-lists-1280.png, ... |
| `screen:SHOPPING_DETAIL` | ... | Phase 6 | `verified` | Evidence: shopping-detail-active-1024.png, shopping-detail-active-1280.png, shopping-detail-complete-1280.png, ... |
| `surface:PANTRY::PantrySearchToolbar` | ... | Phase 6 | `verified` | Evidence: pantry-veg-1280.png (toolbar visible in context), ... |
| `surface:PANTRY::PantryBundlePicker` | ... | Phase 6 | `verified` | Evidence: pantry-bundle-modal-1280.png, ... |
| `surface:PANTRY::PantryAddIngredient` | ... | Phase 6 | `verified` | Evidence: pantry-add-modal-1280.png, ... |
| `surface:MYPAGE::ShoppingHistory` | ... | Phase 6 | `verified` | Evidence: mypage-shopping-nav-1280.png, shopping-lists-1280.png, ... |
| `modal:PANTRY::PantryAddIngredientModal` | ... | Phase 6 | `verified` | Evidence: pantry-add-modal-1280.png, ... |
| `modal:PANTRY::PantryAddBundleModal` | ... | Phase 6 | `verified` | Evidence: pantry-bundle-modal-1280.png, ... |
| `modal:SHOPPING_DETAIL::PantryReflectModal` | ... | Phase 6 | `verified` | Evidence: shopping-detail-reflect-1280.png, ... |
```

---

## 12. Rows That Must Remain Open After Phase 6

### Phase 7 rows (7 rows — DO NOT CLOSE)

| Row | Status | Owner |
| --- | --- | --- |
| `screen:LEFTOVERS` | `open` | Phase 7 |
| `screen:ATE_LIST` | `open` | Phase 7 |
| `screen:COOK_READY_LIST` | `open` | Phase 7 |
| `screen:COOK_MODE_PLANNER` | `open` | Phase 7 |
| `screen:COOK_MODE_STANDALONE` | `open` | Phase 7 |
| `modal:COOK_MODE::ConsumedIngredientSheet` | `open` | Phase 7 |
| `modal:COOK_MODE::CookNoticeDialog` | `open` | Phase 7 |

### Phase 8 rows

All rows enter Phase 8 full-surface QA.

---

## 13. Hard Acceptance Gates (from RALPLAN §6)

These must ALL be verifiable before Phase 6 can be marked complete:

| # | Gate | How to verify |
| --- | --- | --- |
| 1 | Completed shopping list edit-blocking UI is visible | Screenshot of completed detail with read-only banner + disabled checkboxes + "다시 장보기" button |
| 2 | Server edit attempts against completed lists return 409 | Prototype shows "완료된 장보기는 읽기 전용이에요" copy; actual 409 is server-side, not prototype scope |
| 3 | `add_to_pantry_item_ids` preserves 3 meanings: null/[]/selected | Verified by reflect modal behavior: close = null, confirm empty = [], confirm with selections = ids |
| 4 | `is_pantry_excluded=true` forces unchecked state | Verified by `excluded` items not appearing in reflect modal (they're already in pantry) |
| 5 | Pantry reflect modal appears before completion | Verified by `onOpenPantryReflect(reflectables)` call BEFORE `onMarkComplete` in shopping detail |
| 6 | Completed read-only detail reopenable from shopping history | Verified by clicking completed list in ShoppingListsScreen → opens ShoppingDetailScreen with `readOnly=true` |
| 7 | No nested `<button>` warning in shopping flow/detail | Console check in QA evidence |
| 8 | Pantry category tabs are not concatenated text | Screenshot shows separated underline tabs with badges |

---

## 14. Implementation Priority

Suggested implementation order for Codex:

1. **`styles-phase6.css`** — Create the CSS file and link it in HTML.
2. **`screens-2.jsx` PantryScreen** — Replace pill tabs with underline tab bar + ARIA + keyboard.
3. **`screens-2.jsx` MyPageSavedPanel** — Add shopping history quick-nav.
4. **`screens-3.jsx` ShoppingListsScreen** — Rewrite with grouped history rows.
5. **`screens-3.jsx` ShoppingDetailScreen** — Add read-only banner.
6. **`screens-3.jsx` ShoppingFlowScreen** — Verify no nested button warnings; CSS polish.
7. **Modal CSS polish** — Verify all 3 modals look correct with Phase 6 CSS.
8. **Screenshot QA** — Capture all 16 evidence files.
9. **Ledger update** — Mark all 11 rows `verified`.
