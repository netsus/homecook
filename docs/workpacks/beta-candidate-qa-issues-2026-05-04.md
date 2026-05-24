# Beta Candidate QA Issue List: 2026-05-04

이 문서는 `19-youtube-import` closeout 이후 베타 후보를 만들기 전에 확인해야 할 결함 후보와 manual-only 검증 항목을 한곳에 모은다.

## Evidence Snapshot

- Base: `master` after PR #330 merge (`699ee9b`)
- Regression baseline: pre-design-unification baseline captured on 2026-05-05 KST. Use this as the "known good before design work" comparison point, not as post-design release evidence.
- Deterministic gate: equivalent local baseline passed on 2026-05-05 KST.
  - `pnpm verify` ran through lint, typecheck, product tests, build, and full smoke. The first full smoke saw one non-reproducing `mobile-ios-small` timing failure in `slice-15a-cook-planner-complete`; the isolated retry passed, and a full `pnpm test:e2e:smoke` rerun passed.
- Product tests: 58 files / 539 tests passed in the latest follow-up run
- Playwright: smoke 647 passed / 4 skipped on rerun, a11y 6 passed, visual 12 passed, security 9 passed
- Lighthouse assertions: passed with empty `.lighthouseci/assertion-results.json`
- Lighthouse: `pnpm test:lighthouse` passed; local environment still emits known `GitHub token not set` and Node `punycode` warnings.
- Harness: `pnpm verify:harness` passed, 47 files / 560 tests
- Follow-up verification:
  - `pnpm test:product tests/youtube-import.backend.test.ts` passed after adding beta guard and URL-shape coverage
  - `pnpm test:e2e:oauth` ran but skipped 3 tests because live Google credentials are not present locally
  - `pnpm exec playwright test tests/e2e/slice-14-cook-session-start.spec.ts tests/e2e/slice-15a-cook-planner-complete.spec.ts tests/e2e/slice-15b-cook-standalone-complete.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17c-settings.spec.ts tests/e2e/slice-18-manual-recipe-create.spec.ts tests/e2e/slice-19-youtube-import.spec.ts --project=mobile-chrome --project=mobile-ios-small --grep-invert '@live-oauth'` passed, 138 tests
  - GitHub `Playwright Live OAuth` workflow on `master` run `25322608410` completed with 3 skipped tests because live OAuth secrets were not configured

## Regression Baseline Usage

Use the 2026-05-05 baseline whenever a later change claims "nothing functional broke."

1. Before merging the design-unification branch, rerun the same automated gate on that branch or on the post-merge release candidate.
2. Compare failures against this baseline. A new failing file, route, viewport, visual snapshot, or Lighthouse assertion is a release-candidate regression until explained.
3. If the same `slice-15a-cook-planner-complete` `mobile-ios-small` skip-consumed test fails once, rerun that exact test and then rerun `pnpm test:e2e:smoke`. Treat it as a known timing flake only if both reruns pass.
4. Do not use this baseline to close live OAuth, real-device, Web Share, wake-lock, or live YouTube checks. Those remain staging/manual-only gates.
5. Record the post-design baseline SHA and command results before beta invite. The pre-design baseline is only the comparison anchor.

## Current Defect Triage

| ID | Priority | Status | Issue | Why it matters | Recommended timing |
| --- | --- | --- | --- | --- | --- |
| BETA-QA-001 | P0 | None found | Automated gate found no release-blocking defect. | A red deterministic gate would block beta immediately. Current evidence is green. | No action unless new QA evidence appears. |
| BETA-QA-002 | P1 | Passed on staging | Live OAuth return-to-action and stale-session smoke passed on staging, with a GitHub `Playwright Live OAuth` workflow success recorded. | Login recovery is central to protected actions; fixture auth cannot prove external provider redirects. | Closed for the current staging smoke. Rerun if OAuth provider settings, callback URL, or deploy domain changes. |
| BETA-QA-003 | P1 | Passed on staging | Real-device mobile smoke found no blocking screen, unclickable button, bottom CTA overlap, server error, or infinite loading. | Playwright viewport checks catch layout regressions, but not physical touch feel, OS keyboard behavior, or browser chrome quirks. | Closed for MVP blocking UX. Keep broader visual/taste/mobile-comfort work in design backlog. |
| BETA-QA-004 | P1/P3 | Passed on staging for one live import | YouTube import feature flag/env was enabled on staging and a real YouTube recipe was registered. | If YouTube import is visible as a beta feature, stub success does not prove real external extraction. | One live registration smoke is closed. Quota, broad video quality, caption/ASR/LLM behavior, and extraction quality remain YouTube hardening backlog. |
| BETA-QA-005 | P1/P2 | Partially automated + one live smoke passed | Parser coverage includes common URL shapes, the all-`절이기` cooking-method regression is fixed, and one live external registration passed. | Users paste real URLs in many shapes; deterministic parser tests reduce risk, but live YouTube behavior can still differ. | Closed for MVP smoke. Carry wide URL/video matrix and quality scoring to public-launch hardening. |
| BETA-QA-006 | P2 | Passed on staging | Web Share OS sheet was verified manually on HTTPS real devices. | Clipboard fallback is tested, but OS share behavior depends on browser/device support. | 2026-05-24 staging: Android Chrome and iOS Safari both opened the OS share sheet and returned to the app normally after dismissal. |
| BETA-QA-007 | P2 | Covered by deterministic regression | 30-day `eaten` leftover auto-hide is covered by fake-time backend regression. | Calendar/time behavior can still drift in real environments, but the policy logic is locked without waiting 30 days. | Real long-window observation can stay public-launch hardening unless leftovers becomes a beta success metric. |
| BETA-QA-008 | P2 | Manual checklist ready | Wake-lock UX and cooking-mode screen behavior need real mobile browser confirmation. | Screen wake lock is browser/device specific and important while cooking. | Use `docs/workpacks/beta-release-manual-checklist-2026-05-04.md` before cooking-heavy beta sessions; otherwise before public launch. |
| BETA-QA-009 | P3 | Closed in PR #329 | Existing Next.js `<img>` warnings in seven UI screens were removed by converting thumbnail/avatar renders to `next/image` with explicit dimensions and `unoptimized` external URL handling. | Not a functional failure, and Lighthouse is green, but image optimization debt can grow. | Closed; keep Lighthouse as regression signal. |
| BETA-QA-010 | P3 | Verified non-blocking | Local Lighthouse emits environment/tooling warnings such as missing GitHub token upload and Node `punycode` deprecation, but `pnpm test:lighthouse` still passes and the repo config writes LHCI output to filesystem. | These are not app defects, but can hide signal if logs become noisy. | Track with the manual checklist; clean up before public release or when CI noise starts slowing reviews. |
| BETA-QA-011 | P1 | New release decision | Account deletion UI promises irreversible data deletion, but same-social re-login restored access to existing saved/planner data. | This is a trust and policy mismatch while the delete-account action is visible. The narrow re-login/no-error smoke passed, but deletion semantics did not. | Before public beta, choose one path: hide delete-account action, implement actual user-data cleanup/auth-user deletion, or change official contract/copy to recoverable soft-deactivation. |

## P2/P3 Cleanup Update

- `BETA-QA-006`: passed on 2026-05-24 staging with Android Chrome and iOS Safari OS share sheets.
- `BETA-QA-007`: deterministic fake-time regression now covers the 30-day auto-hide policy. Real long-window observation is optional hardening.
- `BETA-QA-008`: still requires deploy, HTTPS, real devices, and real browser behavior. It is captured as an explicit manual gate in `docs/workpacks/beta-release-manual-checklist-2026-05-04.md`.
- `BETA-QA-009`: code cleanup is merged in PR #329. The fix keeps existing image dimensions and uses `unoptimized` because recipe thumbnails/profile images can come from external providers not listed in `next.config`.
- `BETA-QA-010`: no app code change is required. `pnpm test:lighthouse` passed while reproducing `GitHub token not set` and Node `punycode` warnings; `lighthouserc.js` already uses `upload.target = "filesystem"`, so these are tracked as non-blocking tooling noise unless CI logs become hard to read.

## Manual-only Timing Rule

Manual-only 항목은 모두 같은 무게가 아니다. 기준은 아래처럼 나누는 것이 좋다.

1. 베타 초대 전 필수: 실제 사용자 로그인, 실제 모바일 기기, 베타에서 보이는 외부 연동.
2. 기능 노출 전 필수: YouTube import처럼 외부 서비스가 핵심인 기능은 기능 플래그를 켜기 전에 live smoke를 먼저 한다.
3. 공개 출시 전 필수: wake-lock처럼 실제 브라우저 정책에 의존하는 기능, 더 넓은 기기/브라우저 조합.
4. 출시 후 개선 가능: 이미 fallback이 있고 자동 QA가 지키는 저위험 polish, 예를 들어 `<img>` 최적화 경고.

즉, manual-only는 "나중에 언젠가"가 아니라 "그 기능을 실제 사용자에게 열기 직전"에 해결하거나 검증해야 한다. 외부 서비스나 실기기 의존 때문에 지금 자동화할 수 없다면, 해당 기능을 숨기거나 beta scope에서 제외한 뒤 public launch 전 hardening 작업으로 옮긴다.

## QA Reliability Note

현재 QA는 회귀 방지에는 꽤 강하다. Layer 1 deterministic gate가 lint, typecheck, unit/product tests, build, Playwright smoke/a11y/visual/security, Lighthouse budget을 묶어서 깨진 계약을 빠르게 잡는다.

다만 QA가 사람의 품질 판단을 완전히 대체하지는 않는다. Layer 2 exploratory QA는 실제 사용 흐름의 불편함을 찾는 장치이고, Layer 3 eval은 QA 보고서가 제대로 작성됐는지 재검사하는 장치다. 그래서 베타 전에는 "자동 QA green + 핵심 manual-only 직접 확인"을 같이 봐야 품질검증 역할을 제대로 했다고 말할 수 있다.

## Recommended Next Order

1. 디자인 통일 브랜치가 들어오기 전까지 이 문서의 2026-05-05 baseline을 "pre-design known good"으로 보존한다.
2. 디자인 통일 작업이 merge되면 post-design release-candidate SHA에서 `pnpm verify` 또는 동등한 분해 실행, `pnpm verify:harness`를 다시 통과시킨다.
3. 새 실패가 있으면 이 baseline과 비교해 디자인 회귀인지, 기존 known flake인지, 환경성 이슈인지 분류한다. 새 P0/P1 회귀는 staging 배포 전 수정한다.
4. Post-design baseline이 green이면 staging에 최신 release-candidate SHA를 배포한다.
5. `BETA-QA-002` live OAuth smoke를 닫는다. 로컬에서는 credential 부재로 skipped였으므로 staging secret 또는 GitHub `Playwright Live OAuth` workflow가 필요하다.
6. `BETA-QA-003` real-device mobile smoke를 핵심 5개 흐름으로 닫는다: planner, shopping, cook, leftovers, manual recipe creation. YouTube import는 flag off 상태라면 실기기 베타 필수 흐름에서 제외한다.
7. YouTube import는 기본 flag off로 둔다. 노출이 필요하면 `HOMECOOK_ENABLE_YOUTUBE_IMPORT=1`을 켜기 전에 live YouTube smoke를 먼저 통과시킨다.
8. 베타 시작 후 발견 이슈를 이 문서의 표에 추가하고, P0/P1만 즉시 수정한다.
9. 베타 운영 루프는 `docs/workpacks/beta-operations-handoff-2026-05-04.md` 기준으로 돌린다: 매일 feedback triage, P0/P1 stop rule, P2/P3 backlog, public-launch graduation review를 기록한다.
