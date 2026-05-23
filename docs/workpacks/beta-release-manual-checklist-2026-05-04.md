# Beta Release Manual Checklist: 2026-05-04

이 문서는 자동화만으로 닫을 수 없는 베타 후보 P1/P2/P3 항목을 실제 배포 환경에서 확인하기 위한 체크리스트다.

Last updated: 2026-05-24

## Usage

- 실행 시점: staging 또는 beta candidate가 HTTPS로 배포된 뒤.
- 실행자: 배포 환경 접근 권한이 있는 사람.
- 기록 위치: `docs/workpacks/beta-candidate-qa-issues-2026-05-04.md`의 해당 이슈 행 또는 별도 QA 리포트.
- 공통 증거: 날짜, 배포 SHA, 기기, OS, 브라우저, 테스트 계정, 스크린샷 또는 짧은 화면 녹화.
- 전제: 디자인 통일 이후 release-candidate SHA에서 regression baseline이 green이어야 한다. 이 체크리스트는 자동 회귀 검증을 대신하지 않고, 배포/실기기/외부 서비스 의존 항목만 닫는다.

## CR-004 Release Candidate Tracking

`docs/mvp-contract-risk-ledger.md`의 `CR-004 MANUAL_ONLY_RELEASE_CHECK`는 아래 표를 단일 실행표로 사용한다. 이 표는 "구현이 없다"는 뜻이 아니라, 자동화만으로 닫을 수 없는 release candidate 확인 항목에 owner/date/status/evidence를 붙이기 위한 운영 표다.

Status vocabulary:
- `todo`: 아직 실행하지 않음.
- `blocked`: 계정, secret, staging deploy, 실제 기기, safe data 같은 외부 조건이 필요함.
- `passed`: 같은 release-candidate SHA에서 통과 증거를 남김.
- `failed`: 실제 결함이 발견되어 별도 버그/PR로 분리해야 함.
- `stale-candidate`: 오래된 acceptance 항목이라 삭제 또는 정리 후보임.
- `deferred`: MVP 1차 이후로 명시적으로 미룸.

| Track | Maps to | Owner | Target date | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| RC-MO-01 live OAuth / return-to-action | BETA-QA-002, auth/logout, recipe like/save, meals, pantry, cooking, leftovers, mypage/settings | A | 2026-05-23 | passed | See `RC-MO-01 Evidence - live OAuth passed on staging` | 실제 provider redirect와 원래 action 복귀, logout/re-login stale session check, GitHub Playwright Live OAuth run을 같은 SHA에서 확인했다. |
| RC-MO-02 real-device mobile / visual | BETA-QA-003, BETA-QA-006, BETA-QA-008, shopping complete popup, cook mode, leftovers, cooking method color | A | 2026-05-24 | passed | See `RC-MO-02 Evidence - real-device mobile smoke passed` | 실제 모바일에서 핵심 흐름이 막히지 않았고, CTA/button/loading/server error blocker가 없었다. |
| RC-MO-03 live YouTube API | BETA-QA-004, BETA-QA-005, `POST /api/v1/recipes/youtube/*` | A+B | 2026-05-24 | passed | See `RC-MO-03 Evidence - live YouTube import passed on staging` | YouTube import flag/env를 켠 뒤 staging에서 실제 URL 등록까지 통과했다. 조리방법이 모두 `절이기`로 잡히는 품질 개선은 후속 작업으로 남긴다. |
| RC-MO-04 Supabase seed / existing data compatibility | ingredients, pantry bundles, planner columns, shopping, recipe books, system book bootstrap | A+B | 2026-05-24 | passed | See `RC-MO-04 Evidence - staging data compatibility passed` | staging schema/seed baseline과 planner/shopping/pantry/cooking/leftovers 데이터 호환 smoke가 통과했다. |
| RC-MO-05 stale Manual Only cleanup | recipe save, shopping 10a/10b/11 placeholder manual items, old acceptance notes | B | 2026-05-24 | passed | See `RC-MO-05 Evidence - Manual Only classified` | 흩어진 Manual Only를 중앙 분류했다. 진짜 남은 release-gate, deferred backlog, stale placeholder가 분리되었다. |

Evidence record template:

```md
### <Track ID> Evidence

- Date:
- Release-candidate SHA:
- Environment:
- Owner:
- Device / OS / browser:
- Test account:
- Result: todo | blocked | passed | failed | stale-candidate | deferred
- Evidence:
- Follow-up issue or PR:
- Notes:
```

### RC-MO-01 Evidence - live OAuth passed on staging

- Date: 2026-05-23 KST
- Release-candidate SHA: `de150d3df382ab26c30577e3ae9903b100700083`
- Environment: `https://homecook-flame.vercel.app` / Supabase staging `https://geenkqiawwsvjrctvqhx.supabase.co`
- Owner: A
- Device / OS / browser: manual browser check on staging, plus GitHub Actions `ubuntu-latest` Chromium
- Test account: Google OAuth staging test account
- Result: passed
- Evidence:
  - User confirmed `https://homecook-flame.vercel.app/recipe/550e8400-e29b-41d4-a716-446655440022` and `https://homecook-flame.vercel.app/planner` load on staging.
  - User confirmed Google login works on staging.
  - Manual return-to-action flow passed: logout state -> protected action -> Google OAuth -> app callback -> original action/original flow continues.
  - Manual stale session check passed: logout -> protected page requires login -> same Google account re-login -> `/planner` and `/mypage` load normally.
  - No stale-session symptoms observed: no infinite login loop, no lingering previous session, no 401-only state, no server error screen after re-login.
  - GitHub `Playwright Live OAuth` workflow passed for the same SHA: `https://github.com/netsus/homecook/actions/runs/26335564797/workflow`.
  - Workflow metadata: `workflow_dispatch`, branch `master`, head SHA `de150d3df382ab26c30577e3ae9903b100700083`, status `completed`, conclusion `success`, created `2026-05-23T14:42:35Z`, updated `2026-05-23T14:43:31Z`.
  - Staging API smoke: `GET https://homecook-flame.vercel.app/api/v1/recipes/550e8400-e29b-41d4-a716-446655440022` returned HTTP 200.
- Follow-up issue or PR: N/A
- Notes: RC-MO-01 is closed for this release-candidate SHA. This does not close the other CR-004 tracks.

### RC-MO-04 Evidence - staging data compatibility passed

- Date: 2026-05-24 KST
- Release-candidate SHA: `de150d3df382ab26c30577e3ae9903b100700083`
- Environment: `https://homecook-flame.vercel.app` / Supabase staging `https://geenkqiawwsvjrctvqhx.supabase.co`
- Owner: A+B
- Device / OS / browser: staging browser/manual smoke
- Test account: Google OAuth staging test account
- Result: passed
- Evidence:
  - Supabase project linked: `geenkqiawwsvjrctvqhx`.
  - Remote migration list matches local migrations through `20260522102000_22_youtube_ingredient_registration_rpc.sql`.
  - Staging DB seed baseline added with `pnpm qa:seed:01-05`.
  - User confirmed Supabase Dashboard Table Editor shows the migrated tables.
  - Staging API smoke passed: recipe detail endpoint returned HTTP 200 for seeded recipe `550e8400-e29b-41d4-a716-446655440022`.
  - Actual Google account baseline prepared: planner columns 4, meals 3, recipe books 4, recipe book items 2, liked recipes 1.
  - User confirmed planner seeded meals and recipe book data display correctly.
  - User confirmed pantry add/delete/refresh persistence flow works.
  - User confirmed shopping preview/list/detail/check/exclude/complete/read-only/history flow works.
  - User confirmed cooking mode entry/complete flow works.
  - User confirmed leftovers creation/eat/eaten-list flow works.
  - User confirmed logout/re-login data persistence and no server error, auth error, 404-only state, or infinite loading in these data flows.
- Follow-up issue or PR: N/A
- Notes: This closes the staging DB compatibility smoke for the current release-candidate SHA. Longer-running edge cases such as 30-day eaten-leftover auto-hide can remain future hardening unless included in the MVP RC scope.

### RC-MO-02 Evidence - real-device mobile smoke passed

- Date: 2026-05-24 KST
- Release-candidate SHA: `de150d3df382ab26c30577e3ae9903b100700083`
- Environment: `https://homecook-flame.vercel.app`
- Owner: A
- Device / OS / browser: user-confirmed real mobile device check; exact device / OS / browser not captured
- Test account: Google OAuth staging test account
- Result: passed
- Evidence:
  - User confirmed the recommended RC-MO-02 mobile smoke flows were tested and worked.
  - No blocking screen observed.
  - No unclickable button observed.
  - No bottom CTA/button overlap observed.
  - No server error screen observed.
  - No infinite loading observed.
  - YouTube import was excluded from RC-MO-02 pass criteria and recorded separately under RC-MO-03.
- Follow-up issue or PR: N/A
- Notes: If exact device evidence is required for RC closeout, add the tested device / OS / browser and screenshots before tagging the final release candidate.

### RC-MO-03 Evidence - live YouTube import passed on staging

- Date: 2026-05-24 KST
- Release-candidate SHA: `de150d3df382ab26c30577e3ae9903b100700083`
- Environment: `https://homecook-flame.vercel.app`
- Owner: A+B
- Device / OS / browser: staging browser/API smoke
- Test account: Google OAuth staging test account
- Result: passed
- Evidence:
  - Initial observation: before enabling YouTube import env, `/menu/add/youtube` and `POST /api/v1/recipes/youtube/validate` returned 404 / `FEATURE_DISABLED`.
  - After enabling the YouTube import env on Vercel, `GET https://homecook-flame.vercel.app/menu/add/youtube` returned HTTP 307 to `/login?next=%2Fmenu%2Fadd%2Fyoutube` for a guest, proving the page is enabled and auth-gated instead of 404.
  - After enabling the YouTube import env on Vercel, unauthenticated `POST https://homecook-flame.vercel.app/api/v1/recipes/youtube/validate` returned HTTP 401 `UNAUTHORIZED`, proving the API is enabled and auth-gated instead of feature-disabled.
  - User confirmed completing the YouTube import flow through recipe registration on staging.
  - Staging DB contains a registered YouTube recipe: `16308a7f-9e72-4e29-845b-cff00970c625`, title `살찔 걱정 절대 없는 초간단 오이 샌드위치`, `source_type='youtube'`, created at `2026-05-23T16:05:43.988738+00:00`.
  - Staging API smoke passed: `GET https://homecook-flame.vercel.app/api/v1/recipes/16308a7f-9e72-4e29-845b-cff00970c625` returned HTTP 200 with `source.youtube_video_id='MMSS6Rs7CQs'`.
- Follow-up issue or PR:
  - Improve cooking-method classification for imported YouTube recipes. The registered recipe loaded successfully, but all imported steps currently map to cooking method `절이기` / `auto_salt`.
- Notes: This closes the live YouTube import availability/register smoke for the current staging SHA. It does not close the separate YouTube extraction quality improvement.

## RC-MO-05: Stale Manual Only Cleanup

Purpose:
- 오래된 workpack acceptance의 `Manual Only` 항목 중 이미 RC-MO-01~04에서 확인된 항목, 후속 slice에서 자동화/구현으로 닫힌 항목, MVP 1차 이후로 미룰 항목을 분리한다.
- 제품 기능을 새로 테스트하는 트랙이 아니라 문서 부채를 정리하는 트랙이다.

Classification vocabulary:
- `already-covered`: RC-MO evidence 또는 후속 slice evidence로 이미 확인된 항목.
- `still-required`: public beta 전에 실제로 한 번 더 확인하거나, 기능을 숨기거나, 명시적으로 defer해야 하는 항목.
- `deferred`: MVP 1차 이후 hardening 또는 polish backlog로 옮긴 항목.
- `stale-candidate`: 오래된 placeholder이거나 후속 slice에서 의미가 사라진 항목.

Steps:
1. `docs/workpacks/*/acceptance.md`의 `### Manual Only` 아래 미체크 항목을 모은다.
2. 각 항목을 `already-covered`, `still-required`, `deferred`, `stale-candidate` 중 하나로 분류한다.
3. `already-covered`는 이 체크리스트의 RC-MO evidence 또는 후속 slice evidence 링크를 붙인다.
4. `still-required`는 실제로 release 전에 더 봐야 하는 항목만 남긴다.
5. `deferred`는 MVP 1차 이후 작업으로 명시하고 이유를 적는다.
6. `stale-candidate`는 오래된 placeholder이거나 후속 slice에서 의미가 사라진 항목으로 표시한다.
7. 같은 의미의 항목이 여러 workpack에 흩어져 있으면 이 RC 체크리스트 하나로 통합하고, 원래 항목에는 통합 위치를 남긴다.

Pass criteria:
- 남아 있는 `Manual Only` 항목이 전부 최신 release checklist, still-required release gate, deferred backlog, 또는 stale cleanup 후보 중 하나로 분류된다.
- `자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다` 같은 placeholder 문구가 실제 남은 위험처럼 보이지 않는다.
- release 전에 꼭 봐야 하는 항목과 MVP 이후로 미룰 항목이 섞이지 않는다.

### RC-MO-05 Evidence - Manual Only classified

- Date: 2026-05-24 KST
- Release-candidate SHA: `de150d3df382ab26c30577e3ae9903b100700083`
- Environment: docs classification over current repository workpacks
- Owner: B
- Result: passed
- Scan scope:
  - `docs/workpacks/*/acceptance.md`
  - 67 files contain `### Manual Only` sections.
  - 123 unchecked `Manual Only` bullet items were found.
- Evidence:
  - The unchecked items were grouped below by the actual release risk they represent.
  - RC-MO-01 through RC-MO-04 evidence covers the repeated live OAuth, mobile smoke, live YouTube registration smoke, and staging DB compatibility smoke items.
  - Remaining items are explicitly separated into `still-required`, `deferred`, and `stale-candidate`.
- Follow-up issue or PR:
  - Optional docs-governance cleanup can later replace old per-workpack placeholder bullets with links to this RC-MO-05 section.
- Notes:
  - This closes the classification task. It does not mean every deferred or still-required manual edge case has been executed.

| Group | Source workpacks | Classification | Decision / next action |
| --- | --- | --- | --- |
| Live OAuth / return-to-action | `06-recipe-to-planner`, `08a-meal-add-search-core`, `13-pantry-core`, `14-cook-session-start`, `15a-cook-planner-complete`, `15b-cook-standalone-complete`, `16-leftovers`, `17a-mypage-overview-history`, `17c-settings-account` | already-covered | RC-MO-01 confirmed staging Google OAuth, protected action return flow, logout/re-login stale-session check, and Playwright Live OAuth workflow. RC-MO-04 confirmed authenticated planner/shopping/pantry/cooking/leftovers data flows. |
| Staging DB / seed / existing-data compatibility | `07-meal-manage`, `08a-meal-add-search-core`, `08b-meal-add-books-pantry`, `09-shopping-preview-create`, `13-pantry-core`, `14-cook-session-start`, `15a-cook-planner-complete`, `15b-cook-standalone-complete`, `16-leftovers`, `17a-mypage-overview-history`, `17b-recipebook-detail-remove`, `planner-column-customization`, `wave1-port-account-library-leftovers`, `wave1-port-pantry` | already-covered for staging; production-only parts deferred | RC-MO-04 confirmed staging migrations, seed baseline, actual Google account data, planner meals, recipe books, pantry, shopping, cooking, leftovers, and logout/re-login persistence. Production-only compatibility remains a production cutover check, not a staging RC blocker. |
| Real-device mobile smoke | `06-recipe-to-planner`, `12b-shopping-pantry-reflect`, `15a-cook-planner-complete`, `15b-cook-standalone-complete`, `16-leftovers`, `17a-mypage-overview-history`, `17c-settings-account`, `18-manual-recipe-create`, `design-polish-*`, `mvp2-polish-*`, `wave1-port-*` | already-covered for blocking UX; visual polish deferred | RC-MO-02 confirmed no blocking screen, unclickable button, bottom CTA overlap, server error, or infinite loading on a real mobile device. Fine-grained visual/taste/animation checks stay in design polish backlog unless selected for the RC branch. |
| Recipe save / recipebook detail / remove | `04-recipe-save`, `17b-recipebook-detail-remove` | split: already-covered + still-required | Recipe detail save/like and recipe book visibility are covered by RC-MO-01/04. Actual recipebook remove/save removal should still be checked once on a safe test item before public beta if the remove action remains visible. |
| Shopping placeholder manual bullets | `10a-shopping-detail-interact`, `10b-shopping-share-text`, `11-shopping-reorder`, `_template` | stale-candidate | These are generic placeholder bullets, not concrete release risks. The concrete shopping risks are covered by RC-MO-02/04 and `12b-shopping-pantry-reflect`. |
| Shopping complete pantry reflect popup | `12b-shopping-pantry-reflect` | split: already-covered + deferred | Core complete/read-only/history flow is covered by RC-MO-04, and mobile blocker checks are covered by RC-MO-02. Keyboard/screen-reader/Esc/swipe/network-error edge cases are deferred hardening unless accessibility QA is pulled into the RC gate. |
| Cooking mode / leftovers | `14-cook-session-start`, `15a-cook-planner-complete`, `15b-cook-standalone-complete`, `16-leftovers`, `wave1-port-shopping-cooking` | mostly already-covered; one deferred edge | RC-MO-04 confirmed cooking mode entry/complete and leftovers creation/eat/eaten-list. The 30-day eaten-leftover auto-hide check is deferred because it needs time manipulation or a long-running test. |
| Settings / account destructive action | `17c-settings-account`, `wave1-port-account-library-leftovers` | still-required if visible | Settings access and normal manipulation are covered by RC-MO-01/02/04. Account deletion followed by same social rejoin is still a real pre-public-beta manual check if the delete-account action remains visible. Use a safe disposable test account. |
| Cooking method color / synonym quality | `18-manual-recipe-create`, `19-youtube-import`, `21-ingredient-dictionary` | deferred | Basic manual recipe creation is covered by RC-MO-02. Cooking-method visual polish, synonym matching quality, and the known YouTube all-`절이기` classification issue are product-quality follow-ups, not route-contract blockers. |
| Live YouTube import | `19-youtube-import`, `20-youtube-real-import`, `21-ingredient-dictionary`, `22-youtube-ingredient-registration`, `design-polish-slice5-manual-youtube` | already-covered for one live registration; quality/edge cases deferred | RC-MO-03 confirmed staging feature enablement, auth gating, one real YouTube recipe registration, DB persistence, and recipe detail API load. URL-shape matrix, quota exhaustion, classification accuracy, caption/ASR/LLM regression, and ingredient matching improvements remain deferred YouTube hardening. |
| Design / prototype / desktop taste approval | `baemin-*`, `design-polish-*`, `desktop-*`, `h5-*`, `h6-*`, `h7-*`, `h8-*`, `mvp2-*`, `wave1-derived-state-ui-prep` | deferred / outside CR-004 contract risk | These are subjective visual approval or future-direction checks. Keep them in the design backlog unless a specific screen is selected for the RC visual pass. They should not appear as unresolved API/route contract risk. |

## BETA-QA-002: Live OAuth Smoke

CR-004 track: `RC-MO-01 live OAuth / return-to-action`.

Prerequisites:
- HTTPS staging/beta URL.
- 실제 OAuth provider 설정이 staging/beta에 반영되어 있어야 한다.
- 테스트용 Google 계정 또는 GitHub `Playwright Live OAuth` secrets.
- 로그인 후 돌아갈 protected action URL 하나: 예를 들어 recipe detail 저장/좋아요 또는 planner 진입.

Steps:
1. 로그아웃 상태에서 protected action을 누른다.
2. Google 로그인으로 이동하는지 확인한다.
3. 테스트 계정으로 로그인한다.
4. 앱으로 돌아온 뒤 원래 action 또는 return-to-action 흐름이 이어지는지 확인한다.
5. 로그아웃 후 다시 로그인해 stale session 없이 정상 동작하는지 확인한다.
6. 가능하면 GitHub `Playwright Live OAuth` workflow를 같은 deploy SHA에 대해 실행한다.

Pass criteria:
- OAuth redirect가 실제 provider에서 성공한다.
- 앱 callback이 외부 URL로 새지 않고 안전한 내부 경로로 돌아온다.
- protected action의 return flow가 유지된다.
- 실패 시 사용자는 빈 화면이 아니라 로그인/오류 상태를 볼 수 있다.

## BETA-QA-003: Real-device Mobile Smoke

CR-004 track: `RC-MO-02 real-device mobile / visual`.

Prerequisites:
- HTTPS staging/beta URL.
- 최소 1개 실제 모바일 기기. 가능하면 iOS Safari와 Android Chrome을 각각 1회씩 확인한다.
- 인증된 테스트 계정.
- 테스트 계정에 planner, shopping, cook, leftovers, manual recipe creation을 실행할 수 있는 안전한 데이터.

Steps:
1. Planner: 주간 식단을 열고 날짜/끼니 이동, 식사 추가 진입, 돌아가기를 확인한다.
2. Shopping: 장보기 preview 생성, 상세 진입, 체크/제외/read-only 노출을 확인한다.
3. Cook: cooking ready에서 요리모드 진입, 재료/단계 탭 전환, 완료 전 취소를 확인한다.
4. Leftovers: 남은요리 목록, 다먹음 처리, 다먹음 목록 진입을 확인한다.
5. Manual recipe creation: 직접 레시피 등록 폼 입력, validation, 등록 후 상세 또는 meal add 흐름을 확인한다.
6. 각 흐름에서 화면 하단 CTA, keyboard, modal/sheet, browser back이 겹치거나 막히지 않는지 확인한다.

Pass criteria:
- 핵심 5개 흐름이 실제 터치/키보드/브라우저 chrome 환경에서 막히지 않는다.
- 화면 하단 CTA와 modal/sheet가 기기 safe area와 겹치지 않는다.
- 실패가 있으면 기기/OS/브라우저와 화면 녹화 또는 스크린샷을 남긴다.

## BETA-QA-004/BETA-QA-005: Live YouTube Smoke

CR-004 track: `RC-MO-03 live YouTube API`.

Run this only if YouTube import will be visible to beta users. If the feature remains hidden, record the feature-flag-off evidence instead.

Prerequisites:
- `HOMECOOK_ENABLE_YOUTUBE_IMPORT=1` or `NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1` is enabled on a staging/beta test deploy only.
- Real YouTube integration credentials, quota, and error handling are configured if live extraction is intentionally tested.
- Test URLs covering at least `watch`, `youtu.be`, `shorts`, and playlist watch URL shapes.
- One non-recipe YouTube URL and one unavailable/private/error URL if safe to use.

Steps:
1. Confirm `/menu/add/youtube` is hidden when the flag is off.
2. Turn the flag on in a staging/beta test deploy.
3. Submit a valid recipe video URL and complete validate -> extract -> review -> register.
4. Confirm the registered recipe appears in `my_added` and can enter planner add if context exists.
5. Submit each URL shape and confirm video id parsing/extraction behavior.
6. Submit non-recipe and unavailable/error URLs and confirm recoverable user-facing states.
7. Turn the flag back off unless YouTube import is intentionally included in beta scope.

Pass criteria:
- Flag-off deploy hides YouTube import and closes the API.
- Flag-on staging test proves live URL behavior for the planned beta scope.
- External API failures do not create partial or wrong-owner recipes.
- Quota/credential errors are visible as safe retry/error states, not silent success.

## BETA-QA-006: Web Share OS Sheet

CR-004 track: `RC-MO-02 real-device mobile / visual`.

Prerequisites:
- HTTPS staging/beta URL.
- 인증된 테스트 계정.
- 구매 대상 항목이 있는 장보기 상세 화면.
- iOS Safari와 Android Chrome 중 최소 하나, 가능하면 둘 다.

Steps:
1. 장보기 상세 화면으로 이동한다.
2. 공유 버튼을 누른다.
3. Web Share API를 지원하는 브라우저에서는 OS 공유 sheet가 열리는지 확인한다.
4. 공유 sheet에서 취소해도 앱이 깨지지 않는지 확인한다.
5. Web Share API를 지원하지 않는 브라우저에서는 clipboard fallback이 동작하는지 확인한다.

Pass criteria:
- 지원 브라우저에서 OS 공유 sheet가 열린다.
- 취소 후에도 장보기 상세 화면과 토스트 상태가 정상이다.
- 미지원 브라우저에서는 공유 텍스트가 clipboard로 복사된다.

## BETA-QA-007: 30-day Eaten Leftover Auto-hide

CR-004 track: `RC-MO-04 Supabase seed / existing data compatibility`.

Prerequisites:
- staging/beta DB에 테스트 계정 전용 남은요리 데이터가 있어야 한다.
- `eaten_at` 또는 `auto_hide_at`을 제어할 수 있는 안전한 테스트 데이터 생성 방법이 있어야 한다.
- 운영 사용자 데이터에는 직접 실험하지 않는다.

Steps:
1. 테스트 계정에 `eaten` 상태 남은요리 2개를 준비한다.
2. 하나는 `auto_hide_at`이 현재 시각보다 미래가 되게 만든다.
3. 다른 하나는 `auto_hide_at`이 현재 시각보다 과거가 되게 만든다.
4. `/leftovers/ate`를 새로고침한다.
5. 미래 항목은 보이고, 과거 항목은 숨겨지는지 확인한다.
6. 숨겨진 항목이 `/leftovers`의 먹는 중 목록으로 되돌아오지 않는지 확인한다.

Pass criteria:
- 30일이 지나지 않은 `eaten` 항목만 다먹음 목록에 보인다.
- 30일이 지난 `eaten` 항목은 다먹음 목록에서 숨겨진다.
- 테스트는 테스트 계정 데이터에만 영향을 준다.

## BETA-QA-008: Wake Lock Cooking Mode

CR-004 track: `RC-MO-02 real-device mobile / visual`.

Prerequisites:
- HTTPS staging/beta URL.
- 실제 모바일 기기.
- 인증된 테스트 계정.
- 요리모드로 진입할 수 있는 레시피 또는 플래너 식사.
- 기기의 자동 잠금 시간을 짧게 설정한다.

Steps:
1. 설정 화면에서 화면 꺼짐 방지를 켠다.
2. 요리모드로 진입한다.
3. 자동 잠금 시간보다 길게 화면을 터치하지 않고 둔다.
4. 화면이 유지되는지 확인한다.
5. 설정 화면에서 화면 꺼짐 방지를 끈 뒤 같은 조건으로 다시 확인한다.

Pass criteria:
- 설정이 켜진 상태에서는 지원 브라우저에서 요리모드 중 화면이 꺼지지 않는다.
- 설정이 꺼진 상태에서는 기기 기본 자동 잠금 정책을 따른다.
- 미지원 브라우저에서도 요리모드 진행 자체는 막히지 않는다.

## BETA-QA-010: Lighthouse Tooling Noise

Prerequisites:
- 로컬 또는 CI에서 `pnpm test:lighthouse`를 실행할 수 있어야 한다.
- `.lighthouseci/` 아티팩트를 확인할 수 있어야 한다.

Steps:
1. `pnpm test:lighthouse`를 실행한다.
2. performance assertion 결과가 green인지 확인한다.
3. `.lighthouseci/assertion-results.json`이 비어 있거나 실패 항목이 없는지 확인한다.
4. GitHub token, upload, Node `punycode` 같은 환경성 경고가 실제 실패와 섞여 보이는지 확인한다.

Pass criteria:
- Lighthouse assertion은 통과한다.
- 환경성 경고가 있어도 실패 원인을 가리지 않는다.
- 경고가 CI 리뷰를 방해할 정도로 커지면 별도 tooling cleanup 이슈로 승격한다.
