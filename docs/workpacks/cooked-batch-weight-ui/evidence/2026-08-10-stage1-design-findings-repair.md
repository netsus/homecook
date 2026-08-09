# cooked-batch-weight-ui Stage 1 design findings repair

- 작업 일자: 2026-08-10
- 역할: fresh Stage 1 design-repair generator
- Codex task ID: `019fe75f-aa5e-7e33-b940-3b4d486c10fa`
- 실행 모델: GPT-5.6-Sol, high
- Claude 사용: 없음
- 작업 브랜치: `docs/cooked-batch-weight-ui-stage1-design-findings-repair`
- exact start HEAD: `ec1f1d816089bdb8973972107f7f0fedd7dbe033`
- exact start tree: `7d244a636527d1530217b6b99c92b7de84fb6f22`
- exact start parent: `0d64660ff8a7059754f1534cf7663573247a5263`
- 소유 파일: `ui/designs/COOK_MODE.md`, `ui/designs/LEFTOVERS.md`, 이 보고서

## 판정 경계

이 작업은 critic의 설계 finding을 보수하는 generator 작업이다. 이전 HOLD를 승인으로 바꾸거나 fresh critic/final authority를 대신하지 않는다. runtime PNG/Figma, product code, API/DB/migration, README/acceptance/automation/work item/status, critic report는 수정하지 않는다.

## Exact evidence roles

| 역할 | Exact object/artifact | 의미 |
| --- | --- | --- |
| product/base predecessor | `c16102a3072e929e45bb24a69464cd3110d03db5` | #8 merge lineage의 역사적 predecessor이며 repaired design head의 parent라는 주장이 아님 |
| internal 1.5 HOLD evidence | commit `337daa808971802c79698df64c70240205addba4`; `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage1-internal1-5-review.md` | P1-04 등 repair 요구를 제시한 HOLD 보고서; 승인 아님 |
| reviewed design input | commit `0d64660ff8a7059754f1534cf7663573247a5263`; tree `f41f2ed854a3596dc09928063a11308f38c6552f`; parent `337daa808971802c79698df64c70240205addba4` | 두 exact critic이 실제로 읽은 COOK_MODE/LEFTOVERS bytes |
| critic HOLD evidence / repair start | commit `ec1f1d816089bdb8973972107f7f0fedd7dbe033`; tree `7d244a636527d1530217b6b99c92b7de84fb6f22`; parent `0d64660ff8a7059754f1534cf7663573247a5263` | 두 critic 보고서를 추가한 현재 repair base; 승인 아님 |

설계 header의 과거 `HOLD report → parent/current base c16102a…` 화살표는 실제 Git object 관계와 달랐으므로 제거했다. 새 repaired commit/tree/parent는 자기참조를 피하기 위해 커밋 후 task handoff에서 보고한다.

## Artifact index and freshness

| 역할 | Canonical path | 현재 분류 |
| --- | --- | --- |
| COOK_MODE generator design | `ui/designs/COOK_MODE.md` | 이 task에서 repaired |
| LEFTOVERS generator design | `ui/designs/LEFTOVERS.md` | 이 task에서 repaired |
| COOK_MODE critic evidence | `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` | `ec1f1d…`의 HOLD input; repaired design approval 아님 |
| LEFTOVERS critic evidence | `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` | `ec1f1d…`의 HOLD input; repaired design approval 아님 |

이 index는 두 설계와 두 exact critic 경로를 빠짐없이 고정하고 generic `*-critique.md` 경로를 사용하지 않는다. 다만 `automation-spec.json`과 validator regression test의 기계 lock은 이 task의 명시적 수정 금지 범위다. 따라서 그 cross-lane 변경이 통합되기 전까지 P1 artifact-lock 전체 closure를 주장하지 않는다.

## Unique finding disposition

두 critic의 중복을 합친 시작 finding은 `P0/P1/P2 = 0/4/3`이다.

| Unique finding | Source finding | 설계 보수 | 이 task disposition |
| --- | --- | --- | --- |
| P1-01 evidence lineage role 혼합 | P1-CM-01, P1-LO-01 | 두 design header와 이 보고서에서 reviewed design input, internal HOLD, critic HOLD/repair start를 실제 Git object로 분리하고 HOLD 비승인 경계를 명시 | **closed in owned design lane** |
| P1-02 두 design/두 critic 기계 lock 부재 | P1-CM-02, P1-LO-02 | 이 보고서에 canonical four-artifact index와 freshness/비승인 분류를 추가 | **design-side index closed; automation/test lock pending outside ownership** |
| P1-03 기존 LEFTOVERS 기능 소실 | P1-LO-03 | `/leftovers` legacy 관리와 `/cooked-batches` v2 중량을 독립 section/read model로 분리; legacy planner-add/다먹음/ATE_LIST/덜먹음/stale-review 보존; source ID/action group 교차 금지; 390/320 hierarchy 추가 | **closed in owned design lane** |
| P1-04 cursor pagination UX 부재 | P1-LO-04 | familiar `더 보기`, exact `has_next/next_cursor`, next pending/error/retry, filter-bound 422 refresh, tuple order, batch-ID overlap 방지, pending 보존, live announce/focus, opaque cursor 불변을 추가 | **closed in owned design lane** |
| P2-01 COOK_MODE unreachable legacy/depleted | P2-CM-01 | `N/A — LEFTOVERS read-model only`로 잠그고 COOK_MODE evidence에서 제외; hidden GET/background read/new field/guessed state 금지 | **closed in owned design lane** |
| P2-02 unsupported `[상세 확인]` | P2-LO-01 | action을 제거하고 기존 15-field list item만으로 legacy-null card를 read-only 완결; detail endpoint/route/hidden read 금지 | **closed in owned design lane** |
| P2-03 nonexistent `--border` | P2-LO-02 | 일반 경계를 canonical `--line`, destructive 경계를 existing `--danger-border`로 교체; 새 token/hex 금지 | **closed in owned design lane** |

## Contract and ownership checks

- #11은 UI/client-adapter only이고 #8 existing API를 재사용한다.
- #9 meal-log backend field/event/link를 추가하거나 소유하지 않는다.
- #12 `먹은 양 기록`/consumed-amount/meal-log UI를 미리 렌더하지 않는다.
- `/leftovers`의 `leftover_id`와 `/cooked-batches`의 `batch_id`를 같은 ID로 가정하지 않는다. title/date/recipe/servings/position으로도 join 또는 cross-source dedupe하지 않는다.
- v2 batch card는 legacy eat/uneat/keep/planner-add를 호출하지 않고 legacy card는 weight/discard/adjust/close/cancel을 호출하지 않는다.
- COOK_MODE는 existing complete read/mutation만 사용하며 historical batch list를 hidden fetch하지 않는다.
- 새 endpoint, response/request field, status, action enum, error code, local persisted state, DB/RPC/migration, product code를 추가하지 않는다.

## Preserved mobile and accessibility contract

- familiar bottom sheet, body scroll lock, sheet-internal scroll, fixed footer/CTA, safe area를 유지한다.
- 390px/320px hierarchy, 44×44px minimum target, 16px+ numeric input, narrow stacking, no page horizontal overflow를 유지한다.
- title initial focus, trap, Escape/close pending lock, error focus, invoking-control restoration, keyboard avoidance, live status/error를 유지한다.
- cursor append는 polite count announcement와 deterministic focus rule을 갖고 mutation/action pending 및 correctable input을 보존한다.
- Markdown/ASCII는 runtime keyboard, focus, screen reader, virtual keyboard, geometry, contrast, physical device 또는 WCAG pass를 증명하지 않는다. 이 evidence는 Stage 4/final authority pending이다.

## Verification record

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; lockfile change 0 |
| source-of-truth / workflow-v2 / workpack / automation / OMO bookkeeping / authority-presence / closeout validators | 7종 pass |
| focused Vitest: workflow/OMO/SOT/authority + cooked-batch API contract/compatibility + LEFTOVERS frontend | `10 files / 123 tests` pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `git diff --check` | pass |
| token/path/contract grep | undefined `--border`의 positive 사용 0(금지 설명만 존재); `[상세 확인]` affordance 0(제거 설명만 존재); `--line`/`--danger-border`, COOK_MODE N/A, two-section binding, cursor states 확인 |

최종 owned-file/forbidden-file/commit-object 검증은 커밋 직전과 직후에 다시 실행하고 exact delivery object는 task handoff에서 보고한다.

## Remaining gate

1. 별도 ownership lane에서 automation/README/acceptance/test의 two-design/two-critic mechanical lock을 닫아야 한다.
2. repaired exact head/tree를 대상으로 이 generator와 다른 fresh critic task가 재검토해야 한다.
3. Stage 4 runtime evidence와 final product-design-authority는 계속 pending이다.

따라서 이 task는 **owned design findings repaired**까지만 주장하며 Stage 1 전체 APPROVE, runtime 구현 완료, authority confirmed, PR/merge를 주장하지 않는다.
