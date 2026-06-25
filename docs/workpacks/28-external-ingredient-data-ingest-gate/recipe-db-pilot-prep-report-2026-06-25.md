# Recipe DB Pilot Prep Report - 2026-06-25

## Scope

This report records the first execution of the launch recipe DB prep path. It covers:

- existing recipe hygiene read-only report
- FoodSafetyKorea `COOKRCP01` key/response check
- source artifact export
- recipe candidate normalization
- review pack generation
- pilot candidate selection

No production DB writes were performed.

## Commands

```bash
export LOAD_DATE=2026-06-25
export RECIPE_LOAD_DIR=.artifacts/external-recipe-ingest/launch-${LOAD_DATE}

pnpm external:recipes:hygiene-report -- \
  --output-dir "$RECIPE_LOAD_DIR/hygiene" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z"

pnpm external:recipes:live-fetch -- \
  --output-dir "$RECIPE_LOAD_DIR/foodsafety-source" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z" \
  --start-index 1 \
  --end-index 30

pnpm external:recipes:review-pack -- \
  --source-export "$RECIPE_LOAD_DIR/foodsafety-source/live-source-export.json" \
  --output-dir "$RECIPE_LOAD_DIR/review-pack" \
  --target-count 30 \
  --generated-at "${LOAD_DATE}T00:00:00.000Z"
```

## Artifact Outputs

Artifacts are local-only and intentionally under `.artifacts`:

- `.artifacts/external-recipe-ingest/launch-2026-06-25/hygiene/existing-recipe-hygiene-report.md`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/hygiene/existing-recipe-hygiene-report.json`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/foodsafety-source/live-source-export.json`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/foodsafety-source/live-fetch-report.json`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/foodsafety-source/live-fetch-summary.md`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-candidates.json`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-load-risk-report.json`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-load-risk-report.md`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-review-worklist.tsv`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-review.html`
- `.artifacts/external-recipe-ingest/launch-2026-06-25/review-pack/recipe-pilot-selection-2026-06-25.md`

## Existing Recipe Hygiene

Read path: Supabase REST with anon key. No writes.

| Metric | Count |
| --- | ---: |
| Recipes | 13 |
| Recipe sources | 11 |
| Recipe ingredients | 104 |
| Recipe steps | 82 |
| Recipe tags visible to this read path | 1 |
| Flagged recipes | 9 |

Flag counts:

| Flag | Count |
| --- | ---: |
| duplicate_normalized_title | 2 |
| jamo_fixture_like_title | 1 |
| missing_recipe_source_row | 2 |
| missing_system_source_license | 1 |
| short_manual_title_review | 2 |
| thumbnail_without_source_provenance | 6 |

Review items confirmed by the report:

- `ㄴㅇㄹㅇ`: fixture-like manual title, missing source row
- `토블론`: short manual title, missing source row, thumbnail provenance missing
- `서브웨이 뺨치는 오이 참치 샌드위치🥒 #레시피`: duplicate normalized title
- current `system` seed recipe has missing source license/provenance metadata

The `recipe_tags` count is lower than earlier service-role style checks because this run used anon REST reads. Treat it as visible-row evidence for this script, not a full privileged DB count.

## COOKRCP01 Key Check

Current `.env.local` has:

- `DATA_GO_KR_API_KEY`
- `DATA_GO_KR_API_KEY1`

It does not have:

- `FOODSAFETYKOREA_API_KEY`

Result:

| key_source | source_kind | status | rows | note |
| --- | --- | --- | ---: | --- |
| `DATA_GO_KR_API_KEY` | live | failed | 0 | FoodSafetyKorea returned invalid-key HTML alert |
| `DATA_GO_KR_API_KEY1` | live | failed | 0 | FoodSafetyKorea returned invalid-key HTML alert |
| `sample` | sample | ok | 5 | Official sample endpoint returned JSON rows |

Conclusion:

- `DATA_GO_KR_API_KEY*` cannot be reused for FoodSafetyKorea `COOKRCP01`.
- A real `FOODSAFETYKOREA_API_KEY` is required before generating a 20-30 recipe pilot batch.
- The parser/review path was still verified against the official sample response shape.

## Review Pack Result

From 5 sample source rows:

| Metric | Count |
| --- | ---: |
| Candidate recipes | 5 |
| Blocked candidates | 1 |
| Pilot selected | 4 |
| Unresolved ingredient names | 1 |
| Unresolved cooking methods | 1 |
| Weak step rows | 0 |
| Production DB writes | 0 |

Sample pilot candidates:

| Title | Source id | Bucket | Score | Method | Resolved/total ingredients |
| --- | --- | --- | ---: | --- | ---: |
| 사과 새우 북엇국 | 33 | soup_stew | 100 | 끓이기 | 6/6 |
| 방울토마토 소박이 | 31 | side_stir_grill | 100 | 섞기 | 9/9 |
| 부추 콩가루 찜 | 29 | side_stir_grill | 97 | 찌기 | 7/8 |
| 새우 두부 계란찜 | 28 | protein_diet_salad | 100 | 찌기 | 6/6 |

Unresolved ingredient found in sample:

- `요리당`

## Gate Before Pilot Migration

Do not generate a pilot migration yet.

Required before pilot migration:

1. Add `FOODSAFETYKOREA_API_KEY` to `.env.local`.
2. Rerun `pnpm external:recipes:live-fetch` with `--start-index 1 --end-index 200` or another bounded range.
3. Generate review pack from live rows, not sample rows.
4. Review and explicitly approve 20-30 candidates.
5. Generate idempotent pilot migration and guarded rollback SQL from approved candidates only.

## Remaining Risks

- The first real live fetch may expose ingredient strings that need parser tuning beyond the official 5-row sample.
- `요리당` should be added as an ingredient or synonym before it can pass candidate gates.
- Existing recipe cleanup is still a separate guarded decision; this report only flags rows.
- A future migration must not use sample rows as launch seed data.
