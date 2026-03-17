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
Orchestrator → TDD Driver → Git Reviewer → PR Reviewer → Test Reviewer
```

**API/인증 변경**
```
Orchestrator → TDD Driver → Security Reviewer → Test Reviewer → PR Reviewer
```

**UI 변경**
```
Orchestrator → TDD Driver → Design Reviewer → Performance Reviewer → PR Reviewer
```

**설정/CI 변경**
```
Orchestrator → Git Reviewer → Lint Reviewer → PR Reviewer
```

### 3단계 — 구현 순서
```
실패 테스트 작성 → 최소 구현 → 테스트 통과 → 리팩토링
```

### 4단계 — Push 전 로컬 CI 게이트
```
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test
```
하나라도 실패하면 push하지 않는다.

---

## Claude 리뷰 흐름

```
workpacks/<slice>/README.md 확인 (Codex가 작성한 슬라이스 문서 기준 검토)
→ PR 코드 리뷰 (AGENTS.md 기준)
→ CI 실패 시 디버깅 지원
→ 디자인 피드백 (Tailwind/레이아웃/공용 컴포넌트)
→ 구조 변경 필요 시 Codex에 협의 요청
```

> workpack README가 없으면 리뷰를 시작하지 않고 Codex에 먼저 요청한다.

---

## 서브에이전트 판단 형식 (공통)

모든 서브에이전트는 아래 형식으로 결과를 반환한다.

- **판단 결과**
- **필수 수정** (blocker)
- **권장 사항** (non-blocker)

우선순위: `AGENTS.md` > 공식 문서 > repo 설정 > 작업 지시
