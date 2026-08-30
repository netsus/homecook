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
> - mobile default runtime: `ui/designs/evidence/marketing-demand-validation/pending-mobile-390.png`
> - mobile narrow runtime: `ui/designs/evidence/marketing-demand-validation/pending-mobile-320.png`
> - desktop runtime: `ui/designs/evidence/marketing-demand-validation/pending-desktop-1280.png`
> - state set: `ui/designs/evidence/marketing-demand-validation/pending-state-manifest.json`

The `pending-*` runtime paths are required placeholders, not completion evidence. They must exist and replace this note before `pass` or `confirmed` is allowed.

## authority_precheck

### Verdict

- verdict: `hold`
- blocker count: `1`
- major count: `0`
- minor count: `0`

### Why this is hold

This skeleton has the correct shape, but it does not yet include runtime screenshots for the actual /beta surface.
The selected ad evidence is fixed and immutable, yet the authority review still needs:

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
| mobile UX | pending | Needs rendered 390px and 320px evidence |
| interaction clarity | pending | Needs the quiz/result/email state stack rendered |
| visual hierarchy | pending | Needs proof that the crop does not overpower the CTA or push quiz entry below the fold |
| color/material fit | pending | Needs runtime confirmation that the utilitarian blue/white palette reads cleanly |
| familiar app pattern fit | pending | Needs a real /beta render, not just the wireframe |

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

- `ui/designs/evidence/marketing-demand-validation/<pending>-mobile.png`
- `ui/designs/evidence/marketing-demand-validation/<pending>-mobile-narrow.png`
- `ui/designs/evidence/marketing-demand-validation/pending-desktop-1280.png`

### Stage 5 outcome slot

- verdict: `pending`
- blocker count: `TBD`
- major count: `TBD`
- minor count: `TBD`
- Stage 5 confirmed 가능 여부: `TBD`

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
- Design Status projection: `temporary`

### Closeout note

This report is intentionally incomplete. It is a canonical skeleton only, ready to accept future evidence without changing the section order.
