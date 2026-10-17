# 기존 로컬 변경 인벤토리 — 2026-10-17

기준 origin/master `36fbf9535`. 작업 시작 시 비-release134 worktree 중dirty26·경로소실3. 브랜치565개를 ancestry와 git cherry의 patch-id로 읽기 전용 대조했다. 삭제/reset/stash drop/강제push0.

master 조상324개, 비조상241개 중patch동등104개·고유후보137개다. patch동등은 commit정체성/미커밋까지 동일하다는 뜻이 아니다. 고유후보도 그대로 필요기능으로 승인된 것은 아니며 아래판정과 소유자검토를 따른다.

## 현재 열려 있는 PR5개

- [#1749](https://github.com/netsus/homecook/pull/1749) `codex/response-boundary-inventory-20261017`: draft — 실패/부분계약 실험: 기능9개운영후 별도계약작업으로 보류.
- [#1745](https://github.com/netsus/homecook/pull/1745) `codex/shopping-rpc-client-inference-20261017`: draft — 실패/부분계약 실험: 기능9개운영후 별도계약작업으로 보류.
- [#1707](https://github.com/netsus/homecook/pull/1707) `codex/mumeok-weight-participation-integration`: draft — C05 수집OFF·새 기능/운영금지 계약으로 보류.
- [#1681](https://github.com/netsus/homecook/pull/1681) `codex/mumeok-weight-participation`: draft — C05 수집OFF·새 기능/운영금지 계약으로 보류.
- [#1489](https://github.com/netsus/homecook/pull/1489) `release/rehearsal-selection-contract-v2`: draft — 과거release rehearsal 후속: 현재개발 AGENTS의 신규gate가 아니므로 이번기능선행에서 제외.

## 전체 브랜치 분류

| 브랜치 | HEAD | 상태 | 고유/동등 patch | 처리·근거 |
|---|---|---|---|---|
| `backup/fix-omo-auto-resume-scheduler-pre-rewrite` | `92a536340` | 실험/보존후보 | 4/0 | 평가기·실험/백업이력; 운영성공·현계약필요성미확인으로자동머지제외 |
| `backup/local-master-before-sync-20260403` | `de7bd591c` | 실험/보존후보 | 1/0 | 평가기·실험/백업이력; 운영성공·현계약필요성미확인으로자동머지제외 |
| `chore/chain-runner` | `3828d4284` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/codex-vision-html-report-detail` | `918127d7c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/current-mac-production` | `ccccc9528` | 고유검토대기 | 45/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `chore/full-local-supabase-restore-cutover` | `8720f1570` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `chore/gitignore-local-state` | `afeca1b5c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/hybrid-production-data-migration-20260730` | `73de7647b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/hybrid-production-runtime` | `bd448bc72` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/jupyter-recipe-loop` | `a23e89dce` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/marketing-local-dashboard` | `8f0caf0a9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/prelaunch-deployment` | `195d89ce6` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `chore/prelaunch-web-deploy` | `b6b11c9f2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/production-rda-refinement` | `198703d52` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/recipe-loop-dashboard-kst-time` | `33df49626` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/recipe-loop-iter4-6-resume` | `9dd323e40` | 실험/보존후보 | 9/0 | 평가기·실험/백업이력; 운영성공·현계약필요성미확인으로자동머지제외 |
| `chore/recipe-loop-plateau-diagnosis` | `86d712c3d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/release-ci-recovery` | `ba420be8c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/server-workflow-sync-20260915` | `78f4cd870` | patch동등 | 0/0 | 재머지불필요; 기존등록보존 |
| `chore/setup-gitignore` | `b6d685675` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `chore/youtube-recipe-loop-one-iter-observe` | `753883465` | 실험/보존후보 | 5/1 | 평가기·실험/백업이력; 운영성공·현계약필요성미확인으로자동머지제외 |
| `chore/youtube-recipe-loop-validation-canary` | `231263eff` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `claude/intelligent-vaughan` | `25b89dee9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `claude/laughing-hertz` | `c06d69afd` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `claude/objective-mclean-e13d97` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `claude/stoic-blackburn` | `320c957d7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/abalone-estimate-20261011` | `dbe5f414a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/admin-audit-client-inference-20261017` | `1d64b280d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/admin-client-type-evidence-20261017` | `fc7ca7f15` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-ai-nutrition-worker-guards-20261012` | `2e881445d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-auth-gate-owner-field-20261012` | `e161a5a71` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-automation-20261011` | `74f312061` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-contract-checkpoint-20261017` | `cb5d9616f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-cook-highlights-20261011` | `56821e8b0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-cooked-batch-projections-20261012` | `75981abb4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-cooking-methods-read-20261012` | `dced24f0c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-domain-arrays-20261011` | `9697dace5` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-external-ingredient-fields-20261012` | `1140d5bdd` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-food-catalog-client-20261012` | `9f8f16e83` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-food-catalog-projection-20261012` | `0f084fcff` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-food-product-collection-20261012` | `bde70ad3c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-food-product-leaf-routes-20261012` | `d8e65a312` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/anti-slop-image-projection-guards-20261012` | `6b6ec2210` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-ingredient-search-ranking-20261012` | `979c58961` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-manual-recipe-contracts-20261012` | `4733d51f1` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/anti-slop-manual-recipe-payload-20261012` | `3c0ea2b8c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-marketing-validation-boundaries-20261012` | `faad79703` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-missing-reference-fields-20261012` | `a5929fc79` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-next-safe-20261012` | `0eee05214` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-pantry-delete-body-20261012` | `bcb762801` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-pantry-match-20261012` | `34d60482b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-planner-context-parsers-20261012` | `347881d04` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-planner-nutrition-20261011` | `370abd3d0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-planner-nutrition-summary-20261012` | `ad5a2ce5a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-product-planner-rpc-parser-20261012` | `c4091efa7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-pure-transforms-20261012` | `04caf15e7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-recipe-detail-product-fields-20261012` | `2bf786d59` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-recipe-ingredient-search-20261012` | `f7f1afe4c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-recipe-tag-backfill-loops-20261012` | `64b78e860` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-remaining-dispositions-20261017` | `a612957e8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-round2-option-builders-20261012` | `8d6cd81bb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-shopping-aggregation-20261012` | `12ab7cc54` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-shopping-route-boundaries-20261012` | `c839db513` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-static-arrays-20261011` | `198852408` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-tags-read-boundaries-20261012` | `b780ef1b9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-test-contracts-20261012` | `2c0cbd0f0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-ui-filters-20261011` | `5b20d309c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/anti-slop-user-gamification-20261012` | `db5d55f8e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/auth-repair-evidence-20260926` | `7df06b383` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/beta-flow-gaps-20260922` | `2960a6b1e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/beta-response-release-20260922` | `f41aca464` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/beta-response-time-20260922` | `6ff72c803` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/beta-rollout-20260922` | `847249391` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/beta-web-release-20260922` | `3f1fc5503` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/book-cover-client-inference-20261017` | `0e82dad62` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/book-detail-reader-alias-20261017` | `1e4c7351f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/book-list-reader-alias-20261017` | `0ac1ff0e1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/bootstrap-select-projection-contract-20261017` | `2cd4aab93` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/catalog-tag-read-client-cleanup-20261017` | `bf97fadc0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/cloudflare-phase0-diagnostics` | `8ae9bd559` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/codex-quality-tooling-20261011` | `80d4bd269` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/cooked-weight-prediction` | `01b3a3bac` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/cooking-complete-rpc-inference-20261017` | `820d08647` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/cooking-experience-20261017` | `36fbf9535` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/cooking-session-client-reuse-20261017` | `405b895b0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/demo-planner-status-hotfix-20260917` | `ecd87372b` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/derived-create-client-inference-20261017` | `e9b3a518f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/dev-deploy-data` | `ffd8f59fa` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/draft-nutrition-client-inference-20261017` | `2979e3aeb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/f01-closed-r2-maintenance` | `8d62f868d` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/f01-closed-smoke-host` | `ad8e7451d` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/feedback-release-followup-20261008` | `8bdfde130` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/fix-cooking-meal-entry-live` | `b7da4bd47` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/fix-import-shopping-errors` | `0c7635875` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/fix-leftover-detail-youtube-input` | `257d66014` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/fix-r2-ad-links-deploy-root` | `155739631` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/food-product-leaf-clients-20261012` | `b4f5ece99` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/future-impact-client-inference-20261017` | `35343004d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/gabia-direct-prelaunch` | `f970bc1d1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/hotfix-r2-ad-links-live` | `fd18eaeae` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/household-spoon-review-20261011` | `982154c5f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/household-spoon-web-20261011` | `f970bc1d1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/hybrid-static-contract-repair-20261012` | `444fe1f6f` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/hybrid-static-contracts-only-20261012` | `6ec3d787d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/image-cancel-client-inference-20261017` | `873b62607` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/image-upload-client-inference-20261017` | `3a766ff64` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-ai-web-20261008` | `7b672ef55` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-canonical-web-20261009` | `4fe84f825` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-exclusion-recovery-20261010` | `4093fa921` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-identity-description-web-20261010` | `ed3ba74d7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-identity-web-20261010` | `8859a30b4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-nutrition-correction-20261006` | `8abed074f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-nutrition-identities-20261010` | `8742773b2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-nutrition-manual-batches-20261008` | `181025b63` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-nutrition-recovery-web-20261010` | `3039f75bb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-piece-web-20261009` | `913559973` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-representatives-20261008` | `ea140d12d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-search-canonical-20261009` | `02a772233` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-search-native-client-contract-20261017` | `e98b11a9d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ingredient-unit-evidence-20261009` | `4a2e7dcab` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/intake-trend-prototype-plan-20261016` | `f970bc1d1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/known-macro-web-release-20261008` | `899954434` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/leftover-auth-wrapper-cleanup-20261017` | `063f8a226` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/leftover-mutation-errors-20261016` | `781f36ce0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/leftover-mutation-parser-20261016` | `2b0bae9f4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/leftover-status-narrowing-20261017` | `e3e7fb45f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/lint-error-cleanup-20261011` | `64ca7faa0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/manual-nutrition-client-identity-20261017` | `3aaa6688e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/manual-recipe-contract-sync-20261012` | `760b02f57` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/manual-recipe-owner-detail-web` | `d22217ddc` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/marketing-lead-edit-regression-20261012` | `fda59c37c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/master-live-youtube-integration-20261012` | `58a03675a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/meal-log-edit-dialog-fixes-20261009` | `a67c554c4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/meal-log-known-macro-chart-20261008` | `b1b267a47` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/meal-log-revision-body-20261017` | `1897be9fa` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/meal-planner-ui-polish-20261008` | `60585dcb8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/measurement-evidence-review-20261011` | `4a9d3d983` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-auth-web-20260926` | `5d05a180b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-b08-detail-notice` | `018ab24de` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-beta-c01-web-release` | `32ab591ba` | 고유검토대기 | 14/10 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-c03-web-release` | `1c676f43c` | 고유검토대기 | 11/10 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-c04-editor` | `64013fdc7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-c04-recipe-input` | `3151ca839` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-c04-unit-evidence` | `35da89139` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-c04-worker-quantity` | `23c1aa47c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-c05-source-bindings` | `d9a68ce90` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-cooking-css-tests` | `23abf7919` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-beta-f01-live-evidence` | `e032fc03e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-beta-f01-privacy` | `7196651a8` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-f01-web-release` | `87cd04e11` | 고유검토대기 | 8/9 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-live-evidence` | `934957aca` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-beta-notification-retry` | `00c81681d` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-beta-product-foundation` | `dc1a86dd0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-ui-followups` | `3b7d3f101` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-v9-batch1` | `5e8b66ed9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-v9-company` | `2817c8094` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-v9-cooking` | `ecc8bf60f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-beta-v9-navigation` | `4d7360fd3` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-beta-v9-web-release` | `76ff4efe4` | 고유검토대기 | 6/8 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c01-dialog-focus` | `c017eb6e5` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c01-focus-web` | `5be056499` | 고유검토대기 | 14/12 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c01-preview-compat` | `209431e99` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c01-protected-rollout` | `a427a98ff` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c01-reader-evidence` | `db0fa13f5` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c03-ledger-session` | `581b2f28a` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c03-plan-binding` | `26abf81c6` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c03-reader-fence` | `5a3d12b69` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c04-activation-locks` | `cd9211fe7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-active-continuation` | `f8194a678` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-active-ui-deploy` | `82f712f95` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-contracts` | `9148d32ed` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-fork-test-fixture` | `f693bdf29` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-integrated` | `6f5b21acf` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-protected-pre-review` | `405e75b88` | patch동등 | 0/0 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c04-protected-rollout` | `d5e5be81b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-public-detail` | `7e91f2282` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-public-read-deploy` | `e31b2c3aa` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-public-web` | `e00d5f119` | 고유검토대기 | 15/16 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c04-quantity-display` | `5c8ea933e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c04-t1-interstage` | `d1053f0b9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-ui-release` | `79e8f3300` | 고유검토대기 | 15/14 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c04-web-release` | `6b610eb01` | 고유검토대기 | 15/12 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-c04-weight-origin` | `8e52a4c04` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-worker-cutover` | `9b5029ef5` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-c04-worker-release` | `5adfafee9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-c04-worker-stage` | `78c0a07b6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-cooking-login-return` | `45e96c48f` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-cooking-quantity-fidelity` | `40882b122` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-feedback-batch-20260926` | `3158883c5` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-feedback-batch-20260928` | `36ecf7566` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-feedback-release-record-20260927` | `b4654947e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-feedback-web-20260927` | `f8824662e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-feedback-web-20260928` | `8d9dc57ef` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-manual-publication-context` | `97b19336c` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-manual-publication-release` | `dd3991e2b` | 고유검토대기 | 16/20 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-meal-recent-unit` | `a684394e1` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-meal-recent-unit-release` | `10cfaa6b2` | 고유검토대기 | 16/21 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-menu-add-quantity-contract-tests` | `646282c58` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-nutrition-database-release` | `aad3135bc` | 고유검토대기 | 18/21 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-nutrition-reader-release` | `f0ae89064` | 고유검토대기 | 17/21 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-nutrition-recovery-operating-docs` | `d6fb771c0` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-nutrition-source-handoff-entry` | `e19e36ec5` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-nutrition-v4-reasons` | `12a1541ce` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-nutrition-validator-deploy` | `2395018ae` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-nutrition-validator-object-equality` | `7a603ae71` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-personal-plist-binding` | `0d487ee8a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-personal-weight-operating-record` | `b9243bd63` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-personal-weight-release` | `af88126b4` | 고유검토대기 | 16/17 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-plan-snapshot-clarity` | `af88126b4` | 고유검토대기 | 16/17 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-plan-snapshot-clarity-source` | `468fc3ae7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-plan-snapshot-operating-record` | `a657c78e8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-plan-snapshot-release` | `4057885ff` | 고유검토대기 | 16/18 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-product-planner-saved-unit` | `ba009db54` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-product-planner-unit-release` | `0cf3a5a65` | 고유검토대기 | 18/22 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-quantity-fidelity-operating-record` | `a1fe583b0` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-quantity-fidelity-release` | `6d8e6a7ad` | 고유검토대기 | 16/19 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-recent-unit-operating-record` | `508a0c6d6` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-recipe-http-replay` | `950fd090b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-request-role` | `75f295ad2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-role-maintenance` | `f15d5f13c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-role-source-release` | `5a3926e5a` | 고유검토대기 | 18/23 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-recipe-save-current-marker` | `b63d64fff` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-save-maintenance` | `950fd090b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-save-maintenance-integration` | `0d3d50a47` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-save-maintenance-v2-verified` | `65dc0fae8` | 고유검토대기 | 2/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-recipe-save-operating-record` | `9584187be` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-save-recovery` | `c435d614a` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-recipe-save-release` | `0ae67d66c` | 고유검토대기 | 18/22 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-recipe-snapshot-identity` | `950fd090b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-recipe-unit-memory` | `950fd090b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-retired-product-plan-scope` | `ddfe55029` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/mumeok-reviewed-eslint-deploy` | `df2a736b8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-ui-notification-feedback-20260928` | `15c975cf9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-usability-fixes-20260926` | `4f680eef7` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-v9-operating-ledger` | `f7706412e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-weight-attestation` | `33f2ef5c7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-weight-attestation-deploy` | `2717ebcc1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-weight-attestation-rollout` | `7e6f53c3b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/mumeok-weight-joined` | `480c24f05` | 고유검토대기 | 8/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/mumeok-weight-participation` | `3bc4c24ff` | 명시보류PR | 6/0 | 위PR판정참조 |
| `codex/mumeok-weight-participation-integration` | `da65a96a2` | 명시보류PR | 1/0 | 위PR판정참조 |
| `codex/mumeok-weight-source-binding` | `12dbe800c` | 고유검토대기 | 7/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/nutrition-owner-query-contract-20261017` | `7e922e860` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/nutrition-predecessor-read-contract-20261017` | `009ed7af8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/optional-nutrition-display-20261011` | `716597de1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/optional-nutrition-web-20261011` | `4f3f5d458` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/pr1344-internal15-approval` | `50598f7ce` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/prelaunch-recipe-nutrition-v2-20260915` | `523f560a4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/priority-refactor-batches-20261011` | `8fe70dcad` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/progress-cap-metadata-20261016` | `51889a506` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/progress-projection-capability-20261017` | `7943f8c39` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/progress-reader-client-boundary-20261016` | `7efb2612b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/progress-redundant-logic-20261016` | `d1734e84d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/protected-rollout` | `d0a5f7d61` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/r2-readiness-deploy-hotfix` | `5c140caea` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/readme-publish-20260918` | `7997811ab` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/readme-startup-draft` | `0e7342662` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `codex/recipe-card-native-read-contract-20261017` | `edd04ba6d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-delete-rpc-inference-20261017` | `be8101c9a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-detail-context-projection-20261017` | `de4f2d8db` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-like-client-evidence-20261017` | `1b551630e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-loop-iter13-performance-recovery` | `2700b6a12` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-search-native-read-contract-20261017` | `e17363671` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-search-save-release-20260922` | `d9df78789` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-search-save-repair-20260922` | `56fe60c67` | 고유검토대기 | 2/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/recipe-snapshot-guard-name-20261012` | `d2e1c5ce8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/recipe-ui-web-release-20261009` | `4d7238de7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/response-boundary-inventory-20261017` | `d551ff06a` | 명시보류PR | 1/0 | 위PR판정참조 |
| `codex/retire-unused-ingredients-20261011` | `2e5bee2e9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/retired-ingredients-web-20261011` | `3f4efa598` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/server-prelaunch-base-20260906` | `9f429bea2` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/session-attempt-rpc-inference-20261017` | `3d136c317` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/session-refresh-409-repair-20260927` | `8086586fb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/settings-patch-omission-20261017` | `1096582bd` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/shopping-create-response-variant-20261017` | `acd5aef06` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/shopping-leaf-auth-indirection-20261017` | `3724cfc08` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/shopping-rpc-client-inference-20261017` | `5fc7dd786` | 명시보류PR | 1/0 | 위PR판정참조 |
| `codex/sol-worker-operational-base` | `56ef88ef6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/test-contract-cleanup-20261011` | `537a21eb6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ui-nutrition-web-followup-20261008` | `2744e9a15` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ui-nutrition-web-release-20261007` | `9ad9d2ed9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/ui-polish-web-release-20261008` | `974f52a42` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-authored-source-priority-20261016` | `5a48d3d4e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-background-contract` | `d38ee2e4a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-choice-quantity-20261010` | `55351544a` | 고유검토대기 | 9/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-contract-test-sync-20261012` | `650c7bedc` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-display-release-20261008` | `5fa2561b0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-generic-oil-resolution-20261011` | `2bc8ce58a` | 별도정책보류 | 1/0 | 과거패치는 기름 synonym검토정책이며 정확 오일연결과 동등하지 않음. 요구5는PR1781로충족, 기름정책은미반영·정책/소유자검토대기 |
| `codex/youtube-human-reviewed-source-20261011` | `84003a19b` | 고유검토대기 | 35/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-ingredient-resolution-20261009` | `55e8a3651` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-integrated-local-20261013` | `b30ee9e00` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-multi-parent-save-20261011` | `21819a863` | 고유검토대기 | 1/5 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-multi-parent-save-stacked-20261011` | `c66f8d8e5` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-optional-coverage-20261010` | `dfe9d6449` | 고유검토대기 | 11/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-optional-preservation-20261010` | `403e0f050` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-public-discovery-fix` | `8e515a648` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-recipebook-planner-20261012` | `6fe4c80e0` | patch동등 | 0/2 | 재머지불필요; 기존등록보존 |
| `codex/youtube-recipebook-planner-release-20261012` | `a6676d27e` | 고유검토대기 | 4/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-resolution-deploy-20261010` | `c51d53871` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-resolution-operator-20261010` | `6e8f5a63e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-resolution-release-20261010` | `672ede566` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-saved-quantity-compose-20261010` | `dbfd3642d` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-source-bound-master-20261012` | `4c39d0b81` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-source-priority-conflicts-20261016` | `93de94d97` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-source-quantity-recovery-20261012` | `80d2cbf30` | 고유검토대기 | 42/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-speed-quality-20261009` | `55e8a3651` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-text-first-conditional-vision-20261016` | `47d8e67f4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-three-video-answer-key` | `b257148d0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-user-trial-web-20261009` | `370483030` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v69-choice-name-20261011` | `64d934c69` | 고유검토대기 | 13/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v71-cutover-db219-observe` | `da028beed` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v71-cutover-health-contract` | `cff2385ad` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v71-cutover-node-fix` | `f68c4181a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v71-cutover-stop-wait` | `0e89fbe24` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v71-p5-20261011` | `9838f9b63` | 고유검토대기 | 14/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v71-worker-preparation` | `c1d5679da` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v73-former8-20261011` | `0c98a367d` | 고유검토대기 | 15/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v74-controlled-cutover-20261016` | `705737e60` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `codex/youtube-v74-owner-normalization-20261011` | `e869582b4` | 고유검토대기 | 16/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v75-source-ownership-20261011` | `c2e069259` | 고유검토대기 | 17/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v76-source-gap-repair-20261011` | `bc8d1c89c` | 고유검토대기 | 18/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v77-choice-structures-20261011` | `1db7271d4` | 고유검토대기 | 20/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v79-identical-pair-20261011` | `17d46f09c` | 고유검토대기 | 23/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-v86-source-name-quantity-repair-20261012` | `80d2cbf30` | 고유검토대기 | 42/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `codex/youtube-vision-redesign` | `fa167d9ae` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/05-planner-week-core` | `41caebb04` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/06-recipe-to-planner` | `95f54c2e3` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/06-recipe-to-planner-rehearsal` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/06-recipe-to-planner-repair` | `c70f00297` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/07-meal-manage` | `fee3ea79c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/33-youtube-i031-direct-extraction` | `2cdb90337` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/admin-stage3-review-closeout` | `0ce3c1d60` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/bugfix-patch-pilot-pr128-evidence` | `00c45cd3d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/claude-design-wave1-correction` | `3dcb9e83e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/desktop-mvp-porting-ralplan` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/desktop-prototype-bundle-import` | `ec07378ac` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/desktop-prototype-modern-webapp-redesign-plan` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/desktop-prototype-ux-flow-fixes` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/external-smoke-slice06-pilot-evidence` | `3ec05a4c4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/full-local-auth-ledger-read-contract` | `f1ae78347` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/full-local-plan-provenance-fix` | `7ccb55022` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/full-local-production-operator-checklist` | `af0b65ce3` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/full-local-supabase-contract` | `75be5c3b8` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/gemini-youtube-llm-extraction-plan` | `dd44b9098` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/gpt-only-stage-review` | `49dd9a337` | 고유검토대기 | 2/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/gpt-session-stage-workflow` | `951e05ed6` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/hybrid-supabase-contract` | `1db094795` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/iter12-provenance-plan-html` | `8ffd01c48` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/iter12-regrade-plan-html` | `8ffd01c48` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/korean-language-policy` | `70fad9010` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/landing-operations-status-sites-direction` | `1e13fb5e5` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/local-only-supabase-contract` | `35e45a37b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/marketing-demand-validation` | `1bd61f13b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/marketing-demand-validation-four-question-contract` | `06d1d4b5b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/marketing-demand-validation-round2` | `3a6727901` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/marketing-round2-contract-evolution` | `24093c94e` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/marketing-round2-evidence-format-compatibility` | `b19863aee` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/marketing-round2-ready-authority-metadata` | `379ef5ba1` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/marketing-round2-route-stage-ownership` | `745c2dfff` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/marketing-round2-serial-contract-controlled-deploy` | `c29280a83` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/move-baemin-prototype` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/omo-closeout-06-recipe-to-planner` | `cf2001d73` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/omo-full-autonomy-v1-spec` | `93aeda3dd` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/omo-report-33-youtube-i031-direct-extraction` | `3b07e8ee4` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/omo-report-youtube-extraction-truthful-progress-eta` | `556af81a4` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/omo-session-orchestrator-spec` | `35b400620` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/omo-supervisor-reset-plan` | `9d0272bfa` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/pi-single-recipe-dataset-plan` | `20cc962b9` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/pi-visual-implementation-html` | `aebd4f6b4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/pr1344-internal15-approval` | `86e48fbe5` | 고유검토대기 | 5/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/production-performance-root-cause` | `1fd578f73` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/ralplan-youtube-extraction-generality` | `c6085b736` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/recipe-loop-integrity-review-md` | `a23e89dce` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/recipe-loop-iter12-train-diagnostic-plan` | `2e6d1c709` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/recipio-youtube-recipe-candidates` | `8eb477923` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/review-pr-1341-stage6` | `d33a085aa` | 고유검토대기 | 5/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/session-lifecycle-hotfix-contract` | `41e15d3d4` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/session-lifecycle-milestone-a-24h-closeout` | `d09b55367` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/session-lifecycle-milestone-a-evidence` | `e2378a2d8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/slice06-stage6-pilot-evidence` | `aeda8d239` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/sync-wave1-runnable-html` | `3b52bec06` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/youtube-admin-quota-exemption` | `73361cf14` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/youtube-async-closeout-repair` | `a68ef7c94` | 고유검토대기 | 2/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-async-extraction-contract` | `ed1982a13` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/youtube-async-extraction-notification` | `50598f7ce` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-background-contract` | `57319a1c2` | 고유검토대기 | 8/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-background-contract-review-evidence` | `40cca0597` | 고유검토대기 | 9/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-caption-quality-ralplan` | `2a97f6955` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/youtube-extraction-truthful-progress-eta` | `84f8e3c5e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `docs/youtube-extraction-truthful-progress-eta-stage1` | `30d958b83` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-i031-parity-plan` | `578f3705e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `docs/youtube-progress-contract` | `00e87b119` | patch동등 | 0/2 | 재머지불필요; 기존등록보존 |
| `docs/youtube-progress-contract-20260826` | `30d958b83` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `docs/youtube-progress-eta-stage1-current` | `e239ee741` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feat/install-dev-skills` | `3e936316d` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/agent-loops` | `a193fa267` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/baemin-prototype-home-porting` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-05-planner-week-core` | `93d475f03` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-06-recipe-to-planner` | `48c5bbf0c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-07-meal-manage` | `2d7aeed8f` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-33-youtube-i031-direct-extraction` | `db0b838a7` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/be-admin-foundation` | `bae8f3a5c` | 고유검토대기 | 3/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/be-hybrid-auth-local-data-production` | `d35c300a2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-marketing-demand-validation` | `66b97425a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-marketing-demand-validation-round2` | `09413ba38` | 고유검토대기 | 6/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/be-youtube-async-extraction-notification` | `e5bbf77ae` | 고유검토대기 | 38/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/be-youtube-extraction-truthful-progress-worker` | `e50a39646` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/be-youtube-extraction-truthful-progress-worker-phase-c` | `ceb1d712a` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/codex-vision-single-loop` | `f7775f68c` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/demand-validation-funnel-integration` | `753c2d25a` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/demo-video-flow-fixes` | `88c362941` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/fe-05-planner-week-core` | `a3d9407e9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/fe-06-recipe-to-planner` | `38915af6b` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/fe-07-meal-manage` | `a8f7f4f93` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/fe-33-youtube-i031-direct-extraction` | `277f21614` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/fe-hybrid-auth-local-data-production` | `26d5739dd` | 고유검토대기 | 31/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/fe-marketing-demand-validation` | `9e2bd84d2` | 고유검토대기 | 1/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/fe-marketing-demand-validation-v2` | `c29d4a9bd` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/fe-youtube-async-extraction-notification` | `156b0f8d2` | 고유검토대기 | 50/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/fe-youtube-async-extraction-notification-superseding-draft` | `f9d922cf8` | 고유검토대기 | 66/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/frontend-design-skill-install` | `63683ce52` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/full-local-auth-app-adapter` | `2e66a5e83` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/full-local-auth-db-foundation` | `db6b3d317` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/full-local-supabase-runtime` | `c4e5d34c6` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/hybrid-auth-local-data-production-stage2-backend` | `97d39daf4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/marketing-demand-validation-landing-polish` | `08f3ddaec` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/menu-youtube-baemin-handoff` | `917595777` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/omo-bookkeeping-drift-hardening` | `b91f11235` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-design-authority-gate` | `31b093125` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-full-auto-merge` | `a7c5348e9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-full-auto-workflow-v2` | `06d2291fb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-full-autonomy-v1` | `79ea454d3` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-pingpong-quality` | `416889d0e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-stage-owner-rebalance` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-stage-owner-rebalance-v2` | `bcf985dc0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/omo-stage1-docs-gate-bootstrap` | `feaa343b1` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-card-contract-20260708` | `410e5d3ad` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-recipe-boundary-plan-20260708` | `28a9c12bb` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-recipe-unit-memory-20260708` | `41ca1bf20` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-source-backed-amount-step-spine` | `7cab61a39` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/pi-timeline-ref-repair` | `3a4b31751` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-understanding-injection-first-20260709` | `01a5038bc` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-unit-consistency-audit` | `24de31fe3` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/pi-whole-video-recipe-map-20260709` | `de7128c3c` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/r22-recording-connection-20260912` | `9d396bc30` | patch동등 | 0/4 | 재머지불필요; 기존등록보존 |
| `feature/r22-recording-storage-20260912` | `18373258b` | 고유검토대기 | 1/2 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/recipio-youtube-import-parity` | `a55a65310` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/recording-intro-presentation` | `e12b57459` | 고유검토대기 | 11/5 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/to-taste-zero-contributions` | `9247340c2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/worker-youtube-progress-phase-c` | `e50a39646` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/youtube-admin-daily-quota` | `35be0e7be` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/youtube-async-stage2-backend` | `6f6043d91` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/youtube-caption-multi-recipe-vlog` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `feature/youtube-extraction-progress-ui` | `0c2e96979` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `feature/youtube-ocr-local-extraction` | `20cc962b9` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `feature/youtube-oeassmynrro-quality` | `943fca7ff` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/backup-drill-runtime-import` | `abac96755` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/beta-audit-four-20261017` | `ace61508e` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/beta-returning-session-flow` | `0d82e0bf0` | 고유검토대기 | 2/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/beta-session-recovery-main` | `d899ea0a3` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/gamification-projection-20260906` | `fb7b364ad` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/gamification-projection-web-20260906` | `d22ddb447` | 고유검토대기 | 4/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/hybrid-inventory-test-timeout` | `00aa4ad80` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/local-dev-auth-lan` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/marketing-demand-validation-closeout-state` | `ed6fb5da9` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/marketing-validation-stage6-ops-safety` | `c17cb09f4` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/meal-log-runtime-20260906` | `6abe9f0aa` | 고유검토대기 | 5/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/omo-auto-resume-scheduler` | `baa0f27e0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/omo-check-status-dedup` | `5ef1c17fa` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/omo-korean-pr-bodies` | `433511cc3` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/omo-manual-handoff-resume` | `13658b0a1` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/omo-slice06-control-plane-hardening` | `49f2df11c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/omo-status-bootstrap-fallback` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/prelaunch-recipe-nutrition-runtime-script` | `ff4708388` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/production-domain-contract` | `c4c9b620e` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/public-recipe-nutrition-read` | `af0449454` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/r2-rotation-fixture-guards-20261017` | `ca5a87109` | 진행중소유자 | 3/0 | v85단독담당; 조율전중복머지금지 |
| `fix/recipe-create-image-ownership-race` | `526d05587` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/recipe-detail-to-taste-readability` | `6637a8dc6` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/recipe-loop-iter12-judge-drift-check` | `2700b6a12` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/recipe-loop-iter13-performance-recovery` | `b7eb64a49` | 실험/보존후보 | 2/0 | 평가기·실험/백업이력; 운영성공·현계약필요성미확인으로자동머지제외 |
| `fix/recipe-loop-iter14-two-pass-coverage` | `2700b6a12` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/recipe-loop-iter16-validation-stability` | `78f69e885` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-bridge-stable-projection` | `54e4f8906` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-bridge-waiting-worker` | `b09b9923c` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-build-id` | `aad44b6d5` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-candidate-status-identity` | `f7e60febf` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-first-adoption-partial-full-local-recovery` | `4237369df` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-first-adoption-worker-unauthorized` | `20cc962b9` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/release-full-local-confirmation-wait` | `07f8f3b82` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-legacy-app-marker` | `0fe1254aa` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-legacy-plist` | `22f017e19` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-legacy-worker-inventory` | `1e1507aee` | patch동등 | 0/2 | 재머지불필요; 기존등록보존 |
| `fix/release-legacy-worker-plist` | `3fce4351a` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-legacy-worker-preflight` | `cfb6e9df2` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-legacy-worker-root` | `d30ced5e8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/release-legacy-worker-scheduled` | `a7ff5145a` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/release-runtime-env-materialization` | `313df279d` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/release-worker-unauthorized-bridge` | `526f4896c` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/release-workload-stable-digest` | `f5733572d` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/remove-opencode-claude-provider` | `e7ac3b271` | 고유검토대기 | 1/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/session-canary-safe-stage-diagnostics` | `310e0c467` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/session-canary-server-oauth-key-source` | `212c92a78` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/session-lifecycle-evidence-live-root` | `afb773316` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/session-refresh-storm-root-cause` | `4a8413a6f` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/session-refresh-token-consistency` | `e9c470cd6` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/slice-17-local-qa` | `3951628cb` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/step15-ci-deploy-classification` | `74cbd6338` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/t65-canary-return-foreground` | `2b1007718` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/t65-canary-snapshot-root` | `3ff3e9e7d` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/v85-rotation-safe-cutover-20261017` | `ca5a87109` | 진행중소유자 | 3/0 | v85단독담당; 조율전중복머지금지 |
| `fix/v85-web-only-recovery-20261017` | `ca5a87109` | 진행중소유자 | 3/0 | v85단독담당; 조율전중복머지금지 |
| `fix/youtube-admin-acl-normalization` | `6bd602eb2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/youtube-app-release-preflight` | `4713a3161` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/youtube-async-base-master-20260821` | `408ec36c6` | 고유검토대기 | 48/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-extraction-notification-final-superseding-draft` | `9b853b5e3` | 고유검토대기 | 66/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-extraction-notification-final-v2-superseding-draft` | `8804be05a` | 고유검토대기 | 66/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-extraction-notification-final-v3-superseding-draft` | `046014e66` | 고유검토대기 | 93/3 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-extraction-notification-final-v4-superseding-draft` | `aee818a1b` | 고유검토대기 | 54/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-isolated-local-gates` | `a625aefa7` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/youtube-async-local-only-rebase` | `25e8da8b0` | 고유검토대기 | 48/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-async-merge-gates` | `f733c7b1b` | 고유검토대기 | 40/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `fix/youtube-catalog-attestation-after-scope` | `64a322a47` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/youtube-luna-sol-medium` | `c714eb20a` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/youtube-register-review-race` | `2b3c987f4` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `fix/youtube-shared-catalog-contract` | `59b5ed762` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `fix/youtube-shorts-import-resilience` | `3d73542f8` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `homecook-slice06-omo-run` | `4305fc8a2` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `hotfix/auth-client-env-bundle` | `48a7a084f` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/auth-flow-cookie-reset` | `7f1771aac` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/auth-logout-cookie-clear` | `9e6b97949` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/auth-public-post-origin` | `bf739de6b` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/auth-public-redirect-origin` | `96a5d0cf7` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/cloudflare-icn-tunnel-stability` | `585e5f7f3` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/cloudflare-phase0-diagnostics` | `53e96f8d8` | 고유검토대기 | 3/1 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/cloudflare-phase1-preflight` | `0764d108e` | 고유검토대기 | 6/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/cloudflare-phase4-monitoring-gate` | `c2204c4f5` | 고유검토대기 | 7/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/demo-flow-fixes-live` | `fe2719e75` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `hotfix/full-local-db-contract-gate` | `822b6618d` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-dynamic-session-hmac-version` | `7d09e8724` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-launch-agent-environment` | `5d751a4c8` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-product-catalog-gate` | `ec745b606` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-production-install-contract` | `caa804182` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-readiness-semantic-restore` | `e8bf8e651` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-refresh-identity-precision` | `d7fca2be5` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-restore-ledger-state` | `63b62c09a` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-restore-pgdump-comments` | `499fbc7b2` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-restore-relation-order` | `fad123741` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/full-local-restore-semantic-digest` | `e6367ec79` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/local-mac-production-corepack` | `90fd0fabe` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/local-mac-production-full-local-runtime` | `92ccb8a7a` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/local-mac-readiness-budget` | `bce5beb16` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/pantry-product-join` | `b4f6b211f` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/postdeploy-authority-and-youtube-scope` | `cd72d4f44` | 고유검토대기 | 2/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `hotfix/prelaunch-demo-flow-live` | `d5ac93bdb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `hotfix/session-lifecycle-closeout` | `f6e3c4586` | patch동등 | 0/1 | 재머지불필요; 기존등록보존 |
| `hotfix/session-lifecycle-root-fix` | `2ddfc06d2` | 고유검토대기 | 9/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `master` | `b257148d0` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `release/local-mac-production-promote` | `238cb7369` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `release/local-mac-production-promote-adoption` | `c7b665abb` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `release/mumeok-r2-only-20260912` | `92fc7bd09` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `release/mumeok-r2-prelaunch-20260912` | `512779436` | 고유검토대기 | 11/3 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `release/r2-live-master-integration-20260913` | `33041e0c4` | 고유검토대기 | 3/0 | 필요성·후속대체·소유자미확정; 현재9개를선행하고필요분만별도리뷰후머지 |
| `test/slice-01-quality` | `548f99d88` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |
| `ui` | `13e41f49c` | master포함 | 0/— | 재머지불필요; 미커밋은 아래별도 |

## 미커밋 보존과 소유 작업

확정 소유자 정보가 없는 경로는 branch/파일영역으로만 추정했다. 목록을정리허가로해석하지않는다. 코드내용/환경/비밀값은인벤토리에복사하지않는다.

- `/Users/cwj/01_vibe_coding/homecook` / `codex/gabia-direct-prelaunch`: 변경7개. HEAD master포함이어도미커밋은별도검토
- `/private/tmp/homecook-intake-trend-plan-20261016` / `codex/intake-trend-prototype-plan-20261016`: 변경1개. HEAD master포함이어도미커밋은별도검토
- `/private/tmp/homecook-v85-web-recovery-20261017` / `fix/v85-rotation-safe-cutover-20261017`: 변경14개. HEAD자체고유후보와미커밋을분리검토
- `/Users/cwj/.codex/worktrees/2ab3/homecook` / `fix/public-recipe-nutrition-read`: 변경4개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/cooked-weight-prediction/homecook` / `codex/mumeok-c01-reader-evidence`: 변경2개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/cooked-weight-veto/homecook` / `detached`: 변경3개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/ingredient-nutrition-correction/homecook` / `codex/ingredient-nutrition-correction-20261006`: 변경57개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/marketing-demand-validation-stage6-safety/homecook` / `feature/marketing-demand-validation-landing-polish`: 변경8개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/marketing-demand-validation-v2-stage4/homecook` / `feature/fe-marketing-demand-validation-v2`: 변경2개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/marketing-local-dashboard-preserved/homecook` / `chore/marketing-local-dashboard`: 변경3개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/mumeok-beta-products/homecook` / `codex/mumeok-c04-weight-origin`: 변경6개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/mumeok-c04-active-continuation/homecook` / `codex/mumeok-c04-active-continuation`: 변경6개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/mumeok-manual-publication-context/homecook` / `codex/mumeok-recipe-snapshot-identity`: 변경7개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/mumeok-nutrition-v4-reasons/homecook` / `codex/mumeok-recipe-unit-memory`: 변경21개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/mumeok-nutrition-validator-deploy/homecook` / `codex/mumeok-menu-add-quantity-contract-tests`: 변경1개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/quantity-fidelity-operating-docs/homecook` / `codex/mumeok-recipe-http-replay`: 변경9개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/youtube-ingredient-resolution/homecook` / `codex/youtube-ingredient-resolution-20261009`: 변경19개. HEAD자체고유후보와미커밋을분리검토
- `/Users/cwj/.codex/worktrees/youtube-resolution-deploy-20261010/homecook` / `codex/youtube-resolution-deploy-20261010`: 변경1개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/.codex/worktrees/youtube-vision-redesign/homecook` / `codex/youtube-vision-redesign`: 변경111개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/01_vibe_coding/homecook-codex-vision-loop` / `feature/codex-vision-single-loop`: 변경1154개. HEAD자체고유후보와미커밋을분리검토
- `/Users/cwj/01_vibe_coding/homecook-full-local-restore` / `docs/full-local-production-operator-checklist`: 변경67개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/01_vibe_coding/homecook-session-lifecycle-deploy-v20` / `detached`: 변경1개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/01_vibe_coding/homecook-youtube-i031-impl` / `fix/youtube-shorts-import-resilience`: 변경7개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/bootstrap-select-projection-contract-20261017` / `codex/bootstrap-select-projection-contract-20261017`: 변경1개. HEAD master포함이어도미커밋은별도검토
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-recipebook-planner-release-20261012` / `codex/youtube-recipebook-planner-release-20261012`: 변경1개. HEAD자체고유후보와미커밋을분리검토
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-source-quantity-recovery-20261012` / `codex/youtube-source-quantity-recovery-20261012`: 변경14개. HEAD자체고유후보와미커밋을분리검토

## 다음 순서

1. 현재요리개선9개를작은묶음으로검증/머지/직렬배포.
2. v85활성작업은소유자완료와잠금해제후대조.
3. 필요한기존수정은원diff와후속master를대조하여누락분만독립검토한다. 개인정보/가비아기본문구도현재master와동등한지확인전중복반영하지않는다.
4. 남은계약리팩토링29개는상세·요리모드→영양memory→공통초기화순으로별도진행. 이것을현재기능의선행gate로삼지않는다.

분류집계: {"실험/보존후보": 5, "master포함": 324, "고유검토대기": 124, "patch동등": 104, "명시보류PR": 4, "필요기능흡수": 1, "진행중소유자": 3}.

이파일은목록화/보존단계다. 고유검토대기전체가필요없음또는모두머지완료라는판정은아니다.

## 후속 읽기 검토 — master3e3e18b59

- [미커밋26개 독립 리뷰](local-uncommitted-necessity-review-20261017.md): 확장5711파일, exact-master80개. v85는 소유자 후속 커밋으로 현재clean이다. 가열/배수 veto 코드+회귀2파일은 필요 후보로 확인해 최신 독립 브랜치에 이식했다. 원본 worktree 수정/삭제/reset0.
- [고유 커밋511개 인덱스](data/local-change-necessity-review-20261017.json):137개 브랜치의 중복제거다.107개 커밋은 전체 변경 후image가master역사에 있고, runtime만그대로있는것과 비runtime증거를별도분류했다. 이는현재동작·삭제의미까지동등하다는뜻이아니다.
- 최근 runtime 후보 중 줌/꼬집은 현재 `ingredient-piece-units.mjs`의 family/size/evidence 비교로 후속 구현됐다. 과거 대파1줌/소금1꼬집의 user제공무게를 전역 기본값처럼 되살리지 않는다. recipe-detail 페이지 title복원은 현재컴포넌트에존재한다. 일반오일은 PR1781의정확전체명규칙으로이번요구를반영했으므로옛branch전체를머지하지않는다.
- `codex/hybrid-static-contract-repair-20261012`의 recipe-save fallback user-scope 후보는 현재 legacy fallback에 service-role 호출이남아있음을확인했다. 현재9개요구에필수인확정결함으로승격하지않았으며 기존29계약/refactor보류와별도검토가필요하다. 삭제된DELETE endpoint·옛전체보안inventory를복구하지않는다.
- 나머지 unmatched runtime의미검토·다른소유자승인·필요성검증은진행중이다. 사용자 ‘필요한로컬변경모두머지’요청을완료로닫지않는다. 기존소유자작업과동시운영전환을침범하지않는다.

## Runtime 의미 검토 첫 묶음 —5개

`ecd87372b`(줌/꼬집), `e8fa17a1a`/`f76d37241`(제목복원), `dbfd3642d`(수량확인경고)는 현재 후속 구현과 독립 대조해 전체 재머지가 불필요하다고 판정했다. 제목복원 외14개 파일의 현재/병합3e02203a7 과거 blob도 확인했다. 기존 관련196회귀 PASS.

`2bc8ce58a`는 별도 ‘기름 synonym 단독일치를 needs_review로 유지’ 정책이다. 정확 ‘오일’ 연결과 동등하다고 분류한 초기 표현을 정정한다. 요구5 구현과 분리해 정책/소유자 검토 보류로 남기며 전체 옛 branch를 머지하지 않는다. 남은 미검토 runtime커밋은138개다. 필요한로컬변경전체머지 요청은 계속 열린 항목이다.
