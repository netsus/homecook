# Acceptance Checklist

> Current official tuple: `docs/요구사항기준선-v1.7.30.md`, `docs/화면정의서-v1.5.34.md`, `docs/유저flow맵-v1.3.32.md`, `docs/db설계-v1.3.32.md`, `docs/api문서-v1.2.37.md`.
>
> Exact Stage 1 master base/tree: `c16102a3072e929e45bb24a69464cd3110d03db5` / `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`. Approved cooking plan SHA-256 is `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines.
>
> #11 Stage 2/3 is N/A because #11 is a UI-only consumer of #8. Product implementation is Stage 4. #9 owns meal-log backend DB/API/write/events/pointers and #12 owns consumed-amount UI. Unchecked items do not claim implementation, runtime evidence, review approval, merge, activation or Manual evidence.

## COOK_MODE Completion

- [ ] planner/standalone completion keeps exact pantry row selection and exact-one weight action <!-- omo:id=accept-batch-weight-ui-complete-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] copy says original food-only total and excludes pot/container/plate/current remainder <!-- omo:id=accept-batch-weight-ui-food-only-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] container helper is local-only and submits only positive `finished_weight_g` <!-- omo:id=accept-batch-weight-ui-container-helper;stage=4;scope=frontend;review=5,6 -->
- [ ] weigh-later submits null grams without estimate, zero nutrition or meal evidence <!-- omo:id=accept-batch-weight-ui-weigh-later;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/read-only/unauthorized/ready/pending/replay remain fail-closed and preserve safe inputs <!-- omo:id=accept-batch-weight-ui-completion-states;stage=4;scope=frontend;review=5,6 -->
- [ ] creation-off existing v2 read/cancel/complete drain remains usable without activation claim <!-- omo:id=accept-batch-weight-ui-v2-drain;stage=4;scope=frontend;review=5,6 -->

## Delayed Weight / Unrecoverable

- [ ] missing+available exposes original whole-food weight or explicit unknown action <!-- omo:id=accept-batch-weight-ui-missing-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] delayed weight requires confirmation that no eating/discard happened and server eligibility stays authoritative <!-- omo:id=accept-batch-weight-ui-delayed-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] unrecoverable confirmation states irreversibility and nutrition/log impact <!-- omo:id=accept-batch-weight-ui-unrecoverable-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] unrecoverable success/409 removes gram input/logging and never offers restore/reversal <!-- omo:id=accept-batch-weight-ui-unrecoverable-lock;stage=4;scope=frontend;review=5,6 -->

## Batch Actions / Display Truth

- [ ] known+available shows authoritative finished/remaining g and #11-owned discard/adjust only <!-- omo:id=accept-batch-weight-ui-known-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] #12 consumed-amount CTA is absent until #12 is separately merged and enabled <!-- omo:id=accept-batch-weight-ui-no-consume-preclaim;stage=4;scope=frontend;review=5,6 -->
- [ ] discard requires grams/reason/revision and creates no meal entry or XP <!-- omo:id=accept-batch-weight-ui-discard;stage=4;scope=frontend;review=5,6 -->
- [ ] adjustment requires delta/reason/revision and cannot deplete/reopen/exceed bounds <!-- omo:id=accept-batch-weight-ui-adjust;stage=4;scope=frontend;review=5,6 -->
- [ ] destructive confirmation shows amount/reason/result, offers cancel, blocks duplicate submit and restores invoking focus <!-- omo:id=accept-batch-weight-ui-destructive-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] unweighed close requires consumed/discarded/mixed and explicit no-grams/no-nutrition confirmation <!-- omo:id=accept-batch-weight-ui-close-unweighed;stage=4;scope=frontend;review=5,6 -->
- [ ] only exact eligible current closure can cancel; no generic reopen or marker reversal exists <!-- omo:id=accept-batch-weight-ui-no-reopen;stage=4;scope=frontend;review=5,6 -->
- [ ] all six depleted labels are distinct and only consumed variants project eaten/XP <!-- omo:id=accept-batch-weight-ui-depleted-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] `legacy-null` remains read-only unknown and is never treated as missing, 0g or depleted <!-- omo:id=accept-batch-weight-ui-legacy-null;stage=4;scope=frontend;review=5,6 -->
- [ ] partial/unavailable stays explicit; missing weight never becomes zero or estimated nutrition <!-- omo:id=accept-batch-weight-ui-nutrition-truth;stage=4;scope=frontend;review=5,6 -->
- [ ] empty LEFTOVERS offers safe Planner return only; 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거한다. 단, `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용한다. generic reopen, non-current closure cancel, unrecoverable reversal은 금지한다. <!-- omo:id=accept-batch-weight-ui-empty-depleted;stage=4;scope=frontend;review=5,6 -->

## Security / Errors

- [ ] auth return-to-action preserves safe context without rendering private batch data <!-- omo:id=accept-batch-weight-ui-auth-return;stage=4;scope=frontend;review=5,6 -->
- [ ] other-owner access remains nondisclosed and mutation-free <!-- omo:id=accept-batch-weight-ui-owner-nondisclosure;stage=4;scope=frontend;review=5,6 -->
- [ ] UUID idempotency, expected revision and same-key replay/different-payload behavior are preserved <!-- omo:id=accept-batch-weight-ui-idempotency;stage=4;scope=frontend;review=5,6 -->
- [ ] 409/422 keeps correctable input, refreshes authority and focuses the actionable message <!-- omo:id=accept-batch-weight-ui-error-recovery;stage=4;scope=frontend;review=5,6 -->
- [ ] pending blocks duplicate submit and dialog close/cancel restores focus to the invoking CTA <!-- omo:id=accept-batch-weight-ui-dialog-focus;stage=4;scope=frontend;review=5,6 -->

## Ownership / Contract Boundary

- [ ] Stage 2/3 remains N/A and all #11 product implementation metadata points to Stage 4 <!-- omo:id=accept-batch-weight-ui-ui-only-stage;stage=4;scope=shared;review=5,6 -->
- [ ] #9 retains meal-log DB/API/write/events/pointers and shared projection integration is sequential <!-- omo:id=accept-batch-weight-ui-meal-log-owner;stage=4;scope=shared;review=5,6 -->
- [ ] #12 consumed UI is not rendered or preclaimed <!-- omo:id=accept-batch-weight-ui-meal-log-ui-owner;stage=4;scope=shared;review=5,6 -->
- [ ] no migration, Route Handler, RPC, server helper, backend transaction, public field/status/error/action or direct DML is added <!-- omo:id=accept-batch-weight-ui-no-invention;stage=4;scope=shared;review=5,6 -->

## Design Artifact Lock

- [ ] automation and regression lock `ui/designs/COOK_MODE.md` <!-- omo:id=accept-batch-weight-ui-cook-design;stage=4;scope=frontend;review=5,6 -->
- [ ] automation and regression lock `ui/designs/LEFTOVERS.md` <!-- omo:id=accept-batch-weight-ui-leftovers-design;stage=4;scope=frontend;review=5,6 -->
- [ ] automation and regression lock `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` <!-- omo:id=accept-batch-weight-ui-cook-critic;stage=4;scope=frontend;review=5,6 -->
- [ ] automation and regression lock `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` <!-- omo:id=accept-batch-weight-ui-leftovers-critic;stage=4;scope=frontend;review=5,6 -->
- [ ] a single screen, single critic or legacy generic critic path fails the Stage 1 regression <!-- omo:id=accept-batch-weight-ui-artifact-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] design-content findings are repaired by the separate design-generator and fresh critic before implementation <!-- omo:id=accept-batch-weight-ui-design-content;stage=4;scope=frontend;review=5,6 -->

## Mobile / Accessibility / Runtime Evidence

- [ ] 390px and 320px use a familiar bottom sheet with sheet-internal scroll, fixed CTA and safe-area containment <!-- omo:id=accept-batch-weight-ui-mobile-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] all interactive targets are at least 44px and numeric inputs use at least 16px font <!-- omo:id=accept-batch-weight-ui-mobile-geometry;stage=4;scope=frontend;review=5,6 -->
- [ ] virtual keyboard keeps active input, linked error and CTA reachable without page-level overflow <!-- omo:id=accept-batch-weight-ui-virtual-keyboard;stage=4;scope=frontend;review=5,6 -->
- [ ] focus order, focus trap, focus restore, Escape/close behavior and pending dismiss lock pass runtime tests <!-- omo:id=accept-batch-weight-ui-focus-runtime;stage=4;scope=frontend;review=5,6 -->
- [ ] screen reader names/status/live errors and non-color state meaning are programmatically exposed <!-- omo:id=accept-batch-weight-ui-screen-reader;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop evidence covers required states with no horizontal/page overflow <!-- omo:id=accept-batch-weight-ui-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] automated accessibility reports serious/critical zero while full WCAG and physical AT remain Manual Only <!-- omo:id=accept-batch-weight-ui-wcag-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] evidence manifest records implementation head/capture time and both authority reports postdate/cite it <!-- omo:id=accept-batch-weight-ui-evidence-freshness;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] deterministic fixtures cover exact pantry rows, explicit `[]`, known/missing/unrecoverable/legacy-null and six depleted reasons <!-- omo:id=accept-batch-weight-ui-fixtures;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 read-only smoke consumes the merged #8 projection without #11 DB seed/migration/write <!-- omo:id=accept-batch-weight-ui-real-read;stage=4;scope=frontend;review=5,6 -->
- [ ] missing #8 projection/seed fails closed instead of creating guessed fallback state <!-- omo:id=accept-batch-weight-ui-seed-blocker;stage=4;scope=frontend;review=5,6 -->
- [ ] component/history tests record RED before Stage 4 product code <!-- omo:id=accept-batch-weight-ui-tdd-red;stage=4;scope=frontend;review=5,6 -->

## Lifecycle / Verification

- [ ] lifecycle stays `planned`, approval `not_started`, verification `pending`, evaluation `not_started` until independent gates advance it <!-- omo:id=accept-batch-weight-ui-lifecycle-honesty;stage=4;scope=shared;review=5,6 -->
- [ ] Stage 1 claims only docs validators, focused tests, lint/typecheck, audit and diff <!-- omo:id=accept-batch-weight-ui-stage1-honesty;stage=4;scope=shared;review=5,6 -->
- [ ] Stage 4 runtime/visual/a11y evidence is future and is not claimed by this repair <!-- omo:id=accept-batch-weight-ui-future-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh independent internal 1.5/design/Stage 5/6/final authority findings are zero before closeout <!-- omo:id=accept-batch-weight-ui-independent-review;stage=4;scope=shared;review=5,6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority; this Stage 1 author does not self-approve
- environment: COOK_MODE/LEFTOVERS at 390px, 320px, desktop; keyboard/screen reader; current/immediate-previous client
- scenarios: known/later/container helper, delayed weight, unrecoverable, discard, adjust, unweighed close/cancel, legacy-null, depleted labels, stale revision, replay

## Manual Only

- [ ] physical keyboard focus order/trap/restore/Escape in a real browser
- [ ] VoiceOver/TalkBack or equivalent screen reader announcements
- [ ] real 390px/320px device safe-area and virtual keyboard occlusion
- [ ] server-Mac/OAuth evidence owned by the broader lifecycle
- [ ] R/R+1/R+2 and capability activation remain pending and are not performed by #11
