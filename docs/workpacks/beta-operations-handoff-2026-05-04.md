# Beta Operations Handoff: 2026-05-04

이 문서는 베타 후보 QA 이후 실제 베타 운영을 시작할 때 사용할 운영 기준이다. 배포 자체를 대신하지 않고, 배포 전후에 무엇을 확인하고 어떤 기준으로 이슈를 처리할지 고정한다.

## Current State

- Latest merged baseline: `master` after PR #329 (`e7cc446`).
- Automated PR checks on PR #329: GitGuardian, accessibility, build, labeler, lighthouse, policy, quality, security-smoke, smoke, template-check, visual all passed.
- Product slice roadmap: slices `01` through `19` are `merged`.
- YouTube import beta exposure: keep off by default unless live YouTube smoke passes with the feature flag enabled.
- Live OAuth: still blocked until real OAuth credentials are configured in staging or GitHub Actions secrets.
- Manual-only gates: use `docs/workpacks/beta-release-manual-checklist-2026-05-04.md`.

## Beta Entry Gate

Do not invite beta users until all required items below are true.

| Gate | Required? | Evidence |
| --- | --- | --- |
| Latest `master` deployed to staging/beta | Yes | deploy SHA and URL |
| Live OAuth smoke | Yes | GitHub workflow run or staging smoke evidence |
| Real-device mobile smoke | Yes | device, OS, browser, screenshot or recording |
| YouTube import flag off | Yes unless intentionally testing YouTube | env snapshot or deploy note |
| Manual checklist for beta-visible flows | Yes | checklist notes linked from QA issue list |
| P0/P1 open issues | Must be zero | beta issue table |

## Daily Beta Loop

Run this once per beta day while testers are active.

1. Check new tester feedback, support messages, and any captured screenshots or recordings.
2. Check application/runtime logs for auth failures, 4xx/5xx spikes, and slow core flows.
3. Add new issues to `docs/workpacks/beta-candidate-qa-issues-2026-05-04.md` or a dated follow-up issue list.
4. Classify each issue as P0, P1, P2, or P3 using the priority rules below.
5. Fix P0/P1 immediately before expanding the beta cohort.
6. Batch P2/P3 into scheduled hardening unless the same issue repeats across testers.
7. Record what changed: issue ID, priority, owner, deploy SHA, PR, verification evidence, and remaining manual checks.

## Priority Rules

| Priority | Meaning | Action |
| --- | --- | --- |
| P0 | Data loss, account/security issue, app unusable, wrong-user data exposure | Stop beta expansion, fix immediately, redeploy, rerun impacted smoke |
| P1 | Core beta flow blocked for a meaningful group of testers | Fix before next invite wave |
| P2 | Important but has workaround or affects narrower device/flow | Schedule before public launch or earlier if repeated |
| P3 | Tooling noise, copy/polish, low-risk performance debt | Backlog unless it hides real signal |

## Stop Rules

Pause new beta invites if any of these happen.

- Live OAuth login or return-to-action fails for real users.
- Planner, shopping, cooking, leftovers, or manual recipe creation is blocked.
- A completed shopping list can be edited when it should be read-only.
- Another user's data can be viewed or modified.
- YouTube import appears to beta users while the feature flag is intended to be off.
- A P0 or unresolved P1 remains open after a fix attempt.

## Issue Record Template

Use this format when adding a new beta issue.

```md
| BETA-QA-011 | P? | Open | <short issue> | <why it matters> | <recommended timing> |
```

Then add supporting notes below the table:

```md
### BETA-QA-011 Evidence

- First seen: 2026-05-04
- Environment: staging/beta URL, deploy SHA, device/browser
- Repro steps:
- Expected:
- Actual:
- Evidence:
- Owner:
- Fix PR:
- Verification:
```

## Graduation Review

After the first beta cycle, run a go/no-go review before public launch hardening.

- P0/P1 count is zero.
- Repeated P2 issues have owner and target timing.
- `BETA-QA-002`, `BETA-QA-003`, and beta-visible manual checklist items have evidence.
- YouTube import is either still hidden or has live external smoke evidence.
- Latest `master` has all PR checks green.
- A short release note exists with known limitations and disabled features.

## Manual Owner Notes

The following actions require human/deployment access.

- Deploy latest `master` to staging/beta.
- Configure real OAuth credentials or GitHub Actions secrets.
- Use real devices for Web Share and wake-lock behavior.
- Prepare safe staging data for 30-day leftover auto-hide verification.
- Decide beta invite cohort size and communication channel.
