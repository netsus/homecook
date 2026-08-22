# Stage 1 contract-evolution approval evidence — 2026-08-22

## Scope

- Slice: `personal-recipe-customization-write-core` (#6)
- Task role: docs re-lock / contract-evolution sync
- Status at approval time: `in-progress`

## Approved contract

- Official tuple:
  - `docs/요구사항기준선-v1.7.33.md`
  - `docs/화면정의서-v1.5.37.md`
  - `docs/유저flow맵-v1.3.35.md`
  - `docs/db설계-v1.3.35.md`
  - `docs/api문서-v1.2.40.md`
- Line counts:
  - requirements `1557`
  - screens `2092`
  - flow `2301`
  - DB `3277`
  - API `5577`
- SHA-256:
  - requirements `a859887e3efa76f50a96d4140d9f726e1ebef2cd43ae75ad1b057a1e0b973102`
  - screens `07fc92a5ad6f112c0464e375c6cc994c91fe65598aa9b73f44790994720079c9`
  - flow `811ba58201f31ad98fe37f8ebfe8c2f02d14962e0a2fa2beb86676c1824343f7`
  - DB `9d218325b08674fabbf723f4492aeceab01fbbd3a90c2516f171b3f067431f25`
  - API `b50ffe241ec33bd186412772d058199c3701007074ff34c10576fd6602bf144b`
- Core approval:
  - `POST /recipes` is a strict request union.
  - Legacy manual variant keeps current compatibility and rejects personal-only fields.
  - Personal-derived variant requires UUID `Idempotency-Key` plus exact `origin_recipe_id`, `base_recipe_revision`, `draft`, `image_object_id`.
  - Server derives fork vs save_as_new from source state.
  - Personal-derived success returns exact `{ id, revision }` only.
  - Server-only `snapshot_v2` may project ephemeral fork context for the existing `RECIPE_DETAIL` consumer; this is not public API.
  - Guest public fork intent stores only recipeId; login return must reload canonical public source and re-project fresh ephemeral fork context, failing closed for inaccessible/deleted/quarantined/stale source.

## Boundary

- Implementation, E2E, Stage 6 and Manual / R+2 activation remain pending.
- No production, staging, remote, migration or capability activation was performed by this docs sync.
