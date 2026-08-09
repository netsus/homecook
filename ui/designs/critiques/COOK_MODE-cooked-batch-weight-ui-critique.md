# COOK_MODE — cooked-batch-weight-ui Stage 1 독립 설계 크리틱

## 판정

- Verdict: **HOLD**
- P0 / P1 / P2: **0 / 2 / 1**
- Blocker / Major / Minor: **0 / 2 / 1**
- unresolved required finding: **3**
- Contract Evolution Candidate: **없음**

현재 공식 tuple, #8 기존 completion 계약, #11 UI-only 소유권, 390px/320px bottom-sheet 구조, local-only 용기 계산, 권한·멱등성·replay, 44px/16px·focus·safe-area·가상 키보드·정적 증거 한계는 대체로 정확히 잠겼다. 다만 exact lineage 표기, P1-04의 기계적 artifact lock, COOK_MODE에서 도달할 수 없는 legacy/depleted 상태의 데이터 binding이 미해결이라 `unresolved required = 0` 조건을 충족하지 못한다.

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

HOLD report `337daa8…`는 P1-04 closure 기준으로 읽었지만 그 판정을 재사용하거나 이 설계를 승인하는 lineage evidence로 취급하지 않았다. 이 critic은 설계 원본, 제품 코드, 테스트, API, PNG/Figma, README/acceptance/automation/work item/status를 수정하지 않는다.

## 직접 대조한 기준

- `AGENTS.md`, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- current official tuple: 요구사항 `v1.7.30`, 화면정의서 `v1.5.34`, Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`, `design-tokens.md`, `anchor-screens.md`
- #11 `README.md`, `acceptance.md`, `automation-spec.json`
- HOLD report task `019fe738-2551-7be0-993a-df0c172c9290`, report commit `337daa8…`
- #8 Stage 2/4 implementation, final authority, Stage 6 evidence
- `types/cooking.ts`, `lib/api/cooking.ts`, COOK_MODE completion sheet/view/screen과 관련 component/API/replay tests
- API v1.2.37 `0-CBW`, snapshot-v2 complete 및 owner/error/idempotency 계약

## Findings

### P1-CM-01 — exact target lineage 표기가 검증 가능한 tuple과 일치하지 않음

설계 첫머리는 `HOLD report 337daa8… → parent/current base c16102a…`라고 기록한다. 그러나 exact reviewed commit object의 parent는 `337daa8…`이고, 사용자 제공 parent는 `c16102a…`다. 현재 화살표는 review input, report commit, base, reviewed-head parent의 역할을 구분하지 않아 fresh critic이 어느 bytes를 승인 대상으로 삼았는지 재현하기 어렵다.

필수 보수:

1. design source header에서 `reviewed design base`, `HOLD report evidence`, `reviewed design head/tree`를 별도 필드로 분리한다.
2. Git object와 일치하지 않는 parent 주장을 제거한다.
3. HOLD report는 P1-04 요구사항 입력일 뿐 설계 승인이나 source lineage가 아님을 명시한다.
4. repair 뒤 새 exact head/tree를 fresh critic에게 다시 전달한다.

### P1-CM-02 — P1-04의 두 화면/두 critic 기계적 lock이 아직 닫히지 않음

현재 `automation-spec.json`은 `required_screens`에는 두 화면을 적지만 `generator_artifact`는 `ui/designs/COOK_MODE.md` 하나, `critic_artifact`는 실제 산출물과 다른 `ui/designs/critiques/COOK_MODE-critique.md` 하나만 가리킨다. 이 보고서의 exact 경로 `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`도 manifest/index에 잠기지 않는다. 자동 validator가 통과해도 두 설계와 두 fresh critic의 존재·freshness를 기계적으로 증명하지 못한다.

필수 보수:

1. 지원되는 manifest/index 구조로 COOK_MODE·LEFTOVERS design 두 경로를 모두 잠근다.
2. 두 cooked-batch-weight-ui critic exact 경로를 모두 잠근다.
3. README/acceptance의 generic critic 경로와 automation path를 동일한 canonical 경로로 맞춘다.
4. validator가 한 화면 또는 stale/generic critic 경로 누락 시 실패하는 회귀 테스트를 추가한다.

### P2-CM-01 — legacy-null/depleted 상태가 COOK_MODE의 기존 데이터 binding으로는 도달하지 않음

State matrix는 `unknown / legacy-null projection`과 `depleted projection`을 COOK_MODE visible state로 요구한다. 그러나 이 문서의 API binding은 active snapshot-v2 cook-mode read와 기존 complete mutation뿐이며, fresh complete success는 initial `known|missing + available`만 허용한다. 기존 `fetchSnapshotV2CookMode`에도 batch projection이 없고, 문서 스스로 COOK_MODE가 batch GET/PATCH/POST mutation을 호출하지 않는다고 고정한다. 그대로 구현하면 불필요한 batch read 또는 근거 없는 client state가 생길 수 있다.

필수 보수:

1. legacy-null/depleted를 COOK_MODE에서는 `N/A — LEFTOVERS read-model 전용`으로 명시하고 Stage 4 COOK_MODE evidence 요구에서 제외하거나,
2. 실제 존재하는 기존 read/route로 도달 가능한 경우 그 진입 조건과 exact binding을 명시한다.
3. 어떤 경우에도 새 endpoint, field, guessed status 또는 hidden background read를 만들지 않는다.

## 통과한 설계 항목

- API v1.2.37이 #8 v1.2.36 `0-CBW`를 보존하며 request는 exact pantry row + exact-one `set_finished_weight|weigh_later`다.
- local helper의 raw food+container/tare는 component local state이고, positive result만 기존 `finished_weight_g`에 복사된다. 새 server contract나 tare persistence가 없다.
- 요리 인분은 read-only이고 servings→g, current remainder→original total 추정이 없다.
- 390px/320px familiar bottom sheet, internal scroll, fixed footer, safe area, 44px target, 16px+ numeric input, narrow stacking, no horizontal page scroll을 요구한다.
- loading/empty/ready/pending/error/401/private-404/replay/completed-cancelled state는 fail-closed이고 input/selection 보존과 duplicate-submit lock을 명시한다.
- title focus, background inert, trap, Escape/close pending lock, error focus, opener restore, live status/alert, row-specific accessible name을 명시한다.
- #9 backend와 #12 consumed UI를 선점하지 않으며 unsupported meal-log action을 렌더하지 않는다.
- Markdown/ASCII/향후 PNG가 physical keyboard, focus runtime, virtual keyboard, VoiceOver/TalkBack, full WCAG를 증명하지 못한다는 Stage 4 pending 경계를 정직하게 남긴다.

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

이 validator green은 semantic finding을 상쇄하지 않는다. 특히 현재 validator가 단일 `generator_artifact`/`critic_artifact`만으로도 통과하는 것이 P1-CM-02의 핵심이다.

## Evidence limits 및 다음 gate

이 Stage 1 critic은 정적 Markdown과 현재 코드/API/tests를 대조했다. runtime keyboard/focus/virtual-keyboard/safe-area/computed target/contrast/screen-reader/WCAG/physical-device 증거는 생성하거나 승인하지 않았고 Stage 4 pending이다.

다음 fresh critic은 위 3개 repair가 반영된 새 exact head/tree를 검토해야 한다. 그 전에는 COOK_MODE design gate와 전체 P1-04 closure 모두 **HOLD**다.
