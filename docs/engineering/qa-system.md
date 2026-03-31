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

로컬 실행:

- 백엔드 구현 PR 전: `pnpm verify:backend`
- 프론트엔드 구현 PR 전: `pnpm verify:frontend`
- 전체 수동 점검 한 번에: `pnpm verify`

CI 실행:

- PR / push 시 `.github/workflows/ci.yml` + `.github/workflows/playwright.yml`에서 자동 실행
- dependency audit은 `.github/workflows/security-review.yml`에서 자동 실행

### Layer 2 — Agentic Exploratory QA

목적:

- acceptance checklist를 읽고 desktop/mobile에서 실제 사용자 흐름을 훑는다.
- deterministic gate로 잡히지 않는 UX, 디자인, copy, recovery, affordance 문제를 찾는다.

실행 방식:

1. `pnpm qa:explore -- --slice <slice-id>` 실행
2. 생성된 `.artifacts/qa/<slice>/<timestamp>/` 번들을 기준으로 Codex 또는 사용자가 브라우저 탐색 QA 수행
3. `exploratory-report.json` 작성
4. `pnpm qa:eval -- --checklist <.../exploratory-checklist.json> --report <.../exploratory-report.json>` 실행

기본 타이밍:

- `product-frontend`에서 Stage 4 구현 완료 후
- deterministic gate green 후, `Ready for Review` 전

실행 강도:

- `new-screen`, `high-risk-ui-change`: 기본 실행
- `low-risk-ui-change`: 권장, 필요 시 생략 가능하되 PR 본문에 근거 기록
- `product-backend`: 기본 생략, UI 영향이 있거나 인증 복귀 흐름을 바꾸면 선택 실행

### Layer 3 — QA System Eval

목적:

- QA용 prompt, checklist 생성기, report schema, scoring 로직을 무비판적으로 신뢰하지 않도록 측정한다.

언제 실행하나:

- `docs/engineering/qa-system.md`
- `scripts/qa-explore.mjs`
- `scripts/qa-eval.mjs`
- `scripts/lib/qa-system.mjs`
- `qa/schemas/*`
- QA 관련 GitHub Actions/Playwright 구조

위 파일들을 변경하는 docs-governance / tooling 작업에서 실행한다.

실행 방식:

- sample 또는 실제 exploratory report에 대해 `pnpm qa:eval ...` 실행
- score, coverage, device coverage, evidence completeness를 기록

## 산출물

exploratory QA 번들은 아래 파일을 만든다.

- `exploratory-checklist.json`
- `exploratory-report.json`
- `README.md` 실행 가이드

PR에는 아래를 남긴다.

- deterministic gate 실행 결과
- exploratory QA 실행 여부와 보고서 경로
- qa eval 결과 또는 `N/A` 근거

## 운영 원칙

- Layer 1은 사람이 따로 지시하지 않아도 PR/CI에서 자동으로 돈다.
- Layer 2는 브라우저 탐색과 판단이 포함되므로 **명시적으로 실행**한다.
- Layer 3는 QA 시스템 변경이나 보정 작업에서만 실행한다.
- exploratory QA가 manual/agentic이라고 해서 optional evidence가 되지는 않는다. 실행했다면 보고서와 점수를 남긴다.
