# 에이전트 협업 워크플로우 개요

## 역할 요약

| 에이전트 | 역할 |
|----------|------|
| **Claude** | Workpack 문서 작성 (1단계), internal 1.5 docs gate repair/final owner, 백엔드 리뷰 (3단계), 프론트엔드 구현 (4단계), authority-required slice의 final authority gate, CI 디버깅 |
| **Codex** | internal 1.5 docs gate review, TDD 기반 백엔드 구현 (2단계), authority precheck, 디자인 리뷰 (5단계), 프론트엔드 PR 리뷰/closeout (6단계), API 계약 고정, 커밋/PR 생성 |

---

> 이 문서는 `change_type`별 gate, `required_checks`, optional review, loop 진입 조건만 다룬다.
> product slice의 stage owner / 읽을 것 / 산출물 / handoff / 완료 요약은 `docs/engineering/slice-workflow.md`,
> 공통 원칙과 문서 계층은 `AGENTS.md`,
> workflow-v2 operator entry는 `docs/engineering/workflow-v2/README.md`를 따른다.

---

## Change Type Matrix

| `change_type` | 대상 예시 | `required_checks` | `optional_reviews` | `N/A allowed fields` | 기본 PR 경로 |
|---------------|-----------|-------------------|--------------------|----------------------|-------------|
| `product-backend` | Route Handler, 상태 전이, 권한, schema | `pnpm install --frozen-lockfile && pnpm verify:backend`, 브랜치/커밋 규칙, 실제 동작 확인 | security reviewer 추가 점검 | Design / Accessibility (UI 변경 없음 근거 필요) | Draft → required checks green → Ready for Review → 전체 PR checks green 후 merge |
| `product-frontend` | 화면 구현, 상태 UI, 로그인 게이트, UX 흐름 | `pnpm install --frozen-lockfile && pnpm verify:frontend`, 실제 동작 확인 | Stage 5 디자인 리뷰, `product-design-authority`(new-screen / high-risk / anchor extension), performance reviewer, high-risk UI의 exploratory QA | Security / Performance / Design 항목 중 무영향 영역은 근거와 함께 `N/A` 가능 | Draft → required checks green → Ready for Review → 전체 PR checks green 후 merge |
| `docs-governance` | `AGENTS.md`, `CLAUDE.md`, `docs/engineering/*.md`, PR 템플릿 | 문서 정합성 검토, 관련 unit test 또는 validation script, 필요한 경우만 targeted test | `agent-plan-loop`, `agent-review-loop`, human governance review | Test/E2E, Security, Performance, Design은 `N/A` + 근거 허용 | 필요 시 Draft 생략 가능, 단 merge 전 리뷰 기록 필요 |
| `contract-evolution` | 사용자 승인 기반 공식 요구사항/화면/API/DB/Flow 계약 변경, `CURRENT_SOURCE_OF_TRUTH` 갱신, 관련 workpack 재잠금 | 명시적 사용자 승인 기록, 공식 문서·버전 경로 동기화, `CURRENT_SOURCE_OF_TRUTH` sync, 영향 범위 정리, 관련 workpack/acceptance sync, 필요한 최소 validation | `agent-plan-loop`, `agent-review-loop`, human governance review | docs-only PR이면 Test/E2E, Security, Performance, Design은 `N/A` + 근거 허용 | 별도 docs PR merge → 이후 product slice 재개 |
| `low-risk docs/config` | 오탈자 수정, 주석/설명 보강, 위험도 낮은 config 정리 | 변경 파일 확인, 필요한 최소 validation | 추가 리뷰 선택 | 영향 없는 항목은 `N/A` + 근거 허용 | 작은 PR 허용, 단 PR 본문 근거 기록 |

### Change Type Rules

- `product-backend`와 `product-frontend`는 product slice 절차를 따른다.
- `product-frontend`에서 신규 화면, high-risk UI change, anchor extension은 `docs/engineering/product-design-authority.md` 기준 authority review를 optional이 아니라 사실상 required review로 취급한다.
- `docs-governance`는 product slice와 같은 `verify:*`를 자동으로 요구하지 않는다. 필요한 최소 검증은 변경 범위에 맞춰 선택한다.
- `contract-evolution`은 사용자 승인으로 공식 source-of-truth 문서를 바꾸는 경로다. 같은 PR에서 공식 문서, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`, 관련 workpack/acceptance를 함께 동기화한다.
- `contract-evolution`이 필요한 슬라이스는 해당 docs PR이 main에 merge되기 전까지 Stage 2/4 product 구현을 시작하지 않는다.
- `low-risk docs/config`는 리스크가 낮고 제품 계약을 바꾸지 않는 변경만 해당한다.
- `required_checks`는 이 문서가 단일 소스다. 다른 문서는 change type을 가정하지 않고 이 문서를 참조한다.
- `required_checks`는 로컬/PR 준비 단계의 최소 검증 세트다. merge gate는 별도로 현재 PR head SHA에 대해 시작된 check 전체가 완료/green인지 확인한다.
- GitHub Actions는 변경 범위에 따라 무거운 job만 자동 실행한다. policy/PR governance는 기본 유지하고, code CI·frontend QA·security smoke·qa eval은 관련 파일 변경이 있을 때만 뜨는 것을 기본값으로 본다.

### PR Template Guidance

- PR 템플릿의 모든 섹션은 무조건 채우기 대상이 아니다.
- `N/A`를 쓸 때는 `영향 없음` 또는 `해당 없음`의 근거를 한 줄로 남긴다.
- `docs-governance`, `contract-evolution`, `low-risk docs/config`는 E2E, Lighthouse, Design 항목을 무조건 체크하지 않는다.
- `Actual Verification`은 “누가 / 어디서 / 무엇을 / 어떤 결과로” 확인했는지 남기는 섹션이다.
- `Closeout Sync`, `Merge Gate`의 exact ownership / projection semantics는 `docs/engineering/slice-workflow.md`와 `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`를 따른다.
- `docs/engineering/bookkeeping-authority-matrix.md`는 ownership 정의 문서가 아니라 transition-period writable closeout surface compatibility note다.
- product slice는 `Ready for Review` 전에 `Actual Verification`, `Closeout Sync`, `Merge Gate` 세 섹션을 비워두지 않는다.

### QA Execution Rules

- deterministic QA 실행 기준은 `docs/engineering/qa-system.md`가 단일 소스다.
- Layer 1 deterministic QA는 PR/CI에서 자동 실행되며, 로컬에서는 change type에 맞는 `verify:*` 스크립트로 재현한다.
- Layer 2 exploratory QA는 기본적으로 자동 실행되지 않는다. `product-frontend` Stage 4 구현 후, `Ready for Review` 전에 명시적으로 `pnpm qa:explore -- --slice <slice>`를 실행한다.
- Layer 2 exploratory QA를 실행했다면 같은 Stage 4 안에서 `pnpm qa:eval -- --checklist <...> --report <...>`로 report 품질도 남긴다.
- exploratory QA는 `new-screen`과 `high-risk-ui-change`에서 기본 수행이다. low-risk UI change는 생략 가능하지만 PR 본문에 근거를 남긴다.
- non-draft frontend PR과 `docs/omo-closeout-<slice>` closeout PR은 `pnpm validate:exploratory-qa-evidence`로 exploratory QA evidence presence 또는 low-risk skip rationale을 재검증할 수 있다.
- authority-required frontend PR과 `docs/omo-closeout-<slice>` closeout PR은 `pnpm validate:authority-evidence-presence`로 authority report의 visual evidence presence를 재검증할 수 있다.
- authority review는 exploratory QA를 대체하지 않는다. exploratory QA가 "실사용 흐름과 회복 UX"를 본다면, authority review는 "모바일 앱 품질과 시각/구조 적합성"을 본다.
- Layer 3 qa eval은 QA 시스템 자체를 변경할 때 명시적으로 `pnpm qa:eval:suite`를 실행하며, 같은 변경 범위에서는 `.github/workflows/qa-eval.yml`이 자동으로 재실행된다.

---

## Loop Usage Rules

- 계획 합의가 중요한 작업은 `docs/engineering/agent-plan-loop.md`의 `Codex-Claude plan loop`를 권장한다.
  - 새 슬라이스 시작 전 계획 합의, 여러 governing doc이 얽힌 engineering 변경, open question이 남은 docs-governance에 특히 유효하다.
  - low-risk docs/config 정리나 단순 기록 보강은 생략 가능하다.
- 공식 문서에 없는 더 나은 계약이 보여도 plan에 기정사실로 넣지 않는다.
  - `user approval required` unresolved question으로 남기고 `contract-evolution` 경로로 에스컬레이션한다.
- `docs/engineering/agent-review-loop.md`의 generic `Codex-Claude review loop`는 product slice 기본 public stage 엔진이 아니다.
  - Stage 1은 예외가 아니라 supervisor 기본 경로 안의 `internal 1.5 docs gate`를 mandatory로 사용한다.
  - generic review loop는 docs-governance, infra-governance, workflow/tooling 변경, exceptional recovery에서 권장한다.
  - low-risk docs/config, reviewer가 즉시 판단 가능한 작은 변경은 생략 가능하다.
- product slice의 stage 시작 조건, handoff, closeout 의무는 이 문서가 아니라 `docs/engineering/slice-workflow.md`가 단일 소스다.

## Claude public stage 흐름

- `workpacks/<slice>/README.md`를 확인한 뒤 `Stage 1 문서 작성`, `internal 1.5 docs gate repair / final owner 수행`, `Stage 3 백엔드 리뷰 / Stage 4 프론트 구현 수행`을 맡는다.
- authority-required slice면 `authority-required slice면 Stage 5 final_authority_gate 수행`까지 포함한다.
- 상세 읽을 것, 산출물, handoff는 `docs/engineering/slice-workflow.md`를 따른다.

## Codex review / closeout 흐름

- `workpacks/<slice>/README.md + acceptance.md`를 확인한 뒤 `internal 1.5 docs gate review 수행`, `Stage 2 백엔드 구현 수행`, 필요 시 authority precheck를 맡는다.
- public path에서는 `Stage 5 public 디자인 리뷰와 Stage 6 FE PR 리뷰 / closeout 수행`을 담당한다.
- 상세 읽을 것, 산출물, closeout 의무는 `docs/engineering/slice-workflow.md`를 따른다.

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
