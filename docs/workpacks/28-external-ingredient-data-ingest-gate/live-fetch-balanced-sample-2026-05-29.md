# Slice 28 Public Data Balanced Live Sample - 2026-05-29

## Scope

공공데이터포털 인증키 반영 후 식약처/RDA live source를 작은 균형 샘플로 가져와 candidate quality를 확인했다.

실행 범위:

- 식약처 `전국통합식품영양성분정보(가공식품)표준데이터`: 30 rows
- RDA `농식품 국가표준식품성분정보 조회 서비스`: 13개 식품군 x 5 rows
- RDA group codes: `A,B,D,E,F,G,I,J,K,L,M,N,R`

## Command

```bash
pnpm external:ingredients:live-fetch -- --providers mfds,rda --output-dir .artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z --rda-groups A,B,D,E,F,G,I,J,K,L,M,N,R --mfds-rows 30 --rda-page-size 5
```

## Result

- successful providers: 14 / 14
- source export rows: 95
- candidate rows: 95
- pending review: 95
- needs source check: 0
- approved rows: 0
- production DB writes: 0

Source split:

- `mfds`: 30 rows
- `rda`: 65 rows

Category candidate split:

| Category | Count |
| --- | ---: |
| 곡류 | 22 |
| 기타 | 22 |
| 양념 | 13 |
| 육류 | 12 |
| 채소 | 11 |
| 해산물 | 10 |
| 유제품 | 5 |

RDA group split:

| Group | Label | Rows |
| --- | --- | ---: |
| A | 곡류 및 그 제품 | 5 |
| B | 감자 및 전분류 | 5 |
| D | 두류 | 5 |
| E | 견과 및 종실류 | 5 |
| F | 채소류 | 5 |
| G | 버섯류 | 5 |
| I | 육류 | 5 |
| J | 난류 | 5 |
| K | 어패류 및 기타 수산물 | 5 |
| L | 해조류 | 5 |
| M | 우유류 및 유제품 | 5 |
| N | 유지류 | 5 |
| R | 조미료류 | 5 |

## Candidate Quality Notes

- Duplicate candidate count is high: 70 / 95.
- This is expected for RDA because source rows often differ by variety/prep details while the current deterministic candidate intentionally collapses to a canonical ingredient name.
- Examples: `감자` 5 rows, `귀리` 3 rows, `김` 4 rows, `분유` 4 rows.
- MFDS processed-food rows produce many broad processed category names such as `견과류 가공품`, `비스킷 쿠키 크래커`, `기타 사탕`, `초콜릿과자`.
- These MFDS candidates are useful as source evidence, but should not be auto-promoted as canonical ingredients without review.
- The current review gate is doing the right thing: every candidate stays `pending_review`, and approved seed rows remain `0`.

## Generated Artifacts

- `.artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/live-fetch-report.json`
- `.artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/live-source-export.json`
- `.artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/candidate-report.json`
- `.artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/approved-seed-promotion-artifact.json`
- `.artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/live-fetch-summary.md`

## Recommendation

The next production-facing step should still be review, not direct ingest:

1. Keep live fetch output file-backed.
2. Use deterministic review decision input for selected approved fingerprints.
3. Promote only manually approved canonical names to seed artifact.
4. Treat MFDS processed broad category names as review-heavy candidates.
5. Treat RDA duplicate clusters as canonical-name candidates that need duplicate-aware approval.

## Initial Conservative Review

An initial conservative approval decision artifact was created at:

- `docs/workpacks/28-external-ingredient-data-ingest-gate/review-decisions-initial-rda-core-2026-05-29.json`

Selection rule:

- mostly RDA source only
- one fingerprint per `normalized_name`
- simple recipe ingredient names only
- broad MFDS processed-food category names excluded unless explicitly reviewed
- user-approved additions: one MFDS `햄` fingerprint and one RDA `땅콩 버터` fingerprint
- `다시마 육수` is not promoted as `다시마`; exact `다시마` source evidence was not found in the sampled RDA/MFDS data

Approved seed candidates:

| Name | Category |
| --- | --- |
| 귀리 | 곡류 |
| 기장 | 곡류 |
| 감자 | 곡류 |
| 강낭콩 | 곡류 |
| 녹두 | 곡류 |
| 도토리 | 곡류 |
| 도토리묵 | 곡류 |
| 가지 | 채소 |
| 달걀 | 육류 |
| 햄 | 육류 |
| 다랑어 | 해산물 |
| 고등어 | 해산물 |
| 김 | 해산물 |
| 고추기름 | 양념 |
| 들기름 | 양념 |
| 땅콩 버터 | 양념 |
| 간장 | 양념 |
| 겨자 | 양념 |

Dry-run result:

- approved seed rows: 18
- skipped rows: 77
- needs source check: 1 (`다시마 육수`)
- rejected rows: 1 (duplicate `햄` fingerprint)
- production DB writes: 0

Dry-run output:

- `.artifacts/external-ingredient-ingest/reviewed-seed-candidates-initial-rda-core-user-additions-2026-05-29/candidate-report.json`
- `.artifacts/external-ingredient-ingest/reviewed-seed-candidates-initial-rda-core-user-additions-2026-05-29/approved-seed-promotion-artifact.json`

## Seed Promotion Migration

Approved artifact rows were compared against existing ingredient seed migrations before DB promotion.

Migration:

- `supabase/migrations/20260530001000_28_external_ingredient_seed_promotion.sql`

Promotion rule:

- insert only approved canonical ingredients that are not already present in existing seed migrations
- use `on conflict (standard_name) do nothing`
- do not overwrite existing categories/default units
- do not promote held source rows

Promoted rows:

| Name | Category |
| --- | --- |
| 귀리 | 곡류 |
| 기장 | 곡류 |
| 강낭콩 | 곡류 |
| 녹두 | 곡류 |
| 도토리 | 곡류 |
| 도토리묵 | 곡류 |
| 가지 | 채소 |
| 다랑어 | 해산물 |
| 고등어 | 해산물 |
| 고추기름 | 양념 |
| 땅콩 버터 | 양념 |
| 겨자 | 양념 |

Approved but not inserted because existing seed migrations already provide the row:

- `감자`
- `달걀`
- `햄`
- `김`
- `들기름`
- `간장`

Held:

- `다시마 육수` remains `needs_source_check`; it is not promoted as `다시마`.

Remote apply and smoke:

- `supabase db push --linked --dry-run` showed only `20260530001000_28_external_ingredient_seed_promotion.sql`.
- `supabase db push --linked --yes` applied the migration to project `vfubnhtawezmheylfhsv`.
- Remote DB smoke found all 12 promoted rows and confirmed held row `다시마 육수` was not inserted.
- Existing curated rows were preserved by `on conflict do nothing`: `감자`, `달걀`, `햄`, `김`, `들기름`, `간장`.
- API smoke found the promoted rows through `GET /api/v1/ingredients`: `땅콩 버터`, `귀리`, `고등어`.
- 30 URL real app-route smoke after promotion: `validate 30/30`, `extract 30/30`, `review 30/30`, `author_comment 4/30`, `register 9/30`, cleanup remaining recipe/session rows `0/0`.
- App-route smoke report: `docs/workpacks/29-youtube-author-comment-fallback/real-app-route-smoke-2026-05-30.md`.
