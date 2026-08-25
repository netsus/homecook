# Codex 새 작업 Stage Handoff SOP

## 목적

Homecook의 모든 신규 작업은 Claude를 사용하지 않는다.
기존 Claude 담당 단계는 **역할이 분리된 별도 ChatGPT/Codex 작업(새 task ID, 새 세션)** 이 맡는다.

이 문서는 새 Codex 작업을 언제 만들고, 무엇을 전달하며, 어떤 증거를 받아야 다음 단계로 넘어갈 수 있는지 정의하는 단일 소스다.
Stage별 산출물과 검증 기준은 `docs/engineering/slice-workflow.md`가 계속 담당한다.

## 용어

- **조정 작업(coordinator task)**: 사용자 요청을 받은 현재 Codex 작업. stage 순서, handoff, 상태, 최종 검증을 관리한다.
- **Stage 작업(stage task)**: Stage 하나의 작성·구현·리뷰 책임을 맡도록 새로 연 별도 Codex 작업.
- **새 작업**: Codex 앱 사이드바에 독립적으로 생기는 ChatGPT/Codex task/thread. 같은 작업 안의 서브에이전트는 새 작업을 대신하지 않는다.
- **작성 작업**: 문서 또는 코드를 직접 바꾸는 Stage 작업.
- **검토 작업**: 작성 작업과 다른 task ID를 가진 read-only 우선 Stage 작업.

## 절대 규칙

1. Claude CLI, Claude 앱, Claude API를 신규 Stage 실행이나 신규 검토 세션에 사용하지 않는다.
2. 작성 작업은 자기 변경을 최종 승인하지 않는다.
3. Stage 1, 2, 4 작성 작업과 internal 1.5, Stage 3, 5, final authority, Stage 6 검토 작업은 서로 다른 task ID와 서로 다른 새 세션을 사용한다.
4. 같은 작업 안의 서브에이전트는 탐색·테스트·보조 리뷰에는 쓸 수 있지만, 독립 Stage 승인자 역할을 대신하지 않는다.
5. 새 작업은 이전 대화 내용을 안다고 가정하지 않는다. 공식 문서, workpack, PR URL, commit SHA, evidence 경로를 handoff에 명시한다.
6. 검토 작업은 finding과 verdict를 남긴다. 수정이 필요하면 작성 작업으로 되돌리고, 수정 후 같은 검토 작업 또는 새 독립 검토 작업이 재확인한다.
7. task ID, 담당 role, 입력 commit SHA, 결과 artifact/PR URL을 stage-result 또는 PR `Actual Verification`에 남긴다.

## Stage 작업 분리표

| 단계 | Codex 작업 역할 | 독립성 |
|---|---|---|
| Stage 1 | `stage1-docs-author` | 새 작성 작업 |
| internal 1.5 | `docs-gate-reviewer` | Stage 1과 다른 새 검토 작업 |
| internal 1.5 repair | `stage1-docs-author` | finding 수정 후 reviewer 재검토 |
| Stage 2 | `backend-implementer` | 새 작성 작업 |
| Stage 3 | `backend-reviewer` | Stage 2와 다른 새 검토 작업 |
| Stage 4 | `frontend-implementer` | Stage 2/3과 다른 새 작성 작업 |
| authority precheck / Stage 5 | `design-reviewer` | Stage 4와 다른 새 검토 작업 |
| final authority gate | `product-design-authority` | Stage 4/5와 다른 새 검토 작업 |
| Stage 6 | `frontend-closeout-reviewer` | Stage 4와 다른 새 검토 작업 |

Stage 5와 Stage 6은 범위가 다르므로 별도 작업을 기본값으로 한다.
low-risk UI 변경에서 Stage 5를 생략하는 경우에도 Stage 6은 Stage 4 구현 작업과 분리한다.

## 새 작업 생성 규칙

조정 작업은 Stage 진입 조건이 충족되면 Codex 앱의 task 관리 기능으로 새 작업을 만든다.
사용자 또는 실행 환경의 정책상 조정 작업이 직접 새 task를 만들 수 없으면, 아래 handoff prompt를 완성해 사용자에게 전달하고 새 작업 생성이 완료될 때까지 해당 Stage를 직접 수행하지 않는다.

새 작업을 만든 직후에는 생성 결과의 task ID를 기록하고, 완료 또는 사용자 입력 필요 상태가 될 때까지 해당 task를 추적한다.
새 작업의 commentary를 근거로 Stage 완료를 선언하지 않고, 최종 응답과 저장소/PR evidence를 함께 확인한다.

## 공통 Handoff Prompt

```text
Homecook `<slice>`의 `<stage/role>`을 수행한다.

작업 위치:
- repository: <absolute-repository-path>
- branch/worktree: <branch-or-worktree>
- base commit: <sha>
- target PR: <url-or-N/A>
- production_mutation: false | release-promoter
- approved_release_sha: <full SHA or N/A>
- approved_release_tag: <prod tag or N/A>
- promotion_id: <id or N/A>
- release_lock_mode: read | write | none
- operator_approval_attestation: <artifact reference or N/A>
- expected_running_release_sha: <full SHA or N/A>

반드시 읽을 것:
1. AGENTS.md
2. docs/sync/CURRENT_SOURCE_OF_TRUTH.md
3. docs/engineering/codex-task-handoff.md
4. docs/engineering/slice-workflow.md의 <stage> 전체
5. docs/workpacks/<slice>/README.md
6. docs/workpacks/<slice>/acceptance.md
7. <stage-specific-docs>

입력 evidence:
- previous stage result: <path-or-summary>
- verification/CI: <refs>
- unresolved findings: <ids-or-none>

책임 범위:
- <this-stage-scope>
- 다른 Stage는 수행하지 않는다.
- 공식 계약 변경이 필요하면 구현하지 말고 Contract Evolution Candidate로 보고한다.
- 작성 작업이면 자기 변경을 최종 승인하지 않는다.
- 검토 작업이면 원칙적으로 코드를 직접 고치지 않고 actionable finding과 verdict를 남긴다.

완료 시 반환:
- verdict: complete / request_changes / blocked
- changed files 또는 reviewed files
- verification evidence
- required finding IDs와 남은 위험
- branch / commit SHA / PR URL
- 다음 Stage가 읽을 handoff 요약
```

## Stage별 최소 입력

### Stage 1

- slice ID와 goal
- roadmap dependency 상태
- 공식 문서 현재 버전
- UI risk / authority 필요 여부

### Stage 2

- merged Stage 1 문서 commit
- internal 1.5 pass evidence
- Backend First Contract
- backend verification 명령

### Stage 3

- backend PR URL과 current head SHA
- required CI 결과
- Stage 2 test/smoke evidence
- review 대상 checklist IDs

### Stage 4

- merged backend PR 또는 BE-only 근거
- 화면정의서와 design artifact
- Stage 3 verdict
- frontend/QA/authority evidence 요구사항

### Stage 5 / final authority

- frontend PR current head SHA
- 구현 스크린샷 또는 Figma evidence
- exploratory QA report/eval
- authority report와 unresolved finding IDs

### Stage 6

- frontend PR current head SHA
- current-head 전체 check 상태
- Stage 5/final authority verdict
- closeout projection과 checklist 상태

## Handoff 완료 조건

다음이 모두 있어야 다음 Stage로 넘어간다.

- 이전 Stage의 `complete` 또는 `approve` verdict
- 입력 commit SHA와 검토 commit SHA 일치
- 필요한 로컬 검증 또는 CI evidence
- unresolved required finding 0
- 작성 작업과 최종 검토 작업의 task ID가 다름
- workpack/acceptance/PR closeout 상태가 실제 저장소와 일치

task가 종료됐다는 사실만으로 Stage 완료로 보지 않는다.

## OMO 전환 경계

기존 `pnpm omo:supervise`, `pnpm omo:run-stage`, Claude provider/budget/resume 경로는 Claude 실행을 전제로 하므로 신규 Stage actor dispatch에 사용하지 않는다.
현재는 Codex 새 작업이 의미 판단과 Stage 실행을 담당하고, OMO는 Claude를 호출하지 않는 validator, 상태 조회, closeout/report projection에만 제한적으로 사용한다.

기존 machine-readable 필드의 `claude`, `claude_approved`, `claude_repairable` 같은 이름은 과거 실행 기록 호환용이다.
새 실행의 actor 의미로 해석하거나 새 Claude 호출의 근거로 사용하지 않는다.
스키마와 런타임 vocabulary를 모델 중립적으로 바꾸는 작업은 별도 workflow-tooling migration으로 진행한다.
