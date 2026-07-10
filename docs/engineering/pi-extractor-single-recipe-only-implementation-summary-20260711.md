# Pi Extractor Single-Recipe-Only Implementation And Train Verification

Date: 2026-07-11 KST
Dataset profile: `single-recipe-v1`
Run tag: `pi-single-recipe-only-live-smoke-20260711`

## Outcome

The single-recipe path is implemented and the full `train` profile completed with one output recipe per source video. The semantic gate passed, but deterministic quantity matching remains the primary quality gap.

## Implemented Boundaries

- `--single-recipe-only` makes the holistic pipeline emit exactly one full-video recipe candidate, `r1`.
- The final contract requires exactly one recipe and `candidateId === "r1"`; it applies to holistic, staged, raw, and candidate-only outputs before persistence.
- Source/understanding/draft stages preserve video-wide context. Timeline frame windows remain independent evidence windows rather than recipe splits.
- A confirmed multi-recipe video returns `UNSUPPORTED_MULTI_RECIPE_VIDEO` only after two independent signals. A noisy fallback candidate cannot trigger rejection unless it has a usable ingredient and cooking step, and at least two usable candidates remain.
- In single-only mode, visual-estimate targets are hard-capped at four per recipe and six per video.
- The product import path is opt-in through `YOUTUBE_RECIPE_SINGLE_ONLY=true`; a rejected multi-recipe request creates neither a `youtube_extraction_sessions` row nor a `youtube_extraction_candidates` row.
- Dataset profiles control allowed IDs and expected counts. The renderer permits detailed golden comparison only for `train`; `validation` and `holdout` remain aggregate-only.

## Full Train Result

| Check | Result | Interpretation |
| --- | ---: | --- |
| Dataset profile | 9 expected / 9 available | Profile is valid |
| Final recipe count | 9 / 9 matched | No split or extra recipe in this single-only train profile |
| Forbidden reads | 0 | No golden, previous result, or grade was read during extraction |
| Ingredient F1 | 0.867 | Good but not complete ingredient identity coverage |
| Amount match rate | 0.521 | Main remaining weakness |
| Amount coverage | 0.675 | Many expected quantities were intentionally left blank rather than guessed |
| Step coverage | 0.780 | Generally useful flow, with one weak case |
| Semantic average | 4.111 / 5 | Passed |
| Semantic bottom-2 mean | 3.5 / 5 | Passed at the threshold |
| Semantic minimum | 3 / 5 | Below the individual-case reference of 3.5, so the weak case remains an improvement target |
| Semantic judge errors | 0 | No provider, parse, schema, or timeout failure |

Semantic thresholds are `average >= 4`, `bottom-2 mean >= 3.5`, and the judge reports `threshold_success: true`. The recorded threshold object still lists `minCaseScore: 3.5`, while the current gate uses the successful aggregate policy; treat the 3-point case as a real quality warning rather than a release blocker.

## Why The Score Is Not Uniformly High

1. **Quantities are missing when evidence is weak.** The deterministic grader reports 44 amount deductions: 27 `model_missing` and 17 `unit_mismatch`. The extractor now prefers a blank amount over an invented amount, which is safer, but it depresses amount coverage and match rate.
2. **One source is a full recipe-understanding failure, not just a unit-formatting issue.** `rKfLY_Lg1-Q` (pork kimchi stew) scored ingredient F1 `0.606`, amount match `0`, and step coverage `0.333`. The semantic judge found missing green onion and pepper, extra ingredients, and a mixed-in variant cooking method. This needs timeline-grounded recipe identity and step reconstruction before quantity tuning.
3. **Some otherwise correct recipes need normalization, not more visual guessing.** `eJyoszbyNNQ` (one-pot pasta) had four `unit_mismatch` deductions, while the semantic judge says the core recipe and steps are correct. This is a quantity-expression mapping problem. `J5Rmux3ttaY` (kelp chili paste) had five missing amounts but 0.929 step coverage; it needs better high-value amount recovery.

## Recommended Next Iteration Order

1. Add a quantity-evidence ledger that records each amount as source text, caption speech, on-screen text, or visual estimate, plus normalized unit and confidence.
2. Before estimating visually, route source-poor but recipe-critical amounts to the timeline segment where the ingredient is added. Keep the existing frame-evidence contract; do not fill missing values by default.
3. Expand unit normalization for equivalent kitchen expressions, especially volume and package/serving units, and attach the original expression for audit.
4. For low semantic cases, first rebuild the video-wide story and the ordered action timeline. Only then allow a targeted ingredient/amount repair pass. This prevents a wrong recipe variant from being polished into a more confident wrong answer.
5. Re-run the same 9-video profile and compare each metric to this baseline. Do not tune directly against golden data during extraction.

## External Review

A separate `gpt-5.6-sol` high-effort session reviewed the implementation, requested changes, re-reviewed the accepted fixes, and returned `OK`. The detailed finding log is in `docs/engineering/pi-extractor-single-recipe-only-gpt56sol-review-20260711.md`.

## Remaining Risks

- This verifies the 9-video `train` single-recipe profile only. It does not demonstrate generalization to validation or holdout.
- A semantic score of 4.111 is a useful gate, not proof of exact factual equality; the deterministic quantity metric identifies a concrete weakness hidden by a broadly correct recipe.
- Extractor cache and operational event records may exist before a final single-only multi-recipe rejection. They are not user extraction sessions or candidate ledger rows, and the tested public boundary is preserved.
