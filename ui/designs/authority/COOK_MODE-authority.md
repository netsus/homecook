# COOK_MODE — cooked-batch-weight-ui Stage 4 authority precheck

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
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-before-mobile-default-390.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-before-mobile-narrow-320.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-desktop-state-matrix.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-container-helper.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-known.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-weigh-later.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-narrow-320-known.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-narrow-320-pending-error-replay.png`
> - `ui/designs/evidence/cooked-batch-weight-ui/runtime-focus-keyboard-overflow.json`
> - `ui/designs/evidence/cooked-batch-weight-ui/runtime-axe-wcag.json`
> - `ui/designs/evidence/cooked-batch-weight-ui/manifest.json`

## Verdict

- verdict: **pass**
- blocker_count: **0**
- major_count: **0**
- minor_count: **1**
- required_fix_ids: **[]**
- advisory minor ID: `CBW-CM-MIN-01`
- required repair before Stage 5: **없음**

COOK_MODE 단독 gate는 blocker/major `0/0`을 충족한다. 다만 이 보고서는 Stage 4 구현자, Stage 1 critic, Stage 5, final authority와 다른 task의 precheck일 뿐이며 `Design Status: confirmed`, Ready, merge 또는 activation을 승인하지 않는다. 두 화면의 통합 Stage 5 진입은 LEFTOVERS의 major finding이 해결되기 전까지 불가하다.

## Evidence freshness와 검토 계보

- `manifest.json`은 `2026-08-09T19:12:15.711Z`에 implementation head/tree `d6843baa...` / `0fa3545f...`에서 생성되었다.
- `d6843baa... → c9179cce...` diff에는 product code와 test 변경이 없다. 변경 범위는 workpack/status/evidence 문서와 evidence artifact 정리뿐이다.
- 이 구간에서 binary가 바뀐 PNG 8개를 픽셀 단위로 비교했고 모두 동일한 치수, `diff_bbox=None`이었다. 따라서 캡처 이후 UI 동작이나 보이는 픽셀을 바꾸는 변경은 없다.
- Stage 1 base `8b1a4cce... → c9179cce...` 전체 39-file diff와 `git diff --check`를 검토했다. 본 authority report는 위 manifest와 artifact를 직접 확인한 뒤 작성되므로 freshness가 성립한다.
- evidence directory의 PNG 15개를 파일명/치수 확인에 그치지 않고 모두 original-size로 열었다. 이 화면에 해당하는 8개는 아래와 같다.

| 원본 evidence | 치수 | 직접 확인한 내용 |
| --- | ---: | --- |
| before mobile default | `390×844` | 기존 COOK_MODE 첫 화면과 완료 CTA 기준선 |
| before mobile narrow | `320×568` | 기존 narrow first-screen fit |
| desktop state matrix | `1440×1000` | known sheet, desktop containment |
| default container helper | `390×844` | gross/tare local helper와 계산 결과 |
| default known | `390×844` | food-only 직접 중량, pantry selection, fixed CTA |
| default weigh-later | `390×844` | `나중에 입력`, null grams 의미 |
| narrow known | `320×568` | 16px numeric input, 44px controls, internal scroll |
| narrow pending/error/replay | `320×568` | 보존된 입력, alert, replay 경로 |

## Scorecard

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| mobile UX | **pass** | 390/320에서 page/sheet horizontal overflow, CTA clipping, 핵심 정보 손실이 없다. |
| interaction clarity | **pass** | pantry exact selection, 음식-only known, `나중에 입력`, local helper가 서로 다른 선택과 결과로 읽힌다. |
| visual hierarchy | **pass with minor** | 제목→선택→중량→fixed CTA는 명확하나 320 footer가 승인 설계의 stacked primary-first를 따르지 않는다. |
| color/material fit | **pass** | 기존 dark cook board 위 current token 기반 surface sheet와 brand/danger 상태가 일관된다. |
| familiar app pattern fit | **pass** | body-locked bottom sheet, 내부 scroll, fixed footer, safe-area와 dismiss lock이 익숙한 패턴을 유지한다. |

## Mobile UX·interaction·accessibility 교차검토

- `AppBottomSheet`는 `max-h-[calc(100dvh-16px)]`, `overflow-hidden`, body `overflow-y-auto`, 별도 footer와 `env(safe-area-inset-bottom)`을 사용한다 (`components/shared/app-overlay.tsx:101-164`). 390/320 원본에서도 sheet body와 footer의 scroll 책임이 분리되고 page-level overflow가 없다.
- direct/helper numeric inputs는 `text-base`이고 주요 row/button은 `h-11`, `min-h-11`, `min-h-12`로 16px 입력·44px target 기준을 충족한다 (`components/cooking/cooked-batch-completion-sheet.tsx:223-318`).
- `useDialogBoundary`는 initial title focus, background `inert`/`aria-hidden`, body scroll lock, Tab/Shift+Tab trap, Escape, opener focus restore를 구현한다 (`components/shared/use-dialog-boundary.ts:39-129`). runtime JSON과 E2E는 focus trap/restore, pending Escape lock, same-key replay reuse를 기록한다.
- pending 중 close/cancel/selection을 잠그고, 409/422 alert로 focus를 옮기며 입력과 exact selection을 유지한다. `finished_weight_g` field error는 `aria-invalid`와 `aria-describedby`로 연결된다 (`components/cooking/cooked-batch-completion-sheet.tsx:66-91,256-285`).
- 상태는 radio/checkbox/disabled/텍스트/`role=status|alert`로 식별되어 색만으로 전달되지 않는다.

## Contract truth

- food-only known: **pass** — `완성 직후 음식 전체 중량`, `용기·그릇 무게 제외`, `현재 남은 양이 아님`을 명시한다.
- weigh later: **pass** — `weight_action=weigh_later`, `finished_weight_g=null`; 0g·추정 영양을 만들지 않는다.
- local tare helper: **pass** — gross/tare는 component local state이고 positive difference만 direct weight에 복사한다. request에는 helper 입력을 보내지 않는다.
- completion boundaries: **pass** — existing #8 completion body만 소비하며 LEFTOVERS mutation, generic reopen, #9 meal-log write를 호출하지 않는다.
- #12 consumed CTA: **absent** — COOK_MODE completion UI에 consumed-amount/meal-log CTA가 없다.

## Findings

### Blocker

없음.

### Major

없음.

### Minor

#### `CBW-CM-MIN-01` — 320px footer order/stacking이 승인 설계와 다름

- evidence: `COOK_MODE-mobile-narrow-320-known.png`, `COOK_MODE-mobile-narrow-320-pending-error-replay.png`
- code: `components/cooking/cooked-batch-completion-sheet.tsx:140-153`, `components/shared/modal-footer-actions.tsx:18-54`
- expected: `ui/designs/COOK_MODE.md:153-160`의 primary `[완료 저장]` 먼저, secondary `[돌아가기]` 다음의 세로 적층과 동일한 DOM/visual order.
- actual: 공용 footer가 모든 폭에서 `flex` row와 `[돌아가기] → [완료 저장]` DOM 순서를 유지한다.
- severity rationale: 320px 원본에서 두 CTA가 48px 높이로 읽히고 잘림·겹침·오조작 유도는 없다. 핵심 과업을 막지 않는 설계 정합성 편차이므로 minor이며 Stage 5 선행 repair로 강제하지 않는다.

## Accessibility scope와 Manual pending

- 기존 COOK_MODE **full-page** automated axe contrast residual은 정확히 **2 nodes**다. 이를 page-wide 0으로 주장하지 않는다.
- #11 신규 completion sheet와 LEFTOVERS cooked-batch section에 한정한 scoped serious/critical은 **0**이다. 기존 full-page residual 2개와 신규 scope 0을 합치거나 대체하지 않는다.
- static/mock PNG와 automated runtime JSON은 physical keyboard, VoiceOver/TalkBack, full WCAG conformance, 실제 virtual keyboard와 real-device safe-area를 증명하지 못한다.
- 따라서 다음은 **Manual pending**이다: 실제 브라우저 physical keyboard focus order/trap/restore/Escape, VoiceOver/TalkBack announcement, 실제 390/320 기기 safe-area와 virtual-keyboard occlusion, full WCAG.

## PR current-head raw check inventory

PR #1320 head `c9179cce...`: **21 checks = success 19 + intended skip 2**, pending/fail/cancel/rerun **0**.

- success: `CI/quality`; `PR Governance/labeler` ×3 (runs `31332210593`, `31332222135`, `31332433926`); `Policy/policy` ×3 (runs `31332211310`, `31332221963`, `31332433600`); `QA/changes`; `Security Smoke/security-smoke`; `CI/build`; `PR Governance/template-check` ×3 (same governance runs); `QA/smoke`; `CI/hybrid-authority-runtime`; `QA/accessibility`; `CI/security-function-authorization`; `QA/visual`; `GitGuardian Security Checks`.
- intended skip: `QA/lighthouse`, `QA/full-regression`.

Green checks는 finding을 덮어쓰지 않으며 이 precheck가 Ready/merge를 수행했다는 뜻이 아니다.

## Before-merge 권고와 다음 행동

1. `CBW-CM-MIN-01`은 후속 polish backlog로 명시 유지하되, 공유 footer를 바꿀 경우 다른 modal의 safe cancel order를 회귀시키지 않도록 COOK_MODE scoped narrow variant로 구현한다.
2. Manual pending 항목은 실제 기기/AT에서 닫기 전에 수행한다.
3. COOK_MODE는 required repair 없이 Stage 5 screen input으로 사용할 수 있으나, 통합 Stage 5는 LEFTOVERS required repairs와 fresh evidence가 먼저다.
4. 이 report는 Stage 5/final authority/Stage 6/Ready/merge/Discord/activation을 수행하거나 승인하지 않는다.
