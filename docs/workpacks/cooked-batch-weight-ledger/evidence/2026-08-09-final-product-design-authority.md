# cooked-batch-weight-ledger final product-design-authority

## 판정

- **Verdict: HOLD / REQUEST_CHANGES**
- **승인 여부: 미승인**
- **Blocker / Major / Minor: 0 / 2 / 0**
- **P0 / P1 / P2: 0 / 2 / 0**
- **미해결 required finding: 2**
- 승인 조건인 `actionable P0/P1/P2 = 0`과 `unresolved required finding = 0`을 충족하지 못했다.
- 이 보고서는 `Design Status: confirmed`, lifecycle 완료, Stage 6 진입을 선언하지 않는다. 현재 상태는 `pending-review` / `in_progress`로 유지되어야 한다.

## 독립성 및 판정 대상

- final authority task ID: `019fe61a-9336-7691-9bf8-9d82b178702a`
- 위임 source task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- Stage 1 authority, Stage 4 author, Stage 5 reviewers, P1/P2 repair author 및 integrator와 다른 fresh task에서 검토했다.
- 제품/UI/테스트/PNG/status를 작성하거나 수정하지 않았으며, 이 task의 유일한 산출물은 본 보고서다.
- Claude CLI, Claude 앱, Claude API를 사용하지 않았다.

| 구분 | exact revision |
| --- | --- |
| PR | `#1311`, Draft, OPEN |
| base | `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1` |
| 승인된 Stage 5 판정 대상 product head | `ee8863a5317e32e99c16630e03cfd85f60f46844` |
| product tree | `1ea5899a67d6aa2e72d028d6160e44d246d19b6a` |
| final authority 시작 시 report-only PR head | `a87616d64e1442bdb051861722c7247fc5973fe9` |
| 위 report-only tree | `f4a29a0bec0008f95f722246360003a0d4b65561` |
| lineage | `ee8863a…`의 제품 tree 뒤에 Stage 5 re-review 보고서만 추가된 `a87616d…`, 그 뒤에 본 final-authority 보고서만 추가하는 successor |

본 판정의 제품/UI 대상은 `ee8863a…` tree다. `a87616d…`는 `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage5-frontend-rereview.md`만 추가한 report-only successor다. 본 문서를 포함하는 커밋도 제품 tree를 바꾸지 않는 report-only successor이며, 그 커밋 자체가 이 문서 안에 자기 SHA를 포함할 수 없으므로 enclosing commit을 exact authority revision으로 삼는다.

## 읽은 기준과 선행 evidence

- `AGENTS.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/cooked-batch-weight-ledger/{README.md,acceptance.md,automation.md}`
- `.workflow-v2/work-items/cooked-batch-weight-ledger.json`, `.workflow-v2/status.json`
- `docs/engineering/slice-workflow.md`의 final authority 규칙
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`, 디자인 토큰
- `ui/designs/COOK_MODE.md`
- Stage 1 critic/authority evidence와 390/320 design PNG
- Stage 4 implementation evidence, Stage 5 original review/repair/re-review evidence
- PR #1311 body, base-to-head diff, commit lineage, current-head checks
- 관련 제품 코드, API 소비 코드, 컴포넌트 테스트와 Playwright E2E

Stage 5 re-review는 `APPROVE`, `P0/P1/P2 = 0/0/0`이었다. 이번 fresh final authority는 그 판정을 그대로 재사용하지 않고 활성 및 오류 상태를 추가로 실제 검사했으며, 아래 두 접근성 결함을 발견했다.

## 원본 크기 시각 비교

위임문에 적힌 `COOK_MODE-runtime-*.png` 세 경로는 repository에 존재하지 않는다. Stage 4 evidence와 Playwright가 가리키는 아래 canonical `COOK_MODE-implementation-*.png` 세 파일이 동일 viewport의 실제 런타임 evidence이므로 이를 original-size로 직접 열었다. 경로 명칭 차이는 제품 finding으로 세지 않았다.

| evidence | 크기 | SHA-256 |
| --- | ---: | --- |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-desktop-1280.png` | 1280×900 | `3aa8556589cde4280587a7e11005bb628fe3f414ac1ec24e9f767010f47bf696` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-default-390.png` | 390×844 | `1ecd8b2137460b78925ad22b678939bae076d0a9b3af2b5e160719814284139b` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-narrow-320.png` | 320×568 | `e6a05d3a29a6c58e7812d5fc42730665a1119160fbb2eb472021576911fb27d5` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png` | 390×3949 | `b16ff78ede70cbfac39a8e95d082a48b1f63d6654083e28c67ebe5794ffb8069` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png` | 320×5158 | `a37734e0292ee74816e127159c2308784ec329785dbcb1ee2a467153ddb34e73` |

비교 결과:

- 1280px에서는 약 430px 폭의 모바일 sheet가 중앙에 놓이고, header/body/footer 위계가 분명하다.
- 390px에서는 익숙한 bottom-sheet 구조, 16px 좌우 gutter, 고정 CTA 영역과 내부 스크롤 컨테이너가 유지된다.
- 320px에서는 세 번째 pantry row 일부가 자연스럽게 이어져 내부 스크롤 가능성을 알리고, 고정 CTA가 가려지거나 수평 overflow가 생기지 않는다.
- row와 주요 control의 44px 이상 touch target, 긴 제품명 줄바꿈, brand/ordinal에 의한 실제 pantry row 구분, raw UUID 비노출을 확인했다.
- Stage 1 board의 storage-location 예시는 현재 공식 API field가 아니므로 런타임이 임의로 추가하지 않은 것이 맞다. 위치 표시가 필요하면 별도 contract-evolution 대상이며 #8 구현 finding이 아니다.
- 전체적인 mobile-first 구조와 시각 위계는 통과했으나, 정적 PNG만으로 잡히지 않은 활성/error 상태 명암비 두 건은 아래 required finding으로 남는다.

## 상태·상호작용·접근성 검토

### 통과한 항목

- selection은 초기 0개이며 후보는 실제 pantry item ID만 허용한다.
- 같은 원재료도 제품명/브랜드/ordinal로 구분하며 exact-one weight action인 `set_finished_weight` 또는 `weigh_later`만 선택할 수 있다.
- empty, pending lock, server error, terminal read-only, replay 단일 종료 흐름이 코드와 focused tests에 고정되어 있다.
- 409 재시도와 422 field error 뒤에도 선택값·무게 입력값·focus가 유지되고, 같은 payload 재시도는 같은 idempotency key를 사용한다.
- dialog heading 초기 focus, Tab/Shift+Tab focus trap, Escape/닫기, 닫은 뒤 trigger return focus, submit 중 disabled semantics와 `role=status`, 오류 `role=alert` 및 `aria-invalid`/`aria-describedby` 연결을 확인했다.
- numeric input은 `inputMode="decimal"`, 양수 검증과 적절한 accessible label을 사용한다.
- #8은 cooked-batch weight ledger 범위만 다룬다. #9 meal-log, #11 leftovers/지연 계량/폐기·조정·용기 helper/전체 접근성 확장, #12 meal-log UI 및 R/R+1/R+2 activation field/action/screen을 추가하지 않았다.

### FA-P1-01 — 활성 primary CTA의 텍스트 명암비 미달

- 심각도: **Major / P1 / merge-required**
- 위치:
  - `components/shared/modal-footer-actions.tsx:43-49`
  - 특히 `components/shared/modal-footer-actions.tsx:45`
  - `app/globals.css:10-14`, `app/globals.css:39-40`
  - 누락된 검사 상태: `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts:303-307`
- 실제 evidence:
  - 390×844 런타임에서 pantry row를 선택하고 `음식만 무게(g)`에 `640`을 입력해 `완료 저장`을 활성화했다.
  - computed style은 배경 `#00A1FF`, 텍스트 `#FFFFFF`였다.
  - axe `color-contrast` serious violation 및 계산 명암비 **2.78:1**을 확인했다. 일반 크기 텍스트 최소 **4.5:1**에 미달한다.
  - token상 hover 배경 `#0087D7`과 `#FFFFFF`도 약 **3.86:1**로 충분한 대비가 되지 않는다.
  - 기존 E2E axe 검사는 action을 고르기 전 비활성 CTA 상태에서만 실행되어 활성 상태 결함을 탐지하지 못했다.
- 영향: 사용자가 가장 중요한 완료 저장 CTA의 레이블을 읽기 어렵고, WCAG AA 기반 접근성 승인 조건을 충족하지 못한다.
- required repair:
  1. default/hover/pressed 활성 상태 모두 4.5:1 이상인 foreground/background token pair를 사용한다.
  2. 기존 후보 중 흰색과 `--brand-primary-text: #0072BD`는 약 **5.07:1**, `--foreground: #2F3438`과 `#00A1FF`는 약 **4.52:1**이다. 단, hover/pressed까지 함께 검증해야 한다.
  3. shared component 전체 소비자에 미치는 영향을 확인하고, 전역 변경이 과도하면 #8에 scoped appearance/class 계약을 사용한다. public API/제품 계약 필드를 추가하지 않는다.
  4. known-weight와 `weigh_later` 각각의 활성 CTA 상태에서 axe 및 계산 명암비 회귀 테스트를 추가한다.

### FA-P1-02 — 422 오류 heading의 텍스트 명암비 미달

- 심각도: **Major / P1 / merge-required**
- 위치:
  - `components/cooking/cooked-batch-completion-sheet.tsx:157-167`
  - 특히 `components/cooking/cooked-batch-completion-sheet.tsx:159,165`
  - `app/globals.css:57-60`
  - 오류 상태 검사가 빠진 `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts:303-307`
- 실제 evidence:
  - 390×844 런타임에서 같은 유효 입력을 제출하고 `422 finished_weight_g` 응답을 mock했다.
  - 오류 heading computed style은 배경 `#F7F9FA`, 텍스트 `#FF3B30`이었다.
  - axe `color-contrast` serious violation 및 계산 명암비 **3.35:1**을 확인했다. 일반 크기 텍스트 최소 **4.5:1**에 미달한다.
  - 선택값 `1개`, 무게 `640`, field linkage와 오류 focus는 유지되어 상태 보존 자체는 통과했다.
- 영향: 복구 행동에 필요한 서버 오류 이유를 저시력 사용자가 읽기 어렵고, 422 오류 상태의 접근성 완료 조건을 충족하지 못한다.
- required repair:
  1. 오류 본문/heading 텍스트에 AA 대비를 만족하는 token을 사용한다. 기존 `--danger-strong: #B62620`과 `#F7F9FA` 조합은 약 **6.05:1**이다.
  2. border는 의미 구분을 위해 별도 danger token을 유지할 수 있으나 텍스트 대비를 border에 의존하지 않는다.
  3. mocked 422 상태에서 오류 focus, selection/input 보존, `aria-invalid`/`aria-describedby`와 axe serious/critical 0을 한 번에 고정하는 회귀 테스트를 추가한다.

## deterministic screenshot repair 검토

- P2 repair는 network/fonts 대기, reduced motion, capture 시점의 animation/transition 비활성화, caret 숨김, pointer를 `(0,0)`으로 이동, double `requestAnimationFrame`, Playwright `animations: disabled`와 hover 부재 assertion을 사용한다.
- 제품 컴포넌트, 데이터, 콘텐츠, 레이아웃을 가리거나 바꾸는 mask는 추가하지 않았다.
- 제거된 것은 hover transition 중간 프레임과 caret 같은 비결정적 capture artifact뿐이다. 따라서 screenshot repair 자체는 **통과**다.

## 직접 실행한 검증

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, lockfile 변경 없음 |
| `pnpm exec vitest run tests/cooked-batch-completion-sheet.test.tsx tests/cooked-batch-pantry-row-selection.test.tsx tests/cooked-batch-completion-replay.test.tsx` | PASS, 3 files / 6 tests |
| `pnpm exec playwright test tests/e2e/slice-cooked-batch-weight-ledger.spec.ts --project=desktop-chrome --grep 'preserves exact identity\|keeps an empty candidate list'` | PASS, 2 tests |
| 390×844 one-off Playwright + axe, 활성 known-weight CTA | FAIL evidence, `color-contrast` serious, 2.78:1 |
| 390×844 one-off Playwright + axe, mocked 422 상태 | FAIL evidence, `color-contrast` serious, 3.35:1 |
| original-size PNG 5개 직접 열기 및 Stage 1 ↔ runtime paired 비교 | 완료 |
| base/product/report tree, PR body/diff/checks inspection | 완료 |

첫 Vitest 시도는 dependency 설치 전 `vitest not found`로 test discovery 전에 종료됐고, frozen-lockfile 설치 후 동일 focused command를 재실행해 통과시켰다.

`a87616d…` current-head CI를 2026-08-09에 조회했을 때 시작된 15개 check는 terminal이었다. `quality`, `build`, `smoke`, `accessibility`, `visual`, 보안 및 governance를 포함한 13개는 SUCCESS, `lighthouse`와 `full-regression`은 SKIPPED였다. 본 report-only successor push 뒤 새로 시작되는 current-head checks의 전체 terminal 판정은 오케스트레이터 책임이며, 이 보고서는 이를 완료 처리하지 않는다.

## 한계

- committed mock/runtime screenshots는 실제 physical keyboard 동작을 증명하지 않는다.
- macOS Chromium 중심의 focused Playwright는 iOS Safari, Android WebView/Chrome의 viewport·safe-area·가상 키보드 동작을 증명하지 않는다.
- VoiceOver 및 TalkBack 실제 screen reader 탐색/발화는 수행하지 않았다.
- axe focused scan은 full WCAG 적합성이나 모든 상태·브라우저·보조기술 조합을 증명하지 않는다.
- PNG는 정적 시각 evidence이며 focus 이동, trap, return focus, disabled semantics를 자체적으로 증명하지 않는다. 해당 항목은 코드와 자동화로 보완 검토했다.

## Pending / handoff

1. author가 `FA-P1-01`, `FA-P1-02`를 제품 코드와 회귀 테스트로 수리한다.
2. repair successor에서 활성 known-weight/`weigh_later` CTA 및 422 오류 상태의 4.5:1 이상 대비와 axe serious/critical 0을 증명한다.
3. 현재 task와 다른 fresh final product-design-authority가 수리된 exact product head를 다시 검토한다.
4. 그 전까지 `Design Status: pending-review`, lifecycle `in_progress`, final authority 미승인을 유지한다.
5. current-head CI terminalization은 오케스트레이터가 별도로 잠근다.
6. Discord, Ready 전환, merge, Stage 6, Manual/server-Mac/OAuth, R/R+1/R+2, activation 완료 처리는 이 보고서의 범위 밖이며 수행하지 않았다.
