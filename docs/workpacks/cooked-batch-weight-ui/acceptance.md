# Acceptance Checklist

> Stage 1 locks future UI and design evidence. Unchecked items do not claim runtime, refreshed design, browser evidence or #12 meal-log UI exists.

## COOK_MODE Completion

- [ ] planner/standalone snapshot-v2 completion keeps exact pantry row selection and exact-one weight action <!-- omo:id=accept-batch-weight-ui-complete-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] copy says original food-only total and excludes pot/container/plate <!-- omo:id=accept-batch-weight-ui-food-only-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] container helper is local-only and submits only positive `finished_weight_g` <!-- omo:id=accept-batch-weight-ui-container-helper;stage=4;scope=frontend;review=5,6 -->
- [ ] weigh-later submits null grams without estimate or meal evidence <!-- omo:id=accept-batch-weight-ui-weigh-later;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/pending/error/replay remain fail-closed and preserve safe inputs <!-- omo:id=accept-batch-weight-ui-completion-states;stage=4;scope=frontend;review=5,6 -->
- [ ] creation-off existing v2 read/cancel/complete drain remains usable <!-- omo:id=accept-batch-weight-ui-v2-drain;stage=4;scope=frontend;review=3,5,6 -->

## Delayed Weight / Unrecoverable

- [ ] missing+available exposes original whole-food weight or explicit unknown action <!-- omo:id=accept-batch-weight-ui-missing-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] delayed weight requires confirmation that no eating/discard happened <!-- omo:id=accept-batch-weight-ui-delayed-confirm;stage=4;scope=frontend;review=3,5,6 -->
- [ ] unrecoverable confirmation states irreversibility and nutrition/log impact <!-- omo:id=accept-batch-weight-ui-unrecoverable-confirm;stage=4;scope=frontend;review=3,5,6 -->
- [ ] unrecoverable success/409 removes gram input/logging and never offers restore/reversal <!-- omo:id=accept-batch-weight-ui-unrecoverable-lock;stage=4;scope=shared;review=3,5,6 -->

## Batch Actions / Display

- [ ] known+available shows authoritative finished/remaining g and eligible actions <!-- omo:id=accept-batch-weight-ui-known-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] #12 consumed-amount CTA is absent until #12 is separately merged and enabled <!-- omo:id=accept-batch-weight-ui-no-consume-preclaim;stage=4;scope=frontend;review=5,6 -->
- [ ] discard requires grams/reason/revision and creates no meal entry or XP <!-- omo:id=accept-batch-weight-ui-discard;stage=4;scope=shared;review=3,5,6 -->
- [ ] adjustment requires delta/reason/revision and cannot deplete/reopen/exceed bounds <!-- omo:id=accept-batch-weight-ui-adjust;stage=4;scope=shared;review=3,5,6 -->
- [ ] discard and negative adjustment confirm amount/reason/result, offer cancel, block duplicate submit and restore invoking focus <!-- omo:id=accept-batch-weight-ui-destructive-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] unweighed close requires consumed/discarded/mixed and explicit no-nutrition confirmation with cancel <!-- omo:id=accept-batch-weight-ui-close-unweighed;stage=4;scope=shared;review=3,5,6 -->
- [ ] only eligible current closure can cancel; no generic reopen or marker reversal <!-- omo:id=accept-batch-weight-ui-no-reopen;stage=4;scope=shared;review=3,5,6 -->
- [ ] all six weighted/unweighed depleted labels are distinct and only consumed variants project eaten/XP <!-- omo:id=accept-batch-weight-ui-depleted-copy;stage=4;scope=shared;review=3,5,6 -->
- [ ] discard/adjust/close stay hidden until Train D reader cutover is green <!-- omo:id=accept-batch-weight-ui-cutover-gate;stage=2;scope=shared;review=3,6 -->
- [ ] partial/unavailable stays explicit; missing weight never becomes zero/estimated nutrition <!-- omo:id=accept-batch-weight-ui-nutrition-truth;stage=4;scope=frontend;review=5,6 -->
- [ ] empty LEFTOVERS has safe Planner return only; every depleted state is read-only with all mutation CTAs absent <!-- omo:id=accept-batch-weight-ui-empty-depleted;stage=4;scope=frontend;review=5,6 -->

## Security / Errors

- [ ] auth return-to-action preserves safe context without rendering private batch data <!-- omo:id=accept-batch-weight-ui-auth-return;stage=4;scope=frontend;review=3,5,6 -->
- [ ] other-owner access remains nondisclosed and mutation-free <!-- omo:id=accept-batch-weight-ui-owner-nondisclosure;stage=4;scope=shared;review=3,5,6 -->
- [ ] UUID idempotency, expected revision and same-key replay/different-payload behavior are preserved <!-- omo:id=accept-batch-weight-ui-idempotency;stage=4;scope=shared;review=3,5,6 -->
- [ ] 409/422 keeps correctable input, refreshes authority and focuses the actionable message <!-- omo:id=accept-batch-weight-ui-error-recovery;stage=4;scope=frontend;review=3,5,6 -->
- [ ] LEFTOVERS pending blocks duplicate submit and dialog close/cancel restores focus to the invoking CTA <!-- omo:id=accept-batch-weight-ui-dialog-focus;stage=4;scope=frontend;review=5,6 -->

## Design / Verification

- [ ] COOK_MODE and LEFTOVERS canonical designs and independent critiques are refreshed before Stage 2 <!-- omo:id=accept-batch-weight-ui-design-critics;stage=2;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop evidence covers every required state and no overflow <!-- omo:id=accept-batch-weight-ui-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] evidence manifest records implementation head SHA and capture times; both authority reports postdate and cite it <!-- omo:id=accept-batch-weight-ui-evidence-freshness;stage=4;scope=frontend;review=5,6 -->
- [ ] both authority reports approve destructive hierarchy, dialog focus, 44px targets and narrow stacking <!-- omo:id=accept-batch-weight-ui-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] no new API/field/status/event/mutation/direct DML or meal-log UI is invented <!-- omo:id=accept-batch-weight-ui-no-invention;stage=2;scope=shared;review=3,5,6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-batch-weight-ui-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation records failing component/history tests before code <!-- omo:id=accept-batch-weight-ui-tdd-red;stage=2;scope=frontend;review=5,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-batch-weight-ui-independent-review;stage=2;scope=shared;review=3,5,6 -->
- [ ] every current-head check is green/intended skip and post-merge master QA/Policy/Security/Vercel are green <!-- omo:id=accept-batch-weight-ui-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: COOK_MODE/LEFTOVERS at 390px, 320px, desktop; keyboard/screen reader; current/immediate-previous client
- scenarios: known/later/container helper, delayed weight, unrecoverable, discard, adjust, unweighed close/cancel, depleted labels, stale revision, replay

## Manual Only

- [ ] expose discard/adjust/close only after #8 Train D reader-before-writer cutover evidence is approved
