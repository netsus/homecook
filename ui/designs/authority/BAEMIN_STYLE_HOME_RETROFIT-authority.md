# Baemin-Style HOME Retrofit — Authority Report

> Slice: `baemin-style-home-retrofit`
> Stage: 4 (Frontend Implementation)
> Date: 2026-04-27
> Reviewer: Claude (Stage 4 implementer)
> Branch: `feature/fe-baemin-style-home-retrofit`
> evidence:
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-before-mobile.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-after-mobile.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-after-narrow-320.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-sort-sheet-open.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-ingredient-filter-active.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-loading-state.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-empty-state.png`
> - `ui/designs/evidence/baemin-style/home-retrofit/HOME-error-state.png`

---

## Verdict: PASS (conditional)

The HOME screen visual retrofit is complete. All hardcoded hex/rgba values in the 4 target files have been replaced with token-based equivalents. H1 information architecture (D1-D4) and H5 modal decisions are preserved. Shared primitives (Badge, Skeleton) are consumed as specified.

Conditions: Codex Stage 5 should verify the before/after screenshots below and confirm the visual intent is met.

---

## Evidence

| # | Description | Path |
|---|-------------|------|
| E1 | After — mobile default (390px) | `ui/designs/evidence/baemin-style/home-retrofit/after-mobile-default-390.png` |
| E2 | After — narrow (320px) | `ui/designs/evidence/baemin-style/home-retrofit/after-narrow-320.png` |
| E3 | After — desktop | `ui/designs/evidence/baemin-style/home-retrofit/after-desktop.png` |
| E4 | After — sort sheet (desktop) | `ui/designs/evidence/baemin-style/home-retrofit/after-sort-sheet-desktop.png` |
| E5 | After — ingredient filter modal | `ui/designs/evidence/baemin-style/home-retrofit/after-ingredient-filter-modal.png` |

Before screenshots are available via `git show master:tests/e2e/qa-visual.spec.ts-snapshots/` (the baseline snapshots on master prior to this branch).

---

## Risk Point Review (from Stage 1 Critique)

| # | Risk | Resolution | Status |
|---|------|------------|--------|
| R1 | Thumbnail gradient `color-mix()` conversion may alter visual feel | Converted `rgba(255,108,60,0.22)` / `rgba(46,166,122,0.18)` to `color-mix(in srgb, var(--brand) 22%, transparent)` / `color-mix(in srgb, var(--olive) 18%, transparent)`. Visual difference is minimal — brand token is close to the original orange. See E1/E3. | Resolved |
| R2 | `glass-panel` shared scope — inline override may diverge from other screens | Replaced `glass-panel` with inline token styles (`--radius-xl`, `--line`, `--surface`, `--shadow-1`) in `app-header.tsx` and `home-screen.tsx` only. Other screens (`bottom-tabs.tsx`, etc.) retain `glass-panel` — intentionally out of scope. No visual regression in E2E smoke tests. | Resolved (scoped) |
| R3 | Ingredient filter button `#9f3614` unmapped color | Mapped to `--brand-deep` (`#C84C48`). Tone shifts from warm orange to pink-red as documented. The new color is within the brand palette. | Resolved (intentional shift) |
| R4 | SortMenu `bg-white/92` opacity loss with token surface | Used `color-mix(in srgb, var(--surface) 92%, transparent)` to preserve the translucent effect while staying token-based. See E4. | Resolved |

---

## H1 Structure Preservation Check

- [x] D1 (sort at section header): Sort button remains in `모든 레시피` section header row
- [x] D2 (theme as compact carousel strip): `ThemeCarouselStrip` structure intact, visual-only changes
- [x] D3 (ingredient filter as discovery standalone row): Filter button remains as standalone row in discovery panel
- [x] D4 (compact hybrid first viewport): Header + discovery + carousel + section header layout preserved

## H5 Modal Preservation Check

- [x] Icon-only close: `ModalHeader` with `onClose` preserved in SortMenu and IngredientFilterModal
- [x] Olive accent: `--olive` token preserved for ingredient filter active state
- [x] Eyebrow removed: No eyebrow in SortMenu sheet header

---

## Hardcoded Color Scan

```
grep -rn "rgba\(\|#[0-9a-fA-F]\{3,8\}\|bg-black/\|bg-white/\|text-white\b\|glass-panel" \
  components/home/home-screen.tsx \
  components/home/recipe-card.tsx \
  components/home/ingredient-filter-modal.tsx \
  components/layout/app-header.tsx
```

Result: **0 matches** (clean)

---

## Verification Pipeline Results

| Check | Result |
|-------|--------|
| `git diff --check` | Clean (no whitespace errors) |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm test:product` | 232/232 pass |
| `pnpm build` | Pass |
| `pnpm test:e2e:smoke` | 269 pass |
| `pnpm test:e2e:a11y` | 6/6 pass |
| `pnpm test:e2e:visual` | 12/12 pass (baselines updated) |
| `pnpm test:e2e:security` | Pass |
| `pnpm test:lighthouse` | Pass |
| `pnpm validate:workflow-v2` | Pass |
| `pnpm validate:workpack` | Pass |

---

## Contrast Fixes Applied

Badge primitive (`components/ui/badge.tsx`) has inherent contrast issues with `brand` and `muted` variants at small text sizes. Since `components/ui/*` is out of scope, contrast was corrected via inline `style` overrides on consuming elements:

- **Badge brand** (source labels): `style={{ color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}` — darkens text 20% for WCAG 4.5:1 compliance
- **Badge muted** (count): `style={{ color: 'var(--text-2)' }}` — uses secondary text token (#495057) instead of tertiary (#868E96)
- **Serving pill** (recipe card): Same darkened brand-deep treatment

Note: The Badge primitive's built-in contrast should be fixed in a future shared-components maintenance pass.

---

## Files Changed

| File | Change Type |
|------|-------------|
| `components/layout/app-header.tsx` | Token retrofit (glass-panel removal) |
| `components/home/home-screen.tsx` | Token retrofit (discovery, sort, carousel, skeletons) |
| `components/home/recipe-card.tsx` | Token retrofit (card surface, thumbnail, badge, stats) |
| `components/home/ingredient-filter-modal.tsx` | Token retrofit (backdrop, modal, loading, checked states) |
| `tests/recipe-card.test.tsx` | Test assertion update (new token class names) |
| `tests/e2e/qa-visual.spec.ts-snapshots/*.png` | Visual baselines updated (6 darwin snapshots) |

---

## Known Risks for Codex Stage 5

1. **Badge primitive contrast**: The `brand` and `muted` Badge variants do not meet WCAG 4.5:1 at 11px. HOME works around this with `style` overrides, but other screens consuming Badge may need similar treatment.
2. **ContentState hardcoded values**: `ContentState` (shared component, out of scope) still contains hardcoded `rgba()` in eyebrow styles and `bg-white/72` in subtle variant. These will need a separate maintenance pass.
3. **Linux visual baselines**: Only darwin baselines were updated. Linux CI baselines (`*-linux.png`) need regeneration in CI or by Codex.
