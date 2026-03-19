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
`docs/engineering/agent-plan-loop.md`의 `Codex-Claude plan loop`를 우선 사용한다.

기본 흐름:
```
Codex 초안 → Claude 구조화 리뷰 → Codex 수정 → 둘 다 approve 시 종료
```
단, 같은 필수 수정이 반복되거나 blocker가 발생하면 자동 루프를 멈추고 사람이 방향을 재확정한다.

### 리뷰 단계 자동화

구현 후 로컬 pre-PR 단계에서 현재 diff를 반복 리뷰/수정해야 할 때는
`docs/engineering/agent-review-loop.md`의 `Codex-Claude review loop`를 사용한다.

기본 흐름:
```
Claude diff 리뷰 → Codex 수정 → optional verification → Claude 재리뷰 → 둘 다 approve 시 종료
```
단, blocker가 발생하거나 같은 필수 수정이 반복되면 자동 루프를 멈추고 사람이 정리한다.

이 자동 local review loop는 `CLAUDE.md`의 일반 PR-ready 게이트에 대한 좁은 예외다.
- 범위는 구조화된 diff 리뷰 자동화에 한정한다.
- 사람이 수행하는 일반 PR 리뷰는 여전히 `CLAUDE.md`의 PR-ready 조건을 따른다.

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
pnpm install --frozen-lockfile && pnpm test:all
```
하나라도 실패하면 push하지 않는다.

---

## Handoff Protocol

Codex → Claude:
1. 로컬 CI 게이트(`pnpm test:all`) 통과 후 PR을 Draft로 open한다.
2. PR required 워크플로 모두 green 확인 후 "Ready for Review"로 전환한다.

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

## 서브에이전트 판단 형식

→ `docs/engineering/subagents.md` Shared Contract 참조
