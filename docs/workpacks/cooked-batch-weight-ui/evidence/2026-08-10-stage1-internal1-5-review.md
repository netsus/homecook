# cooked-batch-weight-ui Stage 1 internal 1.5 독립 리뷰

- 리뷰 일자: 2026-08-10
- 역할: fresh independent Stage 1 internal 1.5 docs-gate reviewer
- Codex task ID: `019fe738-2551-7be0-993a-df0c172c9290`
- 실행 모델: GPT-5.6-Sol, high
- Claude 사용: 없음
- 리뷰 기준 브랜치: `origin/master`
- exact base/HEAD: `c16102a3072e929e45bb24a69464cd3110d03db5`
- base tree: `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`
- base parents: `6781fa04a4d45678e765be74866d195c8146d27d`, `2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d`
- 리뷰 대상: `cooked-batch-weight-ui`
- 독립성: 기존 Stage 1 작성자 및 #8 task와 다른 task에서 수행했으며, 이 보고서는 작성자의 변경을 승인하지 않는다.

## 최종 판정

**HOLD**

| 등급 | 건수 | 미해결 required |
| --- | ---: | ---: |
| P0 | 0 | 0 |
| P1 | 6 | 6 |
| P2 | 0 | 0 |

자동 validator와 집중 테스트는 통과했지만, 현재 공식 문서 튜플과 lineage, 이미 병합된 #8 의존성 상태, Stage 1 고위험 UI 설계 산출물, UI-only 소유권, 모바일·접근성 증거 계약이 문서에 충분히 고정되지 않았다. `unresolved required = 0` 조건을 만족하지 않으므로 Stage 1 docs gate를 승인할 수 없다.

## 기준선과 공식 계약 확인

`git fetch origin --prune` 후 `origin/master`는 사용자가 지정한 #8 merge SHA와 동일한 `c16102a3072e929e45bb24a69464cd3110d03db5`였다. 더 최신 master로의 전환은 필요하지 않았다.

현재 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`가 고정한 공식 튜플은 다음과 같다.

| 종류 | 현재 공식 문서 |
| --- | --- |
| 요구사항 | `docs/요구사항기준선-v1.7.30.md` |
| 화면정의서 | `docs/화면정의서-v1.5.34.md` |
| 유저 Flow맵 | `docs/유저flow맵-v1.3.32.md` |
| DB 설계 | `docs/db설계-v1.3.32.md` |
| API 문서 | `docs/api문서-v1.2.37.md` |

공식 API v1.2.37은 v1.2.36의 cooked-batch 계약을 보존한다. #11의 소유 범위는 `COOK_MODE`와 `LEFTOVERS`에서 기존 cooked-batch weight 조회, discard, adjust, close UI를 제공하는 데 한정된다. #8의 기존 API와 mutation을 그대로 재사용해야 하며 신규 API, DB, status, error, action을 추가할 수 없다. #12의 consumed-amount CTA와 meal-log UI도 미리 렌더하거나 소유할 수 없다.

이번 리뷰에서 공식 문서 밖 계약이 필요하다는 근거는 발견하지 못했다. 따라서 현재 Contract Evolution Candidate는 **없음**이다. 보수 과정에서 신규 public contract 필요성이 드러나면 임의 구현하지 말고 별도 Contract Evolution Candidate로 전환하여 계속 HOLD해야 한다.

## #8 선행 의존성 판정

### 병합·green으로 확인된 범위

- `cooked-batch-weight-ledger` PR #1311
  - head: `2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d`
  - merge commit: `c16102a3072e929e45bb24a69464cd3110d03db5`
  - 상태: merged
  - current head checks: 성공 또는 의도된 skip
  - Stage 6이 검토한 predecessor `5441c9...`는 현재 merge commit의 ancestor다.
- `cook-mode-whole-board` PR #711
  - head: `55b93ad7...`
  - merge commit: `2f8569cb56a53e9508d8d9571b94b260ec0bce73`
  - 상태: merged
  - current head checks: 성공 또는 의도된 skip
- #8 acceptance의 reader-first 및 writer cutover 조건은 완료되어 #11 UI가 소비할 runtime/API 기반은 merged/green이다.

### 아직 완료로 간주하면 안 되는 범위

#8 runtime 병합과 broader lifecycle/activation 완료는 별개다. Manual physical-device/assistive-technology, server-Mac, OAuth, R/R+1/R+2, capability activation은 계속 pending/blocked로 유지해야 한다. #11 문서가 runtime 준비 완료를 activation 완료로 확대 해석해서는 안 된다.

## Findings와 exact repair list

### P1-01 — 현재 공식 튜플·exact base·lineage가 고정되지 않음

`README.md`와 workflow work item은 각각 이전 튜플인 요구사항 v1.7.25, 화면정의서 v1.5.29, Flow v1.3.27, DB v1.3.26, API v1.2.29를 참조한다. 이는 현재 Source of Truth의 v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37과 다르다. 또한 #11 Stage 1 문서에는 이번 exact base `c16102a...`와 현재 #8 merge lineage가 잠겨 있지 않다.

필수 보수:

1. `README.md`, work item, status, automation lineage에서 공식 튜플을 현재 Source of Truth와 일치시킨다.
2. #11 Stage 1 기준선으로 `c16102a3072e929e45bb24a69464cd3110d03db5`와 tree `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`를 기록한다.
3. API v1.2.37이 v1.2.36의 cooked-batch `0-CBW` 계약을 보존한다는 lineage를 명시한다.
4. 공식 문서 자체는 수정하지 않는다. 신규 계약이 필요하면 Contract Evolution Candidate로 HOLD한다.

### P1-02 — #8 runtime과 whole-board의 병합 상태가 stale함

`README.md`, work item dependency, status note는 #8 runtime 또는 `cook-mode-whole-board`가 아직 merged/green이 아닌 것처럼 기록한다. 실제로 두 선행 변경은 모두 현재 master의 ancestor이며 병합·green이다.

필수 보수:

1. dependency 기록을 위의 exact PR/head/merge SHA와 현재 상태로 갱신한다.
2. #8 runtime/API와 whole-board는 #11 UI 구현에 사용 가능한 선행 기반으로 표시한다.
3. broader lifecycle, Manual/server-Mac/OAuth/R/R+1/R+2/capability activation pending은 별도 항목으로 유지한다.
4. runtime merged를 activation 완료 또는 전체 lifecycle 완료로 표현하지 않는다.

### P1-03 — 필수 Stage 1 문서 구조와 메타데이터가 빠짐

현재 `README.md`에는 명시적인 Dependencies 표, Schema Change, Backend First Contract, 다섯 상태를 포함한 Frontend Delivery Mode, fixture/real DB/seed/blocker를 구분한 QA/Test Data Plan, Primary User Path가 없다. Delivery Checklist에도 OMO metadata가 없고, `acceptance.md`에는 Data Setup/Preconditions가 없다. 이는 Stage 1 SOP가 요구하는 구조를 충족하지 못한다.

필수 보수:

1. Dependencies 표에 #8 merged/green, #9 비차단 병렬 조건, #12 제외 경계를 기록한다.
2. Schema Change를 `None`으로, Backend First Contract를 `#8 existing contract reuse; #11 backend stages N/A`로 고정한다.
3. Frontend Delivery Mode에 loading, empty, error, read-only, ready/interactive 상태와 unknown/depleted 표현을 명시한다.
4. QA/Test Data Plan에 deterministic fixture, real DB 필요 여부, seed/cleanup, blocker를 구분한다.
5. Primary User Path와 acceptance의 Data Setup/Preconditions를 추가한다.
6. Delivery Checklist에 요구되는 OMO/workflow metadata를 추가한다.

### P1-04 — 고위험 UI Stage 1 설계·비평 산출물이 현재 #11에 맞게 잠기지 않음

workpack 자체가 두 화면을 high risk로 분류하고 legacy 산출물을 증거로 인정하지 않지만, 설계 갱신을 “Stage 2 전에”로 미룬다. Stage 1 SOP상 high-risk slice는 두 화면의 현재 설계와 독립 critique가 Stage 1 산출물로 먼저 닫혀야 한다.

현재 상태:

- `ui/designs/COOK_MODE.md`는 #8 Stage 1 계보의 산출물이다.
- `ui/designs/LEFTOVERS.md`는 오래된 planner-add 계보이며 #11 weight actions를 다루지 않는다.
- 두 critique와 기존 authority report도 #11/current tuple 기준의 fresh evidence가 아니다.
- automation manifest는 두 화면을 요구하면서 generator/critic 참조는 사실상 `COOK_MODE` 단일 경로만 고정한다.

필수 보수:

1. Stage 1 작성 task에서 `COOK_MODE`와 `LEFTOVERS` 설계 문서를 모두 #11/current tuple/current base에 맞게 refresh 또는 생성한다.
2. 두 화면 각각에 대해 작성자와 독립된 critique를 생성하고 #11 scope, 390/320, 상태·키보드·접근성 요구를 검토한다.
3. automation/work item이 지원하는 manifest/index 필드로 두 design과 두 critique 경로를 기계적으로 잠근다.
4. runtime PNG와 final authority evidence는 Stage 4 future evidence로 유지한다. 이번 Stage 1 보수에서 PNG/Figma를 새로 만들지 않는다.

### P1-05 — UI-only ownership과 #9 Stage 2 병렬 경계가 모호함

work item은 frontend surface로 표시하지만 README checklist는 #11 Stage 2 TDD RED를 요구하고, acceptance의 다수 UI/설계 항목은 Stage 2로 태깅되며, automation은 backend endpoints, `pnpm verify:backend`, backend fix rounds를 요구한다. 이 조합은 #11이 backend Stage 2/3 또는 새 계약을 소유하는 것처럼 해석될 수 있고 #9와 충돌할 수 있다.

필수 보수:

1. #11의 backend Stage 2/3을 `N/A — #8 existing backend contract consumer`로 고정한다.
2. #11의 제품 코드 변경은 Stage 4 UI lane에서만 닫히도록 README, acceptance metadata, automation current/future command를 정렬한다.
3. migration, route handler, RPC, server helper, backend write transaction, public type 확장을 #11 금지 범위로 명시한다.
4. `pnpm verify:backend` 및 backend fix round가 단순 predecessor smoke인지 제거 대상인지 명확히 하고, #11 required check처럼 오해되지 않게 고친다.
5. #9 backend write ownership과 아래 공유 파일 경계를 문서에 추가한다.

### P1-06 — 모바일·접근성·Manual evidence 계약이 충분히 기계 고정되지 않음

README에는 일부 44px/focus/screen-reader/no-overflow 문구가 있지만 acceptance와 automation이 다음 필수 항목을 충분히 잠그지 않는다.

- 390px와 320px 양쪽 viewport
- 익숙한 bottom sheet 패턴
- 44px 최소 터치 영역과 16px 이상 numeric input font
- sheet 내부 scroll과 fixed CTA, safe-area, 가상 키보드에 의한 CTA/입력 가림 방지
- loading, empty, error, read-only, unknown/legacy-null, depleted 상태
- 키보드 focus order/trap/restore, Escape/닫기, overflow, screen-reader label 및 live error evidence
- 자동 검증과 Manual physical keyboard/screen reader/device 검증의 분리
- server-Mac/OAuth/R/R+1/R+2/activation pending/blocked의 명시적 분리

특히 API는 legacy weight를 명시적 `null`로 반환할 수 있으므로 unknown/legacy-null 상태가 depleted와 구분되어야 한다. 현재 automation `required_states`, artifact assertions, evidence path는 이 구분과 키보드/AT/16px/internal-scroll/fixed-CTA를 충분히 요구하지 않는다. 또한 ordinary 390/320 visual authority evidence가 `external_smokes`에 섞여 있고, Train D는 #8 runtime merge로 이미 충족된 predecessor fact와 진짜 Manual-only 항목을 구분하지 않는다.

필수 보수:

1. acceptance에 위 모바일·상태·키보드·focus·overflow·접근성 조건을 각각 검증 가능한 체크와 metadata로 추가한다.
2. automation의 `required_states`, artifact assertions, screenshot/evidence paths에 자동 검증 가능한 항목을 모두 반영한다.
3. Manual Only에는 physical keyboard, VoiceOver/TalkBack 또는 동등 screen reader, 실제 기기, server-Mac/OAuth만 남기고 실행 환경과 기대 증거를 명시한다.
4. R/R+1/R+2와 capability activation은 pending/blocked로 계속 분리하며 이번 작업에서 활성화하지 않는다.
5. #8 runtime/whole-board merged 상태는 완료된 predecessor evidence로 옮기고 Manual-only gate와 섞지 않는다.

## #9 병렬화 및 충돌 표면 판정

현재는 #11 Stage 1이 HOLD이므로 #11 제품 구현을 시작할 수 없다. 위 보수를 별도 Stage 1 작성 task가 반영하고 fresh independent internal 1.5 재리뷰가 승인한 뒤에는, #11 Stage 4 UI 구현과 #9 Stage 2 backend 작업을 조건부 병렬 실행할 수 있다.

조건은 다음과 같다.

1. #9의 자체 Stage 1/current tuple/predecessor gate가 독립적으로 green이어야 한다.
2. #11은 #8 API를 소비하는 UI-only lane을 유지한다.
3. #9는 meal-log write/backend lane만 소유하고 #11 UI 파일을 수정하지 않는다.
4. 공유 표면 변경이 불가피하면 같은 파일을 병렬 편집하지 말고 순차 merge/rebase한다.
5. #12 consumed-amount CTA와 meal-log UI는 #9 병합 및 #12 별도 Stage가 끝날 때까지 #11에서 렌더하지 않는다.

| 표면 | 소유권 및 병렬 규칙 |
| --- | --- |
| `app/api/v1/meal-log/**` | #9 전용. #11 생성·수정 금지 |
| meal-log schema/migration/RPC, `meal_log_entries`, consumed event pointer | #9 backend write 전용 |
| `lib/server/meal-log*`, `lib/api/meal-log*`, `types/meal-log*` | #9 전용 후보. #11 금지 |
| `app/api/v1/cooked-batches/**` | #8 계약 표면. #11 read-only consumer; 신규 route/action 금지 |
| `lib/server/cooked-batches.ts`, `lib/server/cooked-batch-route.ts` | #8 backend 표면. #11 수정 금지 |
| `supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql` | #8 migration. #11 수정/apply 금지 |
| `types/cooking.ts`의 `CookedBatchProjection` | #8 public contract. #9/#11 모두 임의 확장 금지; import 소비만 허용 |
| `lib/api/cooking.ts` | #11 client lane. 기존 #8 endpoint wrapper만 사용; #9는 회피 |
| `components/cooking/cooked-batch-completion-sheet.tsx`, `components/cooking/snapshot-v2-cook-mode-*` | #11 UI lane |
| `components/leftovers/leftovers-screen.tsx`, `lib/api/leftovers.ts`, `types/leftover.ts` | #11 UI/client-adapter lane. public contract 확장 금지; #9는 회피 |
| `app/globals.css` | #11이 필요 시 사용 가능한 공유 스타일 표면. 다른 병렬 작업과 충돌 시 순차 처리 |

결론: **현재는 병렬 구현 불가(HOLD)**. Stage 1 보수와 재승인 후에는 **#9 Stage 2 backend와 #11 Stage 4 UI를 위 소유권 조건으로 병렬화 가능**하다. #9의 backend write 구현은 #11 discard/adjust/close/weight UI의 선행 조건이 아니다.

## Automation, authority, screenshot, exploratory QA 판정

| 항목 | 판정 |
| --- | --- |
| current commands | 현재 validator 명령은 실행 가능하고 통과하지만 semantic drift를 잡지 못함 |
| future component/E2E commands | 테스트 파일이 아직 없어 future 상태가 맞음; Stage 4 이전 current로 승격 금지 |
| authority evidence | 두 화면 모두 fresh #11 설계/critique가 먼저 필요; runtime screenshot과 final authority는 Stage 4 future evidence |
| screenshots | 390/320, sheet open, keyboard/overflow, state matrix 경로를 automation에 명시해야 함 |
| exploratory QA | deterministic checks와 분리하고, 실제 기기/AT Manual 범위를 명시해야 함 |
| Manual physical keyboard/screen reader | Manual Only로 유지 |
| server-Mac/OAuth | blocked/pending으로 유지, 이번 리뷰에서 실행하지 않음 |
| R/R+1/R+2/capability activation | pending으로 유지, 이번 리뷰에서 활성화하지 않음 |

## 실행 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `git fetch origin --prune` | 성공; `origin/master=c16102a...` 확인 |
| `pnpm branch:start -- --branch docs/cooked-batch-weight-ui-stage1-internal1-5-review` | 성공; 보호 브랜치 밖 review branch intent 고정 |
| `pnpm validate:source-of-truth-sync` | 성공 |
| `pnpm validate:workflow-v2` | 성공 |
| `BRANCH_NAME=docs/cooked-batch-weight-ui pnpm validate:workpack -- --slice cooked-batch-weight-ui` | 성공 |
| `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ui` | 성공 |
| `pnpm validate:omo-bookkeeping` | 성공 |
| `pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui` | 성공 |
| `pnpm validate:closeout-sync -- --slice cooked-batch-weight-ui` | 성공 |
| focused Vitest 7개 파일 | 최초 `vitest` 미설치로 exit 254; `pnpm install --frozen-lockfile` 후 7 files, 72 tests passed |
| `pnpm lint` | 성공 |
| `pnpm typecheck` | 성공 |
| `pnpm audit --audit-level high` | exit 0; high 이상 0, low 1, moderate 1 |
| `git diff --check` | 성공 |

집중 테스트 대상:

- `tests/workflow-v2-docs.test.ts`
- `tests/omo-automation-spec.test.ts`
- `tests/omo-bookkeeping.test.ts`
- `tests/omo-doc-gate.test.ts`
- `tests/source-of-truth-sync.test.ts`
- `tests/cooked-batch-weight-ledger-stage1-relock.test.ts`
- `tests/authority-evidence-presence.test.ts`

다음 #11 테스트는 automation에 future로 선언되어 있고 아직 존재하지 않는다. 이는 이번 docs-only review의 테스트 실패가 아니라 Stage 4 이전 미구현 상태다.

- `tests/cooked-batch-weight-ui.test.tsx`
- `tests/cooked-batch-delayed-weight.test.tsx`
- `tests/cooked-batch-lifecycle-actions.test.tsx`
- `tests/cooked-batch-weight-ui-history.test.tsx`

## 범위 준수와 다음 gate

이번 task에서는 이 리뷰 보고서만 작성했다. `README.md`, `acceptance.md`, `automation-spec.json`, workflow work item/status, 제품 UI, PNG/Figma, API/DB/migration을 수정하지 않았다. PR 생성·merge·Discord 전송, production/staging/Supabase/Vercel/server-Mac 접근, migration apply, capability activation도 수행하지 않았다.

Stage 1 작성 task가 P1 6건을 exact repair list대로 보수한 뒤, 현재 task와 다른 fresh independent internal 1.5 reviewer가 다시 검토해야 한다. 모든 required finding이 0이 되기 전에는 `APPROVE`로 전환할 수 없다.

보고서 delivery commit/tree/parent와 push branch의 최종 값은 자기참조를 피하기 위해 커밋 후 task 최종 handoff에 기록한다.
