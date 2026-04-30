# Slice: 17c-settings-account

## Goal
로그인한 사용자가 마이페이지 설정 화면(`SETTINGS`)에서 요리모드 화면 꺼짐 방지 토글을 켜고 끌 수 있고, 닉네임을 변경하며, 로그아웃하거나 회원 탈퇴를 할 수 있도록 한다. 마이페이지 계정 섹션의 톱니바퀴(⚙️) 버튼으로 진입하는 설정 화면을 이 슬라이스에서 닫는다.

## Branches

- 백엔드: `feature/be-17c-settings-account`
- 프론트엔드: `feature/fe-17c-settings-account`

## In Scope
- 화면: `SETTINGS` (설정 — 화면 꺼짐 방지 토글, 닉네임 변경, 로그아웃, 회원 탈퇴)
- API:
  - `PATCH /users/me/settings` (13-1) — 설정 업데이트 (screen_wake_lock)
  - `PATCH /users/me` (13-2) — 닉네임 변경 (2~30자)
  - `DELETE /users/me` (13-3) — 회원 탈퇴 (소프트 삭제)
  - `POST /auth/logout` (0-4) — 로그아웃
- 상태 전이: `users.deleted_at` NULL → timestamptz (회원 탈퇴 시 소프트 삭제)
- DB 영향: `users` (settings_json 업데이트, nickname 업데이트, deleted_at 업데이트)
- Schema Change:
  - [x] 없음 (기존 `users` 테이블 컬럼 활용)

## Out of Scope
- MYPAGE shell, 프로필 조회, 레시피북 목록/CRUD, 장보기 기록 → `17a-mypage-overview-history` (merged)
- RECIPEBOOK_DETAIL 상세 조회 및 레시피 제거 → `17b-recipebook-detail-remove` (merged)
- 직접 레시피 등록 / 유튜브 레시피 등록 → `18-manual-recipe-create`, `19-youtube-import`
- 프로필 이미지 변경 (공식 문서에 엔드포인트 없음)
- 이메일 변경 (소셜 로그인에서 받아오는 값이므로 직접 변경 불가)
- 소셜 계정 연결/해제 (공식 문서 범위 밖)
- 회원 탈퇴 후 재가입 복구 흐름 (부분 유니크 인덱스로 충돌 방지 설계는 이미 DB에 존재하나, 복구 UX는 공식 문서에 없음)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이다.

## Backend First Contract

### PATCH /users/me/settings (13-1)
- 권한: 🔒 로그인 필수
- Body:
  ```json
  { "screen_wake_lock": true }
  ```
- `screen_wake_lock`: boolean (optional) — 화면 꺼짐 방지 설정
- 서버 동작: `users.settings_json`을 머지 업데이트 (기존 값 보존, 전달된 필드만 덮어쓰기)
- 응답 (200) `{ success, data, error }` — `data`:
  ```json
  { "settings": { "screen_wake_lock": true } }
  ```
- 401: 미인증
- 422: `screen_wake_lock`이 boolean이 아닌 경우

### PATCH /users/me (13-2)
- 권한: 🔒 로그인 필수
- Body:
  ```json
  { "nickname": "새닉네임" }
  ```
- `nickname`: string (2~30자)
- 응답 (200) `{ success, data, error }` — `data`:
  ```json
  {
    "id": "uuid",
    "nickname": "새닉네임",
    "email": "user@example.com",
    "profile_image_url": "https://...",
    "social_provider": "kakao",
    "settings": { "screen_wake_lock": true }
  }
  ```
- 401: 미인증
- 422: `nickname` 누락, 빈 문자열, 2자 미만, 30자 초과

### DELETE /users/me (13-3)
- 권한: 🔒 로그인 필수
- 서버 동작: `users.deleted_at = NOW()` (소프트 삭제)
- 응답 (200) `{ success, data, error }` — `data`:
  ```json
  { "deleted": true }
  ```
- 401: 미인증
- 멱등성: 이미 탈퇴한 사용자 → 동일 응답 200 `{ deleted: true }` (deleted_at이 이미 설정됨)

### POST /auth/logout (0-4)
- 권한: 🔒 로그인 필수
- 서버 동작: 세션/토큰 무효화
- 응답 (200) `{ success, data, error }` — `data`:
  ```json
  { "logged_out": true }
  ```
- 401: 미인증

### 공통 에러 계약
- 모든 엔드포인트: `{ success: false, data: null, error: { code, message, fields[] } }`
- 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 422 `VALIDATION_ERROR`

### 소유자 검증
- 모든 엔드포인트는 인증된 사용자 자신의 정보만 수정/삭제 가능
- 다른 유저의 리소스 접근은 구조적으로 불가능 (경로가 `/users/me`이므로 항상 자기 자신)

### 멱등성 정책
- PATCH /users/me/settings: 동일 값 재전송 시 200 + 동일 결과
- PATCH /users/me: 동일 nickname 재전송 시 200 + 동일 결과
- DELETE /users/me: 이미 탈퇴된 상태에서 재호출 시 200 + `{ deleted: true }`
- POST /auth/logout: 이미 로그아웃 상태면 401

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 설정 값 로딩 스켈레톤
  - `empty`: 해당 없음 (설정 화면은 항상 항목이 존재)
  - `error`: 설정 저장/닉네임 변경 실패 시 인라인 에러 또는 토스트
  - `read-only`: 해당 없음 (설정 화면은 항상 편집 가능)
  - `unauthorized`: 비로그인 → 로그인 게이트 모달, 로그인 성공 후 SETTINGS로 return-to-action
- 진입: MYPAGE 계정 섹션의 ⚙️ 버튼
- 형태: 별도 화면 또는 바텀시트 (화면정의서 기준)

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: 없음 (SETTINGS는 anchor screen이 아님)
- Visual artifact: `ui/designs/SETTINGS.md` (Stage 1 생성)
- Authority status: `required`
- Stage 4 evidence requirements: `mobile-default`, `mobile-narrow`
- Authority report paths: `ui/designs/authority/SETTINGS-authority.md` (Stage 4 생성 예정)
- generator artifact: `ui/designs/SETTINGS.md`
- critic artifact: `ui/designs/critiques/SETTINGS-critique.md`
- h8 matrix classification: `prototype-derived design` (SETTINGS는 별도 증거 없이 parity 승격 불가)
- Notes:
  - SETTINGS는 신규 화면이므로 design-generator + design-critic + authority review 필수
  - h8 matrix에서 `prototype-derived design`이므로 Baemin vocabulary/material은 사용하되 prototype parity 점수 기준은 불필요
  - Stage 4에서 screenshot evidence 기반 authority review 제공 예정

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.4.md` — §1-9 마이페이지 (회원정보 수정/회원탈퇴/설정)
- `docs/화면정의서-v1.5.1.md` — §19 D SETTINGS
- `docs/api문서-v1.2.2.md` — §13 설정 (13-1, 13-2, 13-3), §0-4 로그아웃
- `docs/db설계-v1.3.1.md` — §1-1 users (settings_json, nickname, deleted_at)
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`

## QA / Test Data Plan
- **fixture baseline**: 인증된 사용자 1명 (nickname, settings_json `{}` 초기값)
- **real DB smoke**: `pnpm dev:local-supabase` — 설정 변경 확인, 닉네임 변경 확인, 회원 탈퇴 + 소프트 삭제 확인, 로그아웃 확인
- **seed / reset**: `pnpm dev:demo:reset` 또는 `pnpm local:reset:demo`
- **bootstrap row 기대치**:
  - `users` 테이블: 회원가입 시 자동 생성됨 (이전 슬라이스에서 검증됨)
  - `users.settings_json`: 기본값 `{}` (빈 JSON 객체)
- **blocker 조건**:
  - `users` 테이블 부재
  - auth session/token 무효화 메커니즘 부재 (로그아웃용)

## Key Rules
- 모든 API는 `{ success, data, error }` envelope
- `/users/me` 경로이므로 항상 인증된 사용자 자신에 대해서만 동작 (타인 접근 구조적 불가)
- 닉네임 길이 제약: 2~30자 (`varchar(30)` DB 제약)
- 회원 탈퇴는 소프트 삭제 (deleted_at 세팅) — 부분 유니크 인덱스 `users_social_unique_active`, `users_email_unique_active`로 재가입 충돌 방지
- `settings_json`은 JSONB merge 업데이트 (기존 키 보존, 전달된 키만 덮어쓰기)
- 로그아웃 후 클라이언트 상태 초기화 및 HOME 또는 로그인 화면으로 리다이렉트
- 회원 탈퇴 후 클라이언트 상태 초기화 및 HOME으로 리다이렉트
- 회원 탈퇴 전 확인 다이얼로그 필수 (비가역적 행동)

## Contract Evolution Candidates (Optional)
없음. 현재 공식 문서의 API 계약으로 충분하다.

## Primary User Path
1. 사용자가 `MYPAGE` 계정 섹션의 ⚙️ 버튼을 탭하여 `SETTINGS` 화면으로 진입한다.
2. **요리모드 화면 꺼짐 방지** 토글을 ON/OFF하여 설정을 변경한다. 변경 즉시 서버에 저장된다.
3. 닉네임 변경 영역에서 새 닉네임(2~30자)을 입력하고 저장한다.
4. 로그아웃 버튼을 탭하면 확인 후 로그아웃되고 HOME으로 이동한다.
5. 회원 탈퇴 버튼을 탭하면 확인 다이얼로그가 뜨고, 확인 시 소프트 삭제 후 HOME으로 이동한다.

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [x] 백엔드 계약 고정 (`PATCH /users/me/settings`, `PATCH /users/me`, `DELETE /users/me`, `POST /auth/logout`) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (Route Handler 4개 추가) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (settings update, nickname update, delete account, logout types) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (settings PATCH 멱등, nickname 422, delete 소프트 삭제 멱등, logout 401) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (`users` 테이블, settings_json 기본값) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->

## Stage 2 Backend Evidence

- Branch: `feature/be-17c-settings-account`
- Implemented routes: `PATCH /api/v1/users/me/settings`, `PATCH /api/v1/users/me`, `DELETE /api/v1/users/me`, `POST /api/v1/auth/logout`
- TDD evidence:
  - RED: `pnpm test:product tests/settings-account.backend.test.ts` failed with missing routes/methods before implementation.
  - RED repair: non-object JSON bodies failed with uncaught PATCH route errors during Codex merge-gate review.
  - GREEN: `pnpm test:product tests/settings-account.backend.test.ts` passed after implementation and repair (12 tests).
- Deterministic gates:
  - `pnpm verify:backend` passed.
  - `pnpm test:product` passed: 55 files / 483 tests.
  - `pnpm build` passed and listed `/api/v1/auth/logout` plus `/api/v1/users/me/settings`.
- Real smoke:
  - `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` confirmed `public.users` has `nickname`, `settings_json`, and `deleted_at`.
  - Same schema check confirmed `users_email_unique_active` and `users_social_unique_active` indexes.
  - `pnpm dev:local-supabase --hostname 127.0.0.1 --port 3117` booted successfully.
  - Unauthenticated HTTP smoke returned 401 API envelopes for all four Stage 2 routes.
- Remaining Stage 2 caveat: authenticated mutation smoke is deferred to Stage 4/6 browser flow because local auth session UX is frontend-owned.
