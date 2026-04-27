# Exploratory QA — Baemin-Style HOME Retrofit

> Date: 2026-04-27
> Tester: Claude (Stage 4)
> Branch: `feature/fe-baemin-style-home-retrofit`

---

## Scope

Visual-only token swap on HOME screen. No behavior changes expected.

## Test Matrix

| # | Scenario | Viewport | Result | Notes |
|---|----------|----------|--------|-------|
| Q1 | Home loads with themes + recipe list | mobile 390 | Pass | Discovery panel, carousel, recipe grid all render with new tokens |
| Q2 | Home loads with themes + recipe list | desktop 1280 | Pass | Grid layout intact, sort button functional |
| Q3 | Home loads with themes + recipe list | narrow 320 | Pass | No horizontal overflow, cards wrap correctly |
| Q4 | Search by title filters recipe list | mobile | Pass | Section shell preserved, themes hidden |
| Q5 | Ingredient filter opens modal | mobile | Pass | Modal backdrop, drag indicator, search bar use tokens |
| Q6 | Ingredient selection + apply | mobile | Pass | Checked state uses `--olive` + `--surface` text, active filter summary bar renders |
| Q7 | Sort menu opens (mobile sheet) | mobile | Pass | Sheet backdrop, shadow, drag indicator all token-based |
| Q8 | Sort menu opens (desktop dropdown) | desktop | Pass | Dropdown with `--shadow-3`, `--radius-lg` |
| Q9 | Loading skeleton (initial) | mobile | Pass | Skeleton primitive renders, no `bg-white/*` artifacts |
| Q10 | Empty state | mobile | Pass | ContentState renders (unchanged, out of scope) |
| Q11 | Error state + retry | mobile | Pass | ContentState error tone renders, retry reloads |
| Q12 | Theme carousel horizontal scroll | mobile | Pass | Scroll snap works, right-fade gradient uses `--background` |
| Q13 | Recipe card hover | desktop | Pass | `-translate-y-1` + `--shadow-2` transition |
| Q14 | Recipe card source badge | all | Pass | Badge brand variant with contrast fix |
| Q15 | Recipe card serving pill | all | Pass | Token-based border/bg/text with contrast fix |
| Q16 | Recipe card stats pills | all | Pass | `--surface-fill` background, `--radius-full` |
| Q17 | Active filter clear button | mobile | Pass | `--surface` 88% translucent, `--radius-full` |
| Q18 | A11y axe scan — home | all 3 | Pass | 0 violations |
| Q19 | A11y axe scan — ingredient filter | all 3 | Pass | 0 violations |

## Issues Found

None.

## Regression Check

- [x] E2E smoke: 269 pass
- [x] Product tests: 232 pass
- [x] A11y: 6 pass
- [x] Visual: 12 pass (baselines updated)
- [x] Lighthouse: Pass
