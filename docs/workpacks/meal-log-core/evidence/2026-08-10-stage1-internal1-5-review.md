# meal-log-core Stage 1 internal 1.5 독립 검토

- 검토일: 2026-08-10 KST
- 검토 역할: fresh independent Stage 1 internal 1.5 docs-gate reviewer
- 현재 Codex task ID: `019fe738-2551-7be0-993a-deea4bf83de4`
- 위임 source task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- 검토 브랜치: `docs/meal-log-core-stage1-internal1-5-review`
- 판정: **HOLD**
- 미해결 finding: **P0 0 / P1 2 / P2 0**
- Contract Evolution Candidate: **없음**. 아래 두 건은 이미 승인된 공식 계약으로 문서를 다시 맞추는 repair다.

이 검토는 Stage 1 작성자, #8 작업 및 제품 구현 작업과 분리해 수행했다. 제품 코드, migration, 공식 요구사항/API/DB, workpack 본문, acceptance, automation spec, work item, status를 수정하지 않았고 이 보고서만 추가했다. PR 생성·merge, Discord, production/staging/Supabase/Vercel/server-Mac 접근, migration apply, capability/R/R+1/R+2 activation은 수행하지 않았다.

## 1. Exact base와 검토 tuple

`git fetch origin --prune`은 현재 작업과 무관한 원격 hotfix tracking ref lock 때문에 실패했다. 범위를 `master` 하나로 좁혀 `git fetch origin master:refs/remotes/origin/master`를 다시 실행했고 성공했다. 요청받은 SHA, 갱신된 `origin/master`, `origin/HEAD`가 모두 같으므로 더 최신 master 선택 분기는 발생하지 않았다.

| 항목 | exact 값 |
| --- | --- |
| requested governing base | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| fetched `origin/master` | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| `origin/HEAD` | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| reviewed base commit | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| reviewed base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| base first parent | `6781fa04a4d45678e765be74866d195c8146d27d` |
| ancestry result | requested base = fetched latest master; ancestor check exit `0` |

검토한 Stage 1 projection의 exact blob과 SHA-256은 다음과 같다.

| artifact | git blob | SHA-256 |
| --- | --- | --- |
| `docs/workpacks/meal-log-core/README.md` | `a81ab53b4b1de2af4c83d5077114ac21b02ec499` | `7bb0e245e91a31aff052b04727cef8f0319a8ed418c3f6019ad32c8590e85db3` |
| `docs/workpacks/meal-log-core/acceptance.md` | `c5f723be33e70b4434845fd5c04a4120eeb51cac` | `28ce8c64f65e05a08ed48e136fffad4e16899f1fbc00b76145599bccdb1eae91` |
| `docs/workpacks/meal-log-core/automation-spec.json` | `ad2b793b549e8ae8b2c01f2d3d07227795b88565` | `b0e874654cef637bfc089bd7e70d89fed64e40879518ee8e4b81fd13d44a5d93` |
| `.workflow-v2/work-items/meal-log-core.json` | `4fcde6d73b444a6268ad38d76be0a3c99a65b975` | `a0d7d7e94db601cf4732ae610ddccaf5eb8d0570fc659d71f27634b5f1038dda` |
| `.workflow-v2/status.json` | `2a9ec83f64702b6a95dbf23fc25c3481101a60df` | `f34ee3dcff09fa890a4d17e9df41f988485431212123a271ea79f41bc8174ba1` |
| `docs/workpacks/README.md` | `4e1fcb10e4c88536aa66bbde3c3af3953385c86a` | `1ae4e412a8c05cc972a45720bf5b5659f1f9f376e0bdc4f2cdcf680202ae21cf` |
| `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | `88722e09a5b0cf06f3bba3c83e1fd7908ba877fc` | `baccc47f4d4b09547f7f44ea763a0c96bbbf7aad66d748943714210f5c68e008` |

현재 공식 tuple은 `CURRENT_SOURCE_OF_TRUTH.md:3-8`의 아래 다섯 파일이다.

- 요구사항 `v1.7.30`
- 화면정의서 `v1.5.34`
- 유저 Flow맵 `v1.3.32`
- DB `v1.3.32`
- API `v1.2.37`

Cooking Plan / Meal Log의 승인 lineage는 `CURRENT_SOURCE_OF_TRUTH.md:183-210`이며, 승인된 마스터 계획은 **1,018 lines / SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`**다.

## 2. Findings

### P1-01 — official tuple 및 승인 plan lineage가 다른 계획으로 drift됨

상태: **unresolved / required repair**

증거:

- `docs/workpacks/meal-log-core/README.md:9-14`는 공식 tuple을 `v1.7.25/v1.5.29/v1.3.27/v1.3.26/v1.2.29`로 고정하고, 마스터 계획을 `45f020...`, 1,056 lines로 기록한다.
- 같은 README `:82`의 no-contract-invention 문장도 과거 tuple을 authority로 사용한다.
- `.workflow-v2/work-items/meal-log-core.json:28-32,51`도 같은 과거 tuple과 `45f020...` governing ref를 사용한다.
- `automation-spec.json`의 artifact assertion은 `approved-plan-sha256-and-1056-line-lock`을 요구한다.
- 반면 현재 authority는 `CURRENT_SOURCE_OF_TRUTH.md:3-8,183-210`의 최신 tuple 및 `d4d0...` / 1,018-line cooking-meal-log master plan이다. `45f020...` / 1,056 lines는 별도의 local-first deployment plan lineage다.
- 원 Stage 1 merge `d932a342de691b65c8d576935450ff0f57dd1dd7`에서는 cooking plan의 `d4d0...` / 1,018 lines가 올바르게 기록돼 있었다. 이후 broad local-first contract commit `ca67715c07d43baa091be5d4ac95a04ad0dfcfd0`에서 경로의 의미와 다른 SHA/line lock으로 바뀌었다.

영향:

Stage 2가 현재 공식 API/DB 계약이 아니라 과거 tuple 또는 다른 계획의 해시를 검증할 수 있다. 구조 validator가 통과해도 exact source/lineage gate의 목적을 만족하지 않는다.

Exact repair:

1. `README.md`의 Official Sources와 no-contract-invention authority를 현재 공식 tuple로 갱신한다.
2. cooking-meal-log master plan의 SHA/line lock을 `d4d0...` / 1,018 lines로 복구한다.
3. work item의 `docs_refs.source_of_truth`, governing ref 및 관련 artifact assertion을 같은 authority로 동기화한다.
4. automation spec의 `1056-line` assertion을 올바른 cooking-plan lineage로 바꾼다.
5. Stage 1 base/lineage note에 `c16102a...` 기준과 repair commit의 exact parent를 기록하고, projection validator가 요구하는 status/roadmap 동기화만 수행한다.
6. 공식 문서 자체는 수정하지 않는다. 이 finding은 Contract Evolution이 아니다.

### P1-02 — malformed UUID idempotency key의 exact 400/zero-write gate가 빠짐

상태: **unresolved / required repair**

증거:

- 공식 `docs/api문서-v1.2.37.md:379-386`은 신규 personal mutation의 UUID `Idempotency-Key`를 요구하고, 유효하지 않은 UUID key를 exact `400 INVALID_IDEMPOTENCY_KEY`로 고정한다.
- `README.md:84-97` Error / Zero-write Matrix에는 missing key `428`, reused key `409`가 있지만 malformed key의 `400`이 없다.
- `acceptance.md:28,39,44`는 UUID key를 말하지만 invalid UUID의 exact HTTP/code와 whole-operation zero-write를 acceptance item으로 잠그지 않는다.
- `acceptance.md:80`은 `401/404`와 `409/422/428/503`만 zero-write 집합에 포함해 `400`을 누락한다.
- automation invariant/blocked condition/required assertion에도 invalid UUID key의 route별 zero-write 증명이 없다.

영향:

POST/PATCH/DELETE가 malformed key를 다른 validation code로 반환하거나 idempotency/entry/event/pointer/projection/aggregate에 흔적을 남겨도 Stage 1 acceptance를 통과할 수 있다. 이는 public error와 idempotency 경계를 충분히 고정하지 못한 상태다.

Exact repair:

1. README error matrix에 `400 INVALID_IDEMPOTENCY_KEY`와 mutation/operation/entry/event/pointer/projection/aggregate zero-write를 추가한다.
2. acceptance에 POST/PATCH/DELETE 공통 malformed UUID key의 exact response와 whole-operation zero-write item을 OMO metadata와 함께 추가한다.
3. automation spec의 invariant, blocked condition, required test/evidence assertion에 같은 요구를 추가한다.
4. work item artifact assertion과 handoff가 이 test/evidence를 추적하도록 필요한 최소 projection을 동기화한다.
5. 공식 API는 변경하지 않는다. 기존 승인 계약을 그대로 반영한다.

## 3. 계약 정합성 검토

| 검토 항목 | 결과 | 근거/비고 |
| --- | --- | --- |
| `meal_log_entries` exact-one source | PASS | `cooked_batch|food_product|ingredient` exact-one과 pinned evidence가 잠김 |
| active consumption event pointer | PASS | entry ↔ active event, deferred integrity, own-event reversal과 atomic pointer swap이 잠김 |
| create/replace/delete | PASS | create, PATCH reversal+replacement, DELETE reversal+null+soft delete가 한 transaction으로 명시됨 |
| same-key replay | PASS | compact durable result replay와 different-payload zero-effect가 잠김 |
| owner/auth/generation | PASS | JWT session/account generation 재검증, RLS, private 404 nondisclosure, cleanup order가 명시됨 |
| read-only/state boundary | PASS | deleted slot write denial, batch availability/bounds, lifecycle maintenance/stale state가 구분됨 |
| idempotency missing/reuse | PASS | `428` 및 `409 IDEMPOTENCY_KEY_REUSED`가 잠김 |
| malformed idempotency key | **FAIL** | P1-02: exact `400 INVALID_IDEMPOTENCY_KEY` 및 zero-write acceptance 누락 |
| legacy compatibility | PASS | consumed-only legacy projection, eaten/XP no-repeat, unknown instant null 보존이 잠김 |
| wrapper/error shape | PASS with finding | wrapper와 대부분 exact error는 명시됐으나 P1-02 repair 필요 |
| #10/#12 선점 금지 | PASS | #10 Planner shell, #12 MEAL_LOG UI/sheets/design authority를 명시적으로 제외함 |
| #11 충돌 방지 | PASS with integration condition | #9은 backend write/event ownership, #11은 기존 #8 mutation을 소비하는 UI ownership으로 분리 가능 |
| 문서 밖 field/API/status/error/action/screen | 발견 없음 | 새 계약 후보가 아니라 기존 authority lock 두 건의 누락/오류만 발견 |

## 4. Predecessor runtime과 broader lifecycle 구분

`#9`의 exact DAG predecessor는 `docs/workpacks/README.md:225`에 따라 #1 + #2 + #4 + #8이다. 아래 merge commit은 모두 base `c16102a...`의 ancestor이며, 각 PR current-head check는 실패/대기 없이 pass 또는 intended skip이었다.

| predecessor | runtime/closeout merge evidence | current-head checks | 판정 |
| --- | --- | --- | --- |
| #1 prepared-food-search-relevance | PR #1105 `19f25aae...`; PR #1108 `07e041ad...` | `14 pass + 2 skip`; `10 pass + 5 skip` | runtime merged green; lifecycle closed |
| #2 product-ingredient-link-foundation | PR #1255 `d30ee2c8...`; PR #1256 `5e9773f5...`; PR #1262 `5cf91557...` | `13+2`; `14+1`; `9+5` | runtime/consumer/closeout merged green |
| #4 recipe-snapshot-authority-foundation | PR #1218 `46967fe9...`; PR #1219 `fb15e776...`; PR #1268 `f5bd4b1a...` | `15+1`; `11+4`; `10+5` | #9가 소비할 runtime merged green; broader activation lifecycle은 별도 pending |
| #8 cooked-batch-weight-ledger | PR #1291 `6981a432...`; PR #1311 base merge `c16102a...` | `14+1`; `14+1` | #9가 소비할 runtime/consumer head merged green; broader lifecycle은 별도 pending |

#8 Stage 6 최초 evidence와 successor-head re-review를 모두 읽었다. successor re-review는 exact head `5441c9a...`에 대해 APPROVE, P0/P1/P2 `0/0/0`였고 이후 PR #1311이 base `c16102a...`로 merge됐다. 이 사실은 **#9 runtime predecessor gate**를 만족한다. 하지만 #4/#8 status의 `in-progress`, Manual/server-Mac/OAuth, capability activation, R/R+1/R+2 및 cross-slice release gate까지 완료됐다는 뜻은 아니다. 그 broader lifecycle은 계속 pending이다.

따라서 dependency 판정은 다음과 같다.

- runtime predecessor merged-green: **PASS**
- broader lifecycle/activation complete: **아님; pending 유지**
- #9 Stage 2 시작 가능: **현재 HOLD**. P1-01/P1-02 repair와 독립 docs-gate 재검토가 먼저다.

## 5. #11 병렬화와 ownership

P1 repair 후 #9 docs gate가 merge되면 #9 Stage 2 backend와 #11의 #8-consumer UI 작업은 병렬 진행할 수 있다. 두 작업 모두 merged #8 runtime을 소비하지만 소유 표면을 다음처럼 분리해야 한다.

| 표면 | #9 ownership | #11 ownership / 금지선 |
| --- | --- | --- |
| DB | `meal_log_entries`, active consumption pointer, meal-log RLS/constraint/RPC/migration | #9 table/event/pointer를 만들거나 수정하지 않음 |
| batch write | #8 row-lock/full-replay RPC를 transaction 안에서 호출 | 기존 #8 mutation을 UI에서 소비; 새 event/RPC 의미를 만들지 않음 |
| API | meal-log create/PATCH/DELETE/read route와 meal-log 전용 types/tests | COOK_MODE/LEFTOVERS presentation; meal-log API를 소유하지 않음 |
| UI | #10/#12 shell/MEAL_LOG screen을 선점하지 않음 | #11 화면만 소유; #12 consumed UI/CTA를 미리 구현하지 않음 |
| shared risk | migration ordering, `docs/workpacks/README.md`, `.workflow-v2/status.json` | 같은 shared projection은 branch owner 한 명이 순차 통합 |

충돌을 줄이기 위해 #9 meal-log route/type/client는 전용 module에 두고, #11이 주로 사용할 `lib/api/cooking.ts`, `types/cooking.ts`, cooked-batch component는 불필요하게 수정하지 않아야 한다. 불가피한 shared-file 변경은 branch ownership을 먼저 선언하고 한 branch에서 순차 통합한다.

## 6. Automation honesty와 pending boundary

현재 Stage 1에서 실제로 존재하는 validator/focused-test/lint/typecheck/audit/diff 명령과 future Stage 2+ 명령은 automation spec에서 구분돼 있다. 아래 future artifact는 base에 없으며, 따라서 이번 검토에서 실행하거나 통과했다고 주장하지 않는다.

- `tests/meal-log-core.test.ts`
- `tests/meal-log-security.test.ts`
- `tests/meal-log-batch-events.test.ts`
- `tests/meal-log-nutrition-aggregate.test.ts`
- `tests/meal-log-core-postgres.integration.test.ts`
- `scripts/verify-meal-log-core-local-first.mjs`

external smoke는 future/manual gate다. production/staging/remote DB/Vercel/server-Mac/OAuth 및 capability activation은 실행하지 않았으며, Manual/server-Mac/OAuth/R/R+1/R+2/activation은 모두 pending이다. `pnpm audit --audit-level high`는 exit `0`이었고 low 1건, moderate 1건을 보고했다. high 이상 취약점은 없으며 이번 docs-only 변경에서 dependency를 바꾸지 않았다.

## 7. 실행 명령과 결과

| 명령/검증 | 결과 |
| --- | --- |
| `git fetch origin --prune` | unrelated hotfix tracking-ref lock으로 실패; master 범위 fetch로 복구 |
| `git fetch origin master:refs/remotes/origin/master` | PASS; exact `c16102a...` |
| requested SHA ↔ latest master ancestry | PASS; exact same commit |
| `pnpm branch:start -- --branch docs/meal-log-core-stage1-internal1-5-review` | PASS |
| `pnpm install --frozen-lockfile` | PASS; lockfile 변경 없음 |
| `pnpm validate:source-of-truth-sync` | PASS |
| `pnpm validate:workflow-v2` | PASS |
| `BRANCH_NAME=docs/meal-log-core pnpm validate:workpack -- --slice meal-log-core` | PASS |
| `node scripts/validate-automation-spec.mjs --slice meal-log-core` | PASS |
| `pnpm validate:omo-bookkeeping` | PASS |
| `pnpm validate:closeout-sync -- --slice meal-log-core` | PASS |
| focused Vitest 5 files | PASS; 5 files / 49 tests |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm audit --audit-level high` | PASS exit 0; low 1 / moderate 1 / high 0 |
| predecessor merge ancestry 및 GitHub current-head checks | PASS; 위 dependency 표 참조 |
| product/PostgreSQL/E2E/external/server-Mac smoke | NOT RUN; future/manual/pending boundary |

구조 validator가 모두 green이어도 P1-01의 잘못된 product-plan hash와 P1-02의 누락된 public error case를 탐지하지 못했다. 따라서 green command 결과만으로 APPROVE할 수 없다.

## 8. Final gate verdict와 handoff

**HOLD — P0 0 / P1 2 / P2 0, unresolved required 2.**

Stage 1 작성/repair 작업은 아래 순서로 진행해야 한다.

1. P1-01의 current official tuple 및 cooking-plan lineage를 README/work item/automation projection에 동기화한다.
2. P1-02의 `400 INVALID_IDEMPOTENCY_KEY` exact response와 POST/PATCH/DELETE whole-operation zero-write를 README/acceptance/automation/work item에 잠근다.
3. source/workpack/automation/workflow/OMO/closeout validator와 focused tests를 다시 실행한다.
4. repair commit의 exact base/tree/artifact hash와 diff를 새 evidence로 제출한다.
5. fresh independent internal 1.5 reviewer가 P1 2건의 closure와 문서 밖 계약 추가 없음, predecessor/runtime distinction을 다시 확인한다.
6. 그 재검토가 P0/P1/P2 `0/0/0`일 때만 Stage 1 APPROVE 및 merge 가능하다. 그 전에는 #9 Stage 2를 시작하지 않는다.

이 보고서는 repair를 직접 수행하거나 자기 변경을 승인하지 않는다.
