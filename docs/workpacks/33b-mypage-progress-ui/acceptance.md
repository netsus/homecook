# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] 로그인한 사용자가 MYPAGE에서 실제 progress 기반 level/progress bar를 본다 <!-- omo:id=accept-happy-path-progress-visible;stage=4;scope=frontend;review=5,6 -->
- [x] `GET /api/v1/users/me/progress` 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-progress-api-envelope;stage=4;scope=frontend;review=5,6 -->
- [x] 백엔드 progress contract와 프론트 타입이 일치한다 <!-- omo:id=accept-progress-types-match;stage=4;scope=shared;review=5,6 -->
- [x] 기존 MYPAGE profile/recipebook/shopping history 흐름이 유지된다 <!-- omo:id=accept-mypage-core-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 하드코딩된 `집밥 러너`/`레벨 5` subtitle이 사용자 화면과 소스에서 제거된다 <!-- omo:id=accept-hardcoded-level-removed;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] progress UI는 조회 전용이며 편집 액션이 없다 <!-- omo:id=accept-progress-read-only;stage=4;scope=frontend;review=5,6 -->
- [x] 중복 렌더/재조회에도 progress 표시가 꼬이지 않는다 <!-- omo:id=accept-progress-idempotent-read;stage=4;scope=frontend;review=5,6 -->
- [x] 클라이언트가 XP/level을 계산하지 않고 서버 응답 필드를 표시한다 <!-- omo:id=accept-server-authority-progress;stage=4;scope=frontend;review=5,6 -->
- [x] `GET /api/v1/users/me`에 progress field를 추가하지 않는다 <!-- omo:id=accept-users-me-profile-only;stage=4;scope=shared;review=5,6 -->
- [x] badge/quest/toast/tutorial UI가 33b에 노출되지 않는다 <!-- omo:id=accept-33c-scope-excluded;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] progress loading 상태가 있다 <!-- omo:id=accept-progress-loading;stage=4;scope=frontend;review=5,6 -->
- [x] zero-progress 또는 초기 progress 상태가 있다 <!-- omo:id=accept-progress-empty;stage=4;scope=frontend;review=5,6 -->
- [x] progress error 상태가 MYPAGE 전체 error로 전파되지 않는다 <!-- omo:id=accept-progress-soft-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름은 기존 MYPAGE 로그인 게이트를 따른다 <!-- omo:id=accept-progress-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름은 N/A로 명시된다 <!-- omo:id=accept-progress-conflict-na;stage=4;scope=frontend;review=6 -->
- [x] 신규 return-to-action이 없으며 기존 MYPAGE return-to-action을 깨지 않는다 <!-- omo:id=accept-progress-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인 progress를 조회할 수 없다는 backend contract를 프론트가 우회하지 않는다 <!-- omo:id=accept-progress-owner-guard;stage=4;scope=shared;review=5,6 -->
- [x] invalid progress response는 안전한 fallback 또는 error state로 처리된다 <!-- omo:id=accept-progress-invalid-response;stage=4;scope=frontend;review=5,6 -->
- [x] progress bar width와 표시 문구가 서버 파생 필드와 일치한다 <!-- omo:id=accept-progress-derived-fields;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] progress success/zero/failure fixture가 준비되어 있다 <!-- omo:id=accept-progress-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [x] real DB smoke에서 33a progress endpoint 준비 여부를 확인한다 <!-- omo:id=accept-progress-real-db-ready;stage=4;scope=shared;review=5,6 -->
- [x] 신규 bootstrap/system row가 필요 없음을 명시한다 <!-- omo:id=accept-progress-bootstrap-na;stage=4;scope=shared;review=5,6 -->

## Visual / Design

- [x] `ui/designs/MYPAGE_PROGRESS.md` 기준 compact tone을 따른다 <!-- omo:id=accept-design-generator-followed;stage=4;scope=frontend;review=5,6 -->
- [x] 390px screenshot evidence에서 overflow/overlap이 없다 <!-- omo:id=accept-visual-mobile-390;stage=4;scope=frontend;review=5,6 -->
- [x] 320px screenshot evidence에서 overflow/overlap이 없다 <!-- omo:id=accept-visual-mobile-320;stage=4;scope=frontend;review=5,6 -->
- [x] desktop MYPAGE에서 progress UI가 기존 정보 구조를 밀어내지 않는다 <!-- omo:id=accept-visual-desktop-1440;stage=4;scope=frontend;review=5,6 -->

## Manual QA

- verifier: Stage 4 구현자, Stage 5/6 reviewer
- environment: local dev server + local Supabase 또는 33a progress endpoint가 준비된 demo 환경
- scenarios:
  - 로그인 사용자의 progress success
  - progress zero state
  - progress endpoint failure with MYPAGE core still usable
  - 390px/320px mobile viewport
  - desktop 1440px viewport

## Automation Split

### Vitest

- [x] progress API helper test가 성공/실패/invalid response를 고정한다 <!-- omo:id=accept-vitest-api-helper;stage=4;scope=frontend;review=5,6 -->
- [x] progress card component test가 level/XP/progress bar 표시를 고정한다 <!-- omo:id=accept-vitest-progress-card;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE soft-fail test가 progress failure와 core success를 함께 고정한다 <!-- omo:id=accept-vitest-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] hardcoded level regression test가 정적 subtitle 회귀를 잡는다 <!-- omo:id=accept-vitest-hardcoded-regression;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] 390px/320px visual capture 또는 동등한 browser evidence가 있다 <!-- omo:id=accept-playwright-mobile-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] progress API failure scenario를 브라우저 레벨에서 확인한다 <!-- omo:id=accept-playwright-soft-fail;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 운영 실사용자의 장기 XP 체감 평가는 33c 이후 product analytics에서 별도 판단한다
