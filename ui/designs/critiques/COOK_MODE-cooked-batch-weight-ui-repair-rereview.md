# COOK_MODE — cooked-batch-weight-ui Stage 1 repair 독립 재크리틱

## 판정

- Screen verdict: **APPROVE**
- P0 / P1 / P2: **0 / 0 / 0**
- unresolved required finding: **0**
- Contract Evolution Candidate: **없음**
- Combined unique gate: **HOLD — 0 / 1 / 0, unresolved 1**

COOK_MODE 자체의 original finding 3건은 모두 닫혔다. exact lineage 역할, two-design/two-critic 기계 잠금, legacy-null/depleted의 LEFTOVERS-only N/A 경계, local-only 용기 계산, 기존 #8 completion contract 재사용, 390px/320px bottom sheet와 접근성·runtime evidence 한계가 서로 일치한다.

다만 전체 #11 Stage 1은 LEFTOVERS와 결합 workpack 사이의 별도 P1 1건 때문에 HOLD다. 이 screen-level APPROVE는 전체 Stage 1 승인, runtime evidence 승인, authority 확인 또는 lifecycle promotion이 아니다.

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

이 task는 original generator/critic, 두 repair author, integration author와 다른 fresh task다. original HOLD report는 historical repair input으로만 읽었고 repaired head 승인으로 재사용하지 않았다. 설계·docs·tests·제품 코드는 수정하지 않는다.

## Git lineage 재검증

Local Git object가 확인한 실제 직계 계보는 다음과 같다.

`c16102a3` → `337daa80` → `0d64660f` → `ec1f1d81` → `23356ffc` → `5be80d22` → `e52aa5c5`

- `337daa80`: internal 1.5 HOLD report commit
- `0d64660f`: 두 original critic이 읽은 design input
- `ec1f1d81`: 두 original HOLD critic report commit
- `23356ffc`: design repair commit
- `5be80d22`: docs/automation repair cherry-pick commit
- `e52aa5c5`: integration provenance evidence commit

따라서 `c16102a3`는 역사적 product/base predecessor이며 repaired design commit의 직계 parent가 아니다. 두 design header는 reviewed input, internal HOLD, critic HOLD/repair base를 분리하고 두 HOLD를 비승인 evidence로 명시해 original lineage finding을 닫았다.

## Original finding closure

| Original finding | 재검토 결과 | Disposition |
| --- | --- | --- |
| `P1-CM-01` lineage 역할 혼합 | header가 reviewed design input `0d64660f`/tree, internal HOLD `337daa80`, critic HOLD/repair base `ec1f1d81`를 실제 object 역할대로 분리 | **closed** |
| `P1-CM-02` two-design/two-critic lock 부재 | supported `frontend.artifact_assertions`가 두 design과 두 exact cooked-batch critic path를 순서대로 보유하고 dedicated regression이 단일/generic path를 거부 | **closed** |
| `P2-CM-01` legacy-null/depleted 도달 불가 | §5가 두 상태를 `N/A — LEFTOVERS read-model only`로 제한하고 hidden `GET /cooked-batches`, 새 field/status/read를 금지하며 COOK_MODE evidence에서 제외 | **closed** |

## 직접 재검토 결과

- API v1.2.37은 #8 API v1.2.36 `0-CBW`를 보존하며 COOK_MODE는 기존 snapshot-v2 read/complete만 소비한다.
- completion은 exact pantry row IDs와 exact-one `set_finished_weight | weigh_later`만 전송한다. servings→grams, current remainder→original total, zero nutrition을 추정하지 않는다.
- container helper의 raw `food+container`/tare는 component-local state다. 유효한 양수 결과만 기존 `finished_weight_g` 입력으로 복사하며 helper 자체는 submit·persist·log하지 않는다.
- fresh completion parser는 `known|missing + available`만 허용한다. legacy-null/depleted는 invalid-response로 fail closed하고 historical rendering은 LEFTOVERS에 남긴다.
- 390px/320px hierarchy는 familiar bottom sheet, sheet-internal vertical scroll, fixed footer, safe area, 44×44px target, 16px+ numeric input, narrow stacking과 no horizontal overflow를 잠근다.
- title initial focus, inert background, Tab/Shift+Tab trap, Escape/close, pending dismiss lock, 409/422 alert focus, opener restore와 replay single effect를 명시한다.
- #11은 Stage 2/3 N/A, Stage 4 UI-only다. #9 meal-log backend와 #12 consumed UI를 선점하지 않고 새 endpoint/field/status/error/action/RPC/DML을 만들지 않는다.
- Markdown/ASCII/향후 PNG는 runtime focus, virtual keyboard, safe-area geometry, screen reader, contrast, full WCAG 또는 physical-device 동작을 증명하지 않는다. 해당 evidence는 Stage 4/Manual/final authority pending이다.

## Artifact lock 확인

`docs/workpacks/cooked-batch-weight-ui/automation-spec.json`의 supported index와 `tests/cooked-batch-weight-ui-stage1-repair.test.ts`가 아래 네 path를 exact order로 잠근다.

1. `ui/designs/COOK_MODE.md`
2. `ui/designs/LEFTOVERS.md`
3. `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
4. `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`

기존 두 critic은 repaired head 승인물이 아니라 historical HOLD input이다. 이 rereview가 repaired exact integration head를 별도로 판정한다.

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

초기 focused Vitest 호출은 clean worktree에 `vitest`가 없어 exit 254였다. `pnpm install --frozen-lockfile`로 기존 lockfile의 668 packages를 복원한 뒤 동일·확장 suite가 pass했고 `package.json`/`pnpm-lock.yaml` 변경은 없다.

## Combined gate

COOK_MODE는 unresolved 0으로 **APPROVE**다. 그러나 LEFTOVERS 설계의 exact current-closure cancel 예외와 결합 README/acceptance의 “모든 depleted mutation CTA 제거” 문구가 충돌하므로 전체 unique gate는 **HOLD**다. 정확한 repair는 sibling rereview report `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-repair-rereview.md`의 `P1-LO-RR-01`을 따른다.
