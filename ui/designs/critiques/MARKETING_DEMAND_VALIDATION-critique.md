# MARKETING_DEMAND_VALIDATION critique

> reviewed artifact: `ui/designs/MARKETING_DEMAND_VALIDATION.md`
> source evidence:
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png`
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.md`
> reviewer: design-critic draft review
> verdict: `PASS`
> severity: blocker `0`, major `0`, minor `0`
> scope: Stage 1 design contract and review evidence only. Implementation, publication, analytics wiring, and final owner approval are not claimed here.

## Summary

The landing brief is tight. It respects the selected weekly nutrition creative, keeps the funnel to one route, and avoids the usual conversion-page noise: no pricing, no testimonials, no login wall, no generic SaaS gradients.

The strongest decision is the split between the phone-only crop and the landing frame. Locked ad wording is reused for message match without turning the page into a duplicate poster.

## Blockers

없음.

## Majors

없음.

## Minors

없음.

## Checklist

- [x] The landing route is single-purpose and campaign-scoped.
- [x] The hero is derived from the selected ad instead of copying the full poster.
- [x] The hero reuses the locked ad CTA wording, while the phone-only crop excludes the poster CTA and full poster layout.
- [x] The quiz has five single-choice questions and a clear progress model.
- [x] Neutral control-group copy is explicit and non-shaming.
- [x] The result appears before the email gate.
- [x] The email step is minimal and consent-aware.
- [x] Follow-up remains optional and post-lead.
- [x] The copy contract keeps privacy visible.

## Final Pass / Hold

`PASS`

Applied repair:

- locked the hero to the approved ad-aligned copy set;
- removed the rule that the landing H1/CTA must differ from the ad;
- capped the 390px and 320px crop visibility so the crop cannot crowd out the first quiz question;
- capped the follow-up block to a compact optional panel with a single-line skip action and a visible-height limit.

This is now a clean Stage 1 draft. The remaining gate is runtime evidence, not design-contract ambiguity.
