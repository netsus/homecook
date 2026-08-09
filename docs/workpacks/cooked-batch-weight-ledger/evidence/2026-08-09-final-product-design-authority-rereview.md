# cooked-batch-weight-ledger fresh final product-design-authority re-review

## 판정

- **Verdict: HOLD / REQUEST_CHANGES**
- **승인 여부: 미승인**
- **Blocker / Major / Minor: 0 / 0 / 1**
- **P0 / P1 / P2: 0 / 0 / 1**
- **미해결 required finding: 1**
- 승인 조건인 `blocker/major=0`, `actionable P0/P1/P2=0/0/0`, `unresolved required finding=0` 중 P2와 required finding이 각각 1개 남아 있어 `pass`를 주지 않는다.
- `Design Status: pending-review`, lifecycle `in_progress`를 유지한다. Stage 6, Ready, merge 또는 activation을 승인하지 않는다.

## 독립성 및 exact target

- 역할: Homecook #8 fresh independent final `product-design-authority` re-reviewer
- source task: `019fe028-be31-76f2-a5a7-986000a93374`
- 이전 author/generator/critic/Stage 5/authority/repair task와 다른 독립 task에서 수행했다.
- 제품 코드, 테스트, PNG, PR 본문, workflow/status를 수정하지 않았다. 이 task의 유일한 변경은 본 report다.
- Claude CLI, Claude 앱, Claude API를 사용하지 않았다.
- Stage 5, Stage 6, Ready 전환, PR merge, Discord, capability 또는 production write를 수행하지 않았다.

| 구분 | exact revision |
| --- | --- |
| PR | `#1311`, Draft, OPEN |
| branch | `feature/cooked-batch-weight-ledger-stage4-frontend-current` |
| reviewed product head | `02b77e018d6d02bfbb82feb0b97d51e41e463923` |
| reviewed product tree | `49b7fbd74312c2e7af59626778bb90f2ac29e071` |
| base `origin/master` | `8ae9bd5593f0bad34734f70a96bef0b7bb21a794` |
| report-only branch | `docs/cooked-batch-weight-ledger-final-authority-rereview` |

Fresh fetch와 PR API로 base/head/tree/Draft를 직접 재확인했다. 위 exact target과 불일치가 없었다. PR body와 base-to-head 29-file diff, commit lineage, current-head checks도 직접 읽었다.

## 읽은 기준과 evidence

- `AGENTS.md`, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/cooked-batch-weight-ledger/{README.md,acceptance.md,automation-spec.json}`와 Stage 1/2/4/5/final-authority evidence
- `docs/engineering/product-design-authority.md`, `docs/engineering/slice-workflow.md`, `docs/engineering/git-workflow.md`
- `docs/design/{design-tokens.md,mobile-ux-rules.md,anchor-screens.md}`
- `ui/designs/COOK_MODE.md`
- fresh Stage 1 critic/authority, original Stage 5 review/repair/re-review, original final-authority HOLD와 final-authority repair report
- #8 제품 코드, 공용 overlay/dialog 경계, component/API/E2E tests, `design-qa.md`
- PR #1311 body, exact diff, commit lineage와 current-head checks

> evidence:
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-desktop-1280.png` — `1280×900`, SHA-256 `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-default-390.png` — `390×844`, SHA-256 `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-narrow-320.png` — `320×568`, SHA-256 `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027`, `view_image detail=original` 직접 검사

위임문에 적힌 `COOK_MODE-stage4-*` 세 경로는 repository에 존재하지 않는다. Stage 4 evidence, stage-result JSON, Playwright와 PR diff가 공통으로 가리키며 위임문의 크기·SHA-256과 정확히 일치하는 canonical `COOK_MODE-implementation-*` 세 파일을 검토했다. 명칭 차이는 product finding으로 세지 않지만 evidence provenance limitation으로 남긴다.

## 원본 크기 시각 검토

### Desktop `1280×900`

- 약 430px 폭의 모바일 sheet가 중앙에 고정되고 dimmed whole-board context가 남아 있다.
- header, no-guess 안내, exact pantry rows, weight section, fixed footer 순서가 분명하다.
- 전체 viewport의 수평 흔들림, sheet clipping, footer 겹침 또는 CTA 가림은 보이지 않는다.

### Mobile default `390×844`

- sheet가 familiar bottom-sheet mental model을 유지하며 drag handle, title/close, internal scroll body, fixed footer 경계가 자연스럽다.
- 16px horizontal gutter, 제품명→브랜드/row ordinal 위계, primary/secondary CTA 구분이 읽힌다.
- 세 pantry row와 weight exact-one 영역이 같은 task context 안에 있고 page-level horizontal overflow가 없다.

### Mobile narrow `320×568`

- 세 번째 row 일부가 자연스럽게 이어져 body 내부 세로 스크롤 가능성을 드러낸다.
- footer는 viewport 하단에 고정되지만 body를 영구적으로 가리지 않고, CTA 두 개가 잘리거나 겹치지 않는다.
- 긴 제목/설명은 줄바꿈되고, sheet width가 viewport를 넘지 않는다.

## 통과한 항목

### Mobile UX, scroll, hierarchy와 familiar pattern

- 기존 whole-board를 유지하고 완료 보조 입력만 bottom sheet로 분리해 interaction model을 바꾸지 않았다.
- body `overflow-y-auto`, fixed footer, body scroll lock, background inert의 책임이 분리되어 있다.
- initial pantry selection 0, equivalent row 자동 선택 없음, raw UUID 비노출, actual product/brand/ordinal 구분이 유지된다.
- `음식만 무게(g)`와 `나중에 입력`은 exact-one이며 invalid/default/loading/pending에서 CTA가 fail closed다.
- Loading, Empty `[]`, 409/422 error/retry, Pending lock, terminal read-only, stored replay single-close, unauthorized return-to-action coverage가 코드와 tests에 존재한다.

### Touch target, keyboard, focus와 overflow

- `--control-height-md=44px`, `--control-height-lg=48px`이고 E2E는 dialog button과 label을 `44px+`로 측정한다. checkbox/radio의 visual control은 24px지만 44px 이상 label surface 전체가 hit target이다.
- initial title focus, Tab/Shift+Tab focus trap, Escape, submit 중 Escape lock, opener focus restore, background inert와 body scroll lock이 구현 및 E2E에 고정되어 있다.
- 390/320에서 document-level horizontal overflow 없음, sheet width/height viewport containment, narrow weight action scroll 접근성이 고정되어 있다.
- numeric input은 `text-base`, `inputMode="decimal"`, accessible label, positive validation과 error linkage를 사용한다.

### Contrast repair closure

기존 final-authority의 `FA-P1-01`, `FA-P1-02`는 exact head에서 닫혔다. CSS token pair를 WCAG 상대 휘도 공식으로 독립 계산했고 E2E가 실제 computed style과 axe를 함께 검증한다.

| 상태 | foreground / background | 독립 계산 | 결과 |
| --- | --- | ---: | --- |
| active CTA default | `#FFFFFF` / `#0072BD` | `5.070320:1` | pass |
| active CTA hover/pressed | `#FFFFFF` / `#2F3438` | `12.581112:1` | pass |
| 422 error heading | `#B62620` / `#F7F9FA` | `6.049532:1` | pass |

- known-weight와 `weigh_later` active CTA의 default/hover/pressed는 모두 `4.5:1+`와 axe serious/critical 0을 요구한다.
- mocked 422는 focus, exact selection/input 보존, `aria-invalid`, `aria-describedby`, `4.5:1+`, axe serious/critical 0을 한 흐름에서 요구한다.
- retained exact #8 evidence는 clean-server 3회 byte-identical이며 보고된 결과는 매회 `9 pass / 1 intended skip`이다.

## Finding

### FA-RR-P2-01 — 핵심 footer CTA 레이블이 16px 버튼 타이포 기준보다 작다

- 심각도: **Minor / P2 / approval-required**
- 위치:
  - `components/shared/modal-footer-actions.tsx:35`
  - `components/shared/modal-footer-actions.tsx:45`
  - normative token: `docs/design/design-tokens.md:164-169`
- evidence:
  - 공용 footer의 `[돌아가기]`, `[완료 저장]` 두 button은 모두 `text-sm`을 사용한다.
  - repository typography authority는 `text-sm`을 카드 메타·보조 정보용으로 두고, `text-base` `16px`를 본문·버튼·입력용으로 잠근다.
  - 이 CTA는 완료 task의 primary/secondary 핵심 조작이며 보조 정보가 아니다. 48px hit target과 명암비는 통과하지만 label size는 16px button 기준을 충족하지 않는다.
  - 390/320 PNG에서도 CTA의 시각적 위치·대비는 충분하지만, 정적 이미지가 normative type token 불일치를 정당화하지 않는다.
- 영향:
  - 좁은 모바일에서 가장 중요한 완료/복귀 행동의 가독성이 token 의도보다 낮고, high-risk completion sheet가 공용 component의 작은 metadata scale을 그대로 소비한다.
- required repair:
  1. shared/global 소비자를 일괄 변경하지 말고 #8 completion sheet footer에서 두 CTA label을 `text-base` 16px로 scope한다.
  2. 320×568과 390×844에서 CTA clipping/wrapping 없음, 44px+ target, default/hover/pressed contrast와 fixed-footer geometry를 다시 검증한다.
  3. CTA computed font size `16px` regression을 추가하고 canonical PNG/hash/runtime evidence를 갱신한다.

## Scorecard

| Axis | Result | Authority 판단 |
| --- | --- | --- |
| mobile UX | **pass** | 390/320에서 page-level overflow 없이 내부 scroll과 fixed footer가 분리된다. |
| interaction clarity | **pass** | exact row, no auto-select, exact-one weight와 retry/replay 의미가 명확하다. |
| visual hierarchy | **conditional** | 구조와 CTA 대비는 통과하지만 핵심 footer CTA의 16px type 기준이 남았다. |
| color/material fit | **pass** | scoped blue/dark token repair가 역할을 유지하고 AA 대비를 충족한다. |
| familiar app pattern fit | **pass** | whole-board context 위 bottom sheet와 sticky actions가 익숙한 mobile pattern이다. |
| accessibility evidence | **conditional** | 44px, focus, overflow, axe와 contrast는 통과하나 CTA typography token이 미충족이다. |

## 직접 실행한 검증과 current checks

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; lockfile 변경 없음 |
| focused Vitest 5 files | `5 files / 43 tests` pass |
| `pnpm validate:branch` | pass |
| `pnpm validate:source-of-truth-sync` | pass |
| `pnpm validate:workpack -- --slice cooked-batch-weight-ledger` | pass |
| `git diff --check` | pass |
| PNG `sips` dimensions + SHA-256 | 세 파일 모두 위 evidence block과 exact match |
| WCAG ratio independent calculation | `5.070320`, `12.581112`, `6.049532`; 모두 `4.5:1+` |
| PR #1311 current-head checks | `18 total = 16 success + 2 intended skip + 0 pending + 0 failed` |

Intended skip은 `lighthouse`, `full-regression`이다. checks snapshot의 head/base도 exact `02b77e…` / `8ae9bd…`와 일치했다. 이 task는 browser test를 새로 재실행해 canonical PNG를 덮어쓰지 않았고, exact head에 보존된 clean-server 3회 `9 pass / 1 intended skip` 결과, 테스트 구현, committed PNG/hash를 교차 검토했다.

## Evidence limits

- canonical PNG는 정적 runtime screenshot이므로 실제 virtual keyboard resize/occlusion, focus 이동, focus trap/restore, background inert, disabled semantics 또는 screen-reader announcement를 자체적으로 증명하지 않는다. 이 판정은 해당 항목에서 exact runtime code와 Playwright evidence에 의존한다.
- desktop Chromium emulation과 axe는 physical iOS Safari, Android Chrome/WebView, VoiceOver/TalkBack, 손가락 touch 정확도 또는 full WCAG conformance를 증명하지 않는다.
- screenshot 기본 상태는 active CTA나 mocked 422 상태를 보여주지 않는다. contrast closure는 exact token 계산과 해당 상태를 직접 실행하는 runtime E2E에 의존한다.
- mock/static Stage 1 board도 physical keyboard, focus, WCAG 전체 또는 runtime overflow를 증명하지 않는다.
- current-head CI는 18개 모두 terminal(`16 success + 2 intended skip`)이지만 product-design authority의 시각·상호작용 승인을 대신하지 않는다.

## Pending / next action

1. `FA-RR-P2-01`을 #8 scope에서 수리하고 computed 16px + 320/390 no-clipping evidence를 추가한다.
2. 현재 task와 다른 fresh final product-design-authority가 repaired exact product head와 새 PNG를 다시 검토해 `P0/P1/P2=0/0/0`을 확인한다.
3. 그 전까지 `Design Status: pending-review`, lifecycle `in_progress`, Draft를 유지한다.
4. Stage 6, Ready, merge, Manual/server-Mac/OAuth, full R/R+1 drain, R+2 activation/rollback, Discord는 별도 gate로 남는다.

## Contract Evolution Candidate

없음. 16px CTA repair는 기존 design token을 #8 scope에서 적용하는 UI 수정이며 public endpoint/field/status/error/schema 변경이 아니다.
