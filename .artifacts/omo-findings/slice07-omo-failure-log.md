# Slice07 OMO Failure Log

이 파일은 `07-meal-manage` 구현 중 드러난 OMO/runtime 실패 유형을 임시로 누적하는 작업 메모다.
slice07이 종료된 뒤 OMO 개편 브랜치에서 본 문서를 기반으로 재발방지 작업을 진행한다.

## Failure Families Observed So Far

### 1. Stage Result Missing / Contract Violation

- Stage 1에서 `stage-result.json` 미작성
- docs gate repair에서 `rebuttals.fix_id`, `rationale_markdown` alias mismatch
- implementation stage에서 semantic incomplete result를 terminal output처럼 제출

### 2. Stage-Owned Bookkeeping Dirty Worktree

- `.workflow-v2/status.json`
- `.workflow-v2/work-items/<slice>.json`
- `docs/workpacks/<slice>/README.md`

현재 stage가 소유한 bookkeeping인데도 dirty blocker로 잘못 escalate된 사례가 반복됨.

### 3. Parser / Template Key Mismatch

- Design Authority parser가 `Visual artifact:`만 읽고 `Stage 4 evidence plan:`을 무시
- doc-gate review finding이 `message/remediation_hint` vs `issue/suggestion` 사이에서 canonicalization 필요

### 4. Session / Resume Model Mismatch

- Codex Stage 2가 background task를 띄우고 결과를 기다리는 중간 상태에서 run 종료
- OMO는 single-run collection에 가깝고, background task completion을 같은 실행 안에서 자연스럽게 회수하지 못함

### 5. Semantic Completion Gaps

- Stage 2가 실제 구현/테스트 없이
  - `result=blocked`
  - `changed_files=[]`
  - `checklist_updates=all unchecked`
  를 제출했는데, supervisor가 너무 늦게 차단함

### 6. In-Flight Observability Gaps

- runtime에 `phase=stage_running`이 남아 있어도 실제 actor가 아직 살아 있는지 바로 알기 어려움
- artifact 로그가 비어 있거나 stale인데도 status는 running처럼 보일 수 있음
- operator는 지금이
  - 실제 실행 중인지
  - retry 대기인지
  - stale lock인지
  - 중간 산출물만 남은 stopped state인지
  를 즉시 구분하기 어려움

## Slice07-Specific Incidents

### Stage 1

- Claude stage-result missing
- branch intent / write permission confusion

### Internal 1.5

- docs gate repair rebuttal alias mismatch
- README Design Authority `Visual artifact` parser mismatch
- pending_recheck 후 bookkeeping residue로 `escalated`

### Stage 2

- background task 탐색 후 구현 미착수
- semantic incomplete stage-result 제출
- implementation closeout 전에 human escalation 발생

### Stage 3 / 4

- Claude run이 실제로는 abort/compaction/network 계열 오류로 끝났는데 runtime은 `stage_running` 또는 stale lock처럼 남음
- Stage 4 진행 중에도 transcript는 계속 쌓이는데 artifact stdout/stderr만 보면 빈 상태로 보여 operator가 혼란스러움
- Stage 4 구현은 실제로 완료됐고 authority report / tests / build까지 남겼는데, stage-owned checklist(`delivery-ui-connection`, `delivery-test-split`, `delivery-state-ui`, `delivery-manual-qa-handoff`, `delivery-authority-evidence-plan`)를 workpack/`checklist_updates`에 체크하지 않아 `human_escalation` 발생
- Stage 4 closeout을 맞춘 뒤에도 README `Design Status`가 `temporary`와 `pending-review` 동시 체크 상태로 남아 bookkeeping invariant `design_status_ambiguous` 발생
- Stage 4 finalize 재시도 후 `pnpm verify:frontend`에서 Playwright E2E 39건 실패
  - 공통 증상: 모든 viewport에서 `김치찌개` meal card를 찾지 못함
  - 즉 Stage 4 UI 구현 자체보다도 FE verification fixture/route wiring이 실제 기대 상태와 맞지 않는 가능성이 큼
- Stage 4 authority precheck는 `stage-result.json`과 `opencode.stdout.log`상 완료됐는데 runtime은 `stage_running` + locked 상태로 남음
  - 이번 케이스는 stale Claude가 아니라 stale Codex(`provider=opencode`, `session_role=codex_primary`) lock이어서 기존 auto-retry/auto-resume 경로가 잡지 못함
  - 결과적으로 `pnpm omo:tick`은 `skip_locked -> none (locked_by=...)`만 반환했고, runtime을 `stage_result_ready`로 수동 복구해야 다음 전이로 진행 가능했음
- stale lock을 풀고 authority precheck를 consume하자, 이번에는 authority precheck `stage-result.json`이 Stage 4 implementation에서 이미 닫아 둔 checklist snapshot을 계승하지 않아 다시 `human_escalation` 발생
  - 즉 authority precheck 산출물이 “delta evidence only”로 작성됐고, supervisor는 이를 Stage 4 전체 closeout 결과로 검증하면서 `delivery-*` 및 `accept-*` checklist 누락으로 판단함
  - slice07에서는 이전 Stage 4 implementation result의 checklist snapshot을 authority precheck result에 수동 병합해 복구함
- frontend PR `#152`의 `policy` check는 코드가 아니라 PR body evidence 누락으로 실패함
  - `ui_risk = new-screen`이라 `## QA Evidence`에 `exploratory QA`, `qa eval`, `아티팩트 / 보고서 경로`가 필수였는데, 자동 생성된 PR body가 `해당 없음`으로 채워져 fail
  - 같은 PR은 `external_smokes = [\"pnpm dev:local-supabase\"]`도 선언하고 있어서 `## Actual Verification`의 `environment / scope / result`를 real smoke 기준으로 같이 채워야 함
  - slice07에서는 실제 `.artifacts/qa/07-meal-manage/<timestamp>/` 번들과 `eval-result.json(score=100)`를 만든 뒤 PR body를 수동 보정해 복구함
- PR body를 고친 뒤에도 `policy`가 바로 재실행되지 않았음
  - 현재 `.github/workflows/policy.yml`은 `pull_request` 기본 이벤트만 듣고 있어 PR body `edited`만으로는 새 `Policy` run이 생기지 않음
  - slice07에서는 no-op commit으로 `synchronize` 이벤트를 강제로 발생시켜 재실행시킴
  - 첫 no-op commit은 Conventional Commit 형식이 아니어서 `Validate commit messages`에서 다시 실패했고, top commit message를 `chore(ci): ...`로 교체한 뒤 force-push로 복구함
- 같은 head에서 `lighthouse`는 CI에서만 `performance 0.68` / `TBT 1039ms`로 실패했지만, 로컬 `pnpm test:lighthouse`는 같은 branch 상태에서 통과함
  - slice07 기준으로는 코드 회귀보다 CI variability/flakiness 가능성이 높다고 판단했고, 정책 복구와 함께 새 head에서 재실행하도록 처리함
- CI check가 새 head에서 모두 green이 된 뒤에도 OMO runtime이 이전 `PR checks failed` snapshot을 자동 폐기하지 못하는 failure family가 확인됨
  - 증상: `gh pr checks`는 all green인데 `omo:status:brief`는 계속 `pr_checks_failed` / stale wait 상태를 유지
  - 원인: runtime에 저장된 frontend PR `head_sha`가 옛 실패 commit에 머물러 있고, `human_escalation(reason=PR checks failed)`를 현재 head 기준으로 재평가하는 자동 복구 경로가 없음
  - 결과: `pnpm omo:tick`만으로는 재개되지 않고, current PR head와 `ci` wait snapshot을 수동으로 다시 맞춘 뒤에야 Stage 6으로 전이 가능했음

### Token Cost Spike (Stage 4)

- Stage 4 run-metadata 기준 `claude-sonnet-4-6` 사용량:
  - output tokens: `~99k`
  - cache read input tokens: `~15.5M`
  - cache creation input tokens: `~358k`
  - total cost: `~$7.50`
- 직접 원인:
  - Stage 4가 Stage 1부터 이어진 동일 `claude_primary` session을 재사용해 누적 transcript/context가 매우 커짐
  - 같은 Claude session 아래 subagent transcript(`subagents/*.jsonl`)도 누적되어 context read 비용이 커짐
  - authority report, stage-result summary/PR body, 테스트/설계 문서 읽기가 길고 상세함
  - 실시간으로는 artifact log가 비어 보여도 실제 transcript는 계속 누적되어 operator visibility와 비용 체감이 어긋남
- 시사점:
  - 장수 세션 재사용은 문맥 유지에는 유리하지만 Stage 4/5처럼 문서·스크린샷·테스트를 많이 읽는 단계에서 비용이 급증할 수 있음
  - 추후 OMO 개편 시 session rollover / compaction-aware resume / stage-local context rebasing 필요

## Requested OMO UX / Runtime Improvements

### Real-Time Running Status

- `omo:status` / `omo:status:brief`에 아래를 직접 노출
  - 마지막 actor event timestamp
  - 마지막 transcript timestamp
  - 현재 live process 여부
  - stale lock 여부
  - retry due 시각
  - 현재 subphase / actor / session id
  - 최근 tool activity 요약 (`read`, `write`, `test`, `gh`, `playwright` 등)
- `running`을 단일 상태로 보여주지 말고 아래처럼 구분
  - `running_live`
  - `running_stale`
  - `waiting_retry`
  - `waiting_ci`
  - `waiting_manual_handoff`
  - `blocked_contract`
- `omo:tail -- --work-item <id>` 또는 동등한 명령으로 최근 artifact log / transcript 요약을 실시간으로 확인 가능하게 하기
- Stage owner commentary를 runtime summary에 축약 저장해서, operator가 “지금 무엇을 하고 있는지”를 마지막 1~3줄로 읽을 수 있게 하기
- background/stale execution 복구 시, 왜 자동 retry로 돌렸는지 status notes와 failure log에 함께 남기기

### Stage-Owned Checklist Handling

- Stage 2/4 implementation stage는 stage-owned checklist를 “선택 입력”이 아니라 필수 closeout 출력으로 취급해야 한다
- agent가 `result=done`을 제출했는데 stage-owned checklist가 여전히 unchecked면:
  - 즉시 human escalation로 보내지 말고
  - same-session continue 또는 deterministic checklist sync 후보로 분기해야 한다
- 장기적으로는 README/acceptance checkbox sync를 supervisor-owned bookkeeping으로 흡수하는 방향 검토

## Current Working Rule For Slice07

- slice07 완료 전까지는 OMO 개편보다 slice 구현 성공을 우선한다.
- OMO/system 개선이 필요하더라도, slice07을 막는 최소 수정만 허용한다.
- slice07 구현 중 새로 드러나는 OMO 문제는 이 파일에 계속 추가한다.

## Stage 4 E2E Root Cause: MealScreen Fixture / Rendering Path

- `tests/e2e/slice-07-meal-manage.spec.ts`는 `page.addInitScript()`로 `localStorage["homecook.e2e-auth-override"]`만 설정했다.
- 실제 `MealScreen` 렌더 경로는 다음 순서였다.
  1. `app/planner/[date]/[columnId]/page.tsx`
  2. 서버에서 `getServerAuthUser()`
  3. unauthenticated면 즉시 `/login?next=...` redirect
  4. redirect가 없을 때만 `MealScreen` client component mount
  5. mount 후에야 `MealScreen`이 `readE2EAuthOverride()`로 client override를 읽고 `/api/v1/meals`를 호출
- 따라서 client-only override는 서버 redirect보다 늦어서, `authenticated` 시나리오가 모두 로그인 페이지에서 멈췄다.
- 이번 slice07 fix:
  - QA auth override를 cookie에도 동기화
  - `app/planner/[date]/[columnId]/page.tsx`가 server-side cookie override를 읽고 redirect 여부를 판정
  - `slice-07-meal-manage.spec.ts`는 localStorage와 cookie를 함께 설정
