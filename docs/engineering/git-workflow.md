# Git Workflow Policy

## Branch Strategy

허용 브랜치 패턴:

- `feature/<slug>`
- `fix/<slug>`
- `chore/<slug>`
- `docs/<slug>`
- `refactor/<slug>`
- `test/<slug>`
- `release/<slug>`
- `hotfix/<slug>`

예시:

- `feature/login-gate-modal`
- `fix/pending-action-race`
- `release/2026-03-week2`

`main`, `master`, `develop`는 기본 장기 브랜치로 유지할 수 있다.

## Commit Convention

커밋 메시지는 Conventional Commits 형식을 따른다.

- `feat: add return-to-action after login`
- `fix(auth): handle missing provider callback`
- `refactor(recipe): split fetch helpers`

허용 타입:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `test`
- `chore`
- `perf`
- `build`
- `ci`
- `revert`

## Worktree Strategy

- 큰 기능은 worktree를 분리한다.
- `hotfix/*`는 독립 worktree를 권장한다.
- `release/*`는 안정화 전용 worktree를 권장한다.
- 한 worktree는 한 PR 흐름만 담당한다.

## PR Size Rule

- PR 하나는 한 가지 의도만 담는다.
- 문서, 리팩터링, 기능을 한 PR에 섞지 않는다.
- 불가피하게 섞이면 PR 본문에 이유를 남긴다.
- 해당 변경을 설명하기 위한 필수 bookkeeping 업데이트(예: workpack status, Design Status, 관련 운영 문서 동기화)는 같은 PR에 포함할 수 있다.

## Enforcement

- 로컬 또는 CI에서 브랜치 이름을 검증한다.
- PR 기준 커밋 메시지를 검증한다.
- PR 템플릿 작성 여부와 문서 영향 기록을 확인한다.
