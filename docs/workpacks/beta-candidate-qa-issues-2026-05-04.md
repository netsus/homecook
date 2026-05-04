# Beta Candidate QA Issue List: 2026-05-04

이 문서는 `19-youtube-import` closeout 이후 베타 후보를 만들기 전에 확인해야 할 결함 후보와 manual-only 검증 항목을 한곳에 모은다.

## Evidence Snapshot

- Base: `master` after PR #327 merge (`2d12f2a`)
- Deterministic gate: `pnpm verify` passed on 2026-05-04
- Product tests: 58 files / 539 tests passed in the latest follow-up run
- Playwright: smoke 641 passed / 4 skipped, a11y 6 passed, visual 12 passed, security 9 passed
- Lighthouse assertions: passed with empty `.lighthouseci/assertion-results.json`
- Lighthouse performance: `/` 0.95, `/recipe/mock-kimchi-jjigae` 0.97-0.98 in the latest run
- Follow-up verification:
  - `pnpm test:product tests/youtube-import.backend.test.ts` passed after adding beta guard and URL-shape coverage
  - `pnpm test:e2e:oauth` ran but skipped 3 tests because live Google credentials are not present locally
  - `pnpm exec playwright test tests/e2e/slice-14-cook-session-start.spec.ts tests/e2e/slice-15a-cook-planner-complete.spec.ts tests/e2e/slice-15b-cook-standalone-complete.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17c-settings.spec.ts tests/e2e/slice-18-manual-recipe-create.spec.ts tests/e2e/slice-19-youtube-import.spec.ts --project=mobile-chrome --project=mobile-ios-small --grep-invert '@live-oauth'` passed, 138 tests

## Current Defect Triage

| ID | Priority | Status | Issue | Why it matters | Recommended timing |
| --- | --- | --- | --- | --- | --- |
| BETA-QA-001 | P0 | None found | Automated gate found no release-blocking defect. | A red deterministic gate would block beta immediately. Current evidence is green. | No action unless new QA evidence appears. |
| BETA-QA-002 | P1 | Blocked by external credentials | Live OAuth suite exists and was run locally, but all 3 projects skipped because `E2E_GOOGLE_EMAIL` / `E2E_GOOGLE_PASSWORD` are absent. | Login recovery is central to protected actions; fixture auth cannot prove external provider redirects. | Run `Playwright Live OAuth` workflow or staging smoke with real secrets before inviting beta users. |
| BETA-QA-003 | P1 | Partially mitigated | Mobile Playwright smoke passed for cooking, leftovers, settings, manual recipe creation, and YouTube import across `mobile-chrome` and `mobile-ios-small`. Real-device touch feel remains manual. | Playwright viewport checks catch layout regressions, but not physical touch feel, OS keyboard behavior, or browser chrome quirks. | Do one real-device pass after beta candidate deploy, before beta invite. |
| BETA-QA-004 | P1/P3 | Mitigated by opt-in guard | Real YouTube Data API / live video extraction is still out of scope and stub-backed. Production route/API are now closed unless `HOMECOOK_ENABLE_YOUTUBE_IMPORT=1` or `NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1`. | If YouTube import is visible as a beta feature, stub success does not prove real external extraction. | P3/backlog while the flag is off; P1 before enabling the flag for beta users. |
| BETA-QA-005 | P1/P2 | Partially automated | Parser coverage now includes `watch`, `youtu.be`, `shorts`, playlist watch URLs, and mobile watch URLs. Live external extraction remains manual if the feature flag is enabled. | Users paste real URLs in many shapes; deterministic parser tests reduce risk, but live YouTube behavior can still differ. | Run live YouTube smoke before enabling the feature flag; otherwise carry to public-launch hardening. |
| BETA-QA-006 | P2 | Open manual gate | Web Share OS sheet is manual-only on HTTPS real devices. | Clipboard fallback is tested, but OS share behavior depends on browser/device support. | Before public launch, or before beta if shopping share is a key beta scenario. |
| BETA-QA-007 | P2 | Open manual gate | 30-day `eaten` leftover auto-hide needs real time or controlled long-window verification. | Automated tests cover policy logic, but calendar/time behavior can drift in real environments. | Before public launch; can be moved earlier if leftovers becomes a beta success metric. |
| BETA-QA-008 | P2 | Open manual gate | Wake-lock UX and cooking-mode screen behavior need real mobile browser confirmation. | Screen wake lock is browser/device specific and important while cooking. | Before cooking-heavy beta sessions; otherwise before public launch. |
| BETA-QA-009 | P3 | Cleanup | `pnpm lint` currently passes with existing Next.js `<img>` warnings in several UI screens. | Not a functional failure, and Lighthouse is green, but image optimization debt can grow. | Cleanup sprint after beta candidate unless real performance evidence worsens. |
| BETA-QA-010 | P3 | Tooling noise | Local Lighthouse emits environment/tooling warnings such as missing GitHub token upload and Node `punycode` deprecation. | These are not app defects, but can hide signal if logs become noisy. | Tooling cleanup before public release or when CI noise starts slowing reviews. |

## Manual-only Timing Rule

Manual-only 항목은 모두 같은 무게가 아니다. 기준은 아래처럼 나누는 것이 좋다.

1. 베타 초대 전 필수: 실제 사용자 로그인, 실제 모바일 기기, 베타에서 보이는 외부 연동.
2. 기능 노출 전 필수: YouTube import처럼 외부 서비스가 핵심인 기능은 기능 플래그를 켜기 전에 live smoke를 먼저 한다.
3. 공개 출시 전 필수: Web Share OS sheet, 장기 시간 흐름, 더 넓은 기기/브라우저 조합.
4. 출시 후 개선 가능: 이미 fallback이 있고 자동 QA가 지키는 저위험 polish, 예를 들어 `<img>` 최적화 경고.

즉, manual-only는 "나중에 언젠가"가 아니라 "그 기능을 실제 사용자에게 열기 직전"에 해결하거나 검증해야 한다. 외부 서비스나 실기기 의존 때문에 지금 자동화할 수 없다면, 해당 기능을 숨기거나 beta scope에서 제외한 뒤 public launch 전 hardening 작업으로 옮긴다.

## QA Reliability Note

현재 QA는 회귀 방지에는 꽤 강하다. Layer 1 deterministic gate가 lint, typecheck, unit/product tests, build, Playwright smoke/a11y/visual/security, Lighthouse budget을 묶어서 깨진 계약을 빠르게 잡는다.

다만 QA가 사람의 품질 판단을 완전히 대체하지는 않는다. Layer 2 exploratory QA는 실제 사용 흐름의 불편함을 찾는 장치이고, Layer 3 eval은 QA 보고서가 제대로 작성됐는지 재검사하는 장치다. 그래서 베타 전에는 "자동 QA green + 핵심 manual-only 직접 확인"을 같이 봐야 품질검증 역할을 제대로 했다고 말할 수 있다.

## Recommended Next Order

1. Staging에 최신 `master`를 배포한다.
2. `BETA-QA-002` live OAuth smoke를 먼저 닫는다. 로컬에서는 credential 부재로 skipped였으므로 staging secret 또는 GitHub `Playwright Live OAuth` workflow가 필요하다.
3. `BETA-QA-003` real-device mobile smoke를 핵심 5개 흐름으로 닫는다: planner, shopping, cook, leftovers, manual recipe creation. YouTube import는 flag off 상태라면 실기기 베타 필수 흐름에서 제외한다.
4. YouTube import는 기본 flag off로 둔다. 노출이 필요하면 `HOMECOOK_ENABLE_YOUTUBE_IMPORT=1`을 켜기 전에 live YouTube smoke를 먼저 통과시킨다.
5. 베타 시작 후 발견 이슈를 이 문서의 표에 추가하고, P0/P1만 즉시 수정한다.
