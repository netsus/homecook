# marketing-demand-validation Stage 6 operational closeout

## Scope

Stage 6 closes the post-merge operational surface for `/beta` demand validation without opening production lead capture. The work remains fail-closed until Manual Only readiness items are supplied.

## Implemented artifacts

- `docs/marketing/demand-validation-analysis.sql`
- `docs/marketing/demand-validation-result-template.md`
- `scripts/lib/marketing-validation-operations.mjs`
- `scripts/export-marketing-leads.mjs`
- `scripts/purge-expired-marketing-validation.mjs`
- `supabase/migrations/20260831110000_marketing_validation_retention_operations.sql`
- `tests/marketing-validation-operations.test.ts`

## Verified behaviors

- analysis SQL is PII-free and scopes to `campaign_key=weekly_nutrition_2026`, `creative_key=weekly_nutrition_v2`, `attribution_status=paid_allowlisted`
- primary report includes unique paid sessions, accepted submitted leads, duplicate submissions, target-rule mismatch count, Wilson 95% intervals, and diagnostic distributions
- accepted lead export limits each row to `email / consent_version / consented_at`, pages through an exact-count deterministic query, writes only consented accepted leads to `.artifacts/marketing-validation/*.csv`, sets file mode `0600`, escapes spreadsheet formulas, and never prints email or session identifiers to stdout
- retention purge requires a non-PII `--operator-id`, `.artifacts/marketing-validation/*.json` evidence, defaults to dry-run, and requires both `--confirm` and `MARKETING_VALIDATION_ALLOW_PURGE=1` before deletion
- purge deletes only rows whose `retention_until < now`, obtains exact PostgREST counts independent of response row caps, and emits redacted JSON evidence with count, mode, non-PII operator alias, and remaining-expired count only
- `--now` cutoff override remains mock-fixture-only and is rejected in live operator mode
- internal scope migration preserves existing `marketing-validation` access and adds only exact `marketing-validation-purge` GET/DELETE access to `/marketing_validation_sessions`
- mock fixture mode remains explicit CLI-only test support and does not widen runtime route behavior

## Commands run

- `corepack pnpm exec vitest run --config vitest.product.config.ts tests/marketing-validation-operations.test.ts`
- `pnpm audit --prod`

## Results

- `tests/marketing-validation-operations.test.ts`: 1 file, 9 tests passed
- `pnpm audit --prod`: one existing moderate `postcss` advisory via `next > postcss`; no new dependency was added in this Stage 6 slice

## Security review summary

- no confirmed new security finding in the Stage 6 operational code paths
- residual repo dependency advisory is tracked separately from this slice because Stage 6 introduced no dependency change

## Manual Only remains blocked

- operator privacy facts
- canonical `/privacy` production publication and launch-readiness PR1/2/3
- production Turnstile secret / hostname
- production allowlisted origin and ad settings
- edge rate-limit evidence
- `MARKETING_LEAD_PROTECTION_READY=1` production enable approval
- `MARKETING_CAMPAIGN_END_AT` and campaign-end-plus-180-day retention readiness
- separately approved staging/production full-local migration apply with target and backup evidence
- verified beta-invitation sender email and sending domain
- actual iOS Safari smoke
- explicit paid-ads execution approval after every readiness item is green

Production email capture and paid ads remain closed until every Manual Only blocker above is explicitly cleared.
