---
name: ship-pr-loop
description: "로컬 변경을 의도 단위 커밋으로 나누고, 브랜치를 push하고, GitHub PR을 열거나 갱신하고, 로컬 검증을 돌리고, 현재 PR head SHA 기준 CI를 기다린 뒤, 리뷰와 모든 체크가 green일 때만 머지하는 배달 루프. 사용자가 '커밋·push·PR·CI 대기·머지'를 한 번에 요청하거나, 로컬 작업을 끝까지 ship하려 하거나, 반복 배달 자동화를 원할 때 사용한다. 이 저장소 규칙(Conventional Commits, branch intent 재확인, 엄격한 Merge Gate)에 맞춘 Claude 전용 버전이다."
---

# Ship PR Loop (Claude 전용)

## 개요

로컬 변경 세트를 scope를 잃지 않고 깨끗한 GitHub PR로 마무리하기 위한 스킬이다.
루프 순서: 점검 → 의도 단위 커밋 분리 → 로컬 검증 → 리뷰 → push → PR 생성/갱신 → 현재 head SHA CI 대기 → 머지.

이 저장소의 단일 소스를 따른다:
- 브랜치/커밋/PR/머지 규칙 → `docs/engineering/git-workflow.md`
- 변경 유형별 게이트·리뷰·loop 사용 조건 → `docs/engineering/agent-workflow-overview.md`
- product slice Stage 1~6 절차 → `docs/engineering/slice-workflow.md`

## 역할 경계 (시작 전 확인)

- product slice 작업이면, ship/merge에 해당하는 단계(2·5·6)는 보통 Codex 담당이다.
  `docs/engineering/slice-workflow.md`에서 현재 단계의 담당 AI를 먼저 확인하고,
  Claude 담당이 아니면 "이 단계는 Codex 담당입니다. Codex에게 요청해주세요."라고 안내하고 멈춘다.
- `docs/engineering/` 아래의 repo-engineering automation / workflow tooling 같은 **engineering 예외** 작업이면
  제품 슬라이스 단계 제약 밖이므로 Claude가 이 배달 루프를 끝까지 수행할 수 있다.
- 사용자-facing 응답은 한국어로 작성한다 (`AGENTS.md` 언어 정책).

## 워크플로

1. scope를 먼저 점검한다.
   - `git status -sb`, `git diff --stat`, 필요한 곳만 `git diff`로 읽는다.
   - 무관하거나 사용자 소유인 변경을 식별한다. 무관한 파일은 stage하지 않는다.
   - scope를 안전하게 분리할 수 없으면 멈추고 blocker를 설명한다.

2. 브랜치 lane을 확정한다.
   - 이 저장소는 일반 세션에서 새 user prompt마다 branch intent 재확인을 요구한다.
     파일을 수정/커밋하기 전에 먼저 다음 중 하나를 실행한다:
     - 기존 작업 브랜치 유지: `pnpm branch:start -- --branch <type>/<slug>`
     - 슬라이스 역할 기반: `pnpm branch:start -- --slice <slice> --role <docs|be|fe>`
   - `pnpm branch:status`로 현재 checkout과 recorded intent, reassert 필요 여부를 확인한다.
   - protected base branch(`main`, `master`, `develop`) 위에서 직접 작업하지 않는다.
   - 허용 브랜치 패턴: `feature/ fix/ chore/ docs/ refactor/ test/ release/ hotfix/` (`<type>/<slug>`).
   - PR Size Rule: PR 하나는 한 가지 의도만 담는다. 지금 작업이 현재 작업 브랜치의 의도와 다르면
     별도 브랜치로 분리한다. (`pnpm branch:start`는 clean worktree에서만 새 브랜치를 만든다.)

3. 의도 단위로 커밋을 나눈다.
   - 파일 타입이 아니라 사용자-facing 동작이나 유지보수 목적으로 묶는다.
   - 작은 커밋을 선호한다: 동작 수정 / 회귀 테스트 추가 / 문서 갱신 등을 분리한다.
   - 경로를 명시해서 stage하거나 `git add -p`를 쓴다. 전체가 scope임이 확인되지 않으면 `git add -A`를 피한다.
   - 커밋 메시지는 **Conventional Commits**를 따른다 (`docs/engineering/git-workflow.md`).
     - 형식: `type(scope): summary` 또는 scope 없을 때 `type: summary`
     - 허용 타입: `feat fix docs style refactor test chore perf build ci revert`
     - 예: `fix(auth): handle missing provider callback`, `test: add pending-action regression`

4. push 전에 검증한다.
   - 변경을 증명하는 좁은 테스트를 먼저 돌린다.
   - 실행 가능하면 프로젝트 필수 체크를 돌린다:
     - `pnpm lint`
     - `pnpm typecheck`
     - `pnpm test` (Vitest)
     - 프런트 변경이면 `pnpm verify` (= `verify:frontend`), 필요한 흐름은 targeted Playwright E2E
   - 체크가 실패하면 고치고 다시 돌린 뒤 publish한다. 명백히 무관한 실패면 그 사실을 문서화한다.

5. 머지 전에 리뷰한다.
   - 최종 diff와 테스트 근거를 code-review 관점으로 한 번 훑는다 (Claude의 핵심 역할).
   - critical / important 지적은 진행 전에 고친다. 테스트가 통과했다는 이유로 리뷰를 건너뛰지 않는다.

6. push하고 PR을 열거나 갱신한다.
   - `gh --version`, `gh auth status`로 CLI 상태를 확인한다.
   - tracking과 함께 push: `git push -u origin "$(git branch --show-current)"`.
   - 기존 PR 확인: `gh pr view --json url,number,headRefOid`.
   - 없으면 새로 만든다. 본문에 summary, tests, risks, skip한 항목 메모를 markdown으로 담는다.
   - PR 제목은 Conventional Commits 스타일(`type(scope): summary`). `[claude]` 같은 작성자 접두사는 기본값으로 쓰지 않는다.
   - 사용자가 머지를 요청하지 않았으면 기본 draft. 머지를 요청했으면 CI 대기 전에 ready로 전환한다.

7. 현재 head SHA 기준 CI를 기다린다.
   - push한 commit SHA를 잡는다: `git rev-parse HEAD`.
   - GitHub가 그 정확한 PR head SHA에 대한 체크를 보고할 때까지 기다린다.
   - `pending / queued / 재실행 중 / fail / cancel / 없음 / stale` 체크는 머지 불가로 본다.
   - `gh pr checks --watch` 또는 `gh pr view --json statusCheckRollup,headRefOid` 루프를 쓴다.
   - CI 실패 시 실패 로그를 보고 로컬에서 고치고 commit·push한 뒤 4단계(검증)부터 반복한다.

8. 안전하게 머지한다 (엄격한 Merge Gate).
   - 로컬 검증·리뷰·현재 head CI가 모두 통과한 뒤에만 머지한다.
   - `gh pr checks --required`만으로 충분하지 않다. required가 아니어도 현재 head에서 시작된 체크는 모두 green이어야 한다.
   - 머지 직전 한 번 더 current head 기준 전체 체크 상태를 확인한다. 새 push/rerun으로 체크가 다시 열리면 이전 green을 재사용하지 않는다.
   - branch protection과 저장소 머지 방식을 따른다. 기본은 `gh pr merge --squash --delete-branch`(저장소/사용자가 다른 방식을 요구하면 그에 맞춘다).
   - 머지 후 PR URL, 커밋 목록, 체크 근거, 머지 결과, 남은 risk를 보고한다.

## 실패 규칙

- `pending / queued / 없음 / fail / cancel / stale` CI로는 절대 머지하지 않는다.
- 무관한 로컬 변경을 조용히 포함하지 않는다.
- 명시적 요청 없이 사용자 변경을 다시 쓰거나 되돌리지 않는다.
- 테스트가 통과했다는 이유만으로 리뷰를 건너뛰지 않는다.
- 근거 출처(어떤 명령·어떤 SHA 기준)를 밝히지 않은 채 "CI 통과"라고 주장하지 않는다.
- product slice의 ship/merge가 Claude 담당 단계가 아니면 수행하지 않고 Codex에게 안내한다.
