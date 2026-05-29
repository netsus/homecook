# Acceptance

- Extracting a multi-recipe caption/transcript returns `multi_recipe_status="multiple"` and at least two `recipe_candidates`.
- Parent multi extraction stores `session_kind="multi_parent"` and inserts candidate ledger rows.
- Registering or ingredient-registering a parent multi session returns `CANDIDATE_PROMOTION_REQUIRED`.
- Selecting a candidate creates a `candidate_child` draft and keeps parent/candidate provenance.
- Registering a child draft marks the parent candidate ledger row `registered`.
- Recipio-style quick import does not auto-register multi-candidate extracts.
- No implementation path returns Recipio fixture data or video ID-specific recipe payloads.
- Public docs describe the additive API/DB/UI contract.
