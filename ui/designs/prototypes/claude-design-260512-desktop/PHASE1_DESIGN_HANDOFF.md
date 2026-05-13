# Phase 1 Design Handoff: Desktop Shell, Primitives, LoginGate Foundation

**Author**: Claude (Design Owner)
**Date**: 2026-05-13
**Status**: Ready for Codex implementation
**Target**: `ui/designs/prototypes/claude-design-260512-desktop/`
**Plan reference**: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`

---

## 1. Visual Direction

### What this desktop app should feel like

A **calm operational tool** that respects the user's time. Think of a clean Korean meal-planning dashboard -- dense where density helps (planner grid, shopping checklist, pantry inventory), spacious where scanning matters (recipe cards, recipe detail reading), and quiet everywhere else. The app should feel like a well-organized kitchen counter: everything within reach, nothing decorative in the way.

### Modern web-app quality references (inspiration, not branding)

| Reference | What to take | What to leave |
|-----------|-------------|---------------|
| **Notion** (desktop) | Quiet meta rows, generous reading typography, breadcrumb hierarchy, clear empty states | Nesting depth, heavy editor UI chrome |
| **Linear** (project tool) | Dense list/table layouts, crisp tab bars, focused sidebar, fast keyboard patterns | Dark theme default, engineering-centric density |
| **Ohou/Today's House** (Korean home product) | Color tokens (already adopted), card hover patterns, clean product grids | Heavy e-commerce CTAs, promotional banner spam |
| **Airbnb** (listing detail) | Photo mosaic, two-column detail + action rail, overlay hover on cards | Heavy search-centric hero, booking widget complexity |
| **Google Calendar** (weekly view) | Grid-based week planner, sidebar summary, quick-add affordance | Google-specific Material UI, cramped mobile-first grid |

### What to avoid from the current prototype

- **CSS layering debt**: 4 overlapping CSS files (`styles.css`, `styles-patch.css`, `styles-extra.css`, `styles-home.css`) with duplicate/conflicting selectors (e.g., `.search-bar` defined in both `styles.css:509` and `styles-home.css:75`, `.planner-grid` in `styles.css:582` and `styles-patch.css:287`).
- **Viewport-unit or unbounded font sizes**: The `32px` discovery title and `28px` stat numbers don't scale well at 1024px.
- **Orphan Korean syllable breaks**: No `word-break` or `overflow-wrap` protection on card metadata, tab labels, or badge text. At narrower desktop widths, Korean compound nouns split mid-syllable (e.g., `홈쿡 오리지` / `널`).
- **Decorative-only density**: Cards used as page sections rather than repeated items (MyPage hero, shopping flow entry cards). This wastes vertical space and creates visual inconsistency.
- **Stretched mobile patterns**: Bottom sheets, full-width CTAs, and single-column layouts that don't adapt to desktop viewport.
- **Missing interactive states**: No hover/focus/active differentiation on many controls. No keyboard navigation patterns.

---

## 2. Desktop Layout System

### Shell Structure

```
+---------------------------------------------------------------+
|  TopNav  [brand] [HOME] [PLANNER] [PANTRY] [MYPAGE]   [search] [avatar]  |
+---------------------------------------------------------------+
|                                                               |
|  +-content-frame------------------------------------------+   |
|  |                                                        |   |
|  |  Page content (varies by screen type)                  |   |
|  |                                                        |   |
|  +--------------------------------------------------------+   |
|                                                               |
+---------------------------------------------------------------+
```

### Responsive Width Tokens

| Token | Width | Content max | Side padding | Grid columns (home) |
|-------|-------|-------------|-------------|-------------------|
| `--bp-desktop` | 1024px | 960px | 32px | 3 |
| `--bp-desktop-md` | 1280px | 1200px | 32px | 4 |
| `--bp-desktop-lg` | 1440px+ | 1360px | 40px | 5 |

**Rule**: All layout math uses `max-width` + `margin: 0 auto`. No viewport-width (`vw`) units for content sizing. Padding is fixed px, not percentage.

### Navigation Model

- **TopNav**: Fixed top bar, 64px height, frosted glass background.
- **Primary tabs**: HOME, PLANNER, PANTRY, MYPAGE -- always visible in TopNav.
- **Search**: Compact pill in TopNav right section (not a separate page).
- **Breadcrumbs**: Used on all non-tab-root screens. Format: `[< Parent] / Current Page`.
- **No sidebar navigation**: The app's information architecture is flat enough that tab + breadcrumb covers all cases. Side panels are used for contextual content (planner summary, recipe action rail, shopping pantry info), not navigation.

### Page Layout Patterns

#### Pattern A: Full-width content page (HOME, RECIPEBOOKS, ATE_LIST)
```
[page-header: title + actions]
[content-grid: 3/4/5 columns responsive]
```

#### Pattern B: Two-column detail page (RECIPE_DETAIL, MEAL, SHOPPING_DETAIL)
```
[breadcrumb]
[page-header]
+------main-column------+  +--side-rail--+
|  hero / media          |  | sticky rail |
|  body content          |  | actions     |
|  sections...           |  | stats       |
+------------------------+  +-------------+
```
- Main column: `minmax(0, 1fr)`
- Side rail: `340px` (recipe), `320px` (meal), `340px` (shopping)
- Gap: `48px-56px`
- At `1024px`, side rail shrinks to `280px` or collapses to single column below `1180px`
- Rail is `position: sticky; top: calc(var(--nav-h) + 24px)`

#### Pattern C: Sidebar + main content (PLANNER_WEEK)
```
[page-header: title + week nav + actions]
+--sidebar--(260px)--+  +------main-grid------+
|  week summary       |  | 7-column week grid  |
|  quick add          |  |                     |
|  recent recipes     |  |                     |
+---------------------+  +---------------------+
```
- Sidebar: `260px` fixed
- Main: `minmax(0, 1fr)`
- Gap: `32px`

#### Pattern D: Simple content page (SETTINGS, MYPAGE, PANTRY)
```
[breadcrumb] (if not tab root)
[page-header]
[content-sections: stacked vertically, max-width 720px-960px]
```

### Mobile-to-Desktop Sheet Adaptation

| Mobile pattern | Desktop equivalent | Notes |
|---------------|-------------------|-------|
| Bottom sheet | Centered dialog (`520px` default, `720px` wide) | All modals use centered dialog on desktop |
| Full-screen modal | Dialog with `max-height: calc(100vh - 80px)` | Scrollable body, fixed header/footer |
| Action sheet | Dropdown or popover | For sort/filter with <6 options |
| Swipe-to-dismiss | Click backdrop or X button | Always provide explicit close affordance |
| Floating bottom bar | Dialog footer or inline actions | No floating bars on desktop |

---

## 3. Typography and Korean Wrapping Rules

### Type Scale

All sizes use `px`, not `rem` or `vw`. No viewport-scaled typography.

| Token | Size | Weight | Line-height | Letter-spacing | Usage |
|-------|------|--------|-------------|---------------|-------|
| `h-display` | 32px | 700 | 1.25 | -0.5px | Page hero titles (HOME discovery) |
| `h1` | 24px | 700 | 1.30 | -0.3px | Screen titles |
| `h2` | 20px | 700 | 1.35 | -0.3px | Section headings |
| `h3` | 17px | 600 | 1.40 | -0.3px | Subsection, card group headings |
| `body-lg` | 16px | 400 | 1.65 | 0 | Reading text (recipe steps, descriptions) |
| `body` | 15px | 400 | 1.55 | 0 | Default body text |
| `body-md` | 15px | 500 | 1.50 | -0.3px | Button labels, navigation text |
| `caption` | 13px | 400 | 1.45 | -0.3px | Secondary labels, metadata |
| `meta` | 12px | 500 | 1.40 | -0.3px | Timestamps, counts, form labels |
| `micro` | 11px | 600 | 1.35 | 0.1em | Eyebrow, uppercase labels |

**Changes from current**: `h-display` reduced from 40px to 32px. `h1` reduced from 28px to 24px. `h2` reduced from 22px to 20px. These sizes fit better in 1024px viewport without overwhelming density-oriented screens.

### Korean Wrapping Rules

Korean text has unique wrapping challenges because:
- Korean syllable blocks are wider than Latin characters.
- Compound nouns (e.g., `홈쿡 오리지널`) should not break mid-word.
- Badge/pill text must never wrap.

#### Component-level rules

| Component | Rule | CSS implementation |
|-----------|------|-------------------|
| **Card title** | Truncate with ellipsis at 2 lines max | `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: keep-all;` |
| **Card metadata** | Single line, truncate | `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; word-break: keep-all;` |
| **Tab / pill / badge** | Never wrap, never truncate. If text doesn't fit, the container must grow. | `white-space: nowrap;` |
| **Button label** | Never wrap | `white-space: nowrap;` |
| **Navigation tab** | Never wrap | `white-space: nowrap;` |
| **Reading text** | Natural wrap with `word-break: keep-all` | `word-break: keep-all; overflow-wrap: break-word;` |
| **Table cell** | Truncate with tooltip on hover | `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` |
| **Form label** | Never wrap | `white-space: nowrap;` |
| **Breadcrumb current** | Truncate if too long | `max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` |

#### Global baseline rule

```css
/* Apply to all text containers as a safety net */
body {
  word-break: keep-all;      /* prevent Korean mid-syllable breaks */
  overflow-wrap: break-word;  /* allow long URLs/tokens to break */
}
```

**Critical**: The `word-break: keep-all` rule is the single most important Korean typography fix. It prevents `홈쿡 오리지` / `널` type breaks. The current prototype does NOT set this globally.

---

## 4. Component Primitive Specs

### 4.1 Card

Three card variants. All cards share: `border-radius: var(--r-md)` (16px), `border: 1px solid var(--line)`, hover elevation.

#### PhotoCard (HOME recipe grid)
```
+---------------------------+
|  [image 4:3]    [save-btn]|
+---------------------------+
|  Title (2-line clamp)     |
|  meta: source · time · srv|
+---------------------------+
```
- Image: `aspect-ratio: 4/3`, `object-fit: cover`
- Hover: `box-shadow: var(--shadow-card)`, image `scale(1.05)`, gradient overlay
- Save button: absolute positioned `top: 12px; right: 12px`, 36px circle
- Title: 15px/600, `word-break: keep-all`, 2-line clamp
- Meta: 13px/400, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- **Fix**: Add `min-width: 0` on card body to prevent text overflow

#### MetaRow (MYPAGE, SHOPPING_LISTS, settings lists)
```
+---+----------------------------+---+
|icon|  Title                    | > |
|   |  Subtitle (meta)          |   |
+---+----------------------------+---+
```
- Full-width row, `padding: 16px 20px`
- Icon: 36px square, `border-radius: var(--r-sm)`, light background
- Hover: background tint
- Grouped in `.meta-list` container with `border-bottom` dividers

#### RecipebookCard (RECIPEBOOKS grid)
```
+-------------------------------+
|  [mosaic: 3 images arranged]  |
+-------------------------------+
|  Title                        |
|  12개                         |
+-------------------------------+
```
- Grid: 3 columns at 1024px, 4 at 1280px+
- Image mosaic: 1 large + 2 small arrangement, fixed `aspect-ratio: 4/3`
- Title: 15px/600, `word-break: keep-all`
- Count: 13px/400 meta
- **Current problem**: Missing `.recipebook-grid` and `.recipebook-mosaic` CSS definitions cause vertical stacking

### 4.2 Tab / Segmented Control

#### Tab Bar (Pantry categories, Recipe detail sections)
```
[Tab A]  [Tab B]  [Tab C]  [Tab D]
  ---active---
```
- Height: 48px
- Active indicator: 2px bottom border, brand color
- Text: 14px/600
- Badge/count: inline after label, 12px meta color
- **Spacing**: Each tab has `padding: 14px 20px` with `gap: 0` between tabs
- **Must have**: `white-space: nowrap` on all tab labels
- **Pantry fix**: Tabs currently concatenate into `채소·과일3/9육류·해산물1/5...` because they lack proper flex container and badge separation

#### Segmented Control (Settings unit/theme, Planner meal columns)
```
+---+-------+-------+-------+---+
|   | Opt A | Opt B | Opt C |   |
+---+-------+-------+-------+---+
```
- Container: `background: var(--bg-alt)`, `border-radius: var(--r-pill)`, `padding: 3px`
- Option: `height: 34px`, `padding: 0 16px`
- Active: `background: white`, `color: var(--brand)`, `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`
- `white-space: nowrap` on options

### 4.3 Toolbar

Used in Pantry, Recipebooks, Shopping detail -- any screen with search + filter + sort.

```
+------search-input------+  [filter] [sort-dropdown]  count text
```
- Height: 44px input
- Search: pill input with icon, `max-width: 320px`, focus ring
- Right controls: row of buttons/dropdowns
- Responsive: at 1024px, search takes full width, controls wrap below

### 4.4 Button

Four variants, three sizes. Already well-defined in current CSS.

| Variant | Background | Text | Border | Use |
|---------|-----------|------|--------|-----|
| `primary` | `var(--brand)` | white | none | Primary action per screen |
| `secondary` | transparent | `var(--brand)` | `1px solid var(--brand)` | Secondary action |
| `tertiary` | `var(--bg-alt)` | `var(--text-2)` | none | Neutral action |
| `ghost` | transparent | `var(--text-2)` | none | De-emphasized action |

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | 36px | 0 14px | 13px |
| default | 44px | 0 20px | 15px |
| `lg` | 52px | 0 28px | 16px |

#### Icon Button
- Circular: 40px, `border-radius: 9999px`
- Used for: save, share, close, navigation arrows
- Hover: white background + card shadow

### 4.5 Badge / Pill

```
[label]  or  [label · count]
```
- Height: 24px (tag) or 34px (chip)
- `border-radius: var(--r-pill)`
- Variants: default (bg-alt), active (brand), brand-wash
- **Rule**: `white-space: nowrap` always. Never truncate. If the label doesn't fit, the layout must accommodate it or the label text needs shortening in data/translation.

### 4.6 Modal / Dialog

Centered dialog with header, scrollable body, footer actions.

```
+--dialog (520px / 720px wide)--+
|  [Title]              [close] |
+-------------------------------+
|  Scrollable body              |
|  (max-height: calc(100vh-80px))|
+-------------------------------+
|           [Cancel] [Confirm]  |
+-------------------------------+
```

- Scrim: `rgba(0,0,0,0.42)`, `backdrop-filter: blur(1px)`
- Dialog: `box-shadow: var(--shadow-float)`, `animation: slideUp .2s ease-out`
- Header: 20px padding, bottom border, title 18px/700
- Body: 20px padding, overflow-y auto
- Footer: 16px padding, top border, flex end
- Wide variant: `720px` for filter/picker modals
- Close button: 36px circle in header right

### 4.7 Sheet / Side Panel Equivalent

On desktop, mobile bottom sheets become one of:
1. **Centered dialog** (default for focused tasks)
2. **Dropdown/popover** (for quick selections with <6 items)
3. **Inline expansion** (for in-context editing)

There is no slide-from-right side panel in this app. The "side rail" on detail pages is a layout column, not a slide-in panel.

### 4.8 Empty / Loading / Error / Read-only States

#### StatePanel (empty/error)
```
+--centered, full-width card--+
|     [64px icon circle]      |
|     Title (17px/700)        |
|     Description (14px)      |
|     [Action button]         |
+-----------------------------+
```

#### Skeleton (loading)
- Uses shimmer animation: `linear-gradient` sweep at 1.4s linear
- Card skeleton: image placeholder + 2 text lines
- Grid skeleton: 2 rows of cards

#### Read-only indicator
- Eyebrow text: `"완료된 장보기"` above title
- Disabled interactions: `opacity: 0.55`, no hover, `cursor: default`
- Clear visual distinction from active state

### 4.9 Image Mosaic / Card Media

#### Recipe Detail Photo Mosaic
```
+--main (2fr)---+---side (1fr)---+
|               | [img] | [img]  |
|   main img    +-------+--------+
|               | [img] | [more] |
+---------------+-------+--------+
```
- Height: 460px
- Grid: `grid-template-columns: 2fr 1fr`
- Side: 2x2 sub-grid (4 thumbnails total)
- "사진 전체" button on last thumbnail
- `border-radius: var(--r-md)` on container, `overflow: hidden`
- Hover: `scale(1.03)` on each image cell

#### RecipeBook Mosaic
```
+--large---+--sm--+
|          | img  |
|  img     +------+
|          | img  |
+----------+------+
```
- Fixed aspect ratio container: `aspect-ratio: 4/3`
- Large cell: left 60%, small cells: right 40% stacked
- `border-radius: var(--r-md)` on container

---

## 5. LoginGate and Return-to-Action Foundation

### Principle

Protected actions (save recipe, add to planner, create recipebook, etc.) must feel like a brief **confirmation pause**, not a redirect to a separate login page. The user should see what they're about to do, then authenticate, then complete the action.

### Desktop LoginGate Pattern

```
+----------dialog (520px)----------+
|  [X]                             |
|                                  |
|    [Lock icon / brand icon]      |
|    "로그인이 필요한 기능이에요"     |
|    "레시피를 저장하려면 로그인하세요" |
|                                  |
|  +---kakao-login-button--------+ |
|  +---naver-login-button--------+ |
|  +---google-login-button-------+ |
|                                  |
|  [나중에]                         |
+----------------------------------+
```

### Design rules

1. **LoginGate is a centered dialog**, never a full-page redirect or a mobile-style bottom sheet.
2. The dialog shows the **context of the action** the user was trying to take (e.g., "레시피를 저장하려면" not just "로그인하세요").
3. Provider buttons follow the official OAuth button guidelines for Kakao/Naver/Google.
4. After successful login, the user returns to **exactly where they were** and the action completes automatically (return-to-action pattern).
5. The "나중에" (Later) option dismisses the gate without side effects.
6. LoginGate must be **reusable** -- it is not recipe-only. Every protected action (planner add, pantry edit, shopping create, recipebook actions) uses the same gate component.

### Protected actions list (Phase 1 foundation)

| Action | Where triggered | Gate context text |
|--------|----------------|-------------------|
| Save recipe | HOME card, RECIPE_DETAIL rail | "레시피를 저장하려면 로그인하세요" |
| Add to planner | RECIPE_DETAIL rail, PLANNER_WEEK quick add | "플래너에 추가하려면 로그인하세요" |
| Create recipebook | RECIPEBOOKS screen | "레시피북을 만들려면 로그인하세요" |
| Edit pantry | PANTRY toggle, add ingredient/bundle | "팬트리를 관리하려면 로그인하세요" |
| Create shopping list | SHOPPING_FLOW | "장보기를 만들려면 로그인하세요" |
| Complete shopping | SHOPPING_DETAIL | "장보기를 완료하려면 로그인하세요" |
| Edit nickname | MYPAGE | "닉네임을 변경하려면 로그인하세요" |
| Account delete | SETTINGS | "계정을 삭제하려면 로그인하세요" |

---

## 6. Screen Examples

### 6.1 HOME

#### Current problems
- Discovery title at 32px is acceptable but the search bar + filter row + theme carousel push the recipe grid too far down.
- Recipe cards: metadata line wraps mid-Korean-word at 1024px.
- Theme carousel has no defined card width that works at all breakpoints.

#### Phase 1 target layout (1280px example)

```
+--TopNav---------------------------------------------------+
|  homecook  [HOME] [PLANNER] [PANTRY] [MYPAGE]  🔍  [CW]  |
+-----------------------------------------------------------+

  오늘 뭐 먹지?
  레시피 제목으로 검색하거나, 재료로 좁혀 보세요.
  [🔍 레시피 제목 검색                               ]
  [재료로 검색]  [김치] [돼지고기] [+2]

  이번 주 인기 테마                          더보기 [<] [>]
  +--------+  +--------+  +--------+  +--------+  +--
  |  테마1  |  |  테마2  |  |  테마3  |  |  테마4  |  | 테
  +--------+  +--------+  +--------+  +--------+  +--

  모든 레시피  124개                        [조회순 v]
  +------+  +------+  +------+  +------+
  | card |  | card |  | card |  | card |
  |      |  |      |  |      |  |      |
  | 제목  |  | 제목  |  | 제목  |  | 제목  |
  | meta |  | meta |  | meta |  | meta |
  +------+  +------+  +------+  +------+
  +------+  +------+  +------+  +------+
  ...
```

#### Key specs
- Discovery section: `max-width: 640px` for search bar
- Theme carousel: card width `260px`, `1.5-card peek` visible at edge
- Recipe grid: `grid-template-columns: repeat(4, 1fr)` at 1280px, `repeat(3, 1fr)` at 1024px, `repeat(5, 1fr)` at 1440px+
- Card gap: `24px` at default, `28px` at 1440px+
- Card metadata: single line, `word-break: keep-all`, ellipsis overflow
- Metadata format: `홈쿡 오리지널 · 15분 · 2인분` -- always single-line

### 6.2 RECIPE_DETAIL

#### Current problems
- `.recipe-layout` and `.recipe-grid` defined in different files with conflicting rules
- Ingredient row typography is dense but functional
- Action rail lacks visual weight for primary actions
- Photo mosaic `.recipe-photo-side` has duplicate grid definitions in `styles-patch.css`

#### Phase 1 target layout (1280px)

```
  [< 탐색] / 김치볶음밥

  +----photo-mosaic (2:1 split)------+-----side-2x2------+
  |                                  |  [img1]  | [img2]  |
  |           main photo             +---------+---------+
  |                                  |  [img3]  | [전체]   |
  +----------------------------------+---------+---------+

  김치볶음밥
  [한식] [15분] [1인] [홈쿡 오리지널]

  2인분(기본) · 재료 7개 · 단계 5개 · 15분

  [공유]  [좋아요 1,284]  [저장됨]    |    +--action-rail-(340px)--+
                                     |    | 2인분 기준              |
  간단한 한 끼 요리입니다.             |    | 재료 7개 · 단계 5개     |
                                     |    |                        |
  인분 조절                           |    | [플래너에 추가]  (primary)|
  재료량이 즉시 바뀝니다  [-] 2인분 [+]|    | [요리하기]    (secondary)|
                                     |    |                        |
  ## 재료                             |    | 좋아요  1,284          |
  묵은지 ✓팬트리    1컵               |    | 저장    892            |
  찬밥              1공기             |    | 플래너  234            |
  ...                                |    |                        |
                                     |    | i 요리모드 진입 후에는   |
  ## 조리 순서                        |    |   인분을 바꿀 수 없어요  |
  1 [볶기] 재료 준비...              |    +------------------------+
  2 [볶기] 김치 볶기...              |
```

#### Key specs
- Two-column: `grid-template-columns: minmax(0, 1fr) 340px; gap: 56px`
- Photo mosaic: `height: 460px`, main 2fr + side 1fr (side is 2x2 sub-grid)
- Title block: h1 at 24px (down from 28px), tags as inline pills
- Metric row: compact inline flex, 18px numbers
- Ingredient list: `border-bottom` dividers, pantry badge inline
- Action rail: `sticky`, `box-shadow: var(--shadow-card)`, primary button full-width
- Steps: numbered circles (brand-wash background) + method pill + step text

### 6.3 PLANNER_WEEK

#### Current problems
- Summary sidebar + grid push planner content below fold at 1024px
- Planner grid cells are too tall (`min-height: 132px` in base, `116px` in patch)
- Week navigation buttons are in the page header, not connected to the grid
- Status dots are too small to differentiate

#### Phase 1 target layout (1280px)

```
  주간 플래너
  5월 11일(월) -- 5월 17일(일)        [< 이전 주] [다음 주 >] [장보기 미리보기]

  +--sidebar (260px)--+  +--7-day grid-----------------------------------------------+
  | 이번 주 요약       |  |      | 월 11 | 화 12 | 수 13*| 목 14 | 금 15 | 토 16 | 일 17 |
  | 등록 8 장본 5 완료 3|  |------+-------+-------+-------+-------+-------+-------+-------|
  |                   |  | 아침 |       | meal  |       |       |       |       |       |
  | 빠른 추가          |  |------+-------+-------+-------+-------+-------+-------+-------|
  | + 오늘 저녁        |  | 점심 | meal  |       |       | meal  |       | meal  |       |
  | + 내일 저녁        |  |------+-------+-------+-------+-------+-------+-------+-------|
  | + 주말 점심        |  | 저녁 | meal  | meal  | meal  |       | meal  |       |       |
  |                   |  +-------+-------+-------+-------+-------+-------+-------+-------|
  | 최근 추가 레시피    |
  | [img] 김치볶음밥   |
  | [img] 된장찌개     |
  | [img] 닭가슴살 샐러드|
  +-------------------+
```

#### Key specs
- Sidebar: `260px` fixed, `position: sticky`
- Grid: `grid-template-columns: 56px repeat(7, minmax(0, 1fr))`
- Cell min-height: `100px` (down from 116-132px to fit 3 meal rows on screen)
- Today column header: brand-soft background highlight
- Meal card in cell: thumbnail (16:9) + title (2-line clamp, 12px) + meta (11px)
- Add button: dashed border, `+` icon, full cell height
- Status indicator: colored left border on meal card (not just a dot)
- Legend row below grid: horizontal, small dots + labels

### 6.4 PANTRY

#### Current problems
- Category tabs render as concatenated text (`채소·과일3/9육류·해산물1/5...`) because `.pantry-tab` class is missing from CSS
- Ingredient cards work but the toggle (held/out) affordance is small
- Search + filter toolbar lacks proper flex layout

#### Phase 1 target layout (1280px)

```
  팬트리
  현재 갖고 있는 재료를 표시해 두면...     [번들로 추가] [재료 추가]

  [채소·과일  3/9] [육류·해산물  1/5] [양념·소스  4/8] [곡물·기타  2/6]
   ===active===

  [🔍 채소·과일에서 검색]    ☑ 없는 재료도 표시    보유 3 · 부족 6

  +--------+  +--------+  +--------+  +--------+  +--------+
  |[보유]   |  |[없음]   |  |[보유]   |  |[없음]   |  |[보유]   |
  |  🥬    |  |  🥕    |  |  🍅    |  |  🧅    |  |  🥒    |
  | 배추    |  | 당근    |  | 토마토  |  | 양파    |  | 오이    |
  | 채소    |  | 채소    |  | 채소    |  | 채소    |  | 채소    |
  +--------+  +--------+  +--------+  +--------+  +--------+
```

#### Key specs
- Tab bar: horizontal flex, `gap: 0`, each tab `padding: 12px 20px`
- Tab label: `white-space: nowrap`, count badge inline with `margin-left: 8px`
- Active tab: bottom border + brand color text
- Toolbar: flex row, search left, controls right
- Ingredient grid: 5 columns at 1280px, 6 at 1440px+ (as current)
- Card: held = white background + brand badge, out = bg-alt + muted badge
- Card click = toggle held status

### 6.5 RECIPEBOOKS

#### Current problems
- `.recipebook-grid` and `.recipebook-mosaic` classes are referenced in JSX but not defined in any CSS file
- This causes the huge vertical image stacks and tiny text
- Image mosaic layout is entirely missing

#### Phase 1 target layout (1280px)

```
  [< 마이페이지] / 레시피북

  레시피북
  자동 분류된 시스템 북 3개와 커스텀 북...    [새 레시피북]

  자동 분류
  +----------+  +----------+  +----------+
  | [mosaic] |  | [mosaic] |  | [mosaic] |
  | 저장한    |  | 내가 추가한|  | 좋아요한  |
  | 38개     |  | 12개     |  | 5개      |
  +----------+  +----------+  +----------+

  커스텀
  +----------+  +----------+  +----------+
  | [mosaic] |  | [mosaic] |  | [mosaic] |
  | 한식 모음 |  | 다이어트  |  | 간단 요리 |
  | 8개      |  | 5개      |  | 3개      |
  +----------+  +----------+  +----------+
```

#### Key specs -- NEW CSS REQUIRED
```css
.recipebook-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
@media (min-width: 1440px) {
  .recipebook-grid { grid-template-columns: repeat(4, 1fr); }
}

.recipebook-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.recipebook-card:hover {
  box-shadow: var(--shadow-card);
  transform: translateY(-2px);
}

.recipebook-mosaic {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  aspect-ratio: 4/3;
  background: var(--image-placeholder);
}
.recipebook-mosaic-cell { overflow: hidden; }
.recipebook-mosaic-cell img { width: 100%; height: 100%; object-fit: cover; }
.recipebook-mosaic-cell.pos-0 { grid-row: 1 / 3; } /* large left cell */

.recipebook-card-body {
  padding: 14px 16px;
}
.recipebook-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  word-break: keep-all;
}
.recipebook-card-meta {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 4px;
}
```

---

## 7. Implementation Guidance for Codex

### CSS Consolidation Strategy

#### Phase 1 action: merge into 2 files

**Current state**: 4 CSS files loaded in order:
1. `styles.css` -- base tokens, typography, components
2. `styles-patch.css` -- layout overrides, screen containers, planner/shopping/pantry overrides
3. `styles-extra.css` -- new screen styles (meal, menu-add, shopping flow, leftovers, ate list, settings)
4. `styles-home.css` -- home screen specifics, mypage stats

**Target**: Consolidate into 2 files:
1. `styles-system.css` -- tokens, reset, typography, all shared primitives (button, card, dialog, chip, tab, toolbar, state panel, skeleton, toast, lightbox, form controls)
2. `styles-screens.css` -- all screen-specific layouts (home, recipe detail, planner, pantry, mypage, recipebooks, shopping, settings, meal, menu-add, leftovers, ate list)

**Approach**:
- Start by creating `styles-system.css` as the canonical source for all shared primitives.
- Move screen-specific styles from all 4 files into `styles-screens.css`.
- Remove duplicates: `.planner-grid` is defined in both `styles.css:582` and `styles-patch.css:287`. Keep only the patch version (it has the correct column widths).
- Remove duplicates: `.search-bar` is defined in both `styles.css:509` and `styles-home.css:75`. Keep the home version (it has the correct border treatment).
- Remove duplicates: `.recipe-photo-side` is defined twice in `styles-patch.css:130-139`. Keep only the 2x2 grid version.

### Risky / Broken Class Families

| Class family | Problem | Risk level | Fix |
|-------------|---------|------------|-----|
| `.recipebook-grid`, `.recipebook-mosaic`, `.recipebook-mosaic-cell` | **Not defined in any CSS file**. JSX references them but no styles exist. | **Critical** | Add definitions per Section 6.5 spec |
| `.pantry-tab`, `.pantry-tab-count` | **Not defined in any CSS file**. Pantry tabs render as unstyled inline text. | **Critical** | Add tab bar definitions per Section 6.4 spec |
| `.planner-grid` (double definition) | Defined in `styles.css:582` and `styles-patch.css:287` with different column sizes. Cascade wins but confusing. | **Medium** | Remove `styles.css` version |
| `.search-bar` (double definition) | Defined in `styles.css:509` (pill shape, bg-alt) and `styles-home.css:75` (outlined, surface bg). Different visual styles. | **Medium** | Keep home version, rename or remove base version |
| `.recipe-photo-side` (double definition) | Defined twice in same file `styles-patch.css:130-139`. First is `1fr/1fr` rows, second is `1fr 1fr / 1fr 1fr` grid. | **Low** | Keep the 2x2 grid version only |
| `.recipe-layout` | Referenced in JSX (`screens-1.jsx:251`) but **not defined in CSS**. Uses `.recipe-grid` from `styles-patch.css` instead. | **Medium** | Add `.recipe-layout` or update JSX to use `.recipe-grid` |
| `.pantry-head`, `.pantry-toolbar`, `.pantry-search`, `.pantry-toggle-row`, `.screen-lead` | Referenced in JSX but **not defined in CSS** | **Medium** | Add definitions |
| `.planner-page-head`, `.planner-legend`, `.planner-legend-item`, `.planner-legend-dot` | Referenced in JSX but **not defined in CSS** | **Medium** | Add definitions |

### Class families to ADD (new in Phase 1)

| New class | Purpose |
|-----------|---------|
| `.recipebook-grid` | Recipebook card grid (3/4 columns) |
| `.recipebook-mosaic` + `.recipebook-mosaic-cell` | Image mosaic in recipebook card |
| `.pantry-tab` + `.pantry-tab-count` | Pantry category tab bar |
| `.pantry-head` | Pantry screen header flex layout |
| `.pantry-toolbar` + `.pantry-search` | Pantry search/filter bar |
| `.recipe-layout` | Recipe detail two-column container |
| `.login-gate` | LoginGate dialog styling |
| `.confirm-dialog` | ConfirmDialog variant |

### What NOT to Touch (Mobile Regression Risk)

| Area | Why |
|------|-----|
| `:root` CSS custom properties | Global tokens are shared with mobile. Do not rename, remove, or change values. Add new desktop-only tokens with `--desktop-` prefix if needed. |
| `components.jsx` base component definitions | The `Icon`, `Button`, `Chip`, `Dialog`, `StatePanel` etc. are shared. Override their styling via CSS class additions, not by modifying the component logic. |
| `data.jsx` mock data structure | The data shape is shared across all screens. Do not restructure recipe/meal/pantry objects. |
| Font-family declaration | Pretendard Variable is correct and already imported. Do not add or switch fonts. |
| `app.jsx` routing logic | The stack-based navigation model works. Fix screens, not the router. |
| `<meta name="viewport" content="width=1024"/>` | This is intentional for the desktop prototype. Do not change to responsive viewport. |

---

## 8. Acceptance Checklist

### Screenshot Review Criteria

At each of `1024px`, `1280px`, `1440px`:

#### Layout
- [ ] TopNav is fully visible and all tabs fit without wrapping
- [ ] Content is centered with correct max-width and side padding
- [ ] Two-column layouts (recipe detail, planner, shopping detail) have correct column widths
- [ ] Side rails are sticky and do not overlap content
- [ ] No horizontal scrollbar on any screen

#### Typography & Korean Text
- [ ] No Korean syllable orphan breaks in card titles or metadata
- [ ] Card metadata rows are single-line with ellipsis truncation
- [ ] Tab labels never wrap or truncate
- [ ] Badge/pill text never wraps
- [ ] Button labels never wrap
- [ ] `word-break: keep-all` is applied globally

#### Components
- [ ] Pantry category tabs render as a proper tab bar (not concatenated text)
- [ ] Recipebook cards render in a proper grid with image mosaics (not vertical stacks)
- [ ] Photo card hover shows shadow + scale + overlay
- [ ] Dialogs are centered with correct width (520px default, 720px wide)
- [ ] Empty states use StatePanel with icon + title + description + action
- [ ] Loading states use skeleton shimmer

#### Interaction
- [ ] All clickable elements have visible hover state
- [ ] Focus-visible ring (`2px solid var(--brand)`) appears on keyboard navigation
- [ ] Breadcrumb back navigation works on all sub-pages
- [ ] Tab switching works on all tab-root pages

### Console Warning Criteria

- [ ] No `Warning: validateDOMNesting... <button> cannot appear as a descendant of <button>` (currently present in ShoppingFlowScreen where `<Button>` is nested inside `<button className="shopping-flow-card">`)
- [ ] No `Warning: Each child in a list should have a unique "key" prop`
- [ ] No undefined CSS variable warnings
- [ ] No 404 for CSS/JS resources

### Phase 1 Foundation Readiness Criteria

Phase 1 is ready for Phase 2 anchor screen implementation when:

1. **CSS is consolidated** into 2 files (`styles-system.css`, `styles-screens.css`)
2. **All missing class definitions** from Section 7 "Risky / Broken" table are added
3. **`word-break: keep-all`** is applied globally
4. **LoginGate** dialog component exists and is wired to at least one protected action
5. **Recipebook grid** renders correctly at all 3 breakpoints
6. **Pantry tabs** render correctly at all 3 breakpoints
7. **No console warnings** remain from the current known issues
8. **Desktop shell** (TopNav + content frame + page pattern system) works consistently at all 3 breakpoints
9. **Screenshots** are captured at all 3 widths for HOME, RECIPE_DETAIL, PLANNER_WEEK, PANTRY, RECIPEBOOKS, MYPAGE
10. **Mobile below 1024px** is visually unchanged (regression screenshots captured)

---

## Appendix A: Color Token Reference (No Changes)

The Ohou-toned color system is correct and should not be modified:

| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `#00A1FF` | Primary brand, active states |
| `--brand-deep` | `#0085db` | Hover states, strong brand |
| `--brand-wash` | `rgba(0,161,255,0.06)` | Light brand backgrounds |
| `--text-1` | `#2f3438` | Headings |
| `--text-2` | `#424242` | Body text |
| `--text-3` | `#8a8e93` | Meta/captions |
| `--text-4` | `#cfd4d8` | Disabled |
| `--bg` | `#ffffff` | Page background |
| `--bg-alt` | `#f7f9fa` | Section/card backgrounds |
| `--line` | `rgba(0,0,0,0.08)` | Borders |
| `--divider` | `#eef0f2` | Internal dividers |

## Appendix B: File Inventory

| File | Role | Phase 1 action |
|------|------|----------------|
| `styles.css` | Base tokens + primitives | Merge primitives into `styles-system.css` |
| `styles-patch.css` | Layout overrides | Merge into `styles-screens.css` |
| `styles-extra.css` | New screen styles | Merge into `styles-screens.css` |
| `styles-home.css` | Home + mypage specifics | Merge into `styles-screens.css` |
| `components.jsx` | Shared UI primitives | Do not modify logic; may add CSS classes |
| `data.jsx` | Mock data | Do not modify |
| `app.jsx` | Router + modal orchestration | Add LoginGate wiring |
| `screens-1.jsx` | HOME + RECIPE_DETAIL | Update class names if CSS consolidation renames |
| `screens-2.jsx` | PLANNER + PANTRY + MYPAGE + RECIPEBOOKS | Update class names; fix pantry tab JSX if needed |
| `screens-3.jsx` | MEAL + MENU_ADD + SHOPPING + LEFTOVERS + ATE_LIST + RECIPEBOOK_DETAIL + SETTINGS | Fix nested button in ShoppingFlowScreen |
| `modals.jsx` | All modal components | Add LoginGate modal |
| `homecook desktop prototype.html` | Entry point | Update CSS `<link>` tags for new file names |
