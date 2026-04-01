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

## QA Test Data Strategy

QA는 데이터가 없어서 막히면 안 된다. product slice는 구현뿐 아니라 `바로 재현 가능한 데이터 상태`까지 준비돼야 QA-ready로 본다.

### 데이터 모드

- `fixture/mock`
  - 공식 계약을 따르는 고정 응답 또는 앱 내부 fixture 상태
  - 기본 용도: Layer 2 exploratory QA, slice Playwright smoke, 수동 UX 점검
  - 장점: 재현성, 속도, edge case 구성 용이
- `seeded-db`
  - 로컬 또는 전용 QA DB에 넣는 합성 테스트 데이터
  - 기본 용도: 실제 쿼리, RLS, 소유권, 상태 전이, 마이그레이션 영향 smoke
  - 장점: mock이 가리지 못하는 DB 연동 문제 확인
- `live/external`
  - 실제 OAuth/provider/외부 서비스
  - 기본 게이트 제외, opt-in 실행

### 기본 원칙

- 모든 product slice는 Stage 1 workpack에 `QA / Test Data Plan`을 적는다.
- slice 완료 시점에는 clean reset 뒤 바로 수동 QA와 exploratory QA를 시작할 수 있어야 한다.
- 데이터 계획은 최소 아래 상태를 어떻게 재현하는지 포함한다.
  - `happy path`
  - `empty`
  - `unauthorized`
  - `error`
  - `conflict` 또는 `read-only`
  - `other-user / forbidden` (권한 경계가 있는 slice만)
- 기본값은 `fixture/mock 우선 + seeded-db 보강`이다.
- fixture 데이터는 공식 문서에 없는 필드, 상태, 엔드포인트를 만들면 안 된다.
- seeded DB 데이터는 실제 사용자 데이터가 아니라 reset 가능한 합성 데이터여야 한다.
- shared staging/production 데이터를 QA 전제 조건으로 요구하지 않는다.

### 권장 사용 방식

- Layer 1 deterministic gate
  - 기본: fixture 또는 테스트 내부 route mock
  - 보강: seeded-db smoke를 선택적으로 추가
- Layer 2 exploratory QA
  - 기본: fixture/mock 기반으로 빠르게 반복
  - 필요 시 seeded-db로 실제 DB 동작 재확인
- Layer 3 QA system eval
  - fixture가 기본이다. 같은 입력에 같은 결과가 나와야 eval scoring이 안정적이다.

### 문서화 필수 항목

각 slice workpack의 `QA / Test Data Plan`에는 최소 아래를 남긴다.

- 기본 검증 모드: `fixture`, `seeded-db`, `mixed`
- 어떤 상태를 어떤 데이터 모드로 재현하는지
- setup / reset 방법
- live/external 의존 시 manual-only 또는 opt-in 분리 근거

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
   - 실행 전 workpack의 `QA / Test Data Plan` 기준으로 fixture/seed setup을 먼저 맞춘다.
2. 생성된 `.artifacts/qa/<slice>/<timestamp>/` 번들을 기준으로 Codex 또는 사용자가 브라우저 탐색 QA 수행
3. `exploratory-report.json` 작성
4. `pnpm qa:eval -- --checklist <.../exploratory-checklist.json> --report <.../exploratory-report.json>` 실행
5. 기본값으로 같은 폴더의 `eval-result.json`에 단건 결과 저장

기본 타이밍:

- `product-frontend`에서 Stage 4 구현 완료 후
- deterministic gate green 후, `Ready for Review` 전

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

## 산출물

exploratory QA 번들은 아래 파일을 만든다.

- `exploratory-checklist.json`
- `exploratory-report.json`
- `README.md` 실행 가이드

PR에는 아래를 남긴다.

- deterministic gate 실행 결과
- exploratory QA 실행 여부와 보고서 경로
- qa eval 결과 또는 `N/A` 근거
- Layer 3 변경이면 `pnpm qa:eval:suite` 결과와 artifact 경로

## 운영 원칙

- Layer 1은 사람이 따로 지시하지 않아도 PR/CI에서 자동으로 돈다.
- Layer 2는 브라우저 탐색과 판단이 포함되므로 **명시적으로 실행**한다.
- Layer 3 단건 평가는 exploratory QA 직후 명시적으로 실행할 수 있고, suite는 QA 시스템 변경에서 자동 + 명시 실행 둘 다 지원한다.
- exploratory QA가 manual/agentic이라고 해서 optional evidence가 되지는 않는다. 실행했다면 보고서와 점수를 남긴다.
