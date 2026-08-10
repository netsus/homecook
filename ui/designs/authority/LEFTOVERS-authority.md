# LEFTOVERS — cooked-batch-weight-ui Stage 4 authority precheck

> review role: fresh independent Stage 4 `authority_precheck` design-reviewer
> authority task ID: `019fe990-ccc1-7df0-8aeb-51b848d7e8aa`
> reviewed exact head: `c9179cce6bc30134401fce770e41577b5d60e1b3`
> reviewed exact tree: `c81ca940844bef333d0a8323ed2b7ecea12af59b`
> implementation capture head: `d6843baa6d27addea5d79fa991c937dfc6dbf070`
> implementation capture tree: `0fa3545f9ec22d83dd4e969f1eef70364a2297ba`
> Stage 1 base: `8b1a4cce57e05d282c2a01fc54557ffc129fae1d`
> current `origin/master`: `11883fb790dbe4664ed5f409fd0b5cf55ee02f41`
> source PR: Draft PR #1320, `feature/fe-cooked-batch-weight-ui`
> review date: 2026-08-10
> evidence:
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-before-mobile-default-390.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-before-mobile-narrow-320.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-desktop-state-matrix.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-legacy-null-depleted.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-actions.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-pending-error.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/runtime-focus-keyboard-overflow.json`
> - `ui/designs/evidence/cooked-batch-weight-ui/runtime-axe-wcag.json`
> - `ui/designs/evidence/cooked-batch-weight-ui/manifest.json`

## Verdict

- verdict: **conditional-pass**
- blocker_count: **0**
- major_count: **2**
- minor_count: **0**
- required_fix_ids: **[`CBW-LO-MAJ-01`, `CBW-LO-MAJ-02`]**
- required repair before Stage 5: **있음**
- Stage 5 entry: **불가**

LEFTOVERS의 목록·상태 표현과 action eligibility는 대체로 정확하지만, destructive/unweighed-close 확인 모델과 409/422 field-linked recovery가 승인 설계·acceptance를 충족하지 않는다. blocker는 없으므로 verdict 용어는 `conditional-pass`이나, 이 slice의 Stage 5 진입 조건인 두 화면 모두 blocker/major `0/0`을 충족하지 못한다. 이 보고서는 Stage 5/final authority/Ready/merge를 승인하지 않는다.

## Evidence freshness와 검토 계보

- `manifest.json`은 `2026-08-09T19:12:15.711Z`에 implementation head/tree `d6843baa...` / `0fa3545f...`에서 생성되었다.
- `d6843baa... → c9179cce...`에는 product code와 test 변경이 없다. 변경 범위는 workpack/status/evidence 문서와 evidence artifact 정리뿐이다.
- 이 구간에서 binary가 바뀐 PNG 8개를 픽셀 단위로 비교했고 모두 동일한 치수, `diff_bbox=None`이었다. UI/evidence freshness를 깨는 시각 변경은 없다.
- Stage 1 base `8b1a4cce... → c9179cce...` 전체 39-file diff와 `git diff --check`를 검토했다. 이 report는 manifest와 모든 artifact를 직접 확인한 뒤 작성되므로 freshness 자체는 성립한다.
- freshness와 coverage는 별개다. current artifacts는 목록/상태와 delayed-weight error를 보여주지만 discard/negative-adjust second confirmation과 unweighed-close consequence confirmation을 화면으로 증명하지 않는다. 이 누락은 `CBW-LO-MAJ-01` repair evidence에 포함한다.
- evidence directory의 PNG 15개를 모두 original-size로 열었다. 이 화면에 해당하는 7개는 아래와 같다.

| 원본 evidence | 치수 | 직접 확인한 내용 |
| --- | ---: | --- |
| before mobile default | `390×844` | 기존 legacy LEFTOVERS 첫 화면 |
| before mobile narrow | `320×568` | 기존 narrow list/action 기준선 |
| desktop state matrix | `1440×2127` | legacy와 cooked-batch 두 section, known/missing/unrecoverable/depleted |
| default known/missing/unrecoverable | `390×2296` | 세 authority 상태, eligible CTA, #12 CTA 부재 |
| default legacy-null/depleted | `390×3472` | legacy-null read-only, 6 depleted labels, exact cancel eligibility |
| narrow actions | `320×2352` | 두 section hierarchy, action stacking, no page overflow |
| narrow pending/error | `320×568` | delayed-weight sheet, preserved input, focused alert |

## Scorecard

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| mobile UX | **pass** | 390/320/desktop에서 section과 card가 세로 흐름을 유지하고 page-level horizontal overflow가 없다. |
| interaction clarity | **major repair** | 상태별 CTA eligibility는 분명하나 destructive result/second confirm과 close consequence 확인이 부족하다. |
| visual hierarchy | **pass** | legacy `남은요리 관리`와 v2 `중량·잔량 기록`, recipe→weight truth→actions 순서가 분리된다. |
| color/material fit | **pass** | current surface/brand/danger tokens와 text+shape 상태 표현을 사용한다. |
| familiar app pattern fit | **major repair** | sheet shell은 익숙하지만 validation summary를 field에 연결하지 않고 irreversible flow가 단일 generic checkbox로 축약됐다. |

## Mobile UX·interaction·accessibility 교차검토

- `AppBottomSheet`는 `max-h-[calc(100dvh-16px)]`, 내부 `overflow-y-auto`, 별도 fixed footer와 `env(safe-area-inset-bottom)`을 사용한다 (`components/shared/app-overlay.tsx:101-164`). 390/320 원본에서도 sheet/page horizontal overflow가 없다.
- numeric inputs는 `text-base`, action/input/radio는 `h-12` 또는 `min-h-11`이며 16px 입력·44px target 기준을 지킨다 (`components/leftovers/cooked-batch-action-sheet.tsx:138-165`).
- `useDialogBoundary`가 background inert/body lock, title initial focus, Tab trap, Escape, opener restore를 공통 구현한다. runtime evidence는 shared COOK sheet trap과 LEFTOVERS initial/error/restore, pending Escape lock을 자동 확인한다.
- static evidence에서 known/missing/unrecoverable/legacy-null/depleted는 badge, 제목, 수치/빈 수치, 설명, enabled/absent action으로 구분되어 색만으로 상태를 전달하지 않는다.
- 단, physical keyboard 전체 순서와 real screen reader announcement는 automated JSON/PNG로 증명되지 않는다. 아래 Manual pending을 유지한다.

## Contract truth

- known + available: **pass** — authoritative finished/remaining grams와 `양 조정`/`버림`만 표시한다.
- missing: **pass** — delayed weight, unrecoverable, unweighed close만 노출하며 0g/추정값을 만들지 않는다.
- unrecoverable: **pass** — restore/reversal과 gram action이 없고 `무게 없이 종료`만 남는다.
- legacy-null: **pass** — missing/depleted로 변환하지 않는 complete read-only card이며 detail/action이 없다.
- depleted: **pass** — 여섯 reason label이 text로 구분되고 일반 depleted card의 weight/discard/adjust/close/consume CTA가 없다.
- exact closure cancel: **pass** — non-null `current_unweighed_closure_event_id`가 있는 exact current `closed_unweighed` projection에만 `[방금 종료 취소]`가 있다. generic reopen, non-current cancel, unrecoverable reversal은 없다.
- #12 consumed CTA: **absent** — batch section에 `먹은 양 기록` CTA가 없고 legacy `다먹음`과 교차하지 않는다.

## Findings

### Blocker

없음.

### Major

#### `CBW-LO-MAJ-01` — destructive/irreversible confirmation이 amount·reason·result와 close consequence 계약을 충족하지 않음

- evidence: `LEFTOVERS-mobile-narrow-320-actions.png`는 CTA까지만 보여주고 discard/negative-adjust/close confirmation sheet를 포함하지 않는다. `LEFTOVERS-mobile-narrow-320-pending-error.png`는 delayed-weight error만 보여준다.
- code: `components/leftovers/cooked-batch-action-sheet.tsx:74-107,146-166`.
- expected: discard는 positive amount/reason 입력 뒤 **두 번째 confirmation summary**에서 amount/reason/result를 확인해야 한다. negative adjustment도 current/delta/result/reason summary가 필요하다 (`ui/designs/LEFTOVERS.md:181-198`, `acceptance.md:29-32`). unweighed close는 `consumed|discarded|mixed`와 **no grams/no nutrition/no meal-log** consequence를 명시적으로 확인해야 한다 (`ui/designs/LEFTOVERS.md:200-219`).
- actual: discard/adjust는 한 form에서 generic checkbox와 `적용 뒤 값은 서버 응답으로 확정` 문구만 제공한다. 예상/result 값을 계산해 요약하지 않고 두 번째 확인 단계가 없다. close도 reason radio 뒤 generic `표시된 결과와 되돌릴 수 없는 영향` checkbox만 있어 gram·nutrition·meal-log 손실 결과를 명시하지 않는다.
- impact: 사용자가 파괴적/되돌릴 수 없는 작업의 구체적인 결과를 제출 전에 검증하지 못한다. 서버 권위는 유지되지만, Stage 1에서 승인된 comprehension/safety contract를 약화하므로 major다.
- required repair: discard와 negative adjust에 amount/reason/current/result 요약을 가진 명시적 2차 confirmation을 구현한다. close confirmation에는 grams/nutrition/meal-log가 남지 않는다는 구체 문구를 연결한다. cancel, pending duplicate lock, opener restore를 유지하고 390/320 fresh screenshots와 interaction tests를 다시 캡처한다.

#### `CBW-LO-MAJ-02` — 409/422 `fields[]`가 actionable field에 programmatically 연결되지 않음

- evidence: `LEFTOVERS-mobile-narrow-320-pending-error.png`; runtime automation의 mocked 409는 `fields: []`만 사용하며 422 field mapping을 증명하지 않는다 (`tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts:320-340`).
- code: `components/leftovers/cooked-batch-action-sheet.tsx:13-17,70-72,136-165`.
- expected: 409/422는 alert summary로 focus를 이동하고 `aria-describedby`로 first invalid/correctable field에 연결하며 retained input에서 교정 가능해야 한다 (`ui/designs/LEFTOVERS.md:342-364,377-387,499-505`; `acceptance.md:44`).
- actual: error alert 자체에는 focus가 이동하지만 `error.fields`를 읽지 않는다. amount/reason/radio controls에 `aria-invalid` 또는 alert ID 기반 `aria-describedby`가 없고, runtime fixture도 422 field case를 만들지 않는다.
- impact: sighted keyboard user와 screen-reader user가 오류 summary에서 수정해야 할 field를 식별하기 어렵고, automated evidence가 acceptance의 field-linked recovery를 과대 주장한다. 입력 보존만으로 계약을 충족하지 못하므로 major다.
- required repair: official `fields[]`를 기존 field name에 매핑하고 alert/field를 `aria-describedby`와 `aria-invalid`로 연결한다. alert focus 후 첫 invalid field로 진행 가능한 422와 retained 409 test/runtime evidence를 추가한다. 새 public field/error는 만들지 않는다.

### Minor

없음. 위 두 문제의 cosmetic 하위 현상은 각각 major에 포함했으며 중복 minor로 세지 않았다.

## Accessibility scope와 Manual pending

- 기존 COOK_MODE **full-page** automated axe contrast residual은 정확히 **2 nodes**다. LEFTOVERS/new sheet 결과와 합쳐 page-wide 0으로 주장하지 않는다.
- #11 신규 completion/action sheets와 cooked-batch section에 한정한 scoped serious/critical은 **0**이다. 이는 full WCAG 또는 physical AT pass가 아니다.
- static/mock PNG와 automated runtime JSON은 physical keyboard, VoiceOver/TalkBack, full WCAG conformance, 실제 virtual keyboard와 real-device safe-area를 증명하지 못한다.
- 따라서 다음은 **Manual pending**이다: 실제 브라우저 physical keyboard focus order/trap/restore/Escape, VoiceOver/TalkBack announcement, 실제 390/320 기기 safe-area와 virtual-keyboard occlusion, full WCAG.

## PR current-head raw check inventory

PR #1320 head `c9179cce...`: **21 checks = success 19 + intended skip 2**, pending/fail/cancel/rerun **0**.

- success: `CI/quality`; `PR Governance/labeler` ×3 (runs `31332210593`, `31332222135`, `31332433926`); `Policy/policy` ×3 (runs `31332211310`, `31332221963`, `31332433600`); `QA/changes`; `Security Smoke/security-smoke`; `CI/build`; `PR Governance/template-check` ×3 (same governance runs); `QA/smoke`; `CI/hybrid-authority-runtime`; `QA/accessibility`; `CI/security-function-authorization`; `QA/visual`; `GitGuardian Security Checks`.
- intended skip: `QA/lighthouse`, `QA/full-regression`.

Green checks는 위 design/interaction finding을 해소하지 않으며 이 precheck가 Ready/merge를 수행했다는 뜻이 아니다.

## Before-merge 권고와 다음 행동

1. Stage 4 repair task가 `CBW-LO-MAJ-01`, `CBW-LO-MAJ-02`를 구현·테스트하고 새 implementation head/tree의 fresh 390/320 evidence를 캡처한다.
2. fresh independent authority precheck가 두 required fix를 재검토해 LEFTOVERS blocker/major `0/0`과 evidence freshness를 확인한다.
3. COOK_MODE와 LEFTOVERS 두 보고서가 모두 blocker/major `0/0`일 때만 Stage 5 entry를 승인할 수 있다. 현재는 **진입 불가**다.
4. Manual pending은 자동화 pass로 대체하지 않는다. 이 task는 Stage 4 repair, Stage 5, final authority, Stage 6, Ready, merge, Discord, activation을 수행하지 않는다.
