# OMO Efficiency Report: 17b-recipebook-detail-remove

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | estimated_backfilled |
| 최종 상태 | merged / dual_approved / passed |
| 최종 PR | #308 |
| 측정 구간 | 2026-04-30 13:37 ~ 2026-04-30 15:21 KST |
| 벽시계 총 시간 | 104.2분 |
| 순수 진행 누적시간 | 94.0분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex/Claude 자동 수정 오류 | 3회 |
| post-merge stale | 0회 |
| evidence_source | .omx/artifacts, GitHub PR/CI, git history, PR #308 body |

> estimated backfilled 보고서다. 이 slice는 `.artifacts/omo-lite-dispatch` 기반 Stage 실행 산출물이 없어 자동 report의 순수 진행시간이 0.0분으로 떨어졌다. 실제 운영 판단은 `.omx/artifacts`의 Claude delegation prompt/response mtime, PR #306/#307/#308 timestamp, git commit history, GitHub current-head check 결과, PR #308 body closeout projection을 근거로 재복원했다. GitHub CI 대기와 단순 watch 시간은 순수 진행시간에서 제외했고, Codex/Claude가 직접 수행한 implementation/review/repair/verification 시간은 포함했다.

## Evidence Sources

| Source | Usage |
| --- | --- |
| `.omx/artifacts` | Claude Stage 1/3/4 delegation prompt/response, repair evidence, PR body artifact |
| GitHub PR #306 | Stage 1 docs merge evidence |
| GitHub PR #307 | Stage 2 backend + Stage 3 Claude review merge evidence |
| GitHub PR #308 | Stage 4 frontend, Stage 5/6, internal 6.5, final merge evidence |
| git history | Stage commits and final squash merge `d77082a` |
| `.artifacts/qa/17b-recipebook-detail-remove/2026-04-30T05-52-21-936Z` | exploratory QA report, eval result, screenshots, layout check |

## Change Size

| Area | Files | Stage |
| --- | ---: | --- |
| Stage 1 workpack docs/bookkeeping | 5 files | 1, 1.5 |
| Stage 2 backend routes/tests | backend route/test files | 2, 3 |
| Stage 4 frontend UI/API/tests | 7 files | 4 |
| Stage 5/6 closeout and workflow-v2 projection | 4 files | 5, 6, 6.5 |

## Stage Time

| Stage | 순수 진행시간 | 실행 횟수 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs | 14.0분 | 2 | Claude created docs, Codex gate found API contract drift, Claude repaired |
| 1.5 docs gate | 6.0분 | 1 | `validate:workpack`, `validate:workflow-v2` passed after repair |
| 2 backend | 22.0분 | 2 | Codex implemented GET/DELETE backend and regression tests |
| 3 backend review | 10.0분 | 2 | Claude review found missing `my_added` source filter; Codex repaired; Claude approved |
| 4 frontend | 28.0분 | 2 | Claude implemented UI; Codex repaired route drift and recipe detail href |
| 5 design review | 7.0분 | 1 | Codex low-risk design review passed; layout evidence captured |
| 6 closeout | 5.0분 | 1 | Codex Stage 6 review and closeout docs prepared |
| 6.5 internal gates | 2.0분 | 2 | closeout-sync/design-authority/real-smoke PR body projection repaired and validators passed |
| **Total** | **94.0분** | **13** | merged |

## Timeline Notes

| Segment | Evidence | Note |
| --- | --- | --- |
| Stage 1 docs | PR #306, `.omx/artifacts/claude-delegate-17b-recipebook-detail-remove-stage1-*` | Claude used existing resumed session and repaired official API drift (`items[]`, no `book_type`) |
| Stage 2 backend | PR #307 | Codex added backend behavior and tests for owner guard, book-type policy, counters, and 404 already-removed regression |
| Stage 3 review | Claude review artifact | Required fix F-1: `my_added` GET query needed `source_type` filter |
| Stage 4 frontend | PR #308, `.omx/artifacts/claude-delegate-17b-recipebook-detail-remove-stage4-*` | Claude session ran long; Codex continued from worktree output after artifact write did not complete |
| Stage 5 design | README Stage 5 evidence, screenshot bundle | authority_required=false; no overflow/overlap in desktop/mobile/small-iOS captures |
| Stage 6 / 6.5 | PR #308 body, validators, GitHub checks | PR ready validators and current-head checks all passed before merge |

## Human Escalations

| Stage | 발생 | 첫 발생 시점 | 직전 순수 진행 | 원인 | 해결 |
| --- | ---: | --- | ---: | --- | --- |
| - | 0회 | - | 0.0분 | 없음 | - |

## Manual Decision Required

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | 없음 |

## Post-Merge Stale Events

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | 없음 |

## Codex/Claude-Resolved Non-Human Errors

| Stage | 발생 | 첫 발생 시점 | 원인 | 해결 |
| --- | ---: | --- | --- | --- |
| 1 | 1회 | 2026-04-30 13:47 | Stage 1 docs invented/retained API response drift around `book_type`/`recipes[]` | Claude repaired docs to official §12-6 `items[]` contract; validators passed |
| 3 | 1회 | 2026-04-30 14:40 | Claude backend review found `my_added` GET missing `source_type` filter | Codex added failing regression, fixed query, amended PR #307; Claude approved |
| 4/6 | 1회 | 2026-04-30 15:05 | Stage 4 output used `/recipe-books/[book_id]` and `/recipes/[id]` instead of project routes | Codex repaired to `/mypage/recipe-books/[book_id]` and `/recipe/[id]`; tests/E2E/CI passed |

## Verification Summary

| Check | Result |
| --- | --- |
| `pnpm verify:backend` | passed in Stage 2 PR |
| `pnpm verify:frontend` | passed |
| `pnpm exec playwright test tests/e2e/slice-17b-recipebook-detail.spec.ts` | 27 passed |
| `pnpm test:product tests/recipebook-detail.backend.test.ts tests/recipe-book-detail-screen.test.tsx tests/mypage-screen.test.tsx` | 38 passed |
| `pnpm qa:eval -- --checklist ... --report ...` | passed, score 100 |
| `pnpm dev:local-supabase --hostname 127.0.0.1 --port 3102` + `HEAD /mypage`, `HEAD /mypage/recipe-books/...` | 200 / 200 |
| `pnpm validate:workpack -- --slice 17b-recipebook-detail-remove` | passed |
| `pnpm validate:workflow-v2` | passed |
| `pnpm validate:closeout-sync` | passed |
| `pnpm validate:omo-bookkeeping` | passed |
| `pnpm validate:source-of-truth-sync` | passed |
| `PR_IS_DRAFT=false pnpm validate:pr-ready` | passed |
| GitHub PR #308 current-head checks | all passed: build, quality, smoke, accessibility, visual, lighthouse, security-smoke, policy, template-check, labeler, GitGuardian |

## Efficiency Notes

- Claude 담당 Stage는 기존 session `9772af6b-4187-4e7b-ad2b-0cd7bb6bb03c`를 `resume` 방식으로 사용했다.
- Stage 4 Claude run은 오래 걸렸고 response artifact가 정상 종료 기록을 남기지 못했지만, worktree output이 충분해 Codex가 이어받아 route drift를 수리했다.
- 가장 비용이 컸던 지점은 Stage 4 frontend implementation/repair와 PR #308 smoke check 대기였다. CI 대기는 순수 진행시간에서 제외했다.
- human escalation과 manual decision은 없었다.
- 남은 Manual Only 항목은 live OAuth on HTTPS real device 확인이다.
