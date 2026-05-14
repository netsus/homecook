# Wave1 Mobile Foundation Spec

> Status: Phase 0 design lock
> Created: 2026-05-14
> Author: Claude (design authority)
> Fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> Baseline authority: `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`
> Responsibility matrix: `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`

## 1. Authority and Scope

### 1.1 Scope

This spec defines the **mobile-scoped Wave1 foundation** for all mobile app surfaces. It governs:

- Bottom tab bar, app shell, screen shell policy
- Typography (UI and brand fonts)
- Color palette and legacy conflict resolution
- Spacing, safe-area, and density
- Radius and shadow
- Modal, sheet, and dialog chrome
- Button, chip, and CTA rules
- Icon policy

### 1.2 Out of Scope

- **No global runtime token replacement.** `app/globals.css` legacy `:root` values (`--background`, `--brand`, `--foreground`, `--font-body`, etc.) are NOT replaced by this spec. Mobile Wave1 surfaces consume Wave1 tokens via `--wave1-*` CSS custom properties or direct Tailwind values. Legacy tokens remain the web/desktop default.
- **No desktop/web redesign.** This spec does not govern desktop or web layout. Existing web/desktop UI is smoke-tested for regressions when shared responsive code changes, but is not redesigned here.
- **No functional/behavioral changes.** API contracts, status transitions, auth, permissions, read-only behavior, and error handling remain MVP-governed per `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`.

### 1.3 Authority Order

1. MVP official docs govern behavior.
2. This spec + fixed prototype reference screenshots govern mobile visual/layout.
3. `WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` governs surface readiness classification.
4. `WAVE1_MOBILE_APP_BASELINE.md` is the token source this spec derives from.

If this spec and the BASELINE conflict, this spec wins (it may refine or constrain BASELINE guidance for implementation clarity). If this spec and the fixed prototype screenshots conflict, record the conflict in Section 12 and escalate before implementation.

## 2. Phase 0 Handoff Gate

### 2.1 Required Artifacts

| Artifact | Owner | Path |
|---|---|---|
| Mobile foundation spec | Claude | `ui/designs/WAVE1_MOBILE_FOUNDATION_SPEC.md` (this file) |
| Touchpoint matrix (tracked handoff) | Codex | `ui/designs/WAVE1_UX_REMEDIATION_TOUCHPOINT_MATRIX.md` |
| Touchpoint matrix (OMX local copy) | Codex | `.omx/context/wave1-ux-remediation-touchpoint-matrix.md` |

### 2.2 Required Completed Sections

Before `$ralph` or `$team` implementation proceeds, ALL of the following sections in this spec must be filled:

1. Bottom tab (Section 3)
2. Screen shell policy (Section 4)
3. Typography and Jua font availability (Section 5)
4. Color palette and CTA rules (Section 6)
5. Spacing and safe-area (Section 7)
6. Radius and shadow (Section 8)
7. Modal / sheet / dialog rules (Section 9)
8. Button / chip rules (Section 10)
9. Icon policy (Section 11)
10. User-request vs prototype conflict notes (Section 12)
11. Known blockers before later phases (Section 13)

### 2.3 Cross-Check Responsibility

- After Claude completes this spec and Codex completes the touchpoint matrix, Codex cross-checks:
  - Surface classifications in the touchpoint matrix match this spec's hidden-tab policy (Section 3.7) and screen shell assignments (Section 4).
  - Reference PNG paths in the touchpoint matrix match the manifest.
  - Token values cited in Phase 1 acceptance match Sections 6-8 of this spec.
- If any discrepancy is found, Codex updates the touchpoint matrix or raises a question to Claude before Phase 1 begins.

## 3. Bottom Tab / App Shell

### 3.1 Tab Bar Structure

| Property | Value |
|---|---|
| Container background | `#FFFFFF` |
| Container border top | `0.5px solid #DEE2E6` |
| Container z-index | `30` |
| Container position | `fixed`, `inset-x-0 bottom-0` |
| Container horizontal padding | `16px` |
| Container top padding | `8px` |
| Container bottom padding | `28px + env(safe-area-inset-bottom)` |
| Desktop breakpoint | Hidden at `>= 1024px` (`lg:hidden`) |
| Grid | 4 columns, max-width `430px`, centered |

### 3.2 Tab Items

| Index | ID | Label | Icon | Destination |
|---|---|---|---|---|
| 1 | `home` | 홈 | House (filled when active) | `/` |
| 2 | `planner` | 플래너 | Calendar with dots (filled dots when active) | `/planner` |
| 3 | `pantry` | 팬트리 | Refrigerator outline with freezer divider and handle | `/pantry` |
| 4 | `mypage` | 마이 | Person silhouette (filled when active) | `/mypage` |

### 3.3 Tab Icon Size

| Property | Value |
|---|---|
| Width | `24px` |
| Height | `24px` |
| CSS class | `h-6 w-6` |

### 3.4 Tab Label Typography

| Property | Value |
|---|---|
| Font size | `11px` |
| Font weight (active) | `700` (bold) |
| Font weight (inactive) | `500` (medium) |
| Line height | Default (single line) |
| Font family | Inherits from body (UI font stack in mobile context) |

### 3.5 Active / Inactive State

| State | Icon treatment | Color |
|---|---|---|
| Active | `fill="currentColor"` (filled shape) | `#2AC1BC` (mint) |
| Inactive | `fill="none"` (outline only) | `#868E96` (text3) |

Both icon and label use the same color value for their respective state.

### 3.6 Pantry Tab Icon Policy

The fixed prototype shows a **container/box icon** (rectangular body with a narrower top handle and a horizontal shelf line), NOT a refrigerator icon. The current implementation in `wave1-mobile-bottom-tab.tsx` matches that prototype.

**Decision for this UX remediation track**: Use a refrigerator icon because the user explicitly identified the current pantry icon as not communicating "pantry/fridge" clearly. This is an intentional UX correction, not a silent parity claim. The affected fixed prototype references must be refrozen, or the responsibility matrix must be updated to explicitly supersede the old reference, before Phase 1 can claim exact visual parity. See Section 12, Conflict Note #1.

Refrigerator icon requirements:

| Property | Value |
|---|---|
| Bounding box | `24px x 24px` |
| Body | Rounded rectangle, stroke width `2`, radius approx `3px` |
| Divider | Horizontal freezer divider around upper third |
| Handle | Short vertical handle line on lower door |
| Active treatment | `fill="currentColor"` or filled accent region only if it remains legible at 24px |
| Inactive treatment | Outline only |

### 3.7 Tab Visibility Policy

The fixed prototype screenshots show the bottom tab bar visible on **all** screens including LOGIN and COOK_MODE. This conflicts with the ralplan Phase 1 description and the user's UX goal for immersive/push screens.

**Fixed prototype observation**:
- `mobile-390-login.png`: Bottom tab visible, 홈 active
- `mobile-390-cook-mode-planner.png`: Bottom tab visible, 플래너 active
- `mobile-390-cook-mode-standalone.png`: Bottom tab visible, 홈 active
- `mobile-390-settings.png`: Bottom tab visible, 마이 active
- `mobile-390-account.png`: Bottom tab visible, 마이 active

**Decision for this UX remediation track**: Follow the user-approved UX remediation policy below. This intentionally changes the fixed prototype behavior, so Phase 1 cannot claim exact parity against the old references until the affected references are refrozen or `WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` is updated to explicitly supersede those reference rows. See Section 12, Conflict Note #2.

| Screen Category | Bottom Tab | Active Tab |
|---|---|---|
| HOME | Visible | 홈 |
| PLANNER_WEEK, MEAL_SCREEN | Visible | 플래너 |
| PANTRY | Visible | 팬트리 |
| MYPAGE | Visible | 마이 |
| RECIPE_DETAIL | Visible | 홈 |
| SETTINGS | Hidden | N/A |
| ACCOUNT | Hidden | N/A |
| LOGIN | Hidden | N/A |
| COOK_MODE_PLANNER | Hidden | N/A |
| COOK_MODE_STANDALONE | Hidden | N/A |
| SHOPPING_FLOW, SHOPPING_DETAIL | Visible | (context-dependent) |
| LEFTOVERS, ATE_LIST | Visible | (context-dependent) |
| MENU_ADD, pickers | Visible | 플래너 |
| MANUAL_RECIPE_CREATE | Visible | 플래너 |
| YT_IMPORT | Visible | 플래너 |

## 4. Screen Shell Policy

### 4.1 General Tab Screens

Screens that show the bottom tab and an optional in-screen header (not the legacy `app-header.tsx` desktop nav).

| Property | Value |
|---|---|
| Background | Varies by screen: `#FFFFFF` for HOME, LOGIN, RECIPE_DETAIL; `#F8F9FA` for PLANNER, PANTRY, MYPAGE, LEFTOVERS |
| Bottom tab | Visible |
| Page padding | `0` (each screen manages its own internal padding) |
| Legacy `.app-shell` padding | Zeroed on mobile via `.wave1-*-shell` CSS overrides |
| Header | Screen-specific inline header, not the global desktop `<AppHeader>` |

### 4.2 Push Screens

Screens accessed by navigation that show a back chevron `<` and a centered title.

| Property | Value |
|---|---|
| Back button | `<` chevron, top-left, tappable area `44 x 44px` minimum |
| Title | Centered, `18px` weight `700` |
| Background | `#FFFFFF` |
| Bottom tab | Hidden in the UX remediation target |
| Examples | SETTINGS (`설정`), ACCOUNT (`계정 정보`), RECIPE_DETAIL (no title bar, hero header) |

### 4.3 Fullscreen Screens

The fixed prototype does NOT show a true fullscreen immersive shell (bottom tab is visible even on COOK_MODE). The UX remediation target changes COOK_MODE to a true fullscreen cooking shell:

| Property | Value |
|---|---|
| Background | `#212529` (ink/dark) |
| Text | `#FFFFFF` (white) |
| Header | Compact: context line (`요리 모드 · 날짜 끼니` or `요리 모드 · 독립 요리`), recipe name, step count |
| Back button | `<` chevron, white, top-left |
| Bottom tab | Hidden |
| Bottom CTA area | `취소` (outline/ghost on dark) + `요리 완료` (mint filled) |

### 4.4 Status Bar Guidance

| Context | Suggested treatment |
|---|---|
| Light background screens | Dark status bar content (default) |
| COOK_MODE dark background | Light status bar content |

Note: Status bar color is a native webview/PWA concern. In Playwright capture it defaults to the Chromium rendering. Implementation should use `<meta name="theme-color">` where applicable.

## 5. Typography

### 5.1 UI Font Stack

```
-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo",
"Malgun Gothic", "Noto Sans KR", sans-serif
```

This is the Wave1 prototype UI font. It replaces the legacy MVP font stack (`"Avenir Next", "Pretendard", ...`) for mobile Wave1 surfaces.

**Implementation**: Mobile Wave1 surfaces should apply this via `var(--wave1-font-ui)` or direct `font-family` style. The legacy `--font-body` in `globals.css` is NOT changed.

### 5.2 Brand Font Stack

```
"Jua", -apple-system, sans-serif
```

### 5.3 Jua Font Availability Decision

**Status: AVAILABLE**

`app/layout.tsx` imports Jua via `next/font/google`:

```tsx
const jua = Jua({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-jua",
  weight: "400",
});
```

The CSS custom property `--font-jua` is set on `<body>`. Jua is self-hosted by Next.js Google Fonts integration and available in production.

**Constraint**: Jua only has weight `400`. The prototype uses brand font at weight `700` for Display role, but since Jua only ships `400`, the visual rendering will use Jua at its single available weight. This is acceptable because browser faux-bold at `font-weight: 700` on Jua produces a recognizably similar result, and refreeze of the prototype is not required for this.

**Usage scope**: Brand font applies to the `Display / brand` typography role only (see Section 5.4). All other text roles use the UI font stack.

### 5.4 Type Scale

| Role | Size | Weight | Line-height | Font | Usage examples |
|---|---|---|---|---|---|
| Display / brand | `22px` | `700` | `1.2` | Brand (`Jua`) | HOME brand title `homecook_`, theme headings |
| H1 / screen title | `22px` | `700` | `1.3` | UI | `오늘은 뭐 해먹지?`, screen names |
| H2 / section title | `18px` | `700` | `1.3` | UI | `테마별 레시피`, `모든 레시피`, section headers |
| Body | `14px` | `500` | `1.5` | UI | Descriptions, list item text, recipe metadata |
| Body emphasis | `14px` | `700` | `1.5` | UI | Selected chip text, bold inline labels |
| Caption | `12px` | `500` | `1.4` | UI | Timestamps, secondary labels, counts |
| Meta | `11-12px` | `500-700` | `1.3` | UI | Tab labels, badge text, fine print |

### 5.5 Allowed Weights

| Weight | Usage |
|---|---|
| `400` | Jua brand font (only available weight). Also acceptable for very light body text if prototype shows it. |
| `500` | Default body, caption, meta, inactive labels |
| `700` | Titles, emphasis, active tab labels, CTAs |

Weights `600` and `800`/`900` are NOT used in the prototype. Do not introduce them.

## 6. Color

### 6.1 Wave1 Palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| Brand primary | `mint` | `#2AC1BC` | Active tab, primary CTA bg, active chip border, links |
| Brand pressed | `mintDeep` | `#20A8A4` | Button hover/pressed state |
| Brand soft | `mintSoft` | `#E6F8F7` | Subtle brand backgrounds, selected chip bg |
| Accent | `teal` | `#12B886` | Secondary accent, success indicators |
| Accent light | `tealLight` | `#20C997` | Light accent variant |
| Danger / like | `red` | `#FF6B6B` | Like heart active, danger backgrounds, destructive CTA |
| Danger deep | `redDeep` | `#E03131` | Destructive actions, delete confirm CTA |
| Warning | `orange` | `#FFB347` | Warning indicators |
| Info | `blue` | `#74C0FC` | Info badges |
| Promo | `promo` | `#FF0000` | Promo markers |
| Text primary | `ink` | `#212529` | Primary text, titles |
| Text secondary | `text2` | `#495057` | Secondary descriptions |
| Text tertiary | `text3` | `#868E96` | Placeholders, inactive tab, disabled-like text |
| Text disabled | `text4` | `#ADB5BD` | Disabled text |
| Border | `border` | `#DEE2E6` | Dividers, card borders, tab bar border |
| Border strong | `borderStrong` | `#343A40` | Strong emphasis borders |
| Surface | `surface` | `#FFFFFF` | White backgrounds, card bg, sheet bg, modal bg |
| Surface fill | `surfaceFill` | `#F8F9FA` | Light gray backgrounds (planner, pantry, mypage) |
| Surface subtle | `surfaceSubtle` | `#F1F3F5` | Subtle fills, input bg |
| Cook done bg | `cookDoneBg` | `#E8F8E0` | Cooking completed indicator bg |
| Cook done fg | `cookDoneFg` | `#51CF66` | Cooking completed indicator fg |
| Shopping done bg | `shoppingDoneBg` | `#FFEBEB` | Shopping completed indicator bg |
| Shopping done fg | `shoppingDoneFg` | `#FF6B6B` | Shopping completed indicator fg |
| Meal add bg | `mealAddBg` | `#E8F5FF` | Meal add context bg |
| Meal add border | `mealAddBorder` | `#4DABF7` | Meal add context border |
| Meal add fg | `mealAddFg` | `#4DABF7` | Meal add context fg |
| Cook mode bg | (direct) | `#212529` | COOK_MODE screen background |

### 6.2 Legacy Conflict Resolution

These legacy values in `globals.css` `:root` must NOT be used by mobile Wave1 surfaces. Mobile components should use `--wave1-*` variables or direct values instead.

| Area | Legacy value (DO NOT use for mobile Wave1) | Wave1 value (USE this) |
|---|---|---|
| App background | `--background: #fff9f2` | `#FFFFFF` (surface) or `#F8F9FA` (surfaceFill) |
| Foreground | `--foreground: #1a1a2e` | `#212529` (ink) |
| Brand | `--brand: #ED7470` | `#2AC1BC` (mint) |
| Brand deep | `--brand-deep: #C84C48` | `#20A8A4` (mintDeep) |
| Brand soft | `--brand-soft: #FDEBEA` | `#E6F8F7` (mintSoft) |
| Danger | `--danger: #C84C48` | `#FF6B6B` (red) or `#E03131` (redDeep) |
| Border | `--line: rgba(0,0,0,0.07)` | `#DEE2E6` (border) |
| Shadow | `--shadow: 0 2px 10px rgba(0,0,0,0.08)` | See Section 8.2 |
| Font | `--font-body: "Avenir Next",...` | See Section 5.1 |

### 6.3 CTA Color Rules

| CTA type | Background | Text | Border | Examples |
|---|---|---|---|---|
| Primary | `#2AC1BC` (mint) | `#FFFFFF` | none | `플래너에 추가`, `요리하기`, `저장`, `필터 적용`, `요리 완료`, `4/23 저녁에 추가` |
| Secondary / ghost | transparent | `#212529` (ink) | `1px solid #DEE2E6` | `취소`, `초기화`, `건너뛰기` |
| Danger | `#FF6B6B` (red) or `#E03131` (redDeep) | `#FFFFFF` | none | `회원탈퇴` bg, `로그아웃` confirm CTA |
| Danger text-only | transparent | `#FF6B6B` | none | `삭제` text action in pantry |
| Disabled primary | `#2AC1BC` at reduced opacity or `#ADB5BD` | `#FFFFFF` | none | Disabled submit buttons |
| Naver login | `#03C75A` | `#FFFFFF` | none | `네이버로 시작하기` |
| Google login | `#FFFFFF` | `#212529` | `1px solid #DEE2E6` | `Google로 시작하기` |

### 6.4 Loading Background

| Property | Value |
|---|---|
| Loading screen background | `#FFFFFF` (surface) |
| Rule | The legacy warm cream `#fff9f2` must not appear on mobile Wave1 loading states. Any loading spinner, skeleton, or fallback screen uses pure white. |

## 7. Spacing / Safe-Area

### 7.1 Common Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `micro` | `4px` | Icon-text gap, tight internal gaps |
| `chip-gap` | `8px` | Chip internal padding, small gaps between elements |
| `compact` | `12px` | Compact card internal padding |
| `page` | `16px` | Horizontal page margin on mobile |
| `section` | `20px` | Vertical rhythm between sections |
| `section-lg` | `24px` | Larger section spacing |
| `split` | `32px` | Major section dividers |
| `top-rhythm` | `48px` | Top safe-area offsets in app shell |

These match the `--space-*` tokens already in `globals.css`.

### 7.2 Bottom Tab Spacing

| Property | Value |
|---|---|
| Tab bar height (content) | `~52px` (min-height per tab item) |
| Tab bar top padding | `8px` |
| Tab bar bottom padding | `28px + env(safe-area-inset-bottom)` |
| Total tab bar visual height | `~88px` + safe-area |
| Page content bottom padding | Content that needs to clear the tab bar should use `padding-bottom: calc(88px + env(safe-area-inset-bottom))` or equivalent |

### 7.3 Sticky CTA Spacing

Screens with a sticky bottom CTA area (like RECIPE_DETAIL `플래너에 추가` + `요리하기`):

| Property | Value |
|---|---|
| CTA container padding | `12px 16px` |
| CTA container background | `#FFFFFF` with top border or shadow |
| CTA container position | Above the bottom tab bar |
| Total clearance | CTA height + tab bar height + safe-area |

### 7.4 Modal / Sheet Internal Spacing

| Property | Value |
|---|---|
| Sheet horizontal padding | `16px - 24px` |
| Sheet top padding (below handle/header) | `20px - 24px` |
| Sheet bottom padding (above CTA) | `16px` |
| Section gap inside sheet | `16px - 20px` |
| CTA row padding | `16px` horizontal, `12px` vertical |

## 8. Radius / Shadow

### 8.1 Radius Scale

| Role | Value | Usage |
|---|---|---|
| Tiny badge | `4px` | Small badges, tiny indicators |
| Button / input | `8px` | Primary/secondary buttons, text inputs, stepper controls |
| Card / compact thumb | `12px` | Recipe cards, list cards, recipe image thumbnails |
| Large card / sheet top | `16px` | Large cards, grouped sections |
| Bottom sheet top | `20px` | Bottom sheet top-left and top-right corners |
| Pill / avatar / chip | `9999px` | Chips, pills, avatar circles, round icon buttons |

### 8.2 Shadow Scale

| Token | Value | Usage |
|---|---|---|
| `shadowNatural` | `0px 1px 3px rgba(0,0,0,0.04)` | Subtle card elevation, list items |
| `shadowDeep` | `0px 2px 8px rgba(0,0,0,0.08)` | Standard card shadow, floating elements |
| `shadowSharp` | `0px 4px 12px rgba(0,0,0,0.10)` | Sheets, elevated panels |
| `shadowOutlined` | `0px 4px 16px rgba(0,0,0,0.12)` | Prominent floating UI |
| `shadowCrisp` | `0px 8px 24px rgba(0,0,0,0.16)` | Modal overlays, highest elevation |

CSS custom properties `--wave1-shadow-natural`, `--wave1-shadow-deep`, `--wave1-shadow-sharp`, `--wave1-shadow-crisp` are already defined in `globals.css`. `shadowOutlined` is not yet aliased; use the direct value.

## 9. Modal / Sheet / Dialog

### 9.1 Bottom Sheet

Bottom sheets are the primary overlay pattern in the prototype.

| Property | Value |
|---|---|
| Top corners radius | `20px` |
| Background | `#FFFFFF` |
| Handle bar | `36px x 4px` centered gray bar at top (`#DEE2E6`), optional per sheet |
| Dim/backdrop | `rgba(0,0,0,0.4)` or equivalent semi-transparent black |
| Close button | `X` icon, `24px`, positioned top-right within header area |
| Animation | Slide up from bottom |
| Max height | `~85vh` with internal scroll |
| Shadow | `shadowCrisp` on the sheet container |

### 9.2 Sheet Header

| Property | Value |
|---|---|
| Title | Left-aligned, `18px` weight `700`, color `#212529` |
| Close icon | `X`, `24px`, top-right, color `#212529` or `#495057` |
| Eyebrow | NOT used. Removed per Wave1 design direction. |
| Padding | `20px 16px 12px 16px` (top, right, bottom, left) |

### 9.3 Sheet Footer / CTA Area

| Property | Value |
|---|---|
| Layout | Horizontal row: secondary (left) + primary (right, flex-grow) |
| Position | Sticky at sheet bottom |
| Padding | `12px 16px` with `env(safe-area-inset-bottom)` if sheet reaches screen bottom |
| Primary CTA | Mint filled, radius `8px`, height `48px`, white text `14px` weight `700` |
| Secondary CTA | Outline/ghost, radius `8px`, height `48px`, ink text `14px` weight `700`, border `#DEE2E6` |
| Button gap | `8px - 12px` |

### 9.4 Center Modal

Used sparingly. The fixed prototype primarily uses bottom sheets.

| Property | Value |
|---|---|
| Radius | `16px` |
| Background | `#FFFFFF` |
| Dim/backdrop | `rgba(0,0,0,0.4)` |
| Max width | `min(calc(100vw - 32px), 400px)` |
| Shadow | `shadowCrisp` |
| Close | `X` icon or no close (dismiss by backdrop tap) |

### 9.5 Confirm Dialog

Confirm dialogs appear as bottom sheets in the fixed prototype (e.g., logout confirm, delete confirm).

| Property | Value |
|---|---|
| Container | Bottom sheet with `20px` top radius |
| Handle bar | Visible, centered |
| Title | Left-aligned, `18px` weight `700` |
| Body text | Left-aligned, `14px` weight `500`, color `#495057` |
| Footer | 2-button row: `취소` (ghost/outline) + action (mint or red filled) |
| Destructive action | `#2AC1BC` (mint) for non-destructive confirms like `로그아웃`, `#E03131` (redDeep) for truly destructive like `회원탈퇴` |

Note from prototype: The `로그아웃` confirm CTA uses mint (not red), because logging out is reversible. Only irreversible destructive actions use red.

## 10. Button / Chip

### 10.1 Primary Button

| Property | Value |
|---|---|
| Height | `48px` |
| Horizontal padding | `24px` |
| Radius | `8px` |
| Background | `#2AC1BC` (mint) |
| Text color | `#FFFFFF` |
| Font size | `14px` |
| Font weight | `700` |
| Pressed | `#20A8A4` (mintDeep) |
| Disabled | Opacity `0.5` or background `#ADB5BD` with `#FFFFFF` text |

### 10.2 Secondary / Ghost Button

| Property | Value |
|---|---|
| Height | `48px` |
| Horizontal padding | `24px` |
| Radius | `8px` |
| Background | `transparent` |
| Text color | `#212529` (ink) |
| Border | `1px solid #DEE2E6` |
| Font size | `14px` |
| Font weight | `700` |

### 10.3 Danger Button

| Property | Value |
|---|---|
| Filled variant | Background `#FF6B6B` or `#E03131`, text `#FFFFFF`, radius `8px` |
| Text-only variant | Background `transparent`, text `#FF6B6B`, no border |
| Usage | `회원탈퇴` = filled danger bg, `삭제` pantry header = text-only danger |

### 10.4 Small / Compact Button

For inline actions like stepper `- / +`:

| Property | Value |
|---|---|
| Size | `32px x 32px` or `36px x 36px` |
| Radius | `8px` (square-ish) or `9999px` (round) per context |
| Icon size | `16px - 20px` |
| Color | Mint outline for active, `#DEE2E6` border for inactive |

### 10.5 Chip

| Property | Value |
|---|---|
| Height | `32px - 36px` |
| Horizontal padding | `12px - 16px` |
| Radius | `9999px` (pill) |
| **Active** background | `#FFFFFF` (white) |
| **Active** border | `1.5px solid #2AC1BC` (mint) |
| **Active** text | `#2AC1BC` (mint), weight `700` |
| **Inactive** background | `#FFFFFF` or `#F8F9FA` |
| **Inactive** border | `1px solid #DEE2E6` |
| **Inactive** text | `#495057` (text2) or `#212529` (ink), weight `500` |
| Font size | `13px - 14px` |

### 10.6 Toggle Switch

From SETTINGS screen:

| Property | Value |
|---|---|
| Track width | `44px` |
| Track height | `24px` |
| Thumb size | `20px` |
| On color | `#2AC1BC` (mint) |
| Off color | `#DEE2E6` |
| Radius | `9999px` |

## 11. Icon Policy

### 11.1 Icon Source

The fixed prototype uses custom inline SVG icons, not an icon library. Implementation should continue this pattern: define SVG icons inline in React components rather than importing from an external icon library.

Where an icon is needed that matches a common shape (home, calendar, user, chevron, close X, search magnifier, heart, bookmark, etc.), draw it as an inline SVG matching the prototype's stroke style and proportions.

### 11.2 Tab Bar Icons

| Tab | Icon description | Stroke width | Active treatment |
|---|---|---|---|
| 홈 | House shape with door cutout | `2` | `fill="currentColor"` |
| 플래너 | Calendar outline with two inner dots | `1.8` | Inner dots `fill="currentColor"` |
| 팬트리 | Refrigerator outline with freezer divider and handle | `2` | `fill="currentColor"` or filled accent region |
| 마이 | Person silhouette (head circle + body arc) | `2` | `fill="currentColor"` |

### 11.3 Active / Inactive Treatment

| State | Treatment |
|---|---|
| Active | `fill="currentColor"` — the icon shape is filled with the active color (`#2AC1BC`) |
| Inactive | `fill="none"` — outline only, stroked with inactive color (`#868E96`) |

### 11.4 Icon Sizes

| Context | Size |
|---|---|
| Tab bar icons | `24px x 24px` |
| Inline action icons (chevron, close X, search, sort) | `20px - 24px` |
| Hero action icons (heart, bookmark, cook-complete on RECIPE_DETAIL) | `24px - 28px` |
| Small indicator icons (clock, servings on RECIPE_DETAIL) | `16px` |
| Sheet close X | `24px` |
| Back chevron `<` | `24px`, stroke width `2` |

## 12. User Request vs Fixed Prototype Conflict Notes

| # | Item | User Request | Fixed Prototype / Official Contract | Decision | Reason |
|---|---|---|---|---|---|
| 1 | Pantry tab icon | 냉장고(refrigerator) 아이콘 사용 | Container/box icon with handle and shelf line | **User-approved UX remediation wins, with reference update required** | The user explicitly identified the current icon as unclear. Phase 1 should use a refrigerator icon, but exact visual parity cannot be claimed against the old fixed reference until the prototype/reference is refrozen or the responsibility matrix explicitly supersedes that old reference row. |
| 2 | Bottom tab hidden on LOGIN / COOK_MODE / SETTINGS / ACCOUNT | Ralplan Phase 1: "LOGIN, SETTINGS, COOK_MODE에는 bottom tab이 없다"; SETTINGS/ACCOUNT are push screens; COOK_MODE should be immersive | Current fixed prototype screenshots show the bottom tab visible on every screen, including LOGIN (`mobile-390-login.png`) and COOK_MODE (`mobile-390-cook-mode-planner.png`, `mobile-390-cook-mode-standalone.png`) | **User-approved UX remediation wins, with reference update required** | Hiding the tab better matches mobile app patterns and the user's explicit audit. Phase 1 may implement this only after the affected references are marked for refreeze/matrix supersession. |
| 3 | Loading background | "따뜻한 누런 톤이 튀지 않게" — remove warm cream | Prototype uses `#FFFFFF` surface throughout. Legacy `#fff9f2` is a CSS-only artifact. | **User and prototype aligned** | Both want white. No conflict. `#FFFFFF` for all mobile loading states. |
| 4 | Recipe tag/category chip filter on HOME | User wants category chips (밥·면, 육류, 해산물...) to filter recipes | Current `GET /recipes` API has no `tag` or `category` filter parameter. This requires API/DB/docs contract evolution. | **Deferred to contract-evolution** | Phase 2 may use UI-only fixture/filter on existing fields. Server-backed filter is a contract-change candidate in the ralplan. |
| 5 | MEAL_SCREEN direct cook mode | User may want to start cooking directly from a meal screen | Official flow requires ready-list (`/cooking/ready`) before cook mode. No direct meal→cook route in 화면정의서 or 유저플로우맵. | **Deferred to contract-evolution** | Requires 화면정의서/유저플로우 review. Listed as contract-change candidate in ralplan. |
| 6 | COOK_MODE fullscreen immersive | Ralplan: "COOK_MODE는 fullscreen shell", user expects immersive dark cooking experience without tab bar | Prototype shows COOK_MODE with dark background (`#212529`) but with the bottom tab bar visible | **User-approved UX remediation wins, with reference update required** | Cooking mode is a high-focus task where accidental tab navigation is harmful. Hide tab and preserve a clear cancel/back path inside the cooking shell. Exact parity closeout requires refreeze or responsibility-matrix supersession. |
| 7 | SETTINGS / ACCOUNT bottom tab | Ralplan: SETTINGS and ACCOUNT should behave as push screens | `mobile-390-settings.png` and `mobile-390-account.png` show bottom tab visible, 마이 active | **User-approved UX remediation wins, with reference update required** | Push screens should emphasize back navigation and avoid showing a peer-level tab bar below destructive/account actions. Exact parity closeout requires refreeze or responsibility-matrix supersession. |

## 13. Known Blockers Before Later Phases

### 13.0 Phase 1 Reference Update / Design-Evolution Classification

Phase 1 intentionally changes several fixed-reference visuals based on the user's UX audit:

- pantry tab icon: container/box -> refrigerator
- LOGIN bottom tab: visible -> hidden
- SETTINGS / ACCOUNT bottom tab: visible -> hidden
- COOK_MODE bottom tab: visible -> hidden

These changes are rational UX improvements, but they do not match the current fixed reference PNGs and the responsibility matrix does not allow unapproved icon substitutions or broad approved divergence. The responsibility matrix now has a narrow `2026-05-14 UX Remediation Supersession` section that authorizes these exact shell/icon changes.

Before Phase 1 final closeout, PR evidence must cite one of these:

1. refreshed fixed prototype references with the new UX direction; or
2. `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` → `2026-05-14 UX Remediation Supersession`.

`user-approved design evolution` may be used as an interim planning/evidence label, but final closeout must cite the matrix supersession or refreshed references. Codex should not silently count unrelated visual differences as passing visual parity.

### 13.1 HOME_SORT_OPEN_STATE Reference Refresh (Pre-Phase 2)

The `WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` notes that `HOME_SORT_OPEN_STATE` reference must be refreshed so the fixed reference uses `조회수순 / 최신순 / 저장순 / 플래너 등록순` instead of the old prototype-only `빠른 조리순`.

**Status**: The current committed reference at `mobile-390-home-sort-open-state.png` may still show the old sort options. Before Phase 2 starts, verify the reference is up to date or recapture via `pnpm capture:wave1-prototype-lock`.

**Blocker level**: Phase 2 cannot claim sort surface parity without a correct reference.

### 13.2 SHOPPING_DETAIL_PANTRY_REFLECT_PICKER Backdrop (Pre-Phase 5)

The responsibility matrix requires this reference to be judged against the pre-complete backdrop (not a completed/read-only shopping detail backdrop).

**Status**: Verify that the committed `mobile-390-pantry-reflect-picker.png` shows the pre-complete state. If it shows the post-complete state, recapture is needed before Phase 5.

**Blocker level**: Phase 5 pantry reflect picker parity.

### 13.3 Recipe Tag Filter Contract (Pre-Phase 2 server filter)

`GET /recipes` currently has no `tag` or `category` filter. If Phase 2 wants server-backed category filtering (beyond UI-only fixtures), a contract-evolution PR must be approved first:

- 요구사항 기준선
- 화면정의서
- API 문서
- DB 설계 (taxonomy table)

**Blocker level**: Phase 2 can proceed with UI-only filtering, but server-backed filtering is blocked until contract-evolution.

### 13.4 MEAL_SCREEN Direct Cook Mode Contract (Pre-Phase 5)

Starting cook mode directly from a meal screen (bypassing the ready list) is not in the official flow documents. If this is desired:

- 화면정의서 amendment
- 유저플로우맵 amendment
- API status transition impact analysis

**Blocker level**: Phase 5 implementation of the direct cook path.

### 13.5 Route-to-Modal Transition for MENU_ADD Entries (Pre-Phase 3)

If MENU_ADD entries (recipe search, recipebook selector, etc.) are changed from full routes to modals/sheets, the official flow documents may need a minor amendment since they describe full route navigation.

**Blocker level**: Low. Phase 3 should verify against 화면정의서 before changing route → modal.

## 14. Phase 4 Placement Rationale

Phase 4 (Manual Recipe Create / YouTube Import) is placed between Phase 3 (Planner / Menu Add / Pickers) and Phase 5 (Shopping / Cooking) for these reasons:

1. **Dependency on Phase 3 foundation**: Manual recipe creation and YouTube import are alternate entry points into the meal-add flow. They consume the modal/picker/servings patterns that Phase 3 establishes (e.g., `recipe-ingredient-add-modal.tsx` follows the same sheet rules).

2. **Lower contract risk than Phase 5**: Unlike shopping/cooking which involves multi-step status transitions (`registered → shopping_done → cook_done`) and complex state boundaries, manual recipe and YT import are self-contained creation flows with minimal state-transition risk. Completing them before the more complex Phase 5 avoids interleaving low-risk visual polish with high-risk state-transition changes.

3. **Foundation token consumption**: YT_IMPORT has known visual issues (background color, step label font weight, CTA color) that depend on Phase 1 foundation tokens being in place. Placing Phase 4 after Phase 3 ensures all visual foundation is stable before these screens are polished.

4. **Clean Phase 5 focus**: By clearing Phase 4 first, Phase 5 can focus entirely on the shopping → cooking → pantry-reflect pipeline without distraction from unrelated recipe-creation screens.
