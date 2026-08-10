# COOK_MODE / LEFTOVERS cooked-batch-weight-ui — fresh independent product design authority

> 검토 역할: fresh independent `product-design-authority`
> authority task ID: `019feb0a-f4ba-7812-b250-375264eec1c4`
> 검토일: 2026-08-10
> reviewed exact design head: `4c5145e01ac62db527f144e2d2df0f97efea2e4b`
> reviewed exact tree: `0af6a107be2d1888dbfe5ed09da17a0906d53c18`
> base `master`: `df96c2113f60f1c3efcdb1080e3490d414c73200`
> source branch / PR: `feature/fe-cooked-batch-weight-ui-superseding-draft` / PR #1323 (Draft)
> integration task: `019feaec-60d2-78c1-bd29-79c10b4d5b94`
> reviewed patch hash / blob-list hash: `2bb51802641a72f791d29376879b2377e224bbf0` / `70732532172cda33ae450265cd81f9c8fe704ac8`
> 공식 tuple: 요구사항 `v1.7.30` / 화면정의서 `v1.5.34` / 유저 Flow `v1.3.32` / DB `v1.3.32` / API `v1.2.37`

> evidence:
> - `ui/designs/evidence/cooked-batch-weight-ui/manifest.json` — 15 PNG + runtime JSON 2개, 누락·추가 파일 없음
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-container-helper.png` — `390×844`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-known.png` — `390×844`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-default-390-weigh-later.png` — `390×844`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-narrow-320-known.png` — `320×568`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/COOK_MODE-mobile-narrow-320-pending-error-replay.png` — `320×568`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png` — `390×2296`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-legacy-null-depleted.png` — `390×3472`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-actions.png` — `320×568`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-pending-error.png` — `320×568`, `view_image detail=original` 직접 검사

## Verdict

**APPROVE WITH RESIDUALS**

- P0 blocker: **0** — finding ID 없음
- P1 major: **0** — finding ID 없음
- P2 minor: **2** — `CBW-FA-P2-01`, `CBW-FA-P2-02`

필수 authority 통과 기준인 P0/P1 `0/0`을 충족한다. 두 P2는 기능, 안전, 계약 또는 핵심 과업 완료를 막지 않는 narrow-layout/token 정합성 잔여다. 이 판정은 위 exact design head/tree의 제품·evidence만 대상으로 하며, 이 보고서를 싣는 successor publication head를 스스로 검토하지 않는다. Draft 해제, Stage 5/6, Ready, merge, production/remote write 또는 activation을 승인하거나 수행하지 않는다.

## 독립성 및 범위

- 이 task는 author, implementation, evidence generator, repair, integration task와 다른 fresh authority task다.
- 구현 repair, generator, Stage 5/6, Ready/merge, Discord, production, remote DB, server-Mac, OAuth, activation을 수행하지 않았다.
- 제품 코드, fixture, screenshot, runtime JSON, manifest를 수정하지 않았다. authority-owned 산출물은 이 보고서 하나뿐이다.
- `COOK_MODE`와 `LEFTOVERS`의 #11 UI를 #8 API/action 계약에 대조했다. #12 consumed-amount UI, 새 mutation, endpoint, field, status, error 또는 direct DML은 검토 대상 제품에 추가되지 않았다.

## Exact-head, lineage와 checks

| 항목 | 검증 결과 |
| --- | --- |
| local / remote reviewed head | `4c5145e01ac62db527f144e2d2df0f97efea2e4b` 일치 |
| reviewed tree | `0af6a107be2d1888dbfe5ed09da17a0906d53c18` |
| base `master` | `df96c2113f60f1c3efcdb1080e3490d414c73200` |
| patch preservation hash | `2bb51802641a72f791d29376879b2377e224bbf0` |
| blob-list preservation hash | `70732532172cda33ae450265cd81f9c8fe704ac8` |
| PR state at review | OPEN / Draft / CLEAN / MERGEABLE |
| reviewed-head raw checks | 21 terminal: 19 SUCCESS + 2 intended SKIPPED (`lighthouse`, `full-regression`); pending/fail/cancel/rerun/neutral 0 |
| evidence manifest | implementation head `6aac3c194f9606df8269fcd42a9cfa9f974fa1f0`, tree `cc2ebc645214433dada8492141ba950b5035a9d8`, viewport `320/390/1440`, 17 files exact match |

PR #1320의 preserved implementation lineage `7d11175fe142b95af12b4bffcaf65d2c89262e29` / tree `c9295bb8431e17f9b686376f0360d1c865194d72`와 reviewed head 사이의 scoped product/evidence/workpack/authority diff도 비어 있었다. 따라서 superseding draft가 기존 제품 blob을 바꾸지 않았다는 보존 주장과 hash tuple이 일치한다.

## 원본 시각 evidence 직접 검토

요청된 current mobile 9장뿐 아니라 desktop state matrix 2장과 before regression context 4장까지 총 15장을 각각 thumbnail이 아닌 `detail=original`로 열어 검사했다.

| 구분 | 원본 파일 | 결과 |
| --- | --- | --- |
| COOK current 390 | `container-helper`, `known`, `weigh-later` 3장 (`390×844`) | helper 계산과 food-only 결과, known/weigh-later exact-one, 저장 CTA 위계가 명확함 |
| COOK current 320 | `known`, `pending-error-replay` 2장 (`320×568`) | 본문·입력·오류 줄바꿈과 상태 밀도는 안정적; footer layout P2 1건 |
| LEFTOVERS current 390 | `known-missing-unrecoverable` (`390×2296`), `legacy-null-depleted` (`390×3472`) | legacy와 batch 책임 분리, six-label truth와 depleted/cancel-current 범위가 명확함 |
| LEFTOVERS current 320 | `actions`, `pending-error` 2장 (`320×568`) | destructive confirmation, retained input/error recovery와 pending lock이 명확함; footer token P2 1건 |
| desktop context | COOK `1440×1000`, LEFTOVERS `1440×2127` | 상태 matrix coverage와 두 화면 책임 분리를 확인함 |
| before regression | COOK `390×844`/`320×568`, LEFTOVERS `390×844`/`320×568` | 기존 whole-board/list hierarchy와 legacy action에 가시적 회귀 없음 |

LEFTOVERS의 긴 full-page 캡처에서 하단 app navigation이 중간에 반복되어 보이는 부분은 fixed element를 full-page로 합성한 capture context로 판정했다. 개별 320 viewport와 DOM/runtime evidence에서 sheet footer containment 또는 핵심 CTA 가림 결함으로 재현되지 않아 finding으로 세지 않았다.

## Numbered audit walkthrough

### 1. COOK_MODE에서 완료 보조 sheet 진입 — Healthy

- 기존 dark whole-board를 배경 context로 유지하고 완료 입력만 familiar bottom sheet로 분리한다.
- 16px horizontal padding, 44px 이상 close/control target, max-height sheet, 내부 세로 scroll, safe-area footer의 책임이 분리되어 nested-scroll trap 징후가 없다.
- pantry candidate를 자동 선택하지 않고 explicit selection을 유지한다. container helper는 local-only이며 계산 결과도 음식만 무게로 되돌아간다.

### 2. COOK_MODE known / weigh-later / pending / error / replay — Healthy with P2

- `set_finished_weight`와 `weigh_later` exact-one, original food-only total, explicit `[]`, pending lock, retained 409/422 값과 replay idempotency가 #8 계약과 맞는다.
- serving control, current remainder 추측, #12 consumed-amount CTA 또는 새 mutation은 없다.
- 390/320 모두 제목·row·input·helper/error copy가 잘리지 않고 줄바꿈된다. 320 footer의 approved narrow stacking/order만 `CBW-FA-P2-01`로 남는다.

### 3. LEFTOVERS legacy와 cooked-batch sections 탐색 — Healthy

- `/leftovers` legacy 영역과 `/cooked-batches` batch 영역이 별도 heading/surface/action으로 나뉘며 cross-source join을 암시하지 않는다.
- known, missing, unrecoverable, legacy-null, depleted를 거짓 0g이나 추정 current remainder로 치환하지 않는다.
- depleted six-label truth가 읽히고, `방금 종료 취소`는 exact current unweighed closure에만 노출된다. generic reopen은 없다.

### 4. LEFTOVERS action sheet와 destructive recovery — Healthy with P2

- set weight, adjust, discard, unrecoverable, close와 exact cancel-current의 결과/이유가 명확하다.
- irreversible action은 danger treatment와 second confirmation을 사용하고, current/amount/result/reason을 제출 전에 다시 보여준다.
- pending 중 close/Escape/action을 잠그며 422/409에서 입력을 보존하고 error summary로 회복 경로를 준다.
- 44px/48px action height와 no-overflow는 충족하지만 footer CTA text token은 `CBW-FA-P2-02`로 남는다.

### 5. Desktop matrix, permissions/read-only와 state contract — Healthy

- desktop matrices는 mobile에서 분리 검토한 state가 wide layout에서도 빠지지 않음을 보여준다.
- automation/runtime assertion은 permissions/read-only, loading/error, pending, replay, exact cancel-current visibility를 fail-closed로 고정한다.
- screenshot matrix 자체가 모든 role/permission 변형을 시각적으로 보여 주지는 않으므로 contract/code/test 근거와 함께 판정했고, 실제 사용자 권한 환경 검증은 Manual pending으로 남긴다.

### 6. Before regression 비교 — Healthy

- before는 authority target이 아니라 regression 비교에만 사용했다.
- #11 section/sheet 추가 뒤에도 기존 COOK whole-board CTA hierarchy와 LEFTOVERS legacy card/action 구조에 가시적 파손이 없다.

## Scorecard

| Axis | Result | Authority 판단 |
| --- | --- | --- |
| mobile-first UX | **pass with P2** | 390/320에서 핵심 과업과 natural scroll region이 안정적이며 narrow footer 정합성만 남는다. |
| interaction clarity | **pass** | known/missing/unrecoverable/depleted와 destructive/replay 의미, recoverable error 경로가 분명하다. |
| visual hierarchy | **pass** | page section → batch card → status/action → sheet confirmation 순서가 흔들리지 않는다. |
| contract fit | **pass** | COOK/LEFTOVERS 책임과 #8 action boundary를 지키며 #12 UI나 새 mutation을 만들지 않는다. |
| accessibility design | **pass with Manual pending** | scoped automated axe와 focus assertions는 통과하지만 physical AT/keyboard와 full WCAG는 증명하지 않는다. |
| familiar mobile pattern | **pass** | bottom sheet, fixed footer, close lock, confirmation, opener restore 계획이 익숙하고 안전하다. |

## Findings

### `CBW-FA-P2-01` — 320px COOK_MODE footer가 approved narrow stacking/order를 따르지 않음

- **관찰:** `COOK_MODE-mobile-narrow-320-known.png`과 pending/error/replay viewport에서 footer는 가로 한 줄 `돌아가기 → 완료 저장` 순서를 유지한다. `ui/designs/COOK_MODE.md`의 320px narrow 계획은 primary-first stacked footer다.
- **영향:** 두 버튼 모두 viewport 안에 들어오고 48px 높이, no-overflow, destructive ambiguity 없음이 확인되어 핵심 과업과 안전을 막지 않는다. 다만 320px thumb reach와 승인된 responsive hierarchy가 덜 충실하다.
- **정확한 후속 repair target:** `components/cooking/cooked-batch-completion-sheet.tsx`의 footer wrapper 또는 scoped responsive footer variant에서 320px에만 `완료 저장`을 먼저 읽고 누를 수 있는 stacked primary-first layout을 적용한다. shared modal 전체 동작을 임의로 바꾸지 않는다.

### `CBW-FA-P2-02` — LEFTOVERS action-sheet footer CTA가 button typography token보다 작음

- **관찰:** `components/leftovers/cooked-batch-action-sheet.tsx`는 shared `AppModalFooterActions`의 `text-sm`을 그대로 소비한다. `docs/design/design-tokens.md`는 button 용도를 `text-base` 16px로 잠그고, 같은 #11 COOK completion footer는 scoped `[&_button]:text-base` override를 이미 사용한다.
- **영향:** 320px screenshot에서 label clipping이나 target-size 실패는 없고 action hierarchy도 읽힌다. 그러나 dense destructive confirmation에서 핵심 CTA 가독성과 같은-slice 일관성이 한 단계 약하다.
- **정확한 후속 repair target:** `components/leftovers/cooked-batch-action-sheet.tsx` footer wrapper에 COOK와 같은 scoped 16px button treatment를 적용하고 320/390에서 long label, destructive color, 48px height와 no-overflow를 재캡처한다. shared footer 전역 변경은 이 finding 범위가 아니다.

P0/P1 finding은 없다. 이 P2들은 후속 polish 대상이며 Stage 5 진입을 막지 않는다.

## Runtime JSON과 automation alignment

`runtime-focus-keyboard-overflow.json`과 생성 E2E assertion을 대조했다.

- confirmation back이 입력을 유지하고, 422 alert focus와 field linkage가 참이다.
- sheet focus trap, close 후 opener restore, pending 중 controls/Escape lock이 참이다.
- retained 409 input, replay key reuse, destructive close consequence 확인이 참이다.
- 320/390/1440 horizontal overflow assertion이 모두 0이다.
- inputs는 44/48px control height와 16px numeric text를 유지한다.
- `runtime-axe-wcag.json`은 #11 신규 sheet/section scoped serious/critical 위반 **0**을 보고한다.

이 증거는 mock JSON을 그대로 믿은 것이 아니라 `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts`의 해당 assertion과 맞춰 읽었다. 다만 JSON과 screenshot은 실제 기기·보조기술을 대체하지 않는다.

## Manual pending 및 과장 금지 경계

- physical keyboard의 실제 Tab/Shift+Tab 순환과 Escape timing
- VoiceOver/TalkBack의 실제 reading order, accessible name/description과 live announcement
- 실제 모바일 virtual keyboard가 열린 상태의 occlusion, scroll-to-field와 sticky CTA 접근
- iOS/Android 실제 safe-area inset과 browser chrome 변화
- 실제 role/ownership/read-only 사용자 환경의 end-to-end 행동
- full WCAG audit와 모든 page node의 color contrast

기존 COOK_MODE full-page contrast residual은 **2 legacy nodes**다. #11 scoped 신규 sheet/section serious/critical 0과 구분하며, page-wide contrast 0 또는 full WCAG 준수로 과장하지 않는다. 위 항목은 모두 Manual pending이고 이번 authority approval로 닫히지 않는다.

## Contract Evolution Candidate

없음. 현재 판정과 두 P2 해결에 공식 tuple, API, DB 또는 #8/#12 ownership 변경이 필요하지 않다.

## Publication 및 다음 handoff

이 파일을 추가하는 report-only commit은 reviewed design head `4c5145e01ac62db527f144e2d2df0f97efea2e4b`의 successor publication head다. publication commit의 SHA는 git history와 coordinator handoff에서 기록하며, 이 verdict는 self-authored report commit을 제품 authority target으로 재해석하지 않는다.

다음 단계는 PR을 Draft로 유지한 채 별도 Stage 5 task가 reviewed design tuple, 이 authority verdict, 두 P2와 Manual pending을 입력으로 인수하는 것이다.
