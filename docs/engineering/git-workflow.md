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

## Release Promotion

- `master` merge는 통합 evidence다. production deployment approval은 아니다.
- 서버 Mac release는 `origin/master`의 exact approved SHA, annotated `prod-*` tag, release manifest, attestation이 모두 맞을 때만 승격된다.
- `release/*` 브랜치는 안정화 용도일 수 있지만, production source of truth는 아니다.
- only `release-promoter` role may run production-changing deployment commands.

## Protected Base Branch Rule

- `main`, `master`, `develop`는 merge 대상이 되는 protected base branch다.
- 코드, 문서, 설정 변경을 시작할 때 이 브랜치들 위에서 직접 작업하지 않는다.
- 파일을 수정하기 전에는 반드시 허용된 작업 브랜치로 `checkout`한 뒤 진행한다.
- 표준 로컬 진입점은 `pnpm branch:start -- --branch <name>` 또는 `pnpm branch:start -- --slice <slice> --role <docs|be|fe>`다.
- `pnpm branch:start`는 깨끗한 worktree에서만 동작하며, 새 브랜치는 기본적으로 `origin/master`에서 만든다.
- `pnpm branch:start`는 일반 세션의 active work branch intent를 `.opencode/branch-session.json`에 기록한다.
- `.claude/settings.json` 경로에 남은 project hook는 legacy 호환 경로다. 모든 Codex 새 작업은 hook 유무와 관계없이 새 user prompt 뒤 `pnpm branch:start`로 branch intent를 직접 재확인한다.
- 따라서 같은 세션이어도 새 prompt 뒤에 수정하려면 먼저 `pnpm branch:start ...`를 다시 실행해 이번 턴의 branch intent를 재확인한다.
- 그 다음 `Write/Edit/MultiEdit` 직전에 recorded intent를 검사한다.
  - current checkout과 recorded intent가 다르지만 worktree가 clean이면 recorded branch로 자동 `checkout`
  - current prompt에 대한 branch reassert가 아직 없거나, recorded intent가 없거나, dirty mismatch면 수정 차단
- 현재 상태 확인/초기화:
  - `pnpm branch:status`
  - `pnpm branch:clear`
- `feature/be-<slice>`와 `feature/fe-<slice>`는 `origin/master`에 해당 workpack README + acceptance가 이미 있어야만 시작할 수 있다.
- product PR의 보존된 history 때문에 commit-range policy를 additive commit으로 고칠 수 없는 경우에만 exact recovery branch `feature/<be|fe>-<canonical-slice>-superseding-draft`를 사용할 수 있다.
  - `-superseding-draft`는 예약 suffix다. 다른 suffix, 유사 suffix, PR body/label override, allowlist/skip env로 product branch 의미를 바꾸지 않는다.
  - recovery branch는 parser와 모든 product validator에서 `feature/<be|fe>-<canonical-slice>`와 같은 kind/slice로 분류한다. `fix/*`는 product Ready gate를 실행하지 않으므로 대체 경로가 아니다.
  - original PR/branch history는 force-push, amend, rebase, reset, silent branch recreation 없이 그대로 보존한다.
  - recovery 시작 evidence에는 original PR, exact base/head/tree SHA, additive repair 불가 사유, successor의 exact base/parent/head/tree SHA, original과 successor의 동일-tree 증명을 남긴다.
  - successor commit range는 처음부터 Conventional Commits와 Lore protocol을 만족해야 한다. head-only commit 검사는 clean range 증거를 대체하지 않는다.
  - successor PR은 Draft로 만들고 canonical product PR과 같은 workpack, Policy, Ready, current-head 전체 check, 실제 동작, 독립 Stage review gate를 모두 거친다.
- working branch 또는 PR head branch는 아래 패턴 중 하나여야 한다.
  - `feature/<slug>`
  - `fix/<slug>`
  - `chore/<slug>`
  - `docs/<slug>`
  - `refactor/<slug>`
  - `test/<slug>`
  - `release/<slug>`
  - `hotfix/<slug>`
- `pnpm validate:branch`와 CI branch validation은 protected base branch를 작업 브랜치로 쓰는 경우 실패해야 한다.

이 recovery는 제품 구현 tree를 바꾸기 위한 경로가 아니라 잘못된 보존 history를 우회하지 않고 clean successor history로 다시 제출하는 제한된 절차다. 동일-tree 증명이 없거나 product diff를 함께 바꿔야 하면 이 절차를 쓰지 않고 별도 범위의 product repair로 분리한다.

예시:

```bash
pnpm branch:start -- --branch feature/branch-switch-guard
pnpm branch:start -- --slice 06-recipe-to-planner --role docs
pnpm branch:start -- --slice 06-recipe-to-planner --role be
pnpm branch:start -- --slice 06-recipe-to-planner --role fe
pnpm branch:status
pnpm branch:clear
```

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

## PR Title Convention

- PR 제목은 기본적으로 Conventional Commits 스타일을 따른다.
- 권장 형식은 `type(scope): summary` 또는 scope가 없을 때 `type: summary`다.
- 예시:
  - `fix(planner): keep login CTA above mobile tabs`
  - `docs(workflow): slim CI triggers for docs-only PRs`
- 정규 리뷰용 PR 제목에는 `[codex]` 같은 작성자 접두사를 기본값으로 쓰지 않는다. 역할과 task ID는 PR evidence에 남긴다.
- 이 규칙은 우선 문서 규칙으로 운영하며, 별도 공지 전까지 CI 필수 체크로 강제하지 않는다.

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

## Merge Gate

- merge는 GitHub가 버튼을 허용한다고 바로 진행하지 않는다.
- 현재 PR head SHA에서 시작된 check가 하나라도 `pending`, `queued`, `rerun 중`, `fail`, `cancel`이면 merge하지 않는다.
- `gh pr checks --required`는 merge 판단의 충분조건이 아니다. required가 아닌 check라도 PR에 시작되었다면 모두 완료/green이어야 한다.
- review 승인과 실제 동작 확인이 끝났더라도, merge 직전에는 다시 한 번 current head 기준 전체 PR checks 상태를 확인한다.
- 새 commit push나 rerun으로 head 기준 check가 다시 열리면, 이전 green은 merge 근거로 재사용하지 않는다.

## Enforcement

- 로컬 또는 CI에서 브랜치 이름을 검증한다.
- PR 기준 커밋 메시지를 검증한다.
- PR 템플릿 작성 여부와 문서 영향 기록을 확인한다.
