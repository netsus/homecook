# Acceptance Checklist — marketing-demand-validation-v2

> v1 closeout은 `docs/workpacks/marketing-demand-validation/acceptance.md`에 보존한다. 아래 항목은 v2 구현 evidence 전에는 체크하지 않는다. Stage 1 author task `01a0630e-81f1-7f42-8b1b-cb259d1d5997`은 internal 1.5를 승인하지 않는다.

## Happy Path

- [ ] `ad_variant`/`utm_content`로 선택된 Hero에서 같은 Q1로 이동하고 q1..q4를 모두 완료한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [ ] `q1`, `q2`, `q3`, `q4`의 질문·선택지와 `1 / 4..4 / 4` progress가 exact spec과 일치하며 `q5`는 허용하지 않는다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
- [x] 결과가 Q3 하나로만 `homecook-passer | eyeballing-master | ingredient-tracker | pro-measurer` 중 하나가 된다 <!-- omo:id=accept-result-taxonomy;stage=2;scope=shared;review=3,6 -->
- [ ] 결과·공유·5단계 체험·두 planner payoff가 beta form 전에 공개된다 <!-- omo:id=accept-result-before-email;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`, error가 `{ code, message, fields[] }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 action/result/answer 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] `view → quiz_started → quiz_completed → result_viewed → experience_started → experience_completed → beta_form_viewed → lead_submitted`만 허용한다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] 동일 session/action replay는 first-write-wins generic success이고 skip/reverse는 `409 INVALID_TRANSITION`이다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] v1 cookie는 새 v2 row/cookie로 재시작하고 v1 row와 v2 action/result를 섞지 않는다 <!-- omo:id=accept-legacy-session-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] lead readiness가 닫혀도 result/experience/planner payoff는 read-only로 유지된다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] v2 `target_qualified`는 response/DB에서 null이며 Q1/Q2/Q4 hidden rule을 만들지 않는다 <!-- omo:id=accept-target-null;stage=2;scope=backend;review=3,6 -->
- [x] successor migration이 기존 CHECK를 creative_key별 v1/v2 조건부 CHECK로 교체한다 <!-- omo:id=accept-conditional-db-checks;stage=2;scope=backend;review=3,6 -->
- [x] v1 fixture는 기존 CHECK를 그대로 통과하고 row digest가 유지된다 <!-- omo:id=accept-v1-check-preservation;stage=2;scope=backend;review=3,6 -->
- [x] v2 fixture는 legacy field와 `target_qualified`가 모두 null이며 q1..q4/new result만 사용한다 <!-- omo:id=accept-v2-null-contract;stage=2;scope=backend;review=3,6 -->
- [x] v2 stage order와 exact `beta_form_viewed_at → lead_submitted_at`이 DB CHECK로 강제된다 <!-- omo:id=accept-v2-stage-db-order;stage=2;scope=backend;review=3,6 -->

## Exact Question / Result Contract

| Q3 value | result key | 결과명 |
| --- | --- | --- |
| `pass` | `homecook-passer` | 집밥 패스형 |
| `eyeball` | `eyeballing-master` | 눈대중 장인 |
| `track` | `ingredient-tracker` | 성분 추적러 |
| `measure` | `pro-measurer` | 프로 계량러 |

- [x] 같은 Q3에 Q1/Q2/Q4 조합을 바꿔도 result가 변하지 않는다 <!-- omo:id=accept-q3-only-result;stage=2;scope=backend;review=3,6 -->
- [x] old result key, unknown result, unknown answer key, `q5`, 누락 answer는 `422 VALIDATION_ERROR`다 <!-- omo:id=accept-old-contract-rejected;stage=2;scope=backend;review=3,6 -->

## Attribution

- [ ] exact mapping은 `hook_reentry → a`, `hook_cooked_weight → b`, `hook_calorie_quiz → c`, `hook_workaround → d`다 <!-- omo:id=accept-hero-priority;stage=4;scope=frontend;review=5,6 -->
- [x] 저장 `ad_variant`는 resolved Hero variant이며 recognized `utm_content`가 `ad_variant`와 충돌하면 `utm_content`가 우선한다 <!-- omo:id=accept-ad-variant;stage=2;scope=backend;review=3,6 -->
- [x] unknown URL variant와 direct visit은 `default`이고 unknown `utm_content`는 valid candidate로 fall through한다 <!-- omo:id=accept-attribution-unknown;stage=2;scope=shared;review=3,6 -->
- [x] API enum 밖 `ad_variant`는 `422`이고 개발용 `variant`는 public request field가 아니다 <!-- omo:id=accept-attribution-validation;stage=2;scope=shared;review=3,6 -->

## Lead / PII / Consent

- [x] anonymous action은 email/consent/Turnstile field를 거부하고 PII column을 쓰지 않는다 <!-- omo:id=accept-anonymous-pii-boundary;stage=2;scope=backend;review=3,6 -->
- [x] `lead_submitted`만 normalized email, `consent_version=marketing-demand-validation-v2`, server `consented_at`, verified timestamp를 쓴다 <!-- omo:id=accept-consent-evidence;stage=2;scope=backend;review=3,6 -->
- [x] same-session lead replay는 Turnstile을 다시 요구하지 않고 accepted/duplicate는 같은 generic success다 <!-- omo:id=accept-duplicate-generic-success;stage=2;scope=backend;review=3,6 -->
- [x] duplicate row는 email을 저장하지 않고 accepted row만 normalized email을 보관한다 <!-- omo:id=accept-duplicate-email-redaction;stage=2;scope=backend;review=3,6 -->
- [x] email/Turnstile token/raw IP/user-agent/full referrer/cookie fingerprint가 URL, response, anonymous event, console/server log에 없다 <!-- omo:id=accept-pii-redaction;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] stale/missing session을 새 Hero로 복구하는 empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] validation/Turnstile/readiness/server error 상태가 결과·체험을 지우지 않는다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized는 N/A다. public no-login funnel이고 browser DB access는 없다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] `403 ORIGIN_NOT_ALLOWED`, `409 INVALID_TRANSITION`, `422 VALIDATION_ERROR|TURNSTILE_FAILED`, `503 LEAD_CAPTURE_NOT_READY|LEAD_CAPTURE_UNAVAILABLE` recovery가 있다 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 return-to-action 대신 session restart/retry가 동작한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 기존 `public.marketing_validation_sessions` 한 table과 기존 POST 한 endpoint만 사용한다 <!-- omo:id=accept-single-table-route;stage=2;scope=backend;review=3,6 -->
- [x] RLS forced, anon/authenticated direct access 0, exact full-local internal scope를 유지한다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] v2 nullable columns와 result constraint가 historical v1 row를 보존한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] q3→result, `creative_key=mumeok_funnel_prototype_v2`, server timestamp와 attribution projection이 정확하다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Frontend Port / Accessibility

- [ ] `src/Prototype.tsx`, `src/prototype.css`, `public/assets/funnel/`의 app-owned surface만 포팅한다 <!-- omo:id=accept-app-owned-port;stage=4;scope=frontend;review=5,6 -->
- [ ] iPhone/Pixel frame, device selector, `src/mobile/`, standalone keyboard/status/runtime을 운영 bundle에 넣지 않는다 <!-- omo:id=accept-runtime-excluded;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px 이상 폭, safe-area, 44×44px touch, visible focus, semantic label/heading/progress/live message를 만족한다 <!-- omo:id=accept-accessibility;stage=4;scope=frontend;review=5,6 -->
- [ ] `prefers-reduced-motion`에서 자동 이동/count-up/motion은 즉시 완료 상태다 <!-- omo:id=accept-reduced-motion;stage=4;scope=frontend;review=5,6 -->
- [ ] share 취소/미지원/복사 실패가 퍼널 error나 email gate로 전이되지 않는다 <!-- omo:id=accept-share-fallback;stage=4;scope=frontend;review=5,6 -->
- [ ] canonical share는 `/beta?result=<opaque-result-key>`이고 공유 URL은 다른 query parameter를 모두 제거한다 <!-- omo:id=accept-share-deep-link;stage=4;scope=frontend;review=5,6 -->
- [ ] email, answers, UTM, `ad_variant`는 공유 URL에 넣지 않는다. known result key만 read-only preview이며 unknown result key는 기본 Hero다 <!-- omo:id=accept-share-privacy;stage=4;scope=frontend;review=5,6 -->
- [ ] planner_homecook과 planner_complete 모두 TomorrowPreview를 오늘 card 다음·primary CTA 직전에 표시한다 <!-- omo:id=accept-tomorrow-preview-layout;stage=4;scope=frontend;review=5,6 -->
- [ ] 내일 preview의 `+`는 read-only 또는 disabled이며 실제 planner/meal mutation을 만들지 않는다 <!-- omo:id=accept-tomorrow-preview-read-only;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] Hero/result/action/duplicate/fail-closed fixture가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] pinned isolated local migration replay와 controlled full-local smoke 경로가 분리되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] first `view`가 v2 row/cookie를 만드는 owning flow와 no-extra-system-row가 검증된다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Stage 4와 다른 Stage 5/final authority/Stage 6 task
- environment: local Next.js + mock/isolated full-local; production activation은 별도 승인 전 금지
- scenarios:
  1. 320×568, 390×844, 393×852, desktop에서 frame/selector 없이 app-owned 화면이 usable한지 확인한다.
  2. Hero a/b/c/d/default와 unknown fallback, q1..q4, 네 결과, experience/planner/beta/done을 확인한다.
  3. keyboard, screen reader, reduced motion, share cancel/fallback, rapid double tap을 확인한다.
  4. lead gate 503과 Turnstile 422에서 result/experience 유지와 retry를 확인한다.
  5. 이미지 권리 확인 또는 대체 자산을 확인하고 제품 카드에 `제품 예시`가 항상 보이며 제휴로 오인되지 않는지 확인한다.

## Automation Split

### Vitest

- [x] q1..q4 parser, Q3-only mapping, resolved ad variant, v2 action/state, legacy restart, idempotency, duplicate, consent, PII, conditional CHECK migration을 단위/통합 테스트로 고정한다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [x] old contract가 v2에서 조용히 통과하지 않고 `target_qualified`가 null임을 회귀 테스트로 고정한다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] Hero→q1..q4→result→experience→planner→beta→done 사용자 흐름과 session recovery를 고정한다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 393px와 320px에서 두 planner의 내일 preview, 오늘 card 다음 배치, CTA visibility, read-only `+`를 browser evidence로 고정한다 <!-- omo:id=accept-playwright-tomorrow-preview;stage=4;scope=frontend;review=5,6 -->
- [ ] mock lead와 optional local Turnstile/smoke를 구분하고 production key를 테스트에 사용하지 않는다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] actual operator privacy facts와 canonical `/privacy` 확인
- [ ] Turnstile production secret/hostname/action과 production origin/edge rule evidence 확인
- [ ] campaign retention, full-local migration apply approval/backup, sender email/domain 확인
- [ ] 실제 YouTube 썸네일의 공개 이미지 권리 또는 대체 자산 확인
- [ ] 제품 이미지 사용 권리와 `제품 예시`·비제휴 표현 확인
- [ ] 실제 iOS Safari smoke와 paid ads 집행 승인
