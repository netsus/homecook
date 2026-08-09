# COOK_MODE — cooked-batch-weight-ui exact-cancel 최종 독립 재크리틱

## 판정

- Screen verdict: **APPROVE**
- P0 / P1 / P2: **0 / 0 / 0**
- unresolved required finding: **0**
- Combined unique gate: **APPROVE — 0 / 0 / 0, unresolved 0**
- Contract Evolution Candidate: **없음**

Exact-cancel repair는 COOK_MODE design/API를 바꾸지 않았고, 기존 COOK_MODE original finding 3건의 closure도 그대로 유지한다. repaired README의 stale handoff는 COOK_MODE의 `legacy-null`/depleted를 LEFTOVERS read-model only인 N/A로 현재화했으며, COOK_MODE가 hidden batch read나 guessed status를 추가해야 한다는 오해를 제거했다. 따라서 COOK_MODE와 전체 #11 design-critic gate 모두 unresolved 0으로 승인한다.

이 판정은 Stage 1 정적 design gate에 한정한다. Design Status는 계속 `temporary`이며 Stage 4 구현, 390px/320px runtime evidence, Stage 5, final product-design-authority, Stage 6, Manual 또는 activation을 승인하지 않는다.

## 독립성 및 exact target

- 역할: Homecook #11 `cooked-batch-weight-ui` fresh independent final design-critic rereviewer
- critic task ID: `019fe78e-f5a4-7662-b89a-8bdc9ee98269`
- exact-cancel repair author task ID: `019fe786-0f81-7c80-9238-d6088ae3d924`
- prior critic task ID: `019fe77a-69a8-74d2-a11a-e79e7afa39ce`
- original critic task ID: `019fe752-e4f6-7cc1-99b2-c57b438b069a`
- 모델/effort: GPT-5.6-Sol / high
- Claude CLI/app/API: 사용하지 않음
- reviewed head: `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f`
- reviewed tree: `51c79e12ad4ff76a62676b686698978519479bf6`
- reviewed parent: `856d27001c8c87b85cc9f457ecb23944b43eecc3`
- reviewed lineage: `e52aa5c5583635c849c74c084337e702a3f58060` integration → `23c980c3c99450ce31d01437e2c2d4885702c0c4` prior design reports → `856d27001c8c87b85cc9f457ecb23944b43eecc3` historical internal APPROVE report cherry-pick → `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f` exact-cancel repair

이 task는 generator, repair author, prior critics, internal reviewer와 다른 fresh task다. historical HOLD/APPROVE report의 verdict를 상속하지 않고 exact repaired bytes와 공식 계약을 직접 대조했다. 기존 design, docs, tests, original reports는 수정하지 않는다.

## Exact repair와 scope audit

`856d2700...` 대비 `413d8ffa...`의 변경은 다음 네 경로뿐이다.

1. `docs/workpacks/cooked-batch-weight-ui/README.md`
2. `docs/workpacks/cooked-batch-weight-ui/acceptance.md`
3. `tests/cooked-batch-weight-ui-stage1-repair.test.ts`
4. `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage1-exact-cancel-contradiction-repair.md`

`ui/designs/COOK_MODE.md`, `ui/designs/LEFTOVERS.md`, automation spec, work item/status, 공식 API, product code, schema/migration, `package.json`, `pnpm-lock.yaml`의 diff는 0이다. 새 endpoint, field, status, error, action, route, RPC, migration, dependency 또는 public contract가 없다.

Repair evidence의 TDD 기록도 diff와 일치한다. semantic test를 먼저 추가한 문서 수리 전 실행은 `1 failed / 6 passed`, 수리 뒤 single suite는 `7/7`, exact prior focused 범위는 `14 files / 142 tests`다. 초기 `vitest` 미설치 exit 254는 semantic RED로 계산하지 않았다.

## COOK_MODE original finding closure 재확인

| Original finding | exact repaired head 재검토 | Disposition |
| --- | --- | --- |
| `P1-CM-01` lineage 역할 혼합 | design header가 reviewed input, internal HOLD, critic HOLD/repair base를 분리하고 각 HOLD를 비승인 repair input으로 명시한다. | **closed** |
| `P1-CM-02` two-design/two-critic lock 부재 | supported artifact index와 regression이 두 design 및 두 exact current critic path를 exact order로 잠근다. | **closed** |
| `P2-CM-01` unreachable legacy-null/depleted | COOK_MODE §5와 repaired README가 두 상태를 LEFTOVERS-only N/A로 일치시키고 hidden `GET /cooked-batches`, 새 field/status, guessed state를 금지한다. | **closed** |

COOK_MODE는 snapshot-v2 cook-mode read와 existing complete mutation만 소비한다. exact pantry row, explicit `[]`, exact-one `set_finished_weight | weigh_later`, food-only original total, local-only container helper, replay single effect와 fail-closed invalid response가 유지된다. servings→grams, current remainder→original total, zero nutrition 또는 historical batch fetch를 만들지 않는다.

## Original unique finding 7건과 artifact lock

두 original critic의 중복을 합친 unique finding 7건은 exact repaired head에서 모두 닫혀 있다.

| Unique finding | 결과 |
| --- | --- |
| lineage evidence role 혼합 | closed |
| two-design/two-critic 기계 lock 부재 | closed |
| legacy LEFTOVERS 기능 소실 | closed |
| cursor pagination UX 부재 | closed |
| COOK_MODE unreachable legacy/depleted | closed |
| unsupported legacy `[상세 확인]` | closed |
| nonexistent `--border` token | closed |

Supported `frontend.artifact_assertions`와 dedicated regression은 다음 exact order를 고정한다.

1. `ui/designs/COOK_MODE.md`
2. `ui/designs/LEFTOVERS.md`
3. `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
4. `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`

Historical original critic 두 파일은 finding provenance이며 repaired head 승인물로 재해석하지 않는다. 이 report가 repaired exact head의 fresh COOK_MODE 판정을 제공한다.

## 390px / 320px, mobile UX와 접근성

- 기존 whole-board mental model과 familiar bottom sheet를 유지한다. page-level horizontal scroll은 없고 sheet body만 내부 세로 스크롤하며 footer와 safe area가 고정된다.
- 390px은 exact pantry rows와 weight choice/CTA hierarchy를 한 sheet에서 유지한다. 320px은 labels와 footer actions를 stack하고 target/font를 축소하지 않는다.
- 모든 target은 44×44px 이상, numeric input은 16px 이상이며 virtual keyboard에서도 active input, linked error, CTA가 sheet-internal scroll로 접근 가능해야 한다.
- title initial focus, inert background, Tab/Shift+Tab trap, Escape/close, pending dismiss lock, 409/422 alert focus, opener restore, role=status/alert와 non-color meaning이 명시돼 있다.
- current app role tokens만 사용하고 new hex/global token을 추가하지 않는다. helper는 low-emphasis inset이며 primary completion CTA와 경쟁하지 않는다.

이번 task에서 직접 검사한 predecessor visual은 COOK_MODE 390px/320px whole-board·sheet 상태 evidence다. 이는 familiar interaction reference일 뿐 fresh #11 runtime evidence가 아니다. Stage 1 Markdown/ASCII와 predecessor PNG는 runtime focus, virtual keyboard, computed geometry/contrast, screen reader 또는 WCAG conformance를 증명하지 않는다.

## #9 / #12와 lifecycle 경계

- #11 Stage 2/3은 N/A이고 Stage 4 frontend UI-only다.
- #9는 meal-log DB/API/write/events/pointers를 소유한다. #11은 해당 schema/route/server surface를 수정하지 않는다.
- #12는 consumed-amount add/edit/delete UI를 소유한다. #11 COOK_MODE는 consumed CTA 또는 meal-log sheet를 렌더하지 않는다.
- #8 merged API/runtime과 broader Manual/server-Mac/OAuth, R/R+1/R+2, activation pending을 분리한다.
- lifecycle `planned`, approval `not_started`, verification `pending`, evaluation `not_started`, `auto_merge_eligible=false`를 유지한다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| exact focused design/API/compatibility/completion/LEFTOVERS/workflow Vitest | `14 files / 142 tests` pass |
| additional current-code superset Vitest | `14 files / 162 tests` pass |
| source-of-truth/workflow-v2/workpack/automation/OMO/authority-presence/closeout validators | `7/7` pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| `git diff --check` | pass |
| repair scope / unchanged contract audit | allowed 4 paths exact match; design/API/automation/work item/status/product/package diff 0 |

## 최종 결론과 evidence limits

COOK_MODE는 original finding 3건과 combined unique finding 7건의 관련 closure가 유지되고, exact-cancel repair가 새 모순이나 계약 확장을 만들지 않았다. **Screen APPROVE 0/0/0**, combined design-critic gate도 **APPROVE 0/0/0**이다.

Stage 4는 fresh implementation manifest와 390px/320px/desktop evidence, runtime focus/keyboard/overflow/automated accessibility proof를 새로 만들어야 한다. physical keyboard, VoiceOver/TalkBack, real-device safe area/virtual keyboard와 full WCAG는 Manual pending이며 final authority가 별도로 판정한다.
