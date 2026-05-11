# Wave1 Mobile App Baseline

> Status: active for Wave1 mobile 100% prototype parity work
> Created: 2026-05-11
> Prototype source: `ui/designs/prototypes/claude-design-260505-wave1`
> Fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> Reference manifest: `ui/designs/reference/wave1-fixed-prototype/manifest.json`

## Purpose

This document replaces the older MVP mobile visual criteria for Wave1 mobile app re-porting.

For Wave1 mobile porting surfaces, the target is not C2 Bright Kitchen, h6/h7 near-parity, or a `90+` visual verdict. The target is exact visual/layout parity with the fixed Wave1 prototype in the controlled verification environment.

Web redesign is out of scope for this computer. Existing desktop/web UI may be smoke-tested for regressions, but web should not be redesigned by this baseline.

## Authority Order

For Wave1 mobile app porting, apply these authorities in order:

1. MVP official docs and current implementation govern behavior:
   API, DB, route contract, auth, permissions, status transitions, read-only behavior, idempotency, loading, empty, error, and unauthorized states.
2. Fixed Wave1 prototype references govern mobile visual/layout output:
   color, font, type scale, spacing, radius, shadow, density, icon treatment, card/list/sheet geometry, app shell, bottom tab, sticky CTA, and visible copy placement.
3. Legacy MVP visual rules are historical unless explicitly re-adopted for a non-Wave1 or web-only surface.

If prototype behavior conflicts with official MVP behavior, preserve MVP behavior and record the visual/behavior boundary in the parity ledger.

## Agent Binding Rule

For Wave1 mobile porting slices A-F, the following rules override prior design criteria:

1. The fixed prototype SHA `9bf7a34c6b422d0c9981d4c2968e3350d5a28892` is the sole mobile visual/layout source of truth for exact-reference-ready surfaces.
2. Prior MVP token values, C2 Bright Kitchen direction, h6/h7 near-parity standards, and `90+` visual verdict standards do not apply to mobile porting completion criteria.
3. "Approved divergence" is not a valid escape for visual differences that have an exact prototype reference.
4. Prior visual verdict scores and screenshot evidence from merged PRs #373, #374, #376, #379, #381, and #383 cannot be reused as current completion evidence.
5. If this baseline conflicts with `docs/design/design-tokens.md`, `ui/designs/BAEMIN_STYLE_DIRECTION.md`, `docs/engineering/product-design-authority.md`, or screen-level `ui/designs/*.md`, this baseline wins for Wave1 mobile surfaces.
6. For web/desktop or non-Wave1 legacy surfaces, existing docs continue to apply until a separate web redesign plan supersedes them.
7. `ui/designs/reference/wave1-fixed-prototype/manifest.json` and the Wave1 validator must stay in exact parity mode before any service porting PR can be accepted.

## Non-Negotiable Target

For a mobile surface marked `exact-reference-ready`, completion requires all of the following:

- exact fixed prototype reference screenshot exists at `390px` and `320px`;
- screenshot comparison has no unexplained visual differences;
- computed color values match the prototype;
- font family, font size, font weight, line height, and letter spacing match the prototype;
- spacing, padding, margin, radius, border, shadow, and opacity match the prototype;
- key DOM geometry matches the prototype for app bar, card, list row, tab, CTA, modal, sheet, and bottom nav surfaces;
- no unapproved font, icon, image, emoji, or asset substitution remains;
- remaining differences are limited to `functional-contract-required`, `browser-rendering-limited`, `not-in-mobile-scope`, or `not-yet-prototyped`.

`90+`, `95+`, "near-100%", and broad "approved divergence" language is not sufficient for Wave1 mobile 100% parity.

## Controlled Verification Environment

Pixel-level claims are valid only in the controlled capture environment:

- Chromium via Playwright;
- `deviceScaleFactor: 1`;
- viewport `390 x 844` for mobile default;
- viewport `320 x 568` for mobile narrow;
- light color scheme;
- reduced motion;
- stable capture CSS that disables transitions/animations and hides prototype-only capture controls;
- fixed prototype screenshots from `ui/designs/reference/wave1-fixed-prototype/manifest.json`.

Do not claim arbitrary-device pixel perfection. Claim exact parity only inside this controlled environment.

## Prototype Token Baseline

The fixed prototype token values are the Wave1 mobile visual baseline.

### Color

| Role | Prototype token | Value |
| --- | --- | --- |
| Brand primary | `mint` | `#2AC1BC` |
| Brand pressed | `mintDeep` | `#20A8A4` |
| Brand soft | `mintSoft` | `#E6F8F7` |
| Accent | `teal` | `#12B886` |
| Accent light | `tealLight` | `#20C997` |
| Danger / like | `red` | `#FF6B6B` |
| Danger deep | `redDeep` | `#E03131` |
| Warning | `orange` | `#FFB347` |
| Info | `blue` | `#74C0FC` |
| Promo | `promo` | `#FF0000` |
| Text primary | `ink` | `#212529` |
| Text secondary | `text2` | `#495057` |
| Text tertiary | `text3` | `#868E96` |
| Text disabled | `text4` | `#ADB5BD` |
| Border | `border` | `#DEE2E6` |
| Border strong | `borderStrong` | `#343A40` |
| Surface | `surface` | `#FFFFFF` |
| Surface fill | `surfaceFill` | `#F8F9FA` |
| Surface subtle | `surfaceSubtle` | `#F1F3F5` |
| Cook done bg | `cookDoneBg` | `#E8F8E0` |
| Cook done fg | `cookDoneFg` | `#51CF66` |
| Shopping done bg | `shoppingDoneBg` | `#FFEBEB` |
| Shopping done fg | `shoppingDoneFg` | `#FF6B6B` |
| Meal add bg | `mealAddBg` | `#E8F5FF` |
| Meal add border | `mealAddBorder` | `#4DABF7` |
| Meal add fg | `mealAddFg` | `#4DABF7` |

### Legacy MVP vs Prototype Conflicts

These values are the most likely source of repeated partial porting. For Wave1 mobile exact-reference-ready surfaces, the prototype value wins.

| Area | Legacy MVP value | Wave1 mobile prototype value |
| --- | --- | --- |
| App background | `#fff9f2` | `#FFFFFF` |
| Foreground / ink | `#1a1a2e` | `#212529` |
| Brand | `#ED7470` | `#2AC1BC` |
| Brand deep | `#C84C48` | `#20A8A4` |
| Brand soft | `#FDEBEA` | `#E6F8F7` |
| Border | `rgba(0,0,0,0.07)` | `#DEE2E6` |
| Base shadow | `0 2px 10px rgba(0,0,0,0.08)` | `0px 2px 8px rgba(0,0,0,0.08)` |
| UI font | `"Avenir Next", "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif` | `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif` |
| Brand font | none | `"Jua", -apple-system, sans-serif` |
| Completion gate | `90+` or `95+` score, blocker 0 | unclassified visual difference 0 in controlled environment |

### Typography

| Role | Prototype value |
| --- | --- |
| UI font | `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif` |
| Brand font | `"Jua", -apple-system, sans-serif` |
| Display / brand | `22px`, weight `700`, line `1.2` |
| H1 / screen title | `22px`, weight `700`, line `1.3` |
| H2 / section title | `18px`, weight `700`, line `1.3` |
| Body | `14px`, weight `500`, line `1.5` |
| Body emphasis | `14px`, weight `700`, line `1.5` |
| Caption | `12px`, weight `500`, line `1.4` |
| Meta | `11-12px`, weight `500-700`, line `1.3` |

If production cannot import or self-host the exact prototype brand font, the affected surface cannot be marked complete for 100% parity until the font decision is resolved or the prototype reference is refrozen without that font.

### Radius

| Role | Value |
| --- | --- |
| Tiny badge | `4px` |
| Button / input / small thumb | `8px` |
| Card / compact thumb | `12px` |
| Large card / sheet top | `16px` |
| Bottom sheet top in many prototype sheets | `20px` |
| Pill / avatar / round button | `9999px` |

### Shadow

| Prototype token | Value |
| --- | --- |
| `shadowNatural` | `0px 1px 3px rgba(0,0,0,0.04)` |
| `shadowDeep` | `0px 2px 8px rgba(0,0,0,0.08)` |
| `shadowSharp` | `0px 4px 12px rgba(0,0,0,0.10)` |
| `shadowOutlined` | `0px 4px 16px rgba(0,0,0,0.12)` |
| `shadowCrisp` | `0px 8px 24px rgba(0,0,0,0.16)` |

### Spacing

The prototype mostly uses direct pixel values. Extract exact spacing per surface from the prototype source and computed-style audit. Common values include:

| Role | Value |
| --- | --- |
| Micro gap | `4px` |
| Chip/internal gap | `8px` |
| Compact card padding | `12px` |
| Mobile horizontal page padding | `16px` |
| Section rhythm | `20px` |
| Larger section rhythm | `24px` |
| Large split | `32px` |
| Top/safe-area rhythm | `48px` and prototype app-shell offsets |

Do not round prototype spacing to existing MVP spacing tokens when exact values differ.

## Scope Classification

Use these statuses in Phase 2 and later:

| Status | Meaning |
| --- | --- |
| `exact-reference-ready` | 390px and 320px fixed prototype references exist. MVP mobile can be ported and judged for 100% parity. |
| `needs-prototype-freeze` | The prototype surface exists or should exist, but fixed reference screenshots are missing. Create/freeze references before MVP porting. |
| `excluded-functional` | Prototype behavior conflicts with MVP official behavior; visual treatment may be ported but behavior remains MVP-governed. |
| `web-only` | Not part of this mobile app porting effort. |

## Current Exact Reference Set

The current manifest already contains mobile 390px and 320px screenshots for:

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`
- `MENU_ADD`
- `SHOPPING_DETAIL`
- `PANTRY`
- `MYPAGE`
- `SETTINGS`
- `ACCOUNT`
- `LEFTOVERS`

Surfaces such as `ATE_LIST`, `RECIPEBOOK_DETAIL`, `MEAL_SCREEN`, `SHOPPING_FLOW`, `COOK_READY_LIST`, `COOK_MODE`, `PantryAddSheet`, `PantryBundlePicker`, `PlannerAddPopup`, and `SavePopup` need explicit matrix confirmation and may need new reference captures before porting.

## Required Evidence Per Ported Surface

- fixed prototype screenshot paths at 390px and 320px;
- current MVP before screenshots at 390px and 320px;
- after MVP screenshots at 390px and 320px;
- screenshot diff report;
- computed-style audit for token, type, and material values;
- DOM geometry audit for key elements;
- remaining-difference ledger with zero unclassified visual differences;
- functional regression result;
- desktop/web smoke only when shared responsive components are touched.

## Legacy Criteria Supersession

For Wave1 mobile 100% parity work, this document supersedes:

- C2 Bright Kitchen visual token defaults as mobile target values;
- h6/h7 "near-100%" and `90+`/`95+` score gates;
- approved token divergence records such as coral vs mint, warm cream vs white, non-Jua font stack, and olive vs teal;
- design authority passes that were based on historical screenshots from PR #373, #374, #376, #379, #381, or #383.

Those artifacts remain useful history. They are not completion proof for the current mobile re-port.
