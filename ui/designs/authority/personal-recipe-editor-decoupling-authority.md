# personal-recipe-editor-decoupling Authority Review

> 대상 slice: `personal-recipe-editor-decoupling`
> 검토 단계: Stage 4/5 independent `final_authority_gate`
> 검토일: 2026-07-31
> 검토자: `product-design-authority`
> reviewed base head: `71182357526994e32548335cf55a52ed61cc54e3`
> reviewed state: 위 base head 위의 현재 미커밋 Stage 4 구현, 2026-07-31 02:00 재캡처 390px/320px PNG 20개, 2026-07-31 01:34 desktop visual snapshots
> canonical report: `ui/designs/authority/personal-recipe-editor-decoupling-authority.md`
>
> evidence:
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CLEANUP_ERROR-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CLEANUP_ERROR-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CONTEXTS-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CONTEXTS-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CONTROLS-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_CONTROLS-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_KEYBOARD_FOCUS-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_KEYBOARD_FOCUS-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_STATES-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_STATES-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_UPLOAD_ERROR-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_UPLOAD_ERROR-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_VALIDATION-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/EDITOR_VALIDATION-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/MYPAGE-no-edit-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/MYPAGE-no-edit-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/MYPAGE_RECIPEBOOK-no-edit-regression-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/MYPAGE_RECIPEBOOK-no-edit-regression-mobile-narrow.png` — 320×568 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/RECIPE_DETAIL-mobile-default.png` — 390×844 CSS viewport
> - `ui/designs/evidence/personal-recipe-editor-decoupling/RECIPE_DETAIL-mobile-narrow.png` — 320×568 CSS viewport
> - `tests/e2e/qa-visual.spec.ts-snapshots/qa-manual-recipe-create-desktop-chrome-darwin.png` — 1280px desktop editor
> - `tests/e2e/qa-visual.spec.ts-snapshots/qa-youtube-import-review-desktop-chrome-darwin.png` — 1280px shared tag/editor-control regression snapshot

## Verdict

- verdict: `pass`
- authority mapping: `pass`
- P0_count: `0`
- P1_count: `0`
- P2_count: `0`
- blocker_count: `0`
- major_count: `0`
- minor_count: `0`
- confirmed_allowed: `true`
- reviewed_screen_ids: `["RECIPE_DETAIL", "MANUAL_RECIPE_CREATE", "PERSONAL_RECIPE_EDITOR", "MYPAGE", "RECIPEBOOK_DETAIL"]`
- accepted_rebuttal_ids: `[]`
- 한 줄 요약: 44px·가로 fit·`AppBar → shared feedback → single inner scroll`·오류 focus·dark-ship 경계가 최신 390px/320px 캡처와 desktop visual snapshots에서 확인되어 Stage 4 `confirmed`를 허용한다.

## Scope Clarification

- `RECIPE_DETAIL`의 personal CTA 비노출은 결함이 아니다. 이 slice는 #6 write와 #8 activation을 소유하지 않고 `capabilityEnabled={false}`로 dark ship하므로, reachable 화면에서 기존 `[플래너에 추가] [요리하기]`만 보이는 것이 공식 범위와 일치한다.
- capability-on public fork와 owner edit/delete는 component test의 상태 matrix에서 secondary/destructive hierarchy와 fail-closed 동작을 잠근다. 실제 사용자 활성 화면은 #8 이후 activation authority가 다시 검토한다.
- `personal-create`는 예약된 context이며 MYPAGE/RECIPEBOOK에 새 진입 CTA를 추가하지 않는다. 이번 증거는 두 기존 화면이 no-edit 상태를 유지하고 item navigation 경계를 보존하는지만 검증한다.
- `AppBar → shared feedback → single inner scroll`은 모바일 full-page editor 계약이다. desktop은 기존 web top navigation, 중앙 max-width form, document scroll을 유지하며 모바일 앱 shell을 억지로 복제하지 않는다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 390/320에서 whole-page 가로 overflow가 없고 document 세로 overflow도 0이다. 앱바·공유 피드백 다음의 editor body 한 곳만 스크롤한다. |
| Interaction Clarity | 5/5 | cleanup 오류가 앱바 바로 아래 shared feedback 영역에 한 번 나타나고 44px 재시도 action과 single inner scroll이 순서대로 이어진다. |
| Visual Hierarchy | 5/5 | RECIPE_DETAIL primary 2-button row를 보존하고 editor의 저장·오류·destructive action을 분리한다. |
| Color / Material Fit | 5/5 | app brand blue, surface, danger 상태가 기존 Wave1 모바일 토큰과 일관된다. |
| Familiar App Pattern Fit | 5/5 | 모바일은 고정 앱바와 한 개의 편집 스크롤 영역, desktop은 top-nav와 중앙 form이라는 각 플랫폼의 익숙한 패턴을 보존한다. |

## Previous Blocker Resolution

| ID | 이전 문제 | 최신 확인 | 판정 |
| --- | --- | --- | --- |
| B-01 | ingredient unit/delete, cooking method, step add, mobile ingredient add, image action, tag control이 44px 미만 | 공용 editor와 tag editor가 `h-11`, `w-11`, `min-h-11`, `min-w-11`로 정리됐다. Playwright가 390/320에서 인분 ±, 모든 재료 단위, 재료 삭제, `손질/끓이기/볶기`, `+ 만들기 추가`의 실제 `boundingBox()` 너비·높이를 각각 `>=44`로 확인한다. locked Vitest는 image/tag/mobile-add의 작은 class 회귀도 차단한다. | 해소 |
| B-02 | validation/error/cleanup/focus/MYPAGE 시각 증거 누락 | 기존 8개 외에 `EDITOR_VALIDATION`, `EDITOR_CONTROLS`, `EDITOR_UPLOAD_ERROR`, `EDITOR_CLEANUP_ERROR`, `EDITOR_KEYBOARD_FOCUS`, `MYPAGE-no-edit`의 390/320 PNG 12개가 추가됐다. 실제 캡처에서 오류 문구·retry action·재료/단계 조작·focused textarea·MYPAGE no-edit가 잘림 없이 확인된다. | 해소 |
| B-03 | cleanup alert가 `h-screen` editor 바깥에 있어 app bar보다 먼저 보이고 page/editor 이중 세로 스크롤이 생김 | mobile consumer가 shared feedback을 직접 배치한다. 최신 390/320 PNG와 DOM 순서는 `AppBar → manual-editor-feedback-region → manual-editor-scroll-region`이며, document scroll delta 0 증거로 single inner scroll owner를 잠근다. | 해소 |

## Evidence Review

| Evidence pair | 실제 확인 범위 | 결과 |
| --- | --- | --- |
| `RECIPE_DETAIL-mobile-default/narrow` | capability-off anchor, primary CTA 2개, 390/320 fit | 통과 — personal CTA 비노출이 dark ship과 일치하고 기존 primary hierarchy가 유지된다. |
| `EDITOR_CONTEXTS-mobile-default/narrow` | planner-add context, dirty dialog, focus·action order | 통과 — dialog가 viewport 안에 들어오고 `계속 편집`이 초기 focus다. |
| `EDITOR_STATES-mobile-default/narrow` | managed image success preview, replace/remove | 통과 — 이미지 identity 상태와 조작 action이 읽히며 bottom navigation에 가리지 않는다. |
| `EDITOR_VALIDATION-mobile-default/narrow` | ingredient/step validation, empty add action | 통과 — 오류 copy와 복구 action이 인접하고 320px에서 줄바꿈·충돌이 없다. |
| `EDITOR_CONTROLS-mobile-default/narrow` | ingredient amount/unit/delete, add ingredient, step method controls | 통과 — 실제 브라우저 geometry `>=44px`, 320px row collision과 page-level overflow가 없다. |
| `EDITOR_UPLOAD_ERROR-mobile-default/narrow` | upload limited 오류, retry/remove, 오류 focus | 통과 — 최신 브랜드 preview와 오류·복구 선택이 같은 viewport에 명확히 보이고 CTA가 잘리지 않는다. 오류 alert focus는 locked component test에서 별도로 확인되며 screenshot만으로 focus를 과장하지 않는다. |
| `EDITOR_CLEANUP_ERROR-mobile-default/narrow` | owner cancel 실패, retry/remove, feedback order, vertical containment | 통과 — 알림은 앱바와 inner scroll 사이 shared feedback 영역에 정확히 1개 렌더링되고, 44px retry가 인접한다. document scroll delta는 두 viewport 모두 0이다. |
| `EDITOR_KEYBOARD_FOCUS-mobile-default/narrow` | focused step textarea, scroll padding, top save/bottom navigation 관계 | 통과 — focused textarea가 fixed navigation에 가리지 않고 화면 안에 유지된다. |
| `MYPAGE-no-edit-mobile-default/narrow` | MYPAGE 자체 no-edit, saved recipe item | 통과 — 새 personal edit CTA 없이 기존 library surface가 유지된다. |
| `MYPAGE_RECIPEBOOK-no-edit-regression-mobile-default/narrow` | RECIPEBOOK_DETAIL no-edit, existing item/action layout | 통과 — edit/fork CTA가 추가되지 않았고 기존 detail/cook navigation 경계가 유지된다. |
| `qa-manual-recipe-create-desktop-chrome-darwin.png` | 1280px desktop editor, web top-nav, max-width form, field/action fit | 통과 — desktop은 모바일 app shell을 복제하지 않고 기존 web form hierarchy와 page scroll을 유지하며 좌우 잘림이 없다. |
| `qa-youtube-import-review-desktop-chrome-darwin.png` | 1280px shared tag/editor-control consumer regression | 통과 — shared tag control의 44px 보정이 YouTube review의 기존 단계·재료·만들기 위계를 깨지 않고 좌우 잘림 없이 유지된다. YT import redesign 승인을 의미하지 않는다. |

### Evidence checksums

| Path | SHA-256 |
| --- | --- |
| `EDITOR_CLEANUP_ERROR-mobile-default.png` | `bcd27809b94327992cba09bed94412231440a4ba016d5042a6831ae1f38a915e` |
| `EDITOR_CLEANUP_ERROR-mobile-narrow.png` | `d87888f015302f5f0de8c021a2bc4ec9c9c03a9eafdfa99c18772fdc5a247913` |
| `EDITOR_CONTEXTS-mobile-default.png` | `9f462e6c63dd0d3d3a4deb641b8b467ff52b92cab7a78ad0e5fa9015f0e201af` |
| `EDITOR_CONTEXTS-mobile-narrow.png` | `5390492c129dac6a3c1c5be0f45c2dd797916fdbf997e164ef7d3780090e7623` |
| `EDITOR_CONTROLS-mobile-default.png` | `051c9762b0111c7c8e28e56134704c40cf5bed5a8aed288827fb167fe2c5bc05` |
| `EDITOR_CONTROLS-mobile-narrow.png` | `a1a258f81a671e880893ccc13ab5e07746e39e0ac56872a435eaa0058fc2b2b5` |
| `EDITOR_KEYBOARD_FOCUS-mobile-default.png` | `564e499e49a6f9f63f6dd47eedb186435f5457450bb4f668e681639699366003` |
| `EDITOR_KEYBOARD_FOCUS-mobile-narrow.png` | `49a4745a6e529b3b848ac2b3dee4d1b2128438a9a6f829419c5470bb1760e274` |
| `EDITOR_STATES-mobile-default.png` | `dc3271f6704b0fc5ce853be677e49aae6b7aedd1b92d1268438c7087348fbd21` |
| `EDITOR_STATES-mobile-narrow.png` | `5836c48925045c48b5b5fbd550281da0cde0a55c3ed8b7aeb7edddbb64e29e49` |
| `EDITOR_UPLOAD_ERROR-mobile-default.png` | `be8567df598cab7c15565b622e76848329780625c3d21003048821ac4fb1d42f` |
| `EDITOR_UPLOAD_ERROR-mobile-narrow.png` | `81f8b9c77791c409bad6ed75aa9854f697e7d7bbcfeb195217aa82b64d09b241` |
| `EDITOR_VALIDATION-mobile-default.png` | `b04c3aa40486de5859b0c1bc487faff18aa700844466d068f51176d801dda11d` |
| `EDITOR_VALIDATION-mobile-narrow.png` | `efc400858535d9332c2a6dd41e1abe60efbf5bd04803a53a9d17d820d3935eb7` |
| `MYPAGE-no-edit-mobile-default.png` | `05fcc130943a9bfccd9a1b2691252b24c88449a35291878c150b85a8dedb3815` |
| `MYPAGE-no-edit-mobile-narrow.png` | `891d0c78d418e0c2df11a2d99f5b8a6a2b2ad46a8f3a0ad7754a8fc26e64659e` |
| `MYPAGE_RECIPEBOOK-no-edit-regression-mobile-default.png` | `4896ffdfd8e7ff7660afee0c18990b4ba786c47c1eed5ed2e201cd34d1ac8306` |
| `MYPAGE_RECIPEBOOK-no-edit-regression-mobile-narrow.png` | `85e7cd3b12ee01b46620ef574c7ec55c8fe726a4b3592be2f314348910882781` |
| `RECIPE_DETAIL-mobile-default.png` | `92fd6d7e94bd2445116c37aa6f64ad9bb92600567f161646e39a81409fcc175f` |
| `RECIPE_DETAIL-mobile-narrow.png` | `7f72323676d05e887e27b060daec692a65da2d8bf8ba9e2dbd43b2824a32c595` |
| `qa-manual-recipe-create-desktop-chrome-darwin.png` | `eff80feab029fabddc95568d2ae45c70e7b577ca78f048a25e9290b6ec12d878` |
| `qa-youtube-import-review-desktop-chrome-darwin.png` | `212f3902b6e33e9dc511a16cd4486afc207e10ee661682f14735c0e0914af00c` |

## 확인한 파일

- 기준: `docs/engineering/product-design-authority.md`, `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`
- slice 계약: `docs/workpacks/personal-recipe-editor-decoupling/README.md`, `docs/workpacks/personal-recipe-editor-decoupling/acceptance.md`
- 선행 크리틱: `ui/designs/critiques/personal-recipe-editor-decoupling-design-critic.md`
- 구현 구조 보조 확인: `components/recipe/manual-recipe-create-screen.tsx`, `components/recipe/personal-recipe-editor-shell.tsx`, `tests/e2e/slice-personal-recipe-editor-decoupling.spec.ts`, `playwright.config.ts`
- 실제 캡처: `ui/designs/evidence/personal-recipe-editor-decoupling/`의 2026-07-31 02:00 최신 PNG 20개 전부와 위 2026-07-31 01:34 desktop visual snapshot 2개

## P0 / Blockers

| Finding ID | 위치 | 문제 | 왜 blocker인가 | 수정 방향 |
|---|------|------|----------------|----------|
| - | - | 열린 B-xx finding 없음 | - | - |

## P1 / Major Issues

| Finding ID | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| - | - | 없음 | - |

## P2 / Minor Issues

| Finding ID | 위치 | 문제 | 제안 |
|---|------|------|------|
| - | - | 없음 | - |

## Confirmed Strengths

- `RECIPE_DETAIL` 390/320은 whole-page horizontal scroll 없이 기존 anchor의 `[플래너에 추가] [요리하기]` primary hierarchy를 보존한다.
- dirty dialog는 두 viewport 안에 안정적으로 들어오며 `role="dialog"`, `aria-modal`, initial focus, Tab loop, Escape close와 trigger focus restore가 component/E2E로 확인된다.
- validation은 오류를 해당 section과 복구 action 가까이에 두어 사용자가 다음 행동을 바로 이해할 수 있다.
- 이미지 오류는 해당 이미지 alert로, 재시도 가능한 저장 오류는 inner scroll 바깥 shared feedback summary로 focus를 옮긴다. screenshot은 시각 상태만 증명하고 실제 focus 이동은 locked component test가 증명한다.
- managed upload 성공, upload 제한, owner cleanup 실패가 서로 다른 시각 상태로 분리되고 실패 상태마다 retry/remove가 제공된다.
- 재료 amount/unit/delete와 단계 method/add가 좁은 폭에서도 한 section 안에서 읽히며 실제 44px hit area를 유지한다.
- focus된 step textarea는 320px에서도 bottom navigation 위에 완전히 보이며 `scroll-pb-[96px]`과 editor body의 독립 scroll containment가 작동한다.
- MYPAGE와 RECIPEBOOK_DETAIL에 edit CTA를 추가하지 않았고 기존 library/detail mental model을 바꾸지 않았다.
- 최신 cleanup 실패 캡처에서 같은 오류 문구와 재시도 액션은 정확히 한 번만 렌더링되며, 390/320에서 `AppBar → shared feedback → single inner scroll` 순서로 안정적으로 놓인다.
- cleanup 실패에서도 document는 viewport 높이에 고정되고 `manual-editor-scroll-region`만 세로 스크롤하므로 상태 변화가 page-level scroll owner를 새로 만들지 않는다.
- 1280px desktop editor는 기존 web top-nav, 중앙 max-width form, 하단 저장 위계를 유지하며 모바일 전용 고정 app bar/bottom navigation을 잘못 노출하지 않는다. shared tag/editor-control의 44px 보정도 YouTube review desktop consumer의 기존 정보 구조를 깨지 않는다.

## 검토한 기존 자동화 증거

이번 독립 authority 재심사는 요청된 읽기 전용 경계를 지켜 Playwright를 재실행하지 않았다. 아래 결과는 최신 캡처를 생성한 기존 Stage 4 기록이며, authority는 2026-07-31 02:00 PNG 20개와 01:34 desktop visual snapshot 2개를 직접 열어 별도로 판정했다. 02:00 PNG의 SHA-256은 위 checksum 표와 모두 일치해 최신 재캡처가 기존 승인 이미지와 바이트 단위로 동일함을 확인했다.

- `pnpm exec vitest run tests/personal-recipe-editor-shell.test.tsx tests/personal-recipe-editor-navigation.test.tsx tests/personal-recipe-editor-dirty-state.test.tsx tests/personal-recipe-editor-media-tags.test.tsx tests/recipe-detail-personal-actions.test.tsx tests/manual-recipe-create-screen.test.tsx`
  - 결과: `6 files / 69 tests passed`
- `pnpm exec playwright test tests/e2e/slice-personal-recipe-editor-decoupling.spec.ts --project=mobile-chrome --project=mobile-ios-small`
  - 결과: `12 passed`
  - geometry: 인분 ±, ingredient units/delete, cooking method chips, step add를 390/320에서 실제 `boundingBox()`로 `>=44×44px` 검증
  - layout: RECIPE_DETAIL, editor error/focus/control, RECIPEBOOK_DETAIL에서 whole-page horizontal overflow `0`
  - cleanup containment: cleanup failure에서 두 viewport 모두 `document.documentElement.scrollHeight - clientHeight === 0`; 최신 PNG는 앱바 아래 inner scroll 첫 상태와 단일 alert/retry를 확인한다.
- `node scripts/validate-automation-spec.mjs --slice personal-recipe-editor-decoupling`
  - 결과: 통과
- `pnpm validate:workpack -- --slice personal-recipe-editor-decoupling`
  - 결과: 통과
- `pnpm validate:authority-evidence-presence -- --slice personal-recipe-editor-decoupling`
  - 결과: 통과
- `git diff --check`
  - 결과: 통과

## Remaining Manual Only

- 실기기 키보드/IME: headless Playwright는 실제 iOS/Android 소프트웨어 키보드와 한글 IME 조합 입력을 표시하지 못한다. 자동화 증거는 focused textarea가 scroll viewport와 bottom navigation에 가리지 않는 상태, 320px scroll padding, focus 유지까지 검증했다. 실제 키보드의 resize/pan 방식과 한글 조합 입력 중 viewport 이동은 물리 기기 Manual Only로 남긴다.
- dynamic type/zoom, screen reader의 실제 발표 순서와 물리 기기 gesture-back 조합도 Manual Only다. DOM role/label, dialog focus trap/restore와 browser history back guard는 자동화 범위이며 Manual Only로 중복 분류하지 않는다.
- 이 Manual Only 경계는 Stage 4 screenshot closeout blocker가 아니다. 현재 계약이 요구하는 headless focus/scroll·320px collision 증거는 존재하고 통과했으며, 운영자가 물리 키보드 성공을 거짓으로 주장하지 않는다.
- live remote Auth 로그인 return-to-action, 실제 local private Storage upload/cancel과 실제 네트워크 단절 복구는 fixture authority가 아닌 Manual Only다. mocked server error/retry와 capability-off UI 자체는 자동화·screenshot 범위다.
- #6 personal write/RLS/RPC와 #8 capability/snapshot-v2 공동 activation 뒤의 public-fork, personal-edit, delete 실제 사용자 흐름은 후속 activation authority가 다시 검토한다.
- production/staging write와 실제 사용자 데이터 변경은 수행하지 않았다.

## Decision

- Stage 4 진행 가능 여부: `가능`
- Stage 4 closeout 가능 여부: `가능`
- Stage 5 confirmed 가능 여부: `가능`
- Design Status: authority 기준 `confirmed` 허용
- 다음 행동: 이 dark-ship surface의 Stage 4/5를 진행한다. #8 capability activation 뒤 public-fork/personal-edit/delete reachable 화면은 별도 activation authority에서 다시 검토한다.
