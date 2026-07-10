# Acceptance Checklist: auth-provider-memory-linking

> 이 문서는 구현 evidence가 생길 때만 체크하는 living closeout이다. `Manual Only`의 hosted provider 설정과 live OAuth는 자동화 green으로 대체하지 않는다.

## Happy Path

- [x] Google identity callback fixture는 normalized non-empty verified email을 요구한다 <!-- omo:id=accept-google-login;stage=2;scope=shared;review=3,6 -->
- [x] Kakao callback fixture는 built-in `kakao` 기본값과 invalid/unverified email 차단을 고정한다 <!-- omo:id=accept-kakao-built-in;stage=2;scope=shared;review=3,6 -->
- [x] Naver adapter fixture는 normalized non-empty email과 top-level 표준 `sub`를 만든다 <!-- omo:id=accept-naver-standard-claims;stage=2;scope=shared;review=3,6 -->
- [x] normal callback 성공은 신규/기존 사용자 bootstrap과 return-to-action을 정확히 수행한다 <!-- omo:id=accept-normal-callback-success;stage=2;scope=backend;review=3,6 -->
- [ ] 로그인된 사용자는 미연결 provider를 같은 Supabase user에 수동 연결할 수 있다 <!-- omo:id=accept-manual-link-success;stage=4;scope=shared;review=6 -->
- [x] `public.users.social_provider`는 linked-provider login/link 후에도 최초/primary provider로 유지된다 <!-- omo:id=accept-primary-provider-stable;stage=2;scope=backend;review=3,6 -->

## State / Policy

### Normal Login Callback Boundary

- [x] callback email missing은 sign out + `email_required`이며 `public.users`와 bootstrap row를 만들지 않는다 <!-- omo:id=accept-email-required;stage=2;scope=backend;review=3,6 -->
- [x] 명시적으로 invalid/unverified인 email metadata는 자동 연결에 사용하지 않는다 <!-- omo:id=accept-unverified-email-block;stage=2;scope=backend;review=3,6 -->
- [x] same normalized email + same app/Supabase user id는 linked identity login을 허용한다 <!-- omo:id=accept-same-email-same-user;stage=2;scope=backend;review=3,6 -->
- [x] same normalized email + different user id는 sign out + `account_conflict`이며 bootstrap/merge/update/delete를 하지 않는다 <!-- omo:id=accept-same-email-different-user;stage=2;scope=backend;review=3,6 -->
- [x] primary provider와 attempted provider가 다르다는 이유만으로 same-user login을 차단하지 않는다 <!-- omo:id=accept-no-provider-name-block;stage=2;scope=backend;review=3,6 -->
- [x] 기존 `provider_mismatch`/`expectedProvider` 노출은 제거되고 `account_conflict`만 안전하게 표시된다 <!-- omo:id=accept-safe-account-conflict;stage=4;scope=shared;review=6 -->
- [x] callback 재호출은 duplicate app user/bootstrap row를 만들지 않는다 <!-- omo:id=accept-callback-idempotency;stage=2;scope=backend;review=3,6 -->

## Actual Provider Resolution

- [x] `app_metadata.provider` 단독으로 실제 로그인 provider를 결정하지 않는다 <!-- omo:id=accept-no-app-provider-only;stage=2;scope=backend;review=3,6 -->
- [x] 검증된 attempt와 callback user identity provider/sign-in evidence가 일치할 때만 actual provider를 확정한다 <!-- omo:id=accept-provider-attempt-identity-match;stage=2;scope=backend;review=3,6 -->
- [x] 여러 identity가 있을 때 해당 attempt의 identity `last_sign_in_at` 또는 동등한 검증 evidence로 실제 provider를 구분한다 <!-- omo:id=accept-provider-last-sign-in-evidence;stage=2;scope=backend;review=3,6 -->
- [x] attempt/identity가 모호하거나 불일치하면 provider memory를 쓰지 않고 fail closed 한다 <!-- omo:id=accept-provider-resolution-fail-closed;stage=2;scope=backend;review=3,6 -->

## Manual Link Callback Boundary

- [x] unauthenticated 사용자는 manual link를 시작할 수 없다 <!-- omo:id=accept-link-auth-required;stage=2;scope=backend;review=3,6 -->
- [x] link callback은 시작/current/callback Supabase user id가 같음을 검증한다 <!-- omo:id=accept-link-same-user;stage=2;scope=backend;review=3,6 -->
- [ ] 성공은 요청 provider identity가 같은 user identities에 실제 존재할 때만 표시한다 <!-- omo:id=accept-link-identity-present;stage=4;scope=shared;review=6 -->
- [x] link callback은 `public.users` bootstrap/merge/update/delete를 하지 않는다 <!-- omo:id=accept-link-no-public-user-write;stage=2;scope=backend;review=3,6 -->
- [x] identity가 다른 Supabase user에 속하면 `link_conflict`로 실패하고 자동 이전/merge하지 않는다 <!-- omo:id=accept-link-conflict;stage=2;scope=backend;review=3,6 -->
- [ ] cancel/failure 후 기존 로그인 세션과 identities가 유지된다 <!-- omo:id=accept-link-cancel-preserves-state;stage=4;scope=shared;review=6 -->
- [x] 이미 연결된 provider 재요청은 duplicate identity 없이 safe no-op/already-linked가 된다 <!-- omo:id=accept-link-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] link callback은 normal callback/bootstrap으로 fallback하지 않는다 <!-- omo:id=accept-link-no-normal-fallback;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] normal/link callback은 각 경계의 인증·소유권 조건을 fail closed로 검증한다 <!-- omo:id=accept-error-permission-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] 사용자-facing auth/link 오류는 safe code와 복구 action만 제공한다 <!-- omo:id=accept-error-safe-recovery;stage=4;scope=shared;review=6 -->

## Provider Memory

- [x] normal login 성공은 canonical provider 하나만 `homecook:last-auth-provider:v1`에 기록한다 <!-- omo:id=accept-memory-success-write;stage=4;scope=frontend;review=5,6 -->
- [x] 버튼 클릭, dialog open/cancel, OAuth failure, callback failure는 memory를 바꾸지 않는다 <!-- omo:id=accept-memory-failure-no-write;stage=4;scope=frontend;review=5,6 -->
- [x] manual link 성공/실패는 memory를 바꾸지 않는다 <!-- omo:id=accept-memory-link-no-write;stage=4;scope=frontend;review=5,6 -->
- [x] invalid localStorage provider는 제거되고 무시된다 <!-- omo:id=accept-memory-invalid-local;stage=4;scope=frontend;review=5,6 -->
- [x] localStorage가 비었을 때만 valid legacy cookie를 migration/fallback으로 사용한다 <!-- omo:id=accept-memory-cookie-fallback;stage=4;scope=frontend;review=5,6 -->
- [x] localStorage와 cookie가 다르면 localStorage가 우선한다 <!-- omo:id=accept-memory-local-precedence;stage=4;scope=frontend;review=5,6 -->
- [x] logout은 memory를 보존한다 <!-- omo:id=accept-memory-logout-preserve;stage=4;scope=frontend;review=6 -->
- [x] confirmed account deletion 성공은 localStorage와 cookie를 모두 지운다 <!-- omo:id=accept-memory-delete-clear;stage=4;scope=frontend;review=6 -->

## Provider Switch UI

- [x] 기억 provider가 표시·강조되지만 개인 정보나 계정 소유를 암시하지 않는다 <!-- omo:id=accept-ui-recent-provider-advisory;stage=4;scope=frontend;review=5,6 -->
- [x] 같은 provider 클릭은 dialog 없이 OAuth를 시작한다 <!-- omo:id=accept-ui-same-provider-direct;stage=4;scope=frontend;review=5,6 -->
- [x] 다른 provider 클릭은 explicit dialog action 전 OAuth를 호출하지 않는다 <!-- omo:id=accept-ui-different-provider-dialog;stage=4;scope=frontend;review=5,6 -->
- [x] primary action은 remembered provider, secondary action은 selected provider의 다른 계정 계속이다 <!-- omo:id=accept-ui-dialog-actions;stage=4;scope=frontend;review=5,6 -->
- [x] cancel/ESC/backdrop은 OAuth를 호출하지 않고 선택 버튼으로 focus를 복귀한다 <!-- omo:id=accept-ui-dialog-cancel-focus;stage=4;scope=frontend;review=5,6 -->
- [x] 320px에서 dialog footer/CTA가 잘리지 않고 모든 touch target이 44px 이상이다 <!-- omo:id=accept-ui-dialog-mobile-fit;stage=4;scope=frontend;review=5,6 -->

## Connected Provider UI States

- [x] loading: link pending 동안 중복 action이 disabled된다 <!-- omo:id=accept-ui-link-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty: 추가 연결 가능 provider가 없으면 안전한 완료 상태를 표시한다 <!-- omo:id=accept-ui-link-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error: link failure/conflict는 PII 없는 복구 안내를 표시한다 <!-- omo:id=accept-ui-link-error;stage=4;scope=frontend;review=5,6 -->
- [x] read-only: 연결된 provider는 상태로만 보이고 unlink/primary-change control이 없다 <!-- omo:id=accept-ui-link-read-only;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized: 세션이 없으면 link action을 차단하고 로그인 복귀를 제공한다 <!-- omo:id=accept-ui-link-unauthorized;stage=4;scope=frontend;review=5,6 -->

## Provider Configuration And Claims

- [x] Kakao client는 Supabase built-in `kakao`를 기본 provider로 사용한다 <!-- omo:id=accept-config-kakao-built-in;stage=2;scope=backend;review=3,6 -->
- [x] Kakao email consent/valid/verified metadata가 가능한 범위에서 검증된다 <!-- omo:id=accept-config-kakao-email-signals;stage=2;scope=backend;review=3,6 -->
- [x] 기존 no-store Naver adapter는 nested UserInfo를 top-level 표준 claims로 변환한다 <!-- omo:id=accept-config-naver-nested-fixture;stage=2;scope=backend;review=3,6 -->

- [x] Naver adapter fixture의 non-empty upstream id는 동일한 top-level `sub`로 보존된다 <!-- omo:id=accept-config-naver-sub-integrity;stage=2;scope=backend;review=3,6 -->
- [x] `custom:naver` UserInfo URL은 기존 `/api/auth/oauth-userinfo/naver` adapter를 사용한다 <!-- omo:id=accept-config-naver-adapter-fallback;stage=2;scope=backend;review=3,6 -->
- [x] 기존 adapter는 `Cache-Control: no-store`와 raw token/profile/upstream payload 비저장·비반환을 유지한다 <!-- omo:id=accept-config-naver-adapter-pii;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] email은 lookup/persistence 전에 `trim().toLowerCase()`로 정규화된다 <!-- omo:id=accept-email-normalization;stage=2;scope=backend;review=3,6 -->
- [x] name/nickname/avatar/birthday로 identity를 연결하지 않는다 <!-- omo:id=accept-no-profile-linking;stage=2;scope=backend;review=3,6 -->
- [x] conflict/link/auth event에 email, user id, token, code, provider payload가 기록되지 않는다 <!-- omo:id=accept-auth-event-no-pii;stage=2;scope=backend;review=3,6 -->
- [x] 오류 redirect query에 `expectedProvider`, email, user id, provider payload가 없다 <!-- omo:id=accept-error-query-no-pii;stage=2;scope=backend;review=3,6 -->
- [x] `public.users.social_provider`와 Supabase identities의 역할 경계가 타입/UI에서 섞이지 않는다 <!-- omo:id=accept-provider-truth-boundary;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions

- [x] missing-email/same-user/different-user/multi-identity fixture가 준비된다 <!-- omo:id=accept-fixture-auth-matrix;stage=2;scope=shared;review=3,6 -->
- [x] 기존 `tests/oauth-userinfo-proxy.test.ts` Naver standard-claims fixture가 회귀 검증에 포함된다 <!-- omo:id=accept-fixture-naver-claims;stage=2;scope=backend;review=3,6 -->
- [x] manual-link success/already-linked/conflict/cancel fixture가 준비된다 <!-- omo:id=accept-fixture-link-matrix;stage=2;scope=shared;review=3,6 -->

- [x] local manual identity linking 설정과 dedicated callback contract가 준비된다 <!-- omo:id=accept-link-config-ready;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [x] callback missing-email, same-user, different-user, no-provider-name-only-block 분기를 고정한다 <!-- omo:id=accept-vitest-normal-callback;stage=2;scope=backend;review=3,6 -->
- [x] actual provider attempt/identity/last-sign-in 판정을 고정한다 <!-- omo:id=accept-vitest-provider-resolution;stage=2;scope=backend;review=3,6 -->
- [x] link callback auth/same-user/identity-present/conflict/no-public-write를 고정한다 <!-- omo:id=accept-vitest-link-callback;stage=2;scope=backend;review=3,6 -->
- [x] provider memory parse/read/write/migrate/clear lifecycle을 고정한다 <!-- omo:id=accept-vitest-provider-memory;stage=4;scope=shared;review=6 -->
- [x] provider-switch dialog action/cancel/focus를 고정한다 <!-- omo:id=accept-vitest-provider-dialog;stage=4;scope=frontend;review=5,6 -->
- [ ] connected provider UI 5개 상태를 고정한다 <!-- omo:id=accept-vitest-link-ui-states;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] fixture mode에서 recent provider, different-provider dialog, safe errors를 검증한다 <!-- omo:id=accept-playwright-login-memory;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture mode에서 MYPAGE link success/cancel/conflict와 account deletion memory clear를 검증한다 <!-- omo:id=accept-playwright-link-account;stage=4;scope=frontend;review=5,6 -->
- [x] LOGIN/MYPAGE 390px/320px/desktop visual evidence를 남긴다 <!-- omo:id=accept-playwright-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] live OAuth E3/E5는 deterministic CI와 분리된 manual smoke로 유지한다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: 사용자 또는 사용자 승인 운영 verifier
- environment: hosted Supabase + deployed preview/production
- privacy rule: 결과에는 provider별 pass/fail, user-id equality 여부, email-present 여부, Naver sub integrity 여부만 기록하고 실제 email/sub/user id/token/code는 남기지 않는다.

### Manual Only

- [ ] E1: Kakao built-in provider, Kakao required email consent, Naver required email/claim path, Google email, callback URLs, manual linking setting이 구성됐다.
- [ ] E3: `Allow users without an email`이 ON인 상태에서 fresh Google/Naver/Kakao login을 완료하고 세 provider의 `auth.users.email`이 non-empty임을 확인했다.
- [ ] E3: 기존 no-store Naver adapter를 경유한 `sub`가 non-empty/stable/distinct이며 `auth.users.email`이 non-empty임을 실측했다.
- [ ] E3: Kakao valid/verified metadata를 Supabase가 노출하는 범위에서 확인했다.
- [ ] E3: 각 login이 정확히 하나의 `public.users` row를 만들거나 같은 row로 해석된다.
- [ ] E3: 이메일 없는 기존 QA 계정 3개를 supported deletion path로 정리하고 privacy-safe audit에서 활성 email-less user 0을 확인했다.
- [ ] E4: E1-E3 완료 후 사용자에게 “세 제공자 이메일 반환, 콜백 차단, QA 계정 정리가 확인됐으므로 지금 `Allow users without an email`을 Google, Naver, Kakao 모두 OFF로 바꿀 시점입니다.”라고 알리고 확인을 기다렸다.
- [ ] E4: hosted Supabase에서 Google/Naver/Kakao 모두 `Allow users without an email` OFF가 확인됐다.
- [ ] E5: OFF 상태에서 fresh Google/Naver/Kakao production smoke가 성공하고 non-empty email을 유지한다.
- [ ] E5: same-email linked provider login이 같은 Supabase/app user id로 해석되고 duplicate app row가 생기지 않는다.
- [ ] E5: account conflict/callback/link failure event에 email, access token, authorization code, provider payload가 없다.
