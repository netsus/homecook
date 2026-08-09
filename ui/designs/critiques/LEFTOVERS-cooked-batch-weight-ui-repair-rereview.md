# LEFTOVERS — cooked-batch-weight-ui Stage 1 repair 독립 재크리틱

## 판정

- Screen verdict: **HOLD**
- P0 / P1 / P2: **0 / 1 / 0**
- unresolved required finding: **1**
- Combined unique gate: **HOLD — 0 / 1 / 0, unresolved 1**
- Contract Evolution Candidate: **없음**

Original critic의 LEFTOVERS finding 6건과 두 화면 중복을 합친 original unique finding 7건은 repaired design과 artifact lock에서 모두 닫혔다. 하지만 병렬 docs/automation repair를 결합한 현재 integration head가 exact current unweighed closure의 유일한 허용 mutation인 `cancel_current`를 “모든 depleted mutation CTA 제거” 규칙으로 다시 상쇄한다. 구현자가 어느 문서를 따르면 되는지 달라지는 required behavior contradiction이므로 unresolved 0 조건을 충족하지 못한다.

## 독립성 및 exact target

- 역할: Homecook #11 `cooked-batch-weight-ui` fresh independent Stage 1 design-critic rereviewer
- critic task ID: `019fe77a-69a8-74d2-a11a-e79e7afa39ce`
- original critic task ID: `019fe752-e4f6-7cc1-99b2-c57b438b069a`
- design repair task ID: `019fe75f-aa5e-7e33-b940-3b4d486c10fa`
- docs/automation repair task ID: `019fe75f-aa5e-7e33-b940-3b64df4d9015`
- integration task ID: `019fe771-88ef-73f1-b787-64522aee3d10`
- 모델/effort: GPT-5.6-Sol / high
- Claude CLI/app/API: 사용하지 않음
- reviewed head: `e52aa5c5583635c849c74c084337e702a3f58060`
- reviewed tree: `8664f600497d8215b1c45d1478b2098d0b9c2ce6`
- reviewed parent: `5be80d22682cbcee9e256027304710cc6c0c851a`
- exact Stage 1 master base: `c16102a3072e929e45bb24a69464cd3110d03db5`

이 task는 original generator/critic, repair authors, integration author와 다른 fresh task다. original HOLD report와 author evidence는 repair provenance로만 읽었고 승인 verdict를 상속하지 않았다. 원본 HOLD report, design, docs, tests, 제품 코드, API는 수정하지 않는다.

## Findings

### P1-LO-RR-01 — 결합 workpack이 exact `cancel_current` 예외를 모든 depleted CTA 제거 규칙으로 상쇄함

공식 API v1.2.37 `0-CBW`는 `current_unweighed_closure_event_id`를 **현재 active terminal `closed_unweighed`이고 같은 ID로 `cancel_current` 가능한 경우에만** non-null로 투영한다. 같은 문서는 `POST /cooked-batches/{id}/close-unweighed`의 exact `cancel_current` request와 success action을 고정하고, current closure가 아니거나 later event가 있으면 409로 막는다.

Repaired `ui/designs/LEFTOVERS.md`도 이 authority를 정확히 따른다.

- §4.5: non-null exact projection에서만 secondary `[방금 종료 취소]`를 노출한다.
- §6.2/6.4: depleted는 다른 mutation을 제거하되 exact eligible current-closure cancel만 예외다.
- §7/§9.3: projected event ID + current revision + `action=cancel_current`만 보낸다.
- generic reopen, non-current reversal, `marked_unrecoverable` reversal은 금지한다.

그러나 결합 workpack은 동시에 다음과 같이 기록한다.

- `README.md` Frontend Delivery Mode: `every depleted`에서 `mutation affordance 제거`.
- `acceptance.md` `accept-batch-weight-ui-empty-depleted`: `every depleted state removes mutation CTAs`.
- 같은 `acceptance.md`의 별도 항목은 `only exact eligible current closure can cancel`을 요구한다.
- automation은 `leftovers-current-closure-cancel-no-generic-reopen`을 required state로 요구한다.

즉 같은 integration head 안에서 exact cancel을 **보여야 한다**와 모든 mutation CTA를 **없애야 한다**가 동시에 존재한다. 이는 copy 수준이 아니라 공식 lifecycle action의 노출 조건을 반대로 만드는 구현 blocker다. 현재 focused regression은 four-artifact path와 broad `depleted`/`Stage 4` 문자열만 확인하므로 이 모순에서도 green이다.

#### Exact repair

1. `docs/workpacks/cooked-batch-weight-ui/README.md`의 scope, Frontend Delivery Mode, State/Error Matrix를 다음 단일 규칙으로 맞춘다: 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거하되, `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에만 secondary `[방금 종료 취소]`를 노출한다.
2. `docs/workpacks/cooked-batch-weight-ui/acceptance.md`의 `accept-batch-weight-ui-empty-depleted`를 같은 예외가 드러나도록 고친다. 기존 `accept-batch-weight-ui-no-reopen`과 모순되지 않아야 한다.
3. `tests/cooked-batch-weight-ui-stage1-repair.test.ts`에 “all ordinary depleted mutation CTA absent + exact projected current-closure cancel present + generic reopen absent”를 함께 요구하는 semantic regression을 추가한다.
4. README의 과거 handoff 문구인 `COOK_MODE ... 여부와 LEFTOVERS ... 결합은 design-generator 소유 repair`를 현재 repaired 결과로 갱신해 COOK_MODE N/A와 LEFTOVERS two-section/pagination 결합이 아직 미수행인 것처럼 읽히지 않게 한다.
5. design, API, DB, action enum 또는 public contract는 변경하지 않는다. 위 repair 뒤 새 exact head/tree를 이 task와 다른 fresh critic이 다시 검토한다.

## Original finding closure

| Original unique finding | 재검토 결과 | Disposition |
| --- | --- | --- |
| lineage evidence role 혼합 (`P1-CM-01`, `P1-LO-01`) | 두 design header가 reviewed input, internal HOLD, critic HOLD/repair base를 실제 Git object 역할대로 분리 | **closed** |
| two-design/two-critic lock (`P1-CM-02`, `P1-LO-02`) | supported artifact index + dedicated regression이 두 design/두 exact critic을 잠그고 single/generic path를 거부 | **closed** |
| legacy LEFTOVERS 기능 소실 (`P1-LO-03`) | `/leftovers`와 `/cooked-batches`를 independent section/identity/action group으로 분리하고 planner-add/다먹음/ATE_LIST/덜먹음/stale-review를 보존 | **closed** |
| cursor pagination 부재 (`P1-LO-04`) | familiar `더 보기`, `has_next`/nullable `next_cursor`, pending/error/retry/422 refresh, stable append, batch-ID overlap protection, focus/live announce를 정의 | **closed** |
| COOK_MODE unreachable legacy/depleted (`P2-CM-01`) | LEFTOVERS-only N/A, hidden read/new field/guessed state 금지 | **closed** |
| unsupported `[상세 확인]` (`P2-LO-01`) | affordance 제거; exact 15-field list card만으로 legacy-null read-only truth 완결 | **closed** |
| nonexistent `--border` (`P2-LO-02`) | general `--line`, destructive `--danger-border`; 실제 runtime token 존재 확인 | **closed** |

## 직접 재검토에서 통과한 항목

- Actual Git lineage는 `c16102a3 → 337daa80 → 0d64660f → ec1f1d81 → 23356ffc → 5be80d22 → e52aa5c5`이고 각 HOLD/repair/integration 역할이 evidence와 일치한다.
- `/leftovers` legacy identity/action과 `/cooked-batches` batch identity/action은 local namespace 외에 join하지 않는다. title/date/recipe/servings/position/ID similarity로 merge·cross-source dedupe하지 않는다.
- legacy planner-add/다먹음/ATE_LIST/덜먹음/stale-review는 legacy section에 남고 v2 batch action은 batch section에만 있다. guessed stable join이나 새 contract가 없다.
- 390px/320px에서 두 section heading/action hierarchy, single page vertical scroll, non-nested list, stacked 44px controls와 16px numeric input을 정의한다.
- cursor는 `availability=all` filter-bound opaque value 그대로 round-trip한다. `has_next=false → next_cursor=null`, next pending/error/retry, 422 first-page refresh, `(cooked_at,id)` server order, duplicate batch ID append suppression, mutation focus 보존과 polite announcement가 잠겼다.
- legacy-null `[상세 확인]`은 제거됐고 exact 15-field projection만으로 read-only copy를 완결한다. internal cursor/event ID를 표시·발화하지 않는다.
- canonical `--line`, existing `--danger-border`를 사용하며 undefined `--border`, 새 global token, fallback hex를 요구하지 않는다.
- familiar bottom sheet, internal scroll, fixed CTA, safe area, background lock, initial focus/trap/restore/Escape, pending dismiss lock, keyboard avoidance, linked alert/status와 screen-reader/non-color meaning을 요구한다.
- #11은 Stage 2/3 N/A, Stage 4 UI-only이며 #8 API를 재사용한다. #9 meal-log backend와 #12 consumed UI를 선점하지 않고 새 public contract·Route Handler·RPC·migration·DML을 추가하지 않는다.
- static Markdown/PNG는 runtime focus, virtual keyboard, screen reader, computed geometry/contrast, full WCAG 또는 physical-device 동작을 증명하지 않는다는 한계를 명시한다. 해당 evidence는 Stage 4/Manual/final authority pending이다.

## Artifact lock 확인

Supported `frontend.artifact_assertions`와 dedicated regression은 아래 four exact paths를 순서대로 잠근다.

1. `ui/designs/COOK_MODE.md`
2. `ui/designs/LEFTOVERS.md`
3. `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
4. `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`

기존 critic artifacts는 historical HOLD input이며 repaired integration approval이 아니다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| design/API/compatibility/completion/LEFTOVERS/workflow focused Vitest | `14 files / 141 tests` pass |
| SOT/workflow-v2/workpack/automation/OMO/authority-presence/closeout validators | 7종 pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| integration delta와 worktree `git diff --check` | pass |
| product/API/schema/package diff from Stage 1 base | 없음 |

초기 Vitest는 clean worktree의 missing `vitest`로 exit 254였고 semantic RED가 아니다. `pnpm install --frozen-lockfile` 뒤 668 packages가 lockfile 변경 없이 복원됐고 동일·확장 suite는 pass했다.

Validator/test green은 `P1-LO-RR-01`을 상쇄하지 않는다. 현재 test가 exact-current-cancel과 every-depleted-no-mutation의 공존을 semantic하게 검사하지 않는 것이 이 finding의 일부다.

## 다음 gate

LEFTOVERS와 전체 unique gate는 **HOLD**다. 위 exact docs/test repair만 별도 author task에서 수행하고, 새 exact head/tree에 fresh independent design rereview를 다시 받아야 한다. Stage 4, authority, internal 1.5, activation, PR/merge는 이 report가 승인하지 않는다.
