# 에이전트 협업 워크플로우 개요

## 역할 요약

| 에이전트 | 역할 |
|----------|------|
| **Claude** | Workpack 문서 작성 (1단계), 코드 리뷰 (3·6단계), 디자인 리뷰 (5단계), CI 디버깅 |
| **Codex** | TDD 기반 백엔드 구현 (2단계), 프론트엔드 구현 (4단계), API 계약 고정, 커밋/PR 생성 |

---

> **슬라이스 단계별 상세 절차** (읽을 것·산출물·자가 점검·완료 요약 형식)는
> `docs/engineering/slice-workflow.md`를 참조한다.
> 이 문서는 에이전트 간 고수준 협업 흐름과 자동화 루프 진입점을 기술한다.

## 슬라이스 개발 흐름

```
1단계 (Claude) — Workpack README + acceptance.md 작성 → main merge
       ↓ (merge 완료 후)
2단계 (Codex) — feature/be-<slice> 백엔드 구현 → CI green → PR
       ↓
3단계 (Claude) — 백엔드 PR 리뷰 → merge
       ↓
4단계 (Codex) — feature/fe-<slice> 프론트엔드 구현 → CI green → PR
       ↓
5단계 (Claude) — 디자인 리뷰 (Design Status 기준)
       ↓
6단계 (Claude) — 프론트엔드 PR 리뷰 → merge
```

단계별 상세 절차(사전 조건·읽을 것·산출물·자가 점검·완료 요약)는 `docs/engineering/slice-workflow.md` 참조.

---

## 문서 레이어

- `AGENTS.md`: 원칙, 절대 유지 규칙, engineering 예외 규칙
- `docs/engineering/agent-workflow-overview.md`: 변경 유형별 게이트, optional review, loop 사용 기준
- `docs/engineering/slice-workflow.md`: product slice Stage 1~6 절차
- `docs/engineering/git-workflow.md`: 브랜치/커밋/PR 크기 규칙
- `docs/engineering/workflow-v2/*`: next-generation reusable workflow 설계와 파일럿 규칙

같은 규칙이 여러 문서에 보이면 먼저 아래 기준으로 판정한다.

- `중복`: actor, trigger, action, success condition, scope가 같고 새 실행 정보가 없다
- `계층적 위임`: 상위 문서가 원칙을 선언하고 하위 문서가 단계, 예외, 산출물, 체크리스트를 구체화한다

`중복`으로 판정된 규칙만 단일 소스화 대상으로 본다. `계층적 위임`은 삭제보다 링크와 책임 경계를 정리한다.

## V2 Pilot Note

- 현재 product slice의 운영 기본값은 계속 이 문서와 `docs/engineering/slice-workflow.md`다.
- `docs/engineering/workflow-v2/*`는 reusable workflow v2의 설계·파일럿 문서이며, 명시적 승격 전까지 v1을 자동 대체하지 않는다.
- `docs-governance` 또는 workflow tooling 개선 작업이 `workflow-v2`를 명시적으로 대상으로 삼을 때만 해당 문서를 직접 source of truth로 사용한다.

---

## Change Type Matrix

| `change_type` | 대상 예시 | `required_checks` | `optional_reviews` | `N/A allowed fields` | 기본 PR 경로 |
|---------------|-----------|-------------------|--------------------|----------------------|-------------|
| `product-backend` | Route Handler, 상태 전이, 권한, schema | `pnpm install --frozen-lockfile && pnpm verify:backend`, 브랜치/커밋 규칙, 실제 동작 확인 | security reviewer 추가 점검 | Design / Accessibility (UI 변경 없음 근거 필요) | Draft → required checks green → Ready for Review |
| `product-frontend` | 화면 구현, 상태 UI, 로그인 게이트, UX 흐름 | `pnpm install --frozen-lockfile && pnpm verify:frontend`, 실제 동작 확인 | Stage 5 디자인 리뷰, performance reviewer, high-risk UI의 exploratory QA | Security / Performance / Design 항목 중 무영향 영역은 근거와 함께 `N/A` 가능 | Draft → required checks green → Ready for Review |
| `docs-governance` | `AGENTS.md`, `CLAUDE.md`, `docs/engineering/*.md`, PR 템플릿 | 문서 정합성 검토, 관련 unit test 또는 validation script, 필요한 경우만 targeted test | `agent-plan-loop`, `agent-review-loop`, human governance review | Test/E2E, Security, Performance, Design은 `N/A` + 근거 허용 | 필요 시 Draft 생략 가능, 단 merge 전 리뷰 기록 필요 |
| `contract-evolution` | 사용자 승인 기반 공식 요구사항/화면/API/DB/Flow 계약 변경, `CURRENT_SOURCE_OF_TRUTH` 갱신, 관련 workpack 재잠금 | 명시적 사용자 승인 기록, 공식 문서·버전 경로 동기화, `CURRENT_SOURCE_OF_TRUTH` sync, 영향 범위 정리, 관련 workpack/acceptance sync, 필요한 최소 validation | `agent-plan-loop`, `agent-review-loop`, human governance review | docs-only PR이면 Test/E2E, Security, Performance, Design은 `N/A` + 근거 허용 | 별도 docs PR merge → 이후 product slice 재개 |
| `low-risk docs/config` | 오탈자 수정, 주석/설명 보강, 위험도 낮은 config 정리 | 변경 파일 확인, 필요한 최소 validation | 추가 리뷰 선택 | 영향 없는 항목은 `N/A` + 근거 허용 | 작은 PR 허용, 단 PR 본문 근거 기록 |

### Change Type Rules

- `product-backend`와 `product-frontend`는 product slice 절차를 따른다.
- `docs-governance`는 product slice와 같은 `verify:*`를 자동으로 요구하지 않는다. 필요한 최소 검증은 변경 범위에 맞춰 선택한다.
- `contract-evolution`은 사용자 승인으로 공식 source-of-truth 문서를 바꾸는 경로다. 같은 PR에서 공식 문서, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`, 관련 workpack/acceptance를 함께 동기화한다.
- `contract-evolution`이 필요한 슬라이스는 해당 docs PR이 main에 merge되기 전까지 Stage 2/4 product 구현을 시작하지 않는다.
- `low-risk docs/config`는 리스크가 낮고 제품 계약을 바꾸지 않는 변경만 해당한다.
- `required_checks`는 이 문서가 단일 소스다. 다른 문서는 change type을 가정하지 않고 이 문서를 참조한다.
- GitHub Actions는 변경 범위에 따라 무거운 job만 자동 실행한다. policy/PR governance는 기본 유지하고, code CI·frontend QA·security smoke·qa eval은 관련 파일 변경이 있을 때만 뜨는 것을 기본값으로 본다.

### PR Template Guidance

- PR 템플릿의 모든 섹션은 무조건 채우기 대상이 아니다.
- `N/A`를 쓸 때는 `영향 없음` 또는 `해당 없음`의 근거를 한 줄로 남긴다.
- `docs-governance`, `contract-evolution`, `low-risk docs/config`는 E2E, Lighthouse, Design 항목을 무조건 체크하지 않는다.

### QA Execution Rules

- deterministic QA 실행 기준은 `docs/engineering/qa-system.md`가 단일 소스다.
- Layer 1 deterministic QA는 PR/CI에서 자동 실행되며, 로컬에서는 change type에 맞는 `verify:*` 스크립트로 재현한다.
- Layer 2 exploratory QA는 기본적으로 자동 실행되지 않는다. `product-frontend` Stage 4 구현 후, `Ready for Review` 전에 명시적으로 `pnpm qa:explore -- --slice <slice>`를 실행한다.
- exploratory QA는 `new-screen`과 `high-risk-ui-change`에서 기본 수행이다. low-risk UI change는 생략 가능하지만 PR 본문에 근거를 남긴다.
- Layer 3 qa eval은 QA 시스템 자체를 변경할 때 명시적으로 `pnpm qa:eval:suite`를 실행하며, 같은 변경 범위에서는 `.github/workflows/qa-eval.yml`이 자동으로 재실행된다.

---

## Codex 작업 흐름 (2·4단계)

### 시작 조건
- 해당 슬라이스의 `docs/workpacks/<slice>/README.md`와 `acceptance.md`가 main에 merge된 상태
- (1단계 Claude 문서가 없으면 Claude에 먼저 요청)

### 1단계 — 문서 확인 (항상 이 순서)
```
AGENTS.md → CURRENT_SOURCE_OF_TRUTH.md → workpacks/<slice>/README.md + acceptance.md
→ (필요 시) git-workflow.md, tdd-vitest.md
```

예외:
- `docs/engineering/` 아래의 repo-engineering automation / workflow 작업은 제품 workpack 슬라이스가 아니다.
- 이런 경우 `workpacks/<slice>/README.md` 대신 대상 `docs/engineering/*.md`와 관련 governing doc을 기준으로 진행한다.

### 계획 단계 자동화

문서 보완, 개발 계획, 문제점 탐색처럼 구현 전 합의가 중요한 작업은
`docs/engineering/agent-plan-loop.md`의 `Codex-Claude plan loop`를 **권장**한다.

기본 흐름:
```
Codex 초안 → Claude 구조화 리뷰 → Codex 수정 → 둘 다 approve 시 종료
```
단, 같은 필수 수정이 반복되거나 blocker가 발생하면 자동 루프를 멈추고 사람이 방향을 재확정한다.

공식 문서에 없는 더 나은 계약이 보이면:

- 에이전트는 그 계약을 plan에 기정사실로 넣지 않는다.
- 대신 `user approval required` 성격의 unresolved question으로 남기고 `contract-evolution` 경로로 에스컬레이션한다.
- 사용자 승인 후에는 별도 docs PR로 공식 문서와 `CURRENT_SOURCE_OF_TRUTH`를 먼저 갱신한 뒤 plan 또는 workpack을 다시 잠근다.

권장 상황:

- 새 슬라이스 시작 전 계획 합의가 필요한 경우
- engineering governance 문서처럼 여러 governing doc이 얽힌 경우
- open question이 남아 사람이 곧바로 구현하기 어려운 경우

생략 가능한 상황:

- low-risk docs/config 정리
- 이미 합의된 작은 문서 보정
- 구현보다 단순 기록 보강이 중심인 경우

### 리뷰 단계 자동화

`docs/engineering/agent-review-loop.md`의 `Codex-Claude review loop`는
product slice의 기본 Stage 2/4 경로에서는 사용하지 않는다.
slice workflow에는 이미 Stage 3, 5, 6의 정식 리뷰 단계가 있으므로, product slice에서 review loop를 기본 또는 권장 경로로 중복 추가하지 않는다.

기본 흐름:
```
Claude diff 리뷰 → Codex 수정 → optional verification → Claude 재리뷰 → 둘 다 approve 시 종료
```
단, blocker가 발생하거나 같은 필수 수정이 반복되면 자동 루프를 멈추고 사람이 정리한다.

이 자동 local review loop는 `CLAUDE.md`의 일반 PR-ready 게이트에 대한 좁은 예외다.
- 범위는 구조화된 diff 리뷰 자동화에 한정한다.
- 사람이 수행하는 일반 PR 리뷰는 여전히 `CLAUDE.md`의 PR-ready 조건을 따른다.

권장 상황:

- docs-governance
- infra-governance
- product slice 바깥의 workflow/tooling 변경
- 정식 Stage 리뷰를 대체하지 않는 예외적 recovery 작업

생략 가능한 상황:

- 일반 product slice Stage 2/4 구현
- low-risk docs/config
- reviewer가 즉시 읽고 판단 가능한 작은 문서 변경
- 단일 파일의 명확한 수정으로 추가 loop 가치가 낮은 경우

### 2단계 — 서브에이전트 호출 (작업 유형별)

**기능 개발**
```
Orchestrator → TDD Driver → Git Workflow Reviewer → PR Governance Reviewer → Test Reviewer
```

**API/인증 변경**
```
Orchestrator → TDD Driver → Security Reviewer → Test Reviewer → PR Governance Reviewer
```

**UI 변경**
```
Orchestrator → TDD Driver → Design and System Reviewer → Performance Reviewer → PR Governance Reviewer
```

**설정/CI 변경**
```
Orchestrator → Git Workflow Reviewer → Lint and Format Reviewer → PR Governance Reviewer
```

### 3단계 — 구현 순서
```
실패 테스트 작성 → 최소 구현 → 테스트 통과 → 리팩토링
```

### 4단계 — Push 전 로컬 CI 게이트
```
change type 기준 required checks 실행
```
product slice 구현에서는 기본값으로 backend는 `pnpm install --frozen-lockfile && pnpm verify:backend`, frontend는 `pnpm install --frozen-lockfile && pnpm verify:frontend`를 사용한다.
docs-governance와 low-risk docs/config는 위 Change Type Matrix의 최소 검증 세트를 따른다.

---

## Handoff Protocol

Codex → Claude:
1. change type별 `required_checks`를 통과한 뒤 PR을 연다.
2. product 구현은 Draft로 시작하고 required CI가 green이면 `Ready for Review`로 전환한다.
3. docs-governance, contract-evolution, low-risk docs/config는 작은 변경이면 Draft를 생략할 수 있지만, PR 본문에 근거와 review path를 남긴다.

Claude 리뷰 시작 조건:
→ `CLAUDE.md` 리뷰 시작 조건 참조

---

## Claude 리뷰 흐름

```
workpacks/<slice>/README.md 확인 (Claude가 1단계에서 작성한 슬라이스 문서 기준 검토)
→ PR 코드 리뷰 (AGENTS.md 기준)
→ CI 실패 시 디버깅 지원
→ 디자인 피드백 (Tailwind/레이아웃/공용 컴포넌트)
→ 구조 변경 필요 시 Codex에 협의 요청
```

engineering 예외 작업에서는:
```
관련 docs/engineering/*.md 확인
→ AGENTS.md / CLAUDE.md / workflow 문서와 충돌 없는지 검토
→ 코드/문서 리뷰
```

---

## Design Review Intensity

- `new-screen` 또는 `high-risk-ui-change`
  - Stage 1 `design-generator` / `design-critic` 권장
  - Stage 5 디자인 리뷰 기본 수행
  - `Design Status: temporary -> pending-review -> confirmed`
- `low-risk-ui-change`
  - 기존 화면의 문구, spacing, token swap, 경미한 polish는 Stage 1 설계 산출물을 생략할 수 있다
  - Stage 5는 선택 실행 가능하며, Stage 6에서 lightweight design check로 흡수할 수 있다
  - 생략 시 README 또는 PR 본문에 이유를 남긴다

`high-risk-ui-change` 예시:

- 새 화면 또는 새 핵심 플로우
- navigation, 정보 구조, interaction model 변경
- 새 공용 UI 컴포넌트 도입
- 접근성 또는 상태 UI 동작에 영향이 큰 변경

---

## 서브에이전트 판단 형식

→ `docs/engineering/subagents.md` Shared Contract 참조
