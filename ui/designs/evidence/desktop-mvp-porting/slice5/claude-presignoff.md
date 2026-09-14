I now have complete data from all 18 prototype screenshots, 6 component files, 3 route files, the RALPLAN, ledger, and locked primitives. Here is the signoff.

---

# Slice 5 Pre-Implementation Authority Signoff

**Program**: Desktop MVP Prototype Porting  
**Plan**: `.omx/plans/desktop-mvp-prototype-porting-ralplan-20260518.md`  
**Slice**: 5 — Pantry & Shopping  
**Authority**: Claude (design/planning)  
**Date**: 2026-05-19  
**Depends on**: Slice 1 (shell/viewport), Slice 3 (planner context)

---

## 1. PRE-SIGNOFF: APPROVED

Codex may proceed. No blockers identified.

- Slice 4 merged as PR #482 ✓
- All 17 locked web primitives available ✓
- `--web-*` token namespace established ✓
- Dual-render pattern (`useIsMobileViewport`) already exists in all 6 component files ✓
- Domain rules (read-only, pantry-excluded, reflection semantics) are implemented in the existing state machines and API layer — desktop porting adds presentation only ✓

---

## 2. Slice 5 Design Delta — Per-Row Checklist

### Row 1: `screen:PANTRY`

**Prototype**: `WebShell` + `WebTopNav activeId="pantry"`. Page heading "팬트리" with description. Two action buttons top-right: "번들로 추가" (secondary with icon) + "+ 재료 추가" (primary blue). Category tabs with owned/total counts (채소·과일 3/9 etc.) using `WebTabs`. Below tabs: search bar (category-scoped placeholder, magnifying glass icon) + checkbox "없는 재료도 표시" with count summary. 5-column ingredient card grid — each card: circular icon area, ingredient name, category label, "보유" (green) or "없음" (gray) badge.

**Current MVP delta**: `pantry-screen.tsx` (847 LOC) has `useIsMobileViewport()` branching at line 422 but desktop branch uses zero web primitives and Wave1 tokens throughout. Must replace desktop branch with `WebShell`, `WebTopNav`, `WebTabs`, `WebToolbar`, `WebButton`, `WebCard` and new `.web-pantry-*` CSS classes.

**Key layout requirements**:
- `WebShell` (default width, not wide)
- `WebTopNav activeId="pantry"`
- Header row: heading left, action buttons right — reuse `WebButton variant="primary"` for "+ 재료 추가", `WebButton variant="secondary"` for "번들로 추가"
- `WebTabs` for category filtering with count badges per tab
- `WebToolbar` row: search input left + checkbox + count text right
- Search input: `--web-surface` background, `--web-border` 1px, 40px height, `--web-r-md` radius, search icon left
- Ingredient grid: `repeat(5, 1fr)`, gap 16px
- Each card: `--web-surface` background, `--web-border` 1px, `--web-r-md` radius. Icon in `--web-bg-secondary` circle. Name 15px `--web-font-semibold`. Category 13px `--web-text-secondary`. Badge: "보유" = `--web-success` background/text, "없음" = `--web-text-tertiary` on `--web-bg-secondary`

### Row 2: `screen:SHOPPING_FLOW`

**Prototype**: `WebShell` + `WebTopNav activeId="mypage"`. Breadcrumb: "< 마이페이지 / 장보기". Heading "장보기" with description. 3 horizontal cards in `repeat(3, 1fr)` grid:
1. **Active** (blue border `--web-brand` 2px): "진행 중" badge (blue), title (date range), item count, `WebButton` "바로 시작 >" 
2. **Past** (gray border): "과거 목록" badge (gray), title, description, text link "목록 열기 >"
3. **Manual** (gray border): "직접 만들기" badge (gray), title, description, text link "새로 만들기 +"

**Current MVP delta**: `shopping-flow-screen.tsx` (1276 LOC) has `useIsMobileViewport()` at line 269 but desktop branch uses Wave1 tokens. Replace with web primitives.

**Key layout requirements**:
- `WebShell` default width
- `WebTopNav activeId="mypage"`
- `.web-breadcrumb` pattern from Slice 3
- 3-column card grid: `repeat(3, 1fr)`, gap 24px
- Each card: `WebCard` base with 24px padding
- Active card: additional 2px `--web-brand` border, blue badge
- Badge: pill-shaped, 13px font. Active = `--web-brand-wash` bg + `--web-brand` text. Past/Manual = `--web-bg-secondary` bg + `--web-text-secondary` text
- CTA buttons: `WebButton` for active card, text links with chevron for others

### Row 3: `screen:SHOPPING_LISTS`

**Prototype**: `WebShell` + `WebTopNav activeId="mypage"`. Breadcrumb: "< 마이페이지 / 장보기 목록". Heading "장보기 목록" with description. Two sections with heading: "진행 중" and "완료된 장보기". Each section: stacked `WebListRow` cards with dot indicator (blue=active, green=complete), title, count/date meta, status badge, chevron. Optional bottom dark pill button "다시 장보기로 담았어요".

**Current MVP delta**: No standalone `shopping-lists-screen.tsx` exists. This view is likely composed within `shopping-flow-screen.tsx` or navigated from MyPage. Codex must create or extract the desktop web view for this.

**Key layout requirements**:
- Same shell/nav pattern
- Section headings: 20px `--web-font-semibold`
- List rows: `WebListRow` or `WebCard` per item, `--web-border` bottom divider between items
- Status dot: 8px circle, blue `--web-brand` for active, green `--web-success` for complete
- Badge: "진행 중" = blue pill, "완료" = green pill
- Chevron: `--web-text-tertiary`, right-aligned

**Split ownership note**: Slice 5 owns the list history/detail/read-only/reopen semantics and the layout. Slice 6 owns the MyPage entry/presentation that links to this screen.

### Row 4: `screen:SHOPPING_DETAIL`

**Prototype shows 3 states** — this is the most complex row:

**State A — Active (editable)**:
- `WebShell` + `WebTopNav activeId="mypage"`
- Breadcrumb: "< 마이페이지 / [list title]"
- Status badge "진행 중" (blue pill)
- Heading: date range title
- Description text
- Action button top-right: "장보기 완료" (`WebButton variant="primary"` with cart icon)
- Progress banner: full-width light blue (`--web-brand-wash`) background, "N / M 항목 (X%)" text + progress bar (`--web-brand` fill, `--web-bg-secondary` track, 4px height, pill radius)
- 2-column layout: `minmax(0, 1fr) 340px`
  - **Left**: "구매할 재료" heading + count. 2-column checklist: each row = checkbox (24px, `--web-border` unchecked, `--web-brand` checked) + ingredient name + amount right-aligned. Sorted by `sort_order ASC, id ASC`.
  - **Right**: sticky sidebar `WebCard`. "팬트리에서 빠진 재료" heading + description. Item list: blue dot `--web-brand` + ingredient name + amount + "장보기 추가" ghost button right-aligned. `is_pantry_excluded=true` items shown here.

**State B — Complete (read-only)**:
- Same layout but:
  - Status badge "완료된 장보기" (blue)
  - Description: "완료된 장보기는 읽기 전용이에요."
  - Lock notice banner: `--web-bg-secondary` background, lock icon + "이 장보기는 완료되어 수정할 수 없어요. 수정 시도는 실제 서비스에서 409로 차단됩니다."
  - Action button: "다시 장보기" (`WebButton variant="secondary"` with refresh icon)
  - All checkboxes visually checked + disabled (frozen state)
  - No interactive "장보기 추가" buttons in sidebar
  - Progress bar at 100% or final state

**State C — Read-only after reopen**:
- Identical to State B but may show the list that was reopened from

**Current MVP delta**: `shopping-detail-screen.tsx` (1433 LOC) has `useIsMobileViewport()` at line 49 but desktop branch uses Wave1 tokens. All three states exist in the state machine. Replace desktop presentation.

**Key layout requirements**:
- Progress banner must use `--web-brand-wash` bg, `--web-brand` fill bar
- 2-column layout matches Slice 3 meal pattern: `minmax(0, 1fr) 340px`
- Sidebar sticks at `top: calc(var(--web-nav-h) + 24px)`
- Checkbox styling: 20×20 rounded checkbox, `--web-brand` when checked, `--web-border` when unchecked
- Read-only state: all interactive controls disabled, lock banner visible, "장보기 완료" button replaced by "다시 장보기"

### Row 5: `surface:PANTRY::PantrySearchToolbar`

**Prototype**: Horizontal toolbar row inside pantry screen. Contains: search input (left, flex-1), checkbox toggle + count summary (right). Search input has blue focus border (`--web-brand`), X clear button when text present.

**Requirements**: Use `WebToolbar` wrapper. Search input follows the established `web-picker-search` pattern from Slice 4 but scoped to pantry. Checkbox uses standard `--web-brand` accent.

### Row 6: `surface:PANTRY::PantryBundlePicker`

**Prototype**: Inline in `pantry-bundle-picker.tsx` desktop branch. Shows accordion sections of ingredient bundles. Each section: title + "N / M 추가" count, expandable chip list. Owned items = green-bordered chips with checkmark. Unowned = plain outline chips.

**Requirements**: Since this renders inside a modal (Row 9), the surface styling should match the modal's internal content. Use `WebChip` for ingredient chips. Green state: `--web-success` border + text. Neutral state: `--web-border`.

### Row 7: `surface:PANTRY::PantryAddIngredient`

**Prototype**: Grid content inside the add ingredient modal. 5-column grid of ingredient cells. Each cell: circular icon area + ingredient name below. Selected state: `--web-brand` border ring.

**Requirements**: Reuse the `web-ingredient-grid` / `web-ingredient-cell` pattern from Slice 4's `IngredientPickerModal` with minor adaptations (pantry context rather than recipe context). Category filter uses `WebChip` or `WebTabs` — prototype shows `WebChip` style (pill buttons).

### Row 8: `modal:PANTRY::PantryAddIngredientModal`

**Prototype**: `WebModal` + `WebDialog size="wide"` (~720px). Title: "팬트리에 재료 추가". Subtitle: "현재 보유 N개". Close X button. Search input. Category filter chips (전체 active=blue, 채소, 육류, 해산물, 양념, 곡물, 기타). 5-column ingredient grid. Footer: "취소" (text/ghost) + "+ N개 추가" (`WebButton variant="primary"`).

**Current MVP delta**: `pantry-add-sheet.tsx` (478 LOC) has desktop branch at line 149 but uses Wave1 tokens. Replace with `WebModal` + `WebDialog`.

**Key requirements**:
- `WebModal` + `WebDialog size="wide"` (720px)
- `WebDialogHeader`: title + subtitle + close button
- `WebDialogBody`: search + chips + grid
- `WebDialogFooter`: cancel + primary add button
- Category chips: `WebChip` with blue active state
- Grid: reuse `.web-ingredient-grid` / `.web-ingredient-cell` CSS from Slice 4

### Row 9: `modal:PANTRY::PantryAddBundleModal`

**Prototype**: `WebModal` + `WebDialog size="default"` (~520px). Title: "번들로 한꺼번에 추가". Subtitle. Close X button. 3 accordion sections: "기본 양념" (n/m 추가), "국물 베이스" (n/m 추가), "기본 채소" (n/m 추가). Each section: section header row + chip list. Chips: green border + checkmark for owned, neutral for unowned. Footer: "취소" + "번들 추가" (`WebButton variant="primary"` with icon).

**Current MVP delta**: `pantry-bundle-picker.tsx` (536 LOC) has desktop branch at line 310 but uses Wave1 tokens. Replace with `WebModal` + `WebDialog`.

**Key requirements**:
- `WebModal` + `WebDialog size="default"` (520px)
- Accordion sections: section header (title + count badge), collapsible chip area
- `WebChip` for each ingredient: green variant for owned (`--web-success` border + checkmark), neutral for unowned
- Footer: `WebButton` pair

### Row 10: `modal:SHOPPING_DETAIL::PantryReflectModal`

**Prototype**: `WebModal` + `WebDialog size="default"` (~520px). Title: "팬트리에 반영할까요?". Subtitle: "장본 재료를 팬트리에 자동으로 추가합니다". Scrollable checklist of purchased items: each row = pantry icon + ingredient name + amount + blue checkmark. All pre-checked by default. Footer: "나중에" (`WebButton variant="secondary"`) + "N개 반영" (`WebButton variant="primary"` with checkmark icon).

**Current MVP delta**: `pantry-reflection-popup.tsx` (480 LOC) has desktop branch at line 109 but uses Wave1 tokens. Replace with `WebModal` + `WebDialog`.

**Key requirements**:
- `WebModal` + `WebDialog size="default"` (520px)
- Header: title + subtitle + close X
- Body: scrollable item list with checkboxes (all checked by default)
- Each item: checkbox (blue when checked) + name + amount
- Footer: "나중에" secondary + "N개 반영" primary
- **Domain critical**: Must preserve `add_to_pantry_item_ids` semantics — `null` = default (all checked), `[]` = none reflected, selected ids = partial

---

## 3. Shared Primitive Guidance

### Reuse from REFERENCE_LOCK (no changes needed)

| Primitive | Usage in Slice 5 |
|-----------|-----------------|
| `WebShell` | All 4 screens (default width) |
| `WebTopNav` | All screens: `activeId="pantry"` for pantry, `activeId="mypage"` for shopping |
| `WebButton` | All action buttons, confirm/cancel pairs |
| `WebCard` | Shopping flow cards, pantry-excluded sidebar, shopping list rows |
| `WebModal` | PantryAddIngredientModal, PantryAddBundleModal, PantryReflectModal |
| `WebDialog` | `size="wide"` for ingredient add, `size="default"` for bundle/reflect |
| `WebDialogHeader/Body/Footer` | All 3 modals |
| `WebTabs` | Pantry category tabs |
| `WebChip` | Bundle ingredients, category filters in add modal |
| `WebToolbar` | Pantry search toolbar |
| `WebListRow` | Shopping lists rows, pantry-excluded sidebar items |
| `WebEmptyState` | Empty pantry, empty shopping list |
| `WebErrorState` | Error states |
| `WebSkeleton` | Loading states |
| `WebIconButton` | Close buttons, action icons |
| `.web-breadcrumb` | Shopping screens (from Slice 3) |
| `.web-stepper` | Not needed for Slice 5 |

### Reuse from Slice 4

| Pattern | Source | Usage in Slice 5 |
|---------|--------|-----------------|
| `.web-ingredient-grid` | `globals.css` ~line 3031 | PantryAddIngredientModal grid |
| `.web-ingredient-cell` | `globals.css` ~line 3038 | PantryAddIngredientModal cells |
| `.web-picker-search` | `globals.css` ~line 2765 | Pantry search, add modal search |

### New CSS classes to create

```
.web-pantry-*        — pantry grid, card, badge (보유/없음), search toolbar, category tabs
.web-shopping-flow-* — 3-card grid, active card blue border, status badges
.web-shopping-detail-* — progress banner, 2-col layout, checklist grid, checkbox styling, lock notice
.web-shopping-list-*  — list rows, status dots, section headings, chevrons
.web-reflect-*        — reflect modal item rows, checkbox list
.web-bundle-*         — accordion sections, green chips, section headers
```

### New primitives: NONE required

No new `Web*` component files are needed. All layouts can be composed from existing locked primitives + new `.web-*` CSS classes in `globals.css`.

---

## 4. Evidence Checklist

### MVP screenshots (1280px, after implementation)

| File | Content |
|------|---------|
| `mvp-pantry-1280.png` | Pantry grid with category tabs, search, cards |
| `mvp-pantry-add-modal-1280.png` | Ingredient add modal with grid |
| `mvp-pantry-bundle-modal-1280.png` | Bundle add modal with accordion chips |
| `mvp-shopping-flow-1280.png` | 3-card shopping flow |
| `mvp-shopping-detail-active-1280.png` | Active shopping detail with checklist |
| `mvp-shopping-detail-complete-1280.png` | Completed read-only shopping detail |
| `mvp-shopping-detail-reflect-1280.png` | Pantry reflection modal overlay |
| `mvp-shopping-lists-1280.png` | Shopping list history (진행 중 + 완료된 장보기) |

### Test evidence

| Suite | Expectation |
|-------|-------------|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass |
| `pnpm test:product` | Pass, no regression |
| `pnpm test:e2e:visual` | New desktop baselines for all 8 MVP screenshots above |
| `pnpm test:e2e:a11y` | New desktop-only a11y tests for pantry + shopping screens with `allowPrototypeDesktopColorContrast: true` |
| `pnpm test:e2e:smoke` | Desktop smoke: pantry search/add/bundle, shopping create, check item, exclude/unexclude, complete, read-only 409, reopen, pantry reflect |
| Mobile regression | Existing pantry and shopping functional specs pass on `mobile-chrome` with desktop skipped |

### Ledger updates

All 10 Slice 5 rows must move from `open` → `done` with:
- Reference + MVP screenshot paths
- Style audit, geometry audit
- Remaining differences annotated
- Functional regression result

### Visual verdict target

≥90/100 per row. Fixture/data differences annotated and excluded.

---

## 5. Domain Risk Checklist

These are **hard functional constraints** that must be preserved through the desktop porting. The desktop branch wraps the same state machine with different presentation — it must NOT fork the domain logic.

| Rule | Code path | Verification |
|------|-----------|-------------|
| **Read-only after completion** | `shopping-detail-screen.tsx` — completed list disables all interactive controls. Server returns 409 for mutations. | Desktop must show lock banner, disable checkboxes, hide/disable "장보기 완료" button, show "다시 장보기" instead. Smoke test must verify no mutation buttons are clickable. |
| **`is_pantry_excluded=true` → `is_checked=false`** | Pantry-excluded items always unchecked regardless of user action. | Desktop sidebar must show excluded items WITHOUT checkboxes. Moving an item to/from excluded must update both sections immediately. |
| **`add_to_pantry_item_ids` semantics** | `null` = default (all checked added), `[]` = reflect none, `[id1, id2]` = reflect selected only. | Reflection modal must map its 3 modes correctly: "모두 추가" → null, "추가 안 함" → [], "선택 추가" → selected ids. Do NOT default to empty array when "all" is intended. |
| **Invalid reflection items ignored** | Server ignores IDs not in the checked set. `pantry_added` count matches `pantry_added_item_ids.length`. | Desktop modal should only display checked (purchased) items as reflection candidates. |
| **Sort order** | `sort_order ASC, id ASC` | Desktop checklist must maintain this order. If drag-reorder exists on mobile, desktop can use the same `sort_order` without reimplementing drag UI. |
| **Status transitions** | `registered → shopping_done → cook_done` only | Desktop views must not expose any state transitions that skip steps (e.g., no "cook done" button from the shopping screen). |
| **Shopping preview target** | `status='registered' AND shopping_list_id IS NULL` | Shopping flow only shows meals meeting this filter. Desktop must not show already-assigned meals. |
| **Reopen semantics** | Completed list can be reopened via "다시 장보기" button, creating a new active list. | Desktop must show "다시 장보기" on completed lists and navigate to the new list on success. The original list remains read-only. |

---

## 6. Blocking Ambiguities

**None identified.** All requirements are derivable from the prototype screenshots, existing state machines, and domain rules.

**One clarification for Codex**: The `screen:SHOPPING_LISTS` view does not have a standalone component file — it appears to be rendered as part of the shopping flow or navigated from MyPage. Codex should either:
- (A) Extract a `ShoppingListsWebView` function within `shopping-flow-screen.tsx`, or
- (B) Create a new `components/shopping/shopping-lists-web-view.tsx`

Either approach is acceptable as long as the web view uses `WebShell` + `WebTopNav` + `WebListRow` and the split ownership boundary with Slice 6 (MyPage entry) is clean.

---

## Implementation Priority (recommended)

1. **`screen:PANTRY`** + `surface:PantrySearchToolbar` — standalone screen, establishes pantry shell pattern
2. **`modal:PantryAddIngredientModal`** + `surface:PantryAddIngredient` — reuses Slice 4 ingredient grid pattern
3. **`modal:PantryAddBundleModal`** + `surface:PantryBundlePicker` — new accordion/chip pattern but small scope
4. **`screen:SHOPPING_FLOW`** — entry point for shopping domain, 3-card grid
5. **`screen:SHOPPING_DETAIL`** (all 3 states) — most complex, 2-column layout with state-dependent rendering
6. **`modal:PantryReflectModal`** — triggered from shopping detail completion
7. **`screen:SHOPPING_LISTS`** — list view, moderate complexity

---

**PRE-SIGNOFF: APPROVED** — Codex may proceed with Slice 5 implementation per this checklist. No blocking issues identified.
