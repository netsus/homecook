# Codex Subagent Operating Model

이 문서는 이 저장소에서 메인 Codex가 어떤 역할 기반 서브에이전트 관점으로 작업을 분해하는지 정의한다.

## Core Flow

메인 Codex는 아래 순서를 기본값으로 사용한다.

1. 문서와 소스 오브 트루스 확인
2. 테스트 전략 설계
3. 구현
4. Git/PR/품질 리뷰

작업 중 필요한 역할만 호출하며, 호출 순서는 목적이 명확해야 한다.

## Shared Contract

모든 서브에이전트는 아래 형식으로 판단을 남긴다.

- 판단 결과
- 필수 수정 사항
- 권장 사항
- 차단 여부 (`blocker` / `non-blocker`)

우선순위는 항상 아래 순서를 따른다.

1. `AGENTS.md`
2. 공식 문서
3. repo 설정 파일
4. 개별 작업 지시

## Roles

### 1. Orchestrator

- 사용자 요청을 작업 단위로 분해한다.
- 어떤 서브에이전트를 어떤 순서로 호출할지 정한다.
- 최종 변경 전 승인 기준과 검증 범위를 확정한다.

### 2. Git Workflow Reviewer

- 브랜치 전략, 커밋 컨벤션, worktree 전략을 점검한다.
- 원칙:
  - 커밋은 한 의도만 담는다.
  - PR 하나는 한 workpack 또는 한 슬라이스만 다룬다.
  - 기능, hotfix, release는 worktree 분리를 우선 검토한다.

### 3. Lint and Format Reviewer

- ESLint 규칙과 포맷 일관성을 본다.
- 불필요한 console, debugger, 스타일 드리프트를 줄인다.
- 로컬과 CI 결과가 동일한지 확인한다.

### 4. PR Governance Reviewer

- PR 템플릿 작성 상태를 본다.
- 문서 영향, 테스트, 보안, 성능, breaking change 기록을 확인한다.
- 라벨링과 merge gate 누락 여부를 점검한다.

### 5. TDD Driver

- 구현 전에 실패하는 테스트가 있는지 확인한다.
- 요구사항을 Given/When/Then 시나리오로 바꾼다.
- 회귀 테스트를 함께 닫도록 유도한다.

### 6. Test Reviewer

- happy path만 검증하는 테스트를 경계한다.
- 상태 전이, 에러, read-only, 인증 경계 테스트를 우선 확인한다.
- flaky 가능성과 과한 mocking 사용을 줄인다.

### 7. Security Reviewer

- OWASP 관점에서 인증, 입력 검증, 비밀정보 노출을 본다.
- dependency risk와 권한 경계를 함께 본다.
- 위험도별 우선순위를 남긴다.

### 8. Performance Reviewer

- 클라이언트 번들 증가, 불필요한 렌더링, 서버/클라이언트 경계 문제를 본다.
- UI 라우트 변경 시 Lighthouse 근거 또는 수동 점검 기록을 요구한다.

### 9. Design and System Reviewer

- 공식 문서와 실제 UI 구현이 어긋나지 않는지 본다.
- spacing, hierarchy, interaction, accessibility 일관성을 점검한다.
- wireframe은 참고 자료이며, 공식 문서가 우선이다.

### 10. QA Explorer

- workpack README와 acceptance.md를 읽고 exploratory QA checklist를 만든다.
- desktop/mobile에서 핵심 흐름, edge case, 회복 UX를 탐색한다.
- severity, repro, evidence, remaining risk를 구조화된 보고서로 남긴다.

## Default Invocation Matrix

- 기능 개발: Orchestrator -> TDD Driver -> Git Workflow Reviewer -> PR Governance Reviewer -> Test Reviewer
- API/인증 변경: Orchestrator -> TDD Driver -> Security Reviewer -> Test Reviewer -> PR Governance Reviewer
- UI 변경: Orchestrator -> TDD Driver -> Design and System Reviewer -> Performance Reviewer -> PR Governance Reviewer
- High-risk UI 검증: Orchestrator -> QA Explorer -> Design and System Reviewer -> PR Governance Reviewer
- 설정/CI 변경: Orchestrator -> Git Workflow Reviewer -> Lint and Format Reviewer -> PR Governance Reviewer
