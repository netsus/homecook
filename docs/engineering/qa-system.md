# QA System

이 문서는 현재 저장소의 QA 시스템을 **언제, 어떻게 실행하는지** 정의한다.

## 목표

- deterministic gate로 출고 차단 기준을 먼저 고정한다.
- exploratory QA로 사용자 관점 불편과 edge case를 구조적으로 찾는다.
- QA 시스템 자체도 eval로 측정한다.

## 3-Layer 구조

### Layer 1 — Deterministic Must-Pass Gates

자동 실행 대상:

- `lint`
- `typecheck`
- `vitest`
- `build`
- Playwright smoke
- Playwright accessibility smoke
- Playwright visual regression
- Playwright auth/session security smoke
- Lighthouse budget

기본 device matrix:

- `desktop-chrome`
- `mobile-chrome` (`Pixel 7`)
- `mobile-ios-small` (`iPhone SE` 급 작은 iOS viewport sentinel)

운영 메모:

- 작은 viewport는 한국 서비스에서도 여전히 유효한 회귀 감지 센서로 본다.
- 하단 CTA 가림, 정보 과적층, 작은 control 글자, modal footer 잘림 같은 문제를 조기에 드러내기 위한 sentinel device다.
- visual regression은 위 device matrix 전체에서 실행한다.
- accessibility smoke는 axe scan 외에도 핵심 control의 최소 가독성/터치 타깃 바닥선을 함께 확인한다.

로컬 실행:

- 백엔드 구현 PR 전: `pnpm verify:backend`
- 프론트엔드 구현 PR 전: `pnpm verify:frontend`
- 전체 수동 점검 한 번에: `pnpm verify`
- one-command local demo 실행: `pnpm dev:demo`
- clean local demo reset + 실행: `pnpm dev:demo:reset`
- local Supabase + demo dataset 초기화: `pnpm local:reset:demo`
- real local Supabase + local auth 브라우저 검증: `pnpm dev:local-supabase`
- fixture 기반 브라우저 QA 시작: `pnpm dev:qa-fixtures`

운영 메모:

- Layer 1 Playwright gate는 기본적으로 `http://127.0.0.1:3100`의 전용 QA fixture 서버를 직접 띄운다.
- `pnpm dev:qa-fixtures`의 `3000` 포트는 Layer 2 exploratory QA나 수동 브라우저 확인용으로 유지한다.

CI 실행:

- PR / protected branch push 시 `Policy`, `.github/workflows/ci.yml`, `.github/workflows/playwright.yml`, `.github/workflows/security-smoke.yml`이 변경 범위에 맞게 자동 실행된다.
- branch/commit/workpack 같은 governance 검증은 항상 유지하고, quality/build/QA는 관련 파일 변경이 있을 때만 뜬다.
- dependency audit은 `.github/workflows/security-review.yml`에서 protected branch push, schedule, manual dispatch 기준으로 실행한다.

### Layer 2 — Agentic Exploratory QA

목적:

- acceptance checklist를 읽고 desktop/mobile에서 실제 사용자 흐름을 훑는다.
- deterministic gate로 잡히지 않는 UX, 디자인, copy, recovery, affordance 문제를 찾는다.
- acceptance에 없더라도 아래 휴리스틱은 기본 점검 항목으로 강제한다.

기본 휴리스틱:

- 모바일 가독성: 정렬, 필터, CTA, 상태 문구가 읽기 어려울 정도로 작지 않은가
- 작은 viewport CTA 가시성: iPhone SE 급에서 primary CTA가 가려지지 않는가
- 중복 CTA: 같은 기능 버튼이 한 화면에 불필요하게 두 번 이상 노출되지 않는가
- 정보 계층: 핵심 정보와 그 액션이 물리적으로 과하게 분리되지 않는가
- copy sanity: h1/h2/버튼/상태 문구가 과하게 길거나 어색하지 않은가
- empty/error/no-op: 결과 없음이나 실패 상태에서 의미 없는 CTA를 누르게 하지 않는가
- visual polish: 아이콘, 버튼, 피드백이 placeholder/MVP 임시 UI처럼 보이지 않는가

실행 방식:

1. `pnpm qa:explore -- --slice <slice-id>` 실행
2. 생성된 `.artifacts/qa/<slice>/<timestamp>/` 번들을 기준으로 Codex 또는 사용자가 브라우저 탐색 QA 수행
3. `exploratory-report.json` 작성
4. `pnpm qa:eval -- --checklist <.../exploratory-checklist.json> --report <.../exploratory-report.json>` 실행
5. 기본값으로 같은 폴더의 `eval-result.json`에 단건 결과 저장

운영 메모:

- 단건 `qa:eval --checklist --report`는 report completeness만 보는 것이 아니라 실제 `covered`된 checklist 비중을 점수에 반영한다.
- `blocked`는 evidence가 남아 있더라도 실행 완료로 계산하지 않는다. blocked가 많으면 fixture/fault injection/checklist 설계를 먼저 보강한다.

기본 타이밍:

- `product-frontend`에서 Stage 4 구현 완료 후
- deterministic gate green 후, `Ready for Review` 전
- QA fixture, Playwright, auth/session, exploratory checklist 같은 QA 시스템 변경이 다른 브랜치에서 먼저 merge되었다면 exploratory QA 전에 최신 base를 반영한 브랜치에서 Layer 1 deterministic gate를 다시 실행한다.
- 위 rerun이 red면 exploratory QA를 진행하지 않고 harness 또는 merge drift를 먼저 복구한다.
- 이전 exploratory QA 결과는 참고 evidence로만 유지하고, 최신 deterministic gate를 다시 통과하기 전에는 현재 출고 신호로 간주하지 않는다.

실행 강도:

- `new-screen`, `high-risk-ui-change`: 기본 실행
- `low-risk-ui-change`: 권장, 필요 시 생략 가능하되 PR 본문에 근거 기록
- `product-backend`: 기본 생략, UI 영향이 있거나 인증 복귀 흐름을 바꾸면 선택 실행

필수 evidence:

- required device마다 최소 1개 이상 스크린샷 또는 녹화 경로
- 작은 viewport의 above-the-fold 캡처
- 중복 CTA, 정보 계층, copy sanity 확인 결과를 finding 또는 coverage notes에 기록

### Layer 3 — QA System Eval

목적:

- QA용 prompt, checklist 생성기, report schema, scoring 로직을 무비판적으로 신뢰하지 않도록 측정한다.
- 실제 rerun fixture와 synthetic failure fixture를 섞어, 좋은 QA report는 통과시키고 나쁜 QA report는 실패시키는지 검증한다.

언제 실행하나:

- `docs/engineering/qa-system.md`
- `scripts/qa-explore.mjs`
- `scripts/qa-eval.mjs`
- `scripts/qa-eval-suite.mjs`
- `scripts/lib/qa-system.mjs`
- `qa/schemas/*`
- `qa/evals/*`
- `tests/qa-system.test.ts`
- QA 관련 GitHub Actions/Playwright 구조

위 파일들을 변경하는 docs-governance / tooling 작업에서 실행한다.

실행 방식:

- 단건 점검:
  - `pnpm qa:eval -- --checklist <...> --report <...>`
  - 또는 `pnpm qa:eval -- --case qa/evals/cases/<case>.json`
- 전체 benchmark:
  - `pnpm qa:eval:suite`
- 단건 결과는 기본값으로 `eval-result.json`에 저장한다.
- suite 결과는 `.artifacts/qa/evals/<timestamp>/summary.json`, `.artifacts/qa/evals/<timestamp>/<case-id>.json`, `.artifacts/qa/evals/latest.json`에 저장한다.

평가 기준:

- positive case는 아래 기준을 모두 만족해야 pass다.
  - `total >= 85`
  - `detectionRecall >= 0.8`
  - `falsePositiveRate <= 0.2`
  - `evidenceCompleteness >= 0.8`
  - `severityCalibration >= 0.8`
  - required device coverage 충족
- negative synthetic case는 위 기준을 통과하면 안 된다.
- Layer 3 suite는 각 case의 `expected.pass`와 실제 판정이 모두 일치해야 green이다.

CI 실행:

- `.github/workflows/qa-eval.yml`이 QA 시스템 관련 파일 변경 시 자동 실행된다.
- CI artifact로 `.artifacts/qa/evals`를 업로드한다.

## Slice Workflow 연결

- Stage 1: workpack README와 acceptance에 `QA / Test Data Plan`, `Data Setup / Preconditions`를 적어 fixture 경로, real DB smoke 경로, seed/reset 명령, bootstrap/system row 기대치를 먼저 잠근다.
- Stage 2: 백엔드 구현은 Layer 1 deterministic gate를 통과하고, 스키마/테이블/bootstrap 의존 슬라이스라면 real DB smoke 또는 동등한 검증을 추가로 남긴다.
- Stage 4: 프론트 구현은 Layer 1 deterministic gate를 먼저 green으로 만든 뒤 Layer 2 exploratory QA를 실행한다. exploratory QA를 실행했다면 바로 Layer 3 단건 `qa:eval`로 report 품질도 남긴다.
- Stage 5~6: 디자인 리뷰와 PR 리뷰는 Layer 1 결과, exploratory report, qa eval 결과를 함께 읽고 finding 처리 여부를 판단한다.
- QA 시스템 자체를 바꾸는 docs/tooling 작업은 product slice와 별도로 Layer 3 suite(`pnpm qa:eval:suite`)를 실행한다.

## 산출물

exploratory QA 번들은 아래 파일을 만든다.

- `exploratory-checklist.json`
- `exploratory-report.json`
- `README.md` 실행 가이드

PR에는 아래를 남긴다.

- deterministic gate 실행 결과
- exploratory QA 실행 여부와 보고서 경로
- qa eval 결과 또는 `N/A` 근거
- `new-screen`, `high-risk`, `anchor-extension`, `low-risk` UI 근거에 맞는 exploratory evidence 여부는 `pnpm validate:exploratory-qa-evidence`로 재검증할 수 있다.
- authority-required slice에서 authority report의 visual evidence와 required mobile variants가 실제로 채워졌는지는 `pnpm validate:authority-evidence-presence`로 재검증할 수 있다.
- Layer 3 변경이면 `pnpm qa:eval:suite` 결과와 artifact 경로
- 실제 브라우저 확인 / local demo / local Supabase / live 외부 연동 여부는 PR `Actual Verification` 섹션에 verifier, environment, result 형태로 남긴다.
- README `Delivery Checklist`, acceptance, `Design Status`와 PR evidence가 어긋나지 않았는지는 PR `Closeout Sync` 섹션에서 정리한다.
- `automation-spec.json`의 `external_smokes[]`가 비어 있지 않은 slice에서 `Actual Verification` smoke evidence가 빠졌는지는 `pnpm validate:real-smoke-presence`로 재검증할 수 있다.

## 운영 원칙

- Layer 1은 사람이 따로 지시하지 않아도 PR/CI에서 자동으로 돈다.
- Layer 2는 브라우저 탐색과 판단이 포함되므로 **명시적으로 실행**한다.
- Layer 3 단건 평가는 exploratory QA 직후 명시적으로 실행할 수 있고, suite는 QA 시스템 변경에서 자동 + 명시 실행 둘 다 지원한다.
- exploratory QA가 manual/agentic이라고 해서 optional evidence가 되지는 않는다. 실행했다면 보고서와 점수를 남긴다.
- `pnpm validate:exploratory-qa-evidence`는 non-draft frontend PR과 OMO closeout PR에서 PR body 또는 local `.artifacts/qa/<slice>/` 번들을 기준으로 evidence presence를 fail-closed로 확인한다.
- `pnpm validate:authority-evidence-presence`는 authority-required non-draft frontend PR과 OMO closeout PR에서 authority report의 `> evidence:` block, visual evidence file existence, `stage4_evidence_requirements` variant 충족 여부를 fail-closed로 확인한다.
- `pnpm validate:real-smoke-presence`는 `external_smokes[]`가 선언된 non-draft backend/frontend PR의 `Actual Verification`을 fail-closed로 확인하고, closeout preflight에서는 source PR body를 기준으로 같은 검사를 재사용한다.
