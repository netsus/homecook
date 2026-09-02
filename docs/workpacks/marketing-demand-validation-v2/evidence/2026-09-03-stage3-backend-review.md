# Stage 3 backend review evidence

- Slice: `marketing-demand-validation-v2`
- PR: `https://github.com/netsus/homecook/pull/1498`
- Branch: `feature/be-marketing-demand-validation-v2`
- Reviewer task: `01a063fb-8d16-7842-8b81-09e863ebee18`
- Reviewed implementation head: `b5d4ea2babcc69d13753119acbf4371f61aea317`
- Reviewed tree: `d9c79898d0f695aec83ed08b20be6e394476229e`
- Final verdict for the reviewed implementation head: `APPROVED`
- Findings: `0`

> 이 문서를 추가하는 evidence-only successor commit 자체는 위 reviewer가 아직 승인하지 않았다. 새 exact head에서 이 artifact와 전체 diff를 다시 확인해야 하며, 작성 task는 자기 변경을 승인하거나 merge하지 않는다.

## Review rounds

1. predecessor head `25bd7d9b5fb1e1d0e648ad2c610a73c15e056be0`에서 `P1-001..P1-003`, `P2-001..P2-002`가 열렸다.
2. successor 구현 head `b5d4ea2babcc69d13753119acbf4371f61aea317`에서 위 5개 finding이 모두 닫혔다.
3. PR body drift `P2-003`을 repository head 변경 없이 정정했다.
4. 동일 reviewer task가 reviewed head/tree와 최신 body를 재확인해 `APPROVED / findings 0`을 반환했다.

## Closed findings

- `P1-001`: v1/v2 양방향 field isolation CHECK와 실제 v1-pre → v2 migration → v1-post projection digest/5개 negative write → clean replay 증거를 추가했다.
- `P1-002`: arbitrary unknown JSON key를 safe fixed `body`/`answers` field로만 반환해 email/Turnstile-shaped key reflection을 차단했다.
- `P1-003`: 모든 5개 UTM field의 number/boolean/object/array를 `422 invalid_type`으로 거부한다.
- `P2-001`: Stage 1 checklist identity를 보존하면서 Stage 2 backend evidence와 기존 Stage 4 UI evidence 책임을 분리했다.
- `P2-002`: analysis result shape에 `duplicate_submission`을 `accepted_lead`와 별도로 출력한다.
- `P2-003`: PR `Test Plan`, `QA Evidence`, `Actual Verification`, `Merge Gate`, `Notes`를 successor evidence 하나로 동기화했다.

## Independent verification

- Required four-file Vitest: `66/66` passed
- Marketing operations: `11/11` passed
- `pnpm verify:backend`:
  - Product Vitest: `2,903 passed / 175 skipped`
  - Next production build: passed
  - Playwright security: `12/12` passed
- Pinned isolated local Supabase CLI: `2.110.0`
- Aggregate migration digest: `39b8171e36e704a742c583fb213b6257d524fba2fd1ca4664bfa935d5508bf4a`
- Isolated sequence: v1-pre fixture → v2 migration → v1-post projection digest and five negative writes → clean full replay → RLS/ACL/Data API negative smoke; disposable resources cleaned
- Validators: source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, closeout sync, real-smoke presence, `git diff --check` passed

## Current-head CI snapshot for the reviewed implementation head

- CI quality/build/security-function authorization/security smoke: passed
- Complete QA matrix: full-regression, Lighthouse, accessibility, smoke: passed
- Visual: initial same-head Pantry/Shopping snapshot flake; same-head failed-job rerun passed without code change
- Policy and PR Governance latest runs: passed
- `snyk`: intended skip

The historical Policy failure run is retained as audit history. This evidence-only successor head must start a fresh current-head check set from a PR body that already contains the latest local Supabase evidence.

## Manual Only / production blockers

- actual operator privacy facts and canonical `/privacy`
- production Turnstile secret/hostname/action
- production origin and edge rate-limit evidence
- retention, sender domain, full-local apply approval and backup
- image rights and product-example labeling
- actual iOS Safari smoke and paid ads approval

Production/full-local mutation, remote/cloud/linked Supabase, release/tag/deploy remain out of scope.
