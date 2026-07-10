# Slice: auth-provider-memory-linking

## Goal

사용자는 Google, Naver, Kakao 중 어떤 provider를 사용했는지 브라우저에서 쉽게 알아보고, 다른 provider를 선택할 때 계정이 달라질 수 있음을 확인한 뒤 안전하게 계속할 수 있다. 동일한 verified email의 identity는 Supabase와 앱의 user id가 모두 같을 때만 한 계정으로 사용하며, 서로 다른 user id는 자동 병합하지 않는다. 로그인된 사용자는 현재 계정에서 다른 provider를 명시적으로 연결할 수 있다.

## Approval And Ownership

- 사용자 승인: 2026-07-10, 승인 계획 `.omx/plans/social-auth-provider-memory-linking.md`와 본 task의 추가 공식 근거
- Change type: `contract-evolution` 선행 후 `product-backend` + `product-frontend`
- Stage 1 docs owner: 별도 Codex 세션. 사용자가 Claude 사용 중단과 Codex docs-owner 대체를 명시 승인했다.
- 구현/리뷰 분리: 이후 구현과 리뷰는 역할별 별도 Codex 세션으로 진행하며 구현 세션이 자기 변경을 최종 승인하지 않는다.

## Branches

- 문서: `docs/auth-provider-memory-linking`
- 백엔드: `feature/be-auth-provider-memory-linking`
- 프론트엔드: `feature/fe-auth-provider-memory-linking`

## In Scope

- 화면:
  - `LOGIN`: 최근 성공 provider 안내/강조, 다른 provider 확인 dialog, `email_required`, `account_conflict`
  - `MYPAGE`: 연결된 provider read-only 목록, 미연결 provider 수동 연결
  - `SETTINGS` account deletion success: provider memory localStorage + cookie 삭제
- Web auth routes:
  - normal login `GET /auth/callback`
  - manual identity link `GET /auth/link/callback`
- Provider configuration:
  - Google email 필수
  - Kakao `account_email` 필수, Supabase built-in `kakao` 우선
  - Naver email 필수, 표준 `sub/email/email_verified` claim 검증
  - 기존 no-store Naver UserInfo adapter를 `custom:naver` UserInfo URL로 재사용하고 표준 claim 실측
- 상태/정책:
  - missing/invalid/unverified email 차단
  - same normalized email + same Supabase/app user id 허용
  - same normalized email + different user id 차단
  - provider memory 성공/실패/삭제 lifecycle
  - manual link success/cancel/conflict
- DB 영향:
  - 기존 `public.users`와 Supabase Auth identities 사용
  - `public.users.social_provider`는 최초/primary provider 의미 유지
  - 신규 public table/column 없음
- Schema Change: 없음. 단, local Supabase의 manual identity linking 설정과 hosted provider settings는 운영 configuration 변경 대상이다.

## Out of Scope

- 서로 다른 Supabase user의 자동/수동 duplicate account merge
- provider identity unlink
- primary provider 변경
- 이메일 외 프로필 정보로 계정 매칭
- cross-device provider memory 동기화
- `public.users.email` DB NOT NULL migration
- raw Naver/Kakao UserInfo, OAuth token/code/payload 저장
- hosted Supabase provider setting을 Stage 1 docs PR에서 직접 변경

## Dependencies

| 선행 슬라이스 | 상태 | 근거 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | LOGIN, normal callback, return-to-action 기반 |
| `17a-mypage-overview-history` | merged | MYPAGE account surface |
| `17c-settings-account` | merged | logout/account deletion lifecycle |

## Backend First Contract

### Provider configuration

- Kakao: Supabase 공식 built-in provider id `kakao`를 우선한다. 현재 `custom:kakao`는 E1-E3 전환 검증 전 compatibility fallback으로만 취급한다.
- Kakao Developers `account_email`은 필수 동의항목이다. 명시적 `is_email_valid` / `is_email_verified`가 false이면 자동 연결에 사용하지 않는다.
- Naver: `custom:naver` UserInfo URL을 기존 no-store `/api/auth/oauth-userinfo/naver`에 연결하고, Naver UserInfo의 중첩 `response.id/email`이 표준 `sub/email/email_verified`로 변환되는지 E3에서 검증한다.
- Naver `sub`는 non-empty, 같은 QA identity 재로그인에서 stable, 다른 QA identity 사이에서 distinct여야 한다.
- 기존 adapter는 top-level `sub`, `email`, `email_verified`와 승인된 최소 profile만 반환하고 `Cache-Control: no-store`를 유지하며 raw token/profile/upstream error payload를 저장·반환하지 않는다. E3 실패 시 새 proxy를 추가하지 않고 이 adapter의 URL/config/normalization을 복구한다.
- 기존 Kakao proxy는 `custom:kakao` compatibility fallback용으로만 유지한다. 최종 기본 Kakao 경로는 built-in `kakao`다.

### Normal login callback: `GET /auth/callback`

1. OAuth code를 session으로 교환한다.
2. callback user와 정규화 email을 확보한다. email이 없거나 명시적으로 invalid/unverified면 sign out 후 `email_required`로 실패한다.
3. 실제 provider는 `app_metadata.provider`만으로 결정하지 않는다. 검증된 attempt와 해당 user identity의 provider/최근 sign-in evidence를 대조한다.
4. 활성 `public.users`를 normalized email로 조회한다.

| 기존 활성 app row | `existing.id` vs callback `auth.user.id` | 동작 |
| --- | --- | --- |
| 없음 | N/A | callback user id로 신규 user/bootstrap 생성 |
| 있음 | 같음 | 기존/linked identity 로그인 허용; primary provider 유지 |
| 있음 | 다름 | sign out, `account_conflict`, bootstrap/merge/update/delete 없음 |

5. 성공한 normal login만 nickname onboarding 또는 safe return-to-action으로 이동하고 compatibility cookie를 갱신한다.
6. client landing은 검증된 success marker의 provider를 `localStorage["homecook:last-auth-provider:v1"]`에 기록한다.

`provider_mismatch` / `expectedProvider` 노출은 폐기한다. provider 이름이 primary provider와 다르다는 사실만으로 callback을 차단하지 않는다.

### Manual link callback: `GET /auth/link/callback`

- authenticated current user만 `linkIdentity()`로 시작할 수 있다.
- 시작 user id와 callback 후 user id가 같고, 요청 provider identity가 같은 user의 identities에 존재할 때만 성공한다.
- `public.users` bootstrap/merge/update/delete와 `social_provider` 변경을 하지 않는다.
- provider memory를 갱신하지 않는다.
- cancel, callback error, identity conflict는 기존 로그인과 identities를 유지한다.
- normal login callback으로 fallback하지 않는다.

### Error And Observability Contract

- LOGIN-safe codes: `email_required`, `account_conflict`, `oauth_failed`, `provider_resolution_failed`
- link-safe codes: `link_cancelled`, `link_failed`, `link_conflict`
- event에는 bounded code, pathname, safe summary만 기록한다.
- email, user id, access/refresh token, authorization code, provider payload, provider raw profile, localStorage/cookie contents는 URL, UI message, log, `operational_events.metadata_json`에 기록하지 않는다.

### Authorization / Idempotency

- manual link는 authenticated user만 가능하다.
- 이미 연결된 provider를 다시 연결하려는 요청은 기존 identity를 유지하는 안전한 no-op 또는 명시적 already-linked 결과여야 한다.
- callback 재호출로 duplicate `public.users`, bootstrap row, identity가 생기면 안 된다.
- different-user conflict는 어떤 경우에도 자동 merge/delete로 완화하지 않는다.

## Frontend Delivery Mode

- Design Status는 `temporary`에서 시작하며 LOGIN/MYPAGE high-risk auth flow이므로 screenshot authority review가 필요하다.
- 필수 상태:
  - `loading`: OAuth/link 진행 중, 중복 탭 방지
  - `empty`: 연결 가능한 추가 provider가 없음 또는 연결된 provider 목록 없음의 안전한 설명
  - `error`: email required, account conflict, link failure의 PII 없는 복구 안내
  - `read-only`: 이미 연결된 provider 목록; unlink control 없음
  - `unauthorized`: manual link 진입 차단과 로그인 복귀
- different-provider dialog는 OAuth 전에 열리고, cancel/ESC/backdrop은 OAuth를 호출하지 않으며 focus를 원래 버튼에 돌려준다.
- shared browser를 고려해 recent provider는 advisory copy만 사용하고 다른 계정 계속을 막지 않는다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음 (`LOGIN`, `MYPAGE`는 anchor list 밖이지만 auth/account 핵심 flow)
- Design generator artifact: `ui/designs/AUTH_PROVIDER_MEMORY_LINKING.md`
- Design critic artifact: `ui/designs/critiques/AUTH_PROVIDER_MEMORY_LINKING-critique.md`
- Visual artifact: `ui/designs/evidence/auth-provider-memory-linking/` Stage 4 screenshot bundle
- Stage 4 evidence plan: LOGIN/MYPAGE before/after 390px·320px·desktop screenshot bundle
  - current-state before screenshots: LOGIN/MYPAGE 390px + 320px
  - after screenshots: recent provider, provider-switch dialog, email/account error, connected providers, link pending/error at 390px + 320px
  - desktop 1440px LOGIN/MYPAGE
- Authority report: `ui/designs/authority/AUTH_PROVIDER_MEMORY_LINKING-authority.md`
- Authority status: required

## Design Status

`confirmed` — PR #968 current head의 320/390/1440 evidence를 독립 final authority가 직접 판독하고 interaction·overflow·focus 증거를 재검증했다. actionable design finding 0건으로 Stage 5 최종 승인됐다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.11.md`
- `docs/화면정의서-v1.5.18.md`
- `docs/유저flow맵-v1.3.18.md`
- `docs/db설계-v1.3.16.md`
- `docs/api문서-v1.2.20.md`
- `.omx/plans/social-auth-provider-memory-linking.md`
- [Supabase Kakao login](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase users and identities](https://supabase.com/docs/guides/auth/users)
- [Supabase custom OAuth source](https://github.com/supabase/auth/blob/master/internal/api/provider/custom_oauth.go)
- [Naver login developer guide](https://developers.naver.com/docs/login/devguide/devguide.md)

## QA / Test Data Plan

### Fixture baseline

- Provider: `google | kakao | naver`, built-in/custom raw id normalization 포함
- Auth users: missing email, same email/same id, same email/different id, multiple identities with distinct `last_sign_in_at`
- Naver: 기존 `tests/oauth-userinfo-proxy.test.ts`의 nested `response.id/email` → top-level claims fixture
- Link: authenticated user, identity already linked, identity owned by another user, cancelled callback
- Browser: valid/invalid localStorage, valid/invalid cookie, conflicting memory sources

### Real environment rollout gates

- E1 provider configuration: built-in Kakao, Naver required email/standard claims, callback URLs, manual linking option
- E2 app protection deployed: callback tests, PII-safe errors/logs, full deterministic checks
- E3 setting ON smoke: fresh provider accounts, `auth.users.email`, Naver `sub`, Kakao valid/verified metadata when available, one app row, zero email-less active users after QA cleanup
- E4 mandatory stop: 사용자에게 정확한 toggle 알림 후 hosted setting confirmation
- E5 setting OFF smoke: fresh three-provider login, same-user linking, conflict/log safety

### Seed / reset / blocker

- fixture reset: existing auth test helpers and deterministic mock state
- local real auth: `pnpm dev:local-supabase`; manual linking local config enabled only for implementation verification
- email 없는 기존 3개 계정은 QA data이며 E4 전에 supported deletion path로 제거 가능하다.
- Blocker: Kakao/Naver/Google 중 하나라도 `auth.users.email`이 비었거나, Naver `sub`가 missing/unstable/colliding이거나, same-email different-user가 bootstrap되거나, auth failure log에 PII가 보이면 E4 진입 금지다.

## Key Rules

- Provider memory is a hint, never identity proof.
- `localStorage`가 primary이며 cookie는 valid fallback/migration only다. 둘이 다르면 localStorage가 우선한다.
- normal login 성공만 provider memory를 갱신한다. link success도 마지막 로그인으로 간주하지 않는다.
- logout은 memory를 보존하고 confirmed account deletion은 localStorage + cookie를 지운다.
- `app_metadata.provider`는 최초 provider이므로 actual-provider 단독 근거가 아니다.
- same email은 same account의 충분조건이 아니다. same Supabase/app user id가 추가로 필요하다.
- `public.users.social_provider`는 original/primary provider projection이다.
- Normal callback과 link callback은 bootstrap 책임을 공유하지 않는다.

## Architecture Decision

- 채택: localStorage primary + cookie fallback, normal/link callback 분리, Supabase Auth identities truth.
- 기각: cookie-only memory. Client UX 갱신이 늦고 SSR compatibility surface가 advisory state의 primary가 된다.
- 기각: server profile에 last provider 저장. 안내용 shared-browser state를 계정 데이터로 과도하게 승격하고 cross-device 동기화를 암묵적으로 추가한다.
- 기각: normal callback에 link mode를 overload. bootstrap과 identity linking의 실패/권한 경계를 흐린다.

## Primary User Path

### Recent provider normal login

1. 사용자가 LOGIN에서 최근 provider 안내를 본다.
2. 같은 provider를 누르면 바로 OAuth를 시작한다.
3. callback 성공 후 memory를 갱신하고 return-to-action으로 복귀한다.

### Different provider

1. 사용자가 기억된 provider와 다른 버튼을 누른다.
2. dialog에서 기억 provider 또는 다른 계정 계속을 선택한다.
3. explicit action 이후에만 OAuth가 시작된다. 취소는 아무 OAuth 호출도 하지 않는다.

### Same email callback

1. callback이 normalized email로 app row를 찾는다.
2. 같은 user id면 linked identity 로그인으로 허용한다.
3. 다른 user id면 sign out + `account_conflict`; merge/bootstrap 없음.

### Manual link

1. 로그인 사용자가 MYPAGE에서 미연결 provider의 `[연결]`을 누른다.
2. `linkIdentity()` OAuth와 dedicated callback을 완료한다.
3. 같은 Supabase user identities에 provider가 나타난 경우에만 성공을 표시한다.

## Delivery Checklist

- [x] Kakao built-in 우선/Naver standard claim provider config를 고정한다 <!-- omo:id=delivery-provider-config;stage=2;scope=backend;review=3,6 -->
- [x] normal callback email/user-id decision table을 구현한다 <!-- omo:id=delivery-normal-callback;stage=2;scope=backend;review=3,6 -->
- [x] actual provider를 verified attempt + identity evidence로 판정한다 <!-- omo:id=delivery-provider-resolution;stage=2;scope=backend;review=3,6 -->
- [x] dedicated manual link callback 경계를 구현한다 <!-- omo:id=delivery-link-callback;stage=2;scope=backend;review=3,6 -->
- [x] PII-safe auth/link event를 구현한다 <!-- omo:id=delivery-auth-observability;stage=2;scope=backend;review=3,6 -->
- [x] provider memory localStorage/cookie lifecycle을 구현한다 <!-- omo:id=delivery-provider-memory;stage=4;scope=shared;review=6 -->
- [x] recent provider UI와 provider-switch dialog를 연결한다 <!-- omo:id=delivery-provider-dialog;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE connected provider/read-only/manual link UI를 연결한다 <!-- omo:id=delivery-link-ui;stage=4;scope=frontend;review=5,6 -->
- [x] account deletion memory cleanup을 연결한다 <!-- omo:id=delivery-deletion-memory-clear;stage=4;scope=frontend;review=6 -->
- [x] fixture와 real OAuth E3/E5 smoke 경로를 분리한다 <!-- omo:id=delivery-auth-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] LOGIN/MYPAGE 390px·320px·desktop evidence와 authority report를 확보한다 <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] deterministic tests와 Playwright/live OAuth automation split을 닫는다 <!-- omo:id=delivery-test-split;stage=4;scope=shared;review=6 -->
