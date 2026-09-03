# MARKETING_DEMAND_VALIDATION_V2 Product Design QA

- source visual truth: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
- source screens: `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final/`, `final-v4/`, `final-v5/`
- implementation evidence: `ui/designs/evidence/marketing-demand-validation-v2/`
- viewport: `393×852` primary, `390×844`, `320×568`, `1280×900`
- density: source and implementation normalized to `393×852`, `deviceScaleFactor=1`
- state: Hero default, normal eyeballing result, planner_homecook, beta_form

## Full-view comparison evidence

- `comparisons/hero-source-vs-port.png`
- `comparisons/result-source-vs-port.png`
- `comparisons/planner-homecook-source-vs-port.png`
- `comparisons/beta-source-vs-port.png`

The comparison images place the exact source screenshot and the current Next.js capture in one image. Device bezel, status bar, home indicator, and source-only runtime chrome are intentionally excluded from the operating port and are not scored as app-owned differences.

## Focused fidelity review

- Fonts and typography: the app runtime Avenir Next/Pretendard stack, blue headline hierarchy, result title/quote, compact planner labels, and beta form hierarchy match the selected source closely. The operating shell keeps readable 16px form text and 44px controls.
- Spacing and layout rhythm: 20px mobile inset, compact vertical rhythm, card/panel radii, planner summary cards, week strip, today card, TomorrowPreview, and CTA order match. `320×568` uses the same single vertical scroller without horizontal overflow.
- Colors and tokens: `--brand-primary`, hover/soft variants, white surfaces, gray secondary text, and semantic error colors are used; legacy coral/cream values were not introduced.
- Image quality and assets: all visible Hero, character, food, macro, product, brand, and share raster assets come from exact source commit `63f8ef2a…`; no placeholder or CSS-drawn replacement is used. Image rights remain a separate Manual Only production blocker.
- Copy and content: exact q1..q4, four result titles/copy, experience fixture values, planner totals, `제품 예시`, non-affiliation copy, consent copy, and done copy are present.

Focused region comparison was not required beyond the four composites because each is an equal-density full mobile viewport and the important text, asset crop, controls, and card geometry are legible at original resolution.

## Comparison history

### Iteration 1 — blocked

- P2: default Hero lacked the source brand overlay and used a black headline.
- P2: planner lacked summary cards/week strip/meal metadata and rendered TomorrowPreview vertically.
- P2: beta invitation was vertically stacked and its assets were not loaded before capture.
- Fixes: restored the Hero overlay and blue hierarchy; added source-like planner cards, week strip, meal metadata, read-only add affordances, and horizontal TomorrowPreview; changed beta invitation to the source horizontal card; waited for raster assets before capture.

### Iteration 2 — passed

- post-fix evidence: the four `comparisons/*-source-vs-port.png` files above
- P0/P1/P2 remaining: none
- P3: source-only device chrome and decorative arrow/star/quote treatments are not shipped; TomorrowPreview `+` is visibly disabled to satisfy the operating read-only contract.

## Browser verification

- in-app Browser: `393×852` known-result read-only preview opened and inspected
- primary interaction: read-only result CTA/share controls and semantic structure checked
- console: fresh-tab errors/warnings `0`
- deterministic Playwright: complete v2 flow, error recovery, share URL, reduced motion, and 320/390/393/desktop evidence captured

## Findings

No actionable P0/P1/P2 findings remain. The two P3 differences are intentional operating constraints and do not reduce usability or source fidelity.

final result: passed
