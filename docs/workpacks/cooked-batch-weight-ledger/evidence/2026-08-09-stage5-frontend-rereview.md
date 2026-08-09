# Stage 5 independent frontend re-review — 2026-08-09

## Review provenance and verdict

- Workpack: `cooked-batch-weight-ledger` (#8)
- Review role: fresh independent Stage 5 frontend re-reviewer
- Delegating source task: `019fe028-be31-76f2-a5a7-986000a93374`; 이 fresh re-review task는 original Stage 5 reviewer task `019fe5d9-bd2d-7100-bebd-95f556e80d3c` 및 모든 author/P1/P2/integrator task와 별개다.
- Draft PR: [#1311](https://github.com/netsus/homecook/pull/1311)
- Exact base: `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1`
- Exact re-reviewed product head: `ee8863a5317e32e99c16630e03cfd85f60f46844`
- Exact product tree: `1ea5899a67d6aa2e72d028d6160e44d246d19b6a`
- Exact merge-ref at review: `de399fc9362097f64be39c8e5c8b680ffdc89063`; parents are exact base + product head and its tree equals the product tree.
- Original reviewed product head: `4cf710461c3254b7e75e3bf1298f7385c1906a2c`
- Original Stage 5 verdict: `REQUEST_CHANGES`, `P0/P1/P2=0/1/1`, unresolved required findings `2`
- Verdict for exact product head `ee8863a5…`: **APPROVE**
- Findings: **P0/P1/P2 = 0/0/0**
- Unresolved required findings: **0**

승인 조건인 actionable `P0/P1/P2=0/0/0`과 unresolved required finding `0`을 충족한다. 이 판정은 오직 exact product head `ee8863a5317e32e99c16630e03cfd85f60f46844`에 대한 Stage 5 재리뷰다. 이 파일을 담는 report-only successor commit은 제품 판정 대상이 아니며, 자신의 미래 SHA를 파일 안에 self-reference하지 않는다.

Claude는 사용하지 않았다. 이 작업은 제품/테스트/design/status/PNG를 수정하지 않았고 Ready 전환, merge, Discord, final authority, Stage 6, capability activation을 수행하지 않았다.

## Locked lineage and inspected scope

- Original Stage 5 report successor: `e50d72f9dfca09b5856751c65f5a881ef88e94ae`
- P1 delegated repair `0b6a0d78dccdc06e1011bc165daee6120c686e8e` → integration `80de7265024e3f00a903ac349e176c994799dc26`
- P2 delegated repair `ba81a391483ea9b08912d3d3652c1998d19f5725` → integration `0dd4ceb4658f07063428f3a88ba80d9050430a0c`
- Repair evidence/report-only product head: `ee8863a5317e32e99c16630e03cfd85f60f46844`
- Strict ancestry: `4cf71046… -> e0940377… -> 01ad3495… -> e50d72f9… -> 80de7265… -> 0dd4ceb4… -> ee8863a5…`
- Repair diff `4cf71046…ee8863a5`: `10 files`, including P1 API/tests, P2 E2E/evidence/PNG, original review and repair reports.
- Full Stage 4 diff `6981a432…ee8863a5`: `26 files`, `2,233 additions`, `52 deletions`.

필수 governing docs, current official tuple, #8 README/acceptance/automation/work item/status, Stage 4 evidence/stage-result, original Stage 5 report, repair report, PR body/checks, 전체 repair/full diff, 변경 코드·테스트와 1280/390/320 runtime PNG 원본을 직접 검토했다.

## Original finding closure

### P1 — malformed snapshot-v2 terminal response acceptance: resolved

독립 코드·테스트 대조 결과 original P1의 required repair가 exact head에서 모두 닫혔다.

| Required boundary | Exact-head evidence | Result |
| --- | --- | --- |
| session mode / response cross-check | `fetchSnapshotV2CookMode`가 exact session ID와 `planner|standalone` mode를 기억하고 complete/cancel response의 session/mode를 대조한다. production caller는 remembered mode를 사용한다. | pass |
| legacy-only null rejection | 신규 v2 complete batch의 `cooking_servings`, `weight_status`, `batch_status`, `revision`, `nutrition_calculation_status` null을 모두 거부한다. | pass |
| initial state | `status=leftover`, `batch_status=available`, `depleted_reason=null`, `current_unweighed_closure_event_id=null`만 허용한다. | pass |
| request/response weight correlation | `set_finished_weight`는 request positive g와 finished/remaining이 모두 같고 `known`; `weigh_later`는 `missing`과 두 weight null만 허용한다. | pass |
| malformed success fail-closed | exact 8-key completion data와 exact 15-key batch projection을 검사하고 drift를 `502 INVALID_RESPONSE`로 거부한다. | pass |
| per-session bounded cache | module-local map은 session ID별로 격리되고 insertion/LRU-like order로 최대 `32`개만 유지한다. eviction 후 network mutation 전 fail closed한다. | pass |
| normal cleanup | validated complete와 cancel 뒤 remembered mode를 제거한다. | pass |
| malformed retry retention | malformed terminal success 또는 normal API error에서는 mode를 제거하지 않아 같은 payload/idempotency key 재시도가 가능하다. | pass |

Focused regression은 mode mismatch, fetched-mode production path, legacy null 5종, impossible initial state 5종, weight mismatch 3종, exact weigh-later success, per-session isolation, 33번째 eviction, complete/cancel cleanup과 malformed retry를 행동 중심으로 고정한다. 테스트 편의를 위한 explicit `expectedMode` 인자는 production call site에서 사용되지 않으며, 실제 `SnapshotV2CookModeScreen`은 fetch로 기억한 mode를 소비한다.

### P2 — retained screenshot provenance and determinism: resolved

P2 repair는 product UI를 숨기거나 mask하지 않고 capture-only readiness를 안정화한다.

- `networkidle`과 `document.fonts.ready/status=loaded`를 기다린다.
- capture-only CSS로 animation/transition/caret을 비활성화한다.
- pointer를 `(0,0)`으로 이동하고 primary CTA가 `:hover`가 아님을 검사한다.
- viewport 변경 뒤 double `requestAnimationFrame` paint settlement를 기다린다.
- screenshot 자체도 `animations: "disabled"`를 사용한다.
- product component/style에는 P2 repair 변경이 없다.

세 consecutive exact Playwright run은 모두 `5 passed / 1 intended skip`이고 PNG는 매 run 후 byte-identical이었다.

| Viewport | Run 1 | Run 2 | Run 3 | Markdown / JSON / exact blob |
| --- | --- | --- | --- | --- |
| 1280×900 | `3aa8556589cde4280587a7e11005bb628fe3f414ac1ec24e9f767010f47bf696` | same | same | exact match |
| 390×844 | `1ecd8b2137460b78925ad22b678939bae076d0a9b3af2b5e160719814284139b` | same | same | exact match |
| 320×568 | `e6a05d3a29a6c58e7812d5fc42730665a1119160fbb2eb472021576911fb27d5` | same | same | exact match |

세 PNG는 테스트 실행 후 working tree diff가 없었으므로 복구가 필요하지 않았다. `git show ee8863a5:<path> | shasum -a 256`, 현재 파일, Stage 4 Markdown, stage-result JSON 값이 모두 일치한다.

원본 크기 직접 시각 검토에서도 desktop은 중앙 430px급 mobile sheet 위계를 유지하고, 390은 familiar bottom sheet의 header/body/footer가 명확하며, 320은 footer를 유지한 채 body 내부 세로 스크롤이 필요함이 자연스럽게 드러난다. clipping, page-level horizontal overflow, 약한 primary hierarchy, 식별 불가능한 copy/contrast defect는 발견하지 못했다.

## Full Stage 4 regression review

### Contract, idempotency and error recovery

- request는 exact `{ consumed_pantry_item_ids, weight_action, finished_weight_g }`만 전송한다.
- success는 exact 8-key complete data와 15-key owner-only `CookedBatchProjection`을 fail closed로 소비한다.
- same payload retry는 동일 UUID idempotency key를 재사용하고, payload 변경은 새 key를 만든다. in-flight ref가 double click/tap을 한 요청으로 제한한다.
- initial pantry selection은 비어 있고 candidate server order로 exact selected IDs만 전송한다. 동등 row 자동 선택이나 raw UUID 노출이 없다.
- 409/422는 sheet, exact selection, weight input을 유지하고 error summary로 focus를 이동한다. `finished_weight_g` field error는 input과 `aria-describedby`로 연결된다.
- stored terminal success는 sheet를 닫고 read-only 결과를 한 번만 표시하며 completion control을 다시 만들지 않는다.
- loading, empty `[]`, error, unauthorized return-to-action, pending lock, completed/cancelled read-only가 각각 fail closed다.

### Security, ownership and slice boundaries

- browser-visible type/projection에 `owner_id`, account generation, content snapshot ID, payload hash, claim/operation metadata를 추가하지 않았다.
- auth/owner/capability의 최종 authority는 기존 server/DB에 남고 frontend는 이를 완화하지 않는다.
- full diff에는 backend route, migration, grant/RLS, capability 또는 protected server authority 변경이 없다.
- #9 meal-log link/event UI/API, #11 delayed-weight/unrecoverable/discard/adjust/LEFTOVERS final UI, #12 MEAL_LOG UI를 구현하지 않았다.
- R/R+1 drain 또는 R+2 activation을 완료/승인으로 투영하지 않았다.

### Mobile UX, visual hierarchy and accessibility

- computed target assertions: dialog button/label `44px+`.
- 390px heading x-coordinate `16px`; 390/320 page-level horizontal overflow 없음.
- sheet는 `max-height`, body internal `overflow-y-auto`, fixed footer safe-area 구조로 scroll containment가 분명하다.
- title initial focus, focus trap, Tab/Shift+Tab, Escape close, opener restore, pending Escape lock을 검증한다.
- exact #8 capture test의 axe serious/critical violation과 console error는 `0`이다.
- current blue brand token, surface/border/text role token을 재사용하고 새 hard-coded color/dependency를 추가하지 않았다.
- 원본 PNG에서 primary/secondary action, product→brand/context, section hierarchy와 narrow wrap 품질을 확인했다.

## Independent verification

초기 focused Vitest 시도는 local dependency가 없어 `vitest not found`로 test discovery 전에 종료됐다. `pnpm install --frozen-lockfile` 성공 후 동일 명령을 fresh 재실행했으며, 그 사전 실패는 test pass/fail 수치에 포함하지 않는다.

| Command | Exact result |
| --- | --- |
| focused Vitest 5 files | `5 files / 42 tests passed` |
| `pnpm test:product` | `222 files passed / 11 intended skip`; `2,685 tests passed / 150 intended skip` |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm build` | production build pass; `78/78` static pages generated |
| exact #8 Playwright run 1 | `5 passed / 1 intended skip`; three canonical hashes match |
| exact #8 Playwright run 2 | `5 passed / 1 intended skip`; three canonical hashes match |
| exact #8 Playwright run 3 | `5 passed / 1 intended skip`; three canonical hashes match |
| relevant COOK_MODE a11y grep | `1 passed / 2 intended skip` |
| relevant COOK_MODE visual grep | `1 passed / 2 intended skip` |
| source-of-truth / workflow-v2 / workpack / automation / OMO bookkeeping | all pass |
| closeout-sync / authority evidence / exploratory QA evidence | all pass |
| commit validator | `20` commits pass |
| full diff check | pass |

PR #1311 exact product head check snapshot at re-review completion:

- Draft/open, base/head exact match, merge state `CLEAN`
- `18 total = 16 success + 2 intended skip + 0 in progress + 0 failed + 0 cancelled`
- intended skip: `lighthouse`, `full-regression`
- handoff 당시의 `8 in progress`를 final proof로 사용하지 않았다. 위 수치는 같은 exact product head에서 terminalized된 current snapshot이다.

## Findings

새 actionable finding 없음.

- P0: `0`
- P1: `0`
- P2: `0`
- unresolved required findings: `0`

## Lifecycle and limitations

- Stage 5 frontend re-review: **APPROVE** for exact product head `ee8863a5…`
- Design Status: `pending-review` 유지. 이 Stage 5 pass는 별도 final product-design-authority의 `confirmed` 권한을 대신하지 않는다.
- Lifecycle: `in_progress`
- Overall approval / verification / evaluation closeout: 기존 pending/not-started 상태 유지
- Final product-design-authority: pending
- Stage 6: pending
- Ready transition, merge, Discord: 수행·승인하지 않음
- Manual/server-Mac/OAuth와 merged-exact-SHA server-production/local-rehearsal evidence: pending
- full v1 compatibility 및 seeded R/R+1 drain: pending
- R, R+1, R+2와 service-owner capability activation/rollback approval: pending

Desktop Chromium emulation과 정적 PNG/axe는 physical iOS Safari, 실제 virtual-keyboard resize/occlusion, VoiceOver·TalkBack/screen-reader announcement, 손가락 touch 정확도 또는 전체 WCAG success criteria 준수를 완전히 증명하지 않는다. 이 한계는 그대로 Manual/final authority 후속 검증에 남긴다.
