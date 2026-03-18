# 에이전트 협업 워크플로우 개요

## 역할 요약

| 에이전트 | 역할 |
|----------|------|
| **Codex** | TDD 기반 기능 구현, API 계약 고정, 커밋/PR 생성 |
| **Claude** | 코드 리뷰, CI 디버깅, 디자인/UX 개선 |

---

## Codex 작업 흐름

### 1단계 — 문서 확인 (항상 이 순서)
```
AGENTS.md → CURRENT_SOURCE_OF_TRUTH.md → workpacks/<slice>/README.md
→ (필요 시) git-workflow.md, tdd-vitest.md
```

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
workpacks/<slice>/README.md 확인 (Codex가 작성한 슬라이스 문서 기준 검토)
→ PR 코드 리뷰 (AGENTS.md 기준)
→ CI 실패 시 디버깅 지원
→ 디자인 피드백 (Tailwind/레이아웃/공용 컴포넌트)
→ 구조 변경 필요 시 Codex에 협의 요청
```

---

## 서브에이전트 판단 형식

→ `docs/engineering/subagents.md` Shared Contract 참조
