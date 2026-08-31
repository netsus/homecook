# MARKETING_DEMAND_VALIDATION authority report

> status: Codex draft skeleton pending final-owner review
> reviewed artifact: `ui/designs/MARKETING_DEMAND_VALIDATION.md`
> source evidence:
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png`
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.md`
> - `ui/designs/MARKETING_DEMAND_VALIDATION.md`
> authority scope: `/beta` mobile-first landing, message-match, state copy, and funnel containment

> evidence:
> - locked ad reference: `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png`
> - mobile default runtime: `ui/designs/evidence/marketing-demand-validation/beta-hero-390.png`
> - mobile narrow runtime: `ui/designs/evidence/marketing-demand-validation/beta-hero-320.png`
> - desktop runtime: `ui/designs/evidence/marketing-demand-validation/beta-hero-1280.png`
> - state set: `ui/designs/evidence/marketing-demand-validation/pending-state-manifest.json`
> - quiz flow runtime: `ui/designs/evidence/marketing-demand-validation/beta-quiz-390.png`
> - result runtime: `ui/designs/evidence/marketing-demand-validation/beta-result-390.png`
> - email runtime: `ui/designs/evidence/marketing-demand-validation/beta-email-390.png`
> - follow-up runtime: `ui/designs/evidence/marketing-demand-validation/beta-followup-390.png`
> - fail-closed runtime: `ui/designs/evidence/marketing-demand-validation/beta-turnstile-fail-closed-390.png`

Runtime evidence now exists for Stage 4 and public Stage 5 returned `APPROVE / FINDINGS_COUNT: 0`. This report stays `hold` only until the fresh final-owner authority review runs.

## authority_precheck

### Verdict

- verdict: `hold`
- blocker count: `1`
- major count: `0`
- minor count: `0`

### Why this is hold

Stage 4 runtime screenshots now exist for the actual /beta surface.
The selected ad evidence is fixed and immutable, and the remaining authority work is:

- mobile default screenshot
- 320px narrow screenshot
- desktop screenshot
- hero state screenshot
- quiz state screenshot
- result state screenshot
- email state screenshot
- follow-up state screenshot
- a rendered check that the 390px crop stays within the approved visible height band
- a rendered check that the optional follow-up remains compact and does not become a second conversion wall

### Precheck notes

- The design brief is narrow enough to be reviewable.
- The landing is intentionally not a full marketing site.
- The crop rule and the copy de-duplication rule are the two most important constraints.
- `Design Status: confirmed` is not allowed from this skeleton alone.
- The hero may reuse the approved ad wording directly, but the crop still cannot recreate the full poster layout.

### Precheck scorecard

| axis | status | note |
|---|---|---|
| mobile UX | ready-for-review | 390px and 320px runtime evidence captured |
| interaction clarity | ready-for-review | quiz/result/email/follow-up stack rendered |
| visual hierarchy | ready-for-review | crop stays phone-only and CTA remains above the fold |
| color/material fit | ready-for-review | runtime screenshots and a11y color-contrast pass captured |
| familiar app pattern fit | ready-for-review | rendered /beta evidence now exists for review |

## public Stage 5

### Review intent

This section is reserved for the public Stage 5 Codex design review after Stage 4 screenshots exist.
It should compare the rendered landing against the locked creative, the copy contract, and the funnel order.

### Stage 5 pass criteria

- blocker `0`
- major `0`
- mobile 390px evidence present
- 320px narrow evidence present
- hero crop remains phone-only and does not duplicate the full ad poster
- quiz/result/email/follow-up states remain in the approved funnel order
- privacy and consent remain visible
- 390px crop height stays inside the approved band
- follow-up remains compact, optional, and skip-first

### Stage 5 evidence placeholders

- `ui/designs/evidence/marketing-demand-validation/beta-hero-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-hero-320.png`
- `ui/designs/evidence/marketing-demand-validation/beta-hero-1280.png`
- `ui/designs/evidence/marketing-demand-validation/beta-quiz-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-result-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-email-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-followup-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-followup-scrolled-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-followup-end-390.png`
- `ui/designs/evidence/marketing-demand-validation/beta-turnstile-fail-closed-390.png`

### Stage 5 outcome

- decision: `APPROVE`
- findings count: `0`
- verdict: `pass`
- blocker count: `0`
- major count: `0`
- minor count: `0`
- Stage 5 confirmed 가능 여부: `가능`
- 한 줄 요약: Hero부터 follow-up까지 모바일 퍼널의 위계, 단계 이동, result-before-email, 대칭 intent, fail-closed 복구, 390px viewport에서 검증한 최대 높이 320px follow-up containment와 localized scroll affordance가 계약과 일치한다.
- next gate: authority-required slice이므로 `Design Status: confirmed` 반영은 fresh `final_authority_gate` 통과 후 수행한다.

## final_authority_gate — fresh Codex task only

### Review intent

This section is reserved for the final independent authority pass.
It must be read after Stage 5, not before it.

### Final gate requirements

- Stage 4 screenshots exist
- public Stage 5 is complete
- the ad crop still reads as proof, not decoration
- no hidden conversion prompts were added
- the control-group path stays dignified
- the optional follow-up stays optional

### Final gate outcome slot

- verdict: `pending`
- blocker count: `TBD`
- major count: `TBD`
- minor count: `TBD`
- confirmed: `no`
- Design Status projection: `pending-review`

### Closeout note

This report is intentionally incomplete. It is a canonical skeleton only, ready to accept future evidence without changing the section order.
