# cooked-batch-weight-ui Stage 1 exact-cancel contradiction repair

## 역할과 범위

- 역할: Homecook #11 Stage 1 LEFTOVERS exact-cancel contradiction repair author
- author task ID: 현재 Codex task `019fe786-0f81-7c80-9238-d6088ae3d924`
- 모델/effort: GPT-5.6-Sol / high
- Claude CLI/app/API: 사용하지 않음
- finding: fresh design critic task `019fe77a-69a8-74d2-a11a-e79e7afa39ce`의 `P1-LO-RR-01`
- 수정 범위: README, acceptance, semantic regression, 이 evidence만 직접 수정한다. design, critic/internal report, automation, work item/status, official docs, product/API/schema/migration/dependency는 수정하지 않는다.

이 작업은 exact contradiction을 보수하는 author 작업이며 자기 변경을 승인하지 않는다. 신규 endpoint, field, status, error, action, route, RPC, migration 또는 public contract를 만들지 않는다.

## Report integration과 exact repair parent

| 역할 | 원본 commit | 이 계보의 commit / parent | 결과 |
| --- | --- | --- | --- |
| fresh design reports | `23c980c3c99450ce31d01437e2c2d4885702c0c4` | parent `e52aa5c5583635c849c74c084337e702a3f58060`; tree `0ac7b009804d983a00fc4e497bd3394148acee3f` | COOK_MODE `APPROVE 0/0/0`, LEFTOVERS `HOLD 0/1/0`과 `P1-LO-RR-01` 전달 |
| fresh internal 1.5 report | `794e0f5ad2d993d0b9340049db3dd2f4447d6772` | ordinary cherry-pick `856d27001c8c87b85cc9f457ecb23944b43eecc3`; parent `23c980c3c99450ce31d01437e2c2d4885702c0c4` | report-only path를 충돌 없이 통합; reviewed docs head `e52aa5c...` APPROVE 기록 보존 |
| exact-cancel repair | 이 commit | parent `856d27001c8c87b85cc9f457ecb23944b43eecc3` | README/acceptance/test/evidence만 수리; commit/tree는 최종 handoff에서 기록 |

통합된 internal 1.5 보고서는 `e52aa5c...`를 승인한 역사적 독립 evidence다. 이 수리로 README/acceptance/test bytes가 달라지므로 repaired exact head를 승인하지 않으며, fresh critic과 fresh internal 1.5 재검토가 모두 pending이다.

## P1-LO-RR-01 closure

README의 LEFTOVERS scope, Frontend Delivery Mode, State/Error Matrix와 acceptance `accept-batch-weight-ui-empty-depleted`를 아래 한 규칙으로 맞췄다.

1. 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거한다.
2. `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용한다.
3. generic reopen, non-current closure cancel, unrecoverable reversal은 금지한다.

README의 오래된 handoff도 현재 결과로 고쳤다. COOK_MODE `legacy-null`/depleted는 LEFTOVERS read-model only라 N/A이고, LEFTOVERS legacy/v2 two-section과 cursor pagination 보수는 완료됐다. 이 repair의 fresh independent rereview는 아직 pending이다.

## TDD RED / GREEN

### RED

- test first: `tests/cooked-batch-weight-ui-stage1-repair.test.ts`에 ordinary depleted mutation CTA absent, exact projected current-closure cancel present, generic reopen/non-current/unrecoverable reversal absent를 같은 test에서 잠갔다.
- 첫 실행은 worktree에 `vitest`가 없어 exit `254`였으며 semantic RED가 아니었다.
- `pnpm install --frozen-lockfile`로 기존 lockfile의 668 packages를 복원했고 package/lockfile 변경은 없었다.
- 문서 수리 전 재실행: `1 failed / 6 passed`. scope가 새 depleted rule을 포함하지 않아 새 test가 의도대로 실패했다.

### GREEN

- 문서 수리 뒤 focused single suite는 `1 file / 7 tests` 전부 통과했다.
- fresh design rereview의 기존 14-file/141-test 범위에 새 regression 하나를 포함한 exact 확장 suite는 `14 files / 142 tests` 전부 통과했다.

## Verification

| Check | Result |
| --- | --- |
| focused Stage 1 semantic regression | `1 file / 7 tests` pass |
| design/API/compatibility/completion/LEFTOVERS/workflow focused suite | `14 files / 142 tests` pass |
| source-of-truth/workflow/workpack/automation/OMO/authority/closeout validators 7종 | 모두 pass |
| lint / typecheck / audit high | lint pass; typecheck pass; audit exit 0, high/critical 0, residual low 1 / moderate 1 |
| diff / lineage / allowed-scope audit | `git diff --check` pass; repair parent `856d2700...`; 직접 수정 4개 허용 경로 exact match; package/lockfile/official API/automation/work item/status/design diff 0 |

## Lifecycle와 남은 gate

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- Stage 2/3: N/A
- Stage 4 component/E2E/visual/a11y/browser/runtime evidence: pending
- Manual physical keyboard, screen reader, real-device safe area/virtual keyboard: pending
- final product-design-authority: pending
- server-Mac/OAuth, R/R+1/R+2, capability activation: pending
- fresh independent design critic rereview: pending
- fresh independent internal 1.5 rereview of repaired exact head: pending

이 작업은 PR, merge, Discord, Stage 4, critic/internal reviewer 실행, authority, activation을 수행하지 않는다.
