# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path
- [x] MYPAGE ⚙️ 버튼 탭 시 SETTINGS 화면으로 진입한다 <!-- omo:id=accept-settings-entry;stage=4;scope=frontend;review=5,6 -->
- [x] 화면 꺼짐 방지 토글이 현재 설정값(settings_json.screen_wake_lock)을 반영한다 <!-- omo:id=accept-wake-lock-display;stage=4;scope=frontend;review=5,6 -->
- [x] 화면 꺼짐 방지 토글 변경 시 즉시 서버에 저장된다 (PATCH /users/me/settings) <!-- omo:id=accept-wake-lock-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] 닉네임 변경 시 새 닉네임(2~30자)이 서버에 저장된다 (PATCH /users/me) <!-- omo:id=accept-nickname-change;stage=4;scope=frontend;review=5,6 -->
- [x] 로그아웃 시 세션이 무효화되고 HOME으로 이동한다 (POST /auth/logout) <!-- omo:id=accept-logout;stage=4;scope=frontend;review=5,6 -->
- [x] 회원 탈퇴 확인 후 개인 데이터 cleanup을 실행하고 HOME으로 이동한다 (DELETE /users/me) <!-- omo:id=accept-account-delete;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] settings_json merge 업데이트가 기존 키를 보존한다 (전달된 키만 덮어쓰기) <!-- omo:id=accept-settings-merge;stage=2;scope=backend;review=3,6 -->
- [x] 닉네임 길이 제약(2~30자)이 서버에서 검증된다 <!-- omo:id=accept-nickname-length-validation;stage=2;scope=backend;review=3,6 -->
- [x] 회원 탈퇴가 개인 데이터 삭제 + 작성 레시피 익명 보존으로 동작한다 <!-- omo:id=accept-private-data-cleanup;stage=2;scope=backend;review=3,6 -->
- [x] PATCH /users/me/settings 동일 값 재전송 시 멱등 응답 <!-- omo:id=accept-settings-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] DELETE /users/me 이미 탈퇴 상태에서 재호출 시 멱등 응답 <!-- omo:id=accept-delete-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [x] loading 상태가 있다 (설정 값 로딩 스켈레톤) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (해당 없음 — 설정 화면은 항상 항목 존재, N/A 근거 README에 명시) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (설정 저장/닉네임 변경 실패 시 에러 표시) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 시 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 후 return-to-action이 SETTINGS로 복귀한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] 닉네임 빈 문자열 / 2자 미만 / 30자 초과 시 422 반환 <!-- omo:id=accept-nickname-validation-422;stage=2;scope=backend;review=3,6 -->
- [x] screen_wake_lock이 boolean이 아닌 경우 422 반환 <!-- omo:id=accept-settings-validation-422;stage=2;scope=backend;review=3,6 -->
- [x] 회원 탈퇴 전 확인 다이얼로그가 표시된다 <!-- omo:id=accept-delete-confirmation;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] /users/me 경로는 항상 인증된 사용자 자신에 대해서만 동작한다 (타인 접근 구조적 불가) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 회원 탈퇴 후 같은 소셜 계정 재로그인은 새 bootstrap 사용자 상태로 시작한다 <!-- omo:id=accept-delete-rejoin-bootstrap;stage=2;scope=backend;review=3,6 -->
- [x] 회원 탈퇴해도 사용자가 직접/유튜브로 등록한 레시피 row는 삭제하지 않고 `recipes.created_by = null`로 보존한다 <!-- omo:id=accept-delete-preserve-authored-recipes;stage=2;scope=backend;review=3,6 -->
- [x] settings_json 업데이트가 기존 데이터를 파괴하지 않는다 <!-- omo:id=accept-settings-no-data-loss;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (인증된 사용자 1명, settings_json `{}`) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 (회원가입 → users row) <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: 사용자 또는 QA 에이전트
- environment: `pnpm dev:local-supabase` 또는 `pnpm dev:demo`
- scenarios:
  - 화면 꺼짐 방지 토글 ON → 새로고침 → 설정 유지 확인
  - 닉네임 변경 → MYPAGE 복귀 → 닉네임 반영 확인
  - 로그아웃 → HOME 이동 → 로그인 게이트 정상 작동 확인
  - 회원 탈퇴 → 확인 다이얼로그 → 탈퇴 → HOME 이동, 동일 계정 재로그인 후 이전 개인 기록이 보이지 않는지 확인
  - 비로그인 상태에서 SETTINGS 직접 접근 → 로그인 게이트 → 로그인 후 SETTINGS 복귀
  - Live OAuth 소셜 로그인 후 설정 화면 정상 진입 확인

## Automation Split

### Vitest
- [x] PATCH /users/me/settings 성공 응답, 422 응답 (비 boolean) <!-- omo:id=accept-vitest-settings-update;stage=2;scope=backend;review=3,6 -->
- [x] PATCH /users/me 닉네임 변경 성공, 422 (빈 문자열, 2자 미만, 30자 초과) <!-- omo:id=accept-vitest-nickname-update;stage=2;scope=backend;review=3,6 -->
- [x] DELETE /users/me 개인 데이터 cleanup 성공, cleanup 실패 500 <!-- omo:id=accept-vitest-account-delete;stage=2;scope=backend;review=3,6 -->
- [x] POST /auth/logout 성공, 401 (미인증) <!-- omo:id=accept-vitest-logout;stage=2;scope=backend;review=3,6 -->
- [x] 모든 엔드포인트 401 미인증 검증 <!-- omo:id=accept-vitest-auth-guard;stage=2;scope=backend;review=3,6 -->

### Playwright
- [x] SETTINGS 진입 → 토글 변경 → 닉네임 변경 flow <!-- omo:id=accept-playwright-settings-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 로그아웃 → HOME 이동 확인 <!-- omo:id=accept-playwright-logout-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 회원 탈퇴 → 확인 다이얼로그 → HOME 이동 확인 <!-- omo:id=accept-playwright-delete-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 → SETTINGS → 로그인 게이트 <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [x] Live OAuth 소셜 로그인 후 설정 화면 정상 진입 및 조작 확인
  - RC-MO-01 live OAuth와 2026-05-24 account deletion smoke에서 Google 로그인 후 SETTINGS 진입/계정 삭제 조작/로그인 게이트를 확인.
- [x] 실기기 모바일 브라우저에서 화면 꺼짐 방지 토글 UX 확인
  - 2026-05-24 `https://homecook-flame.vercel.app`, PR #579 / `8c2a2b8b` 배포 후 확인.
  - iOS Safari와 Android Chrome 모두 화면 꺼짐 방지 ON 상태의 요리모드에서 화면이 꺼지지 않음을 확인했다.
- [x] 회원 탈퇴 후 동일 소셜 계정으로 재가입 가능 여부 확인
  - 2026-05-24 staging `https://homecook-flame.vercel.app`, macOS Chrome, `Share Notion` 계정으로 확인.
  - 탈퇴 성공, HOME 이동, MYPAGE 로그인 요구, 동일 소셜 계정 재로그인 성공, 화면 에러 없음.
  - Supabase migration 적용 후 재테스트에서 기존 저장/플래너 개인 데이터가 재가입 계정에 보이지 않음을 확인했다.
  - 유튜브로 등록한 레시피는 탈퇴 후에도 서비스에 남고, 재가입 후 "내가 추가한 레시피"는 0개로 표시됨을 확인했다.
