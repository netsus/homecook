# LEFTOVERS — cooked-batch-weight-ui Stage 1 독립 설계 크리틱

## 판정

- Verdict: **HOLD**
- P0 / P1 / P2: **0 / 4 / 2**
- Blocker / Major / Minor: **0 / 4 / 2**
- unresolved required finding: **6**
- Contract Evolution Candidate: **없음**

새 #8 cooked-batch projection과 delayed-weight/discard/adjust/close/cancel lifecycle 자체는 공식 계약에 맞고, #9/#12 선점도 피한다. 하지만 exact lineage, 두 화면/두 critic artifact lock, 기존 LEFTOVERS 공식 기능과의 결합, cursor pagination, 근거 없는 detail action, 존재하지 않는 token 참조가 남아 있어 승인할 수 없다.

## 독립성 및 exact target

- 역할: Homecook #11 `cooked-batch-weight-ui` fresh independent Stage 1 design-critic
- critic task ID: `019fe752-e4f6-7cc1-99b2-c57b438b069a`
- design-generator task ID: `019fe746-8d84-7cd2-9f12-9c4ccbea0789` — 다른 task
- source coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- 모델: GPT-5.6-Sol, high
- Claude 사용: 없음
- reviewed head: `0d64660ff8a7059754f1534cf7663573247a5263`
- reviewed tree: `f41f2ed854a3596dc09928063a11308f38c6552f`
- local Git object에서 관찰한 reviewed-head parent: `337daa808971802c79698df64c70240205addba4`
- 사용자 제공 parent tuple: `c16102a3072e929e45bb24a69464cd3110d03db5` — local commit object와 불일치
- reviewed delta의 실제 parent-to-head 파일: `ui/designs/COOK_MODE.md`, `ui/designs/LEFTOVERS.md` 두 개

HOLD report `337daa8…`는 P1-04 closure 기준으로 읽었지만 설계 승인이나 독립 review 판정으로 재사용하지 않았다. 제품/설계 원본/API/tests/PNG/Figma/README/acceptance/automation/work item/status는 수정하지 않는다.

## 직접 대조한 기준

- `AGENTS.md`, current SOT와 공식 요구사항/화면/Flow/DB/API tuple
- product-design authority, mobile UX, design tokens, anchor-screen 규칙
- #11 README/acceptance/automation과 HOLD P1-04 report
- #8 backend/Stage 4/final authority/Stage 6 evidence
- current `components/leftovers/leftovers-screen.tsx`, `ate-list-screen.tsx`, planner leftover picker
- current `/leftovers` 및 `/cooked-batches` types/client/server/routes와 compatibility tests
- API v1.2.37 exact projection, cursor pagination, owner/nondisclosure, mutation/idempotency contract

## Findings

### P1-LO-01 — exact target lineage 표기가 검증 가능한 tuple과 일치하지 않음

COOK_MODE와 같은 공통 header가 `HOLD report 337daa8… → parent/current base c16102a…`를 기록하지만 local exact commit object parent는 `337daa8…`다. review input, base, report-only evidence와 parent가 한 화살표에 섞여 fresh review 재현성이 없다.

필수 보수:

1. `reviewed design base`, `HOLD report evidence`, `reviewed head/tree`를 분리한다.
2. Git object와 일치하지 않는 parent 표기를 제거한다.
3. HOLD report를 design lineage/approval로 오해할 표현을 없앤다.

### P1-LO-02 — P1-04의 LEFTOVERS design/critic 경로가 기계적으로 잠기지 않음

`automation-spec.json`은 required screen에 LEFTOVERS를 적지만 `generator_artifact`와 `critic_artifact`는 COOK_MODE 단일 경로만 가진다. 이 보고서의 exact 경로도 automation/README의 generic `LEFTOVERS-critique.md`와 다르다. validator green만으로 두 fresh artifact를 증명할 수 없다.

필수 보수:

1. supported manifest/index에 COOK_MODE·LEFTOVERS design 두 경로와 두 cooked-batch-weight-ui critic 경로를 모두 기록한다.
2. README/acceptance/automation의 canonical 경로를 맞춘다.
3. 한 화면/critic 누락 또는 stale path에서 validator가 실패하는 회귀를 추가한다.

### P1-LO-03 — 공식 legacy planner-add/done-eating UX를 보존하는 결합 규칙이 없음

설계는 기존 `PlannerAddSheet`, `플래너에 추가`, `다먹음`, ATE_LIST routing과 `POST /meals` binding을 #11 artifact에서 제거하고, 제품이 이를 유지할 경우에만 별도 surface로 두라고 조건부 표현한다. 그러나 current official 요구사항/Flow와 현재 구현/tests는 LEFTOVERS의 `플래너에 추가`, legacy `다먹음`, 다먹은 목록과 `덜먹음`, stale-review/계속 보관을 여전히 요구한다. #8 compatibility는 v2 discarded/mixed를 `eaten`으로 투영하지 않으면서 legacy row writer를 보존한다.

또한 cooked-batch 15-field projection에는 `stale_reviewed_at`, `source_meal_label`, `source_planned_servings`가 없어 문서의 “optional existing stale-storage notice”를 이 read model만으로 유지할 수 없다. title/date로 두 API 결과를 추측 join하면 owner truth와 row identity를 훼손한다.

필수 보수:

1. 기존 LEFTOVERS 기능은 “있으면 유지”가 아니라 공식 required existing surface로 명시한다.
2. legacy row와 v2 cooked-batch row를 어떤 stable identity/source로 구분하고 어느 action group을 보이는지 정보 구조를 추가한다.
3. v2 row에는 legacy eat/uneat을 호출하지 않고, legacy row에는 #11 weight mutation을 추측 노출하지 않는다.
4. planner-add/done-eating/ate-list/stale-review와 #11 batch actions가 같은 카드에서 혼동되지 않도록 별도 section/action hierarchy와 390/320 wireframe을 제공한다.
5. 기존 `/leftovers`와 `/cooked-batches`를 함께 소비해야 한다면 exact adapter/identity rule을 기존 contract 안에서 정의한다. 안전한 join key가 없으면 새 contract를 발명하지 말고 contract-evolution 후보로 별도 HOLD한다.

### P1-LO-04 — `limit=20` 이후 항목을 여는 cursor pagination UX가 없음

문서는 `GET /cooked-batches?availability=all&limit=20[&cursor=opaque]`를 binding하지만 page/list wireframe과 state matrix에는 `has_next`, `next_cursor`, 다음 page loading/error/retry, 중복 방지, 새 항목 announce/focus가 없다. 현재 계약은 default 20/max 50의 stable cursor list이므로 그대로 구현하면 21번째 이후 owner record가 접근 불가할 수 있다.

필수 보수:

1. familiar `더 보기` 또는 bounded infinite-scroll 중 한 패턴을 선택하고 390/320 hierarchy를 추가한다.
2. `has_next=false`, nullable `next_cursor`, next-page pending/error/retry와 filter-bound cursor 422를 정의한다.
3. append 시 `(cooked_at,id)` stable order, duplicate card 방지, action pending 보존, screen-reader 새 항목 announcement와 focus 정책을 잠근다.
4. opaque cursor를 표시·해석·변경하지 않는다.

### P2-LO-01 — legacy unknown 카드의 `[상세 확인]`에 기존 binding이 없음

legacy all-null 카드 wireframe은 `[상세 확인]` action을 제공하지만 data/API binding에는 list와 six mutation만 있고 detail endpoint, local read-only sheet, route가 정의되지 않는다. 이 상태로 구현하면 문서에 없는 endpoint/navigation을 만들거나 아무 동작 없는 affordance가 생길 수 있다.

필수 보수:

1. 15-field list item만 쓰는 local read-only detail sheet라면 그 layout, close/focus, 표시 가능한 field를 명시하거나,
2. 별도 정보가 없다면 action을 제거하고 카드 자체를 read-only truth로 완결한다.
3. 새 detail endpoint나 hidden mutation을 추가하지 않는다.

### P2-LO-02 — visual rule이 존재하지 않는 `--border` token을 요구함

설계는 current token으로 `--border`를 적지만 `docs/design/design-tokens.md`와 `app/globals.css`의 app token에는 해당 변수가 없다. 현재 divider/border 역할은 `--line`, `--brand-primary-border`, `--danger-border` 등으로 존재한다. 구현자가 undefined token 또는 ad-hoc fallback/hex를 만들 가능성이 있다.

필수 보수:

1. 일반 경계는 canonical `--line` 또는 현재 실제 역할 token으로 교체한다.
2. destructive border가 필요하면 기존 `--danger-border`를 명시한다.
3. 새 global token/hex를 이 UI slice에서 임의 추가하지 않는다.

## 통과한 설계 항목

- exact 15-field owner projection과 existing weight/discard/adjust/close/cancel request/success wrapper를 그대로 사용한다.
- known/missing/unrecoverable/legacy-null/depleted와 six depleted labels를 구분하고 consumed 두 종류만 legacy eaten/XP로 취급한다.
- #9 meal-log backend, #12 consumed CTA/UI를 선점하지 않고 discard/adjust가 meal entry/XP를 만들지 않음을 명시한다.
- unrecoverable은 irreversible이고 restore/marker reversal/g input이 없으며 current exact closure만 `cancel_current` 가능하다.
- stale revision, 409/422, same-key replay/different-payload, UUID key, expected revision, owner-only 404 nondisclosure를 보존한다.
- 390/320 bottom sheet, internal scroll/fixed CTA/safe area, 44px, 16px numeric, narrow stacking, destructive confirmation/cancel, focus trap/restore/Escape/pending lock/live error를 요구한다.
- static Markdown/PNG와 runtime keyboard/focus/AT/physical-device/WCAG evidence의 한계를 명시하고 Stage 4 pending으로 둔다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| source-of-truth / workflow-v2 / workpack / automation / OMO / authority-presence / closeout validators | pass |
| focused workflow/OMO/SOT/authority Vitest | `7 files / 72 tests` pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| exact design parent-to-head `git diff --check` | pass |
| reviewed parent-to-head file list | COOK_MODE + LEFTOVERS only |

현재 validator가 COOK_MODE 단일 artifact path로 통과하는 사실은 P1-LO-02를 해소하지 않는다.

## Evidence limits 및 다음 gate

이 보고서는 정적 design source와 current code/tests/API를 대조한 Stage 1 critique다. runtime focus order/trap/restore, Escape, virtual keyboard, safe-area, computed overflow/target/font, screen reader/live region, contrast, full WCAG, physical device evidence는 Stage 4 pending이며 이번 task가 승인하지 않는다.

위 6개 repair가 반영된 새 exact head/tree를 다른 fresh critic이 재검토하기 전까지 LEFTOVERS design gate와 전체 P1-04 closure는 **HOLD**다.
