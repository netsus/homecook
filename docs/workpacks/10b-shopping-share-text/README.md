# Slice: 10b-shopping-share-text

## Goal
장보기 리스트의 구매 섹션 항목을 텍스트 체크리스트로 변환하여 공유할 수 있다. 팬트리 제외 섹션(`is_pantry_excluded=true`) 항목은 공유 대상에서 자동 제외되며, 사용자는 SHOPPING_DETAIL 화면의 `[공유(텍스트)]` 버튼으로 클립보드 복사 또는 OS 공유 시트를 통해 장보기 목록을 외부로 전달할 수 있다.

## Branches

- 백엔드: `feature/be-10b-shopping-share-text`
- 프론트엔드: `feature/fe-10b-shopping-share-text`

## In Scope
- 화면:
  - `SHOPPING_DETAIL` (기존 확정 화면에 `[공유(텍스트)]` 버튼 동작 연결)
- API:
  - `GET /shopping/lists/{list_id}/share-text` (장보기 공유 텍스트 생성)
- 상태 전이:
  - 없음 (읽기 전용 API, DB 상태 변경 없음)
- DB 영향:
  - `shopping_lists` (READ)
  - `shopping_list_items` (READ)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 장보기 순서 변경 (드래그&드롭) — slice 11
- 장보기 완료 처리 — slice 12a
- 팬트리 반영 선택 팝업 — slice 12b
- 장보기 기록 목록 조회 — slice 17a
- 이미지/PDF 형태 공유 — 공식 문서 범위 밖
- 쿠팡/컬리 검색 링크 — 선택 구현, 별도 후속 slice

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `10a-shopping-detail-interact` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### GET /shopping/lists/{list_id}/share-text
- **권한**: 로그인 필수 (401)
- **Path**: `list_id` (uuid)
- **Response**: `{ success, data, error }`
  - `data`: `{ text: string }`
  - `text` 형식: `"📋 3/1 장보기\n\n☐ 양파 2개 + 200g\n☐ 김치 400g\n☐ 두부 1모\n..."`
  - 포함 대상: `is_pantry_excluded=false` 항목만
  - 정렬: `sort_order ASC`, tie-break: `id ASC`
  - 제목 행: 리스트 `title` 또는 `date_range_start` 기반 날짜 표기
- **검증**:
  - 소유자 일치: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
  - 존재 여부: `list_id` 유효성 (404)
- **멱등성**: 동일 리스트에 대해 항목 상태가 변경되지 않은 한 동일 텍스트 반환
- **Error**:
  - 401: UNAUTHORIZED (토큰 없음)
  - 403: FORBIDDEN (타인 리소스 접근)
  - 404: RESOURCE_NOT_FOUND (리스트 없음)
  - 500: INTERNAL_ERROR

## Frontend Delivery Mode
- 디자인 확정 전: 기존 SHOPPING_DETAIL 화면의 `[공유(텍스트)]` 버튼에 동작 연결
- 필수 상태:
  - `loading`: 공유 텍스트 API 호출 중 (버튼 disabled 또는 spinner)
  - `empty`: 구매 섹션에 항목이 없을 때 공유 텍스트가 비어 있는 경우 (안내 toast/snackbar)
  - `error`: API 호출 실패 시 에러 toast/snackbar
  - `read-only`: 완료된 리스트에서도 공유 텍스트 생성 가능 (read-only는 수정 제한이지 조회/공유 제한이 아님)
  - `unauthorized`: 401 발생 시 로그인 안내 (실질적으로 드물지만 처리 포함)
- 공유 동작:
  1. `navigator.share` 지원 시 → Web Share API 호출
  2. 미지원 시 → `navigator.clipboard.writeText` 후 "복사되었습니다" toast
- 로그인 보호 액션: 장보기 상세는 이미 로그인 게이트 통과 후 진입하므로 return-to-action은 상위 플로우에서 처리됨

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음
- Visual artifact: 없음 (기존 confirmed SHOPPING_DETAIL 화면의 low-risk 동작 연결)
- Authority status: `not-required`
- Notes: SHOPPING_DETAIL은 10a에서 신규 화면으로 생성되어 confirmed 상태이다. 10b는 이미 화면정의서에 명시된 `[공유(텍스트)]` 버튼의 동작만 연결하는 low-risk UI change이므로 design-generator/design-critic/authority review를 생략한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.

> 2026-04-27 Codex Stage 5: 기존 confirmed `SHOPPING_DETAIL`의 low-risk 동작 연결로 lightweight design check를 수행했고, 5개 상태 / 화면정의서 액션 / token·spacing drift / a11y 기본 요소에서 blocker 0개로 `confirmed` 전환한다. Authority-required가 아니므로 Claude final authority gate는 필요 없다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` § 2-11 장보기 공유
- `docs/화면정의서-v1.5.0.md` § 12 SHOPPING_DETAIL (`[공유(텍스트)]` 버튼)
- `docs/api문서-v1.2.2.md` § 8-6 GET /shopping/lists/{id}/share-text
- `docs/db설계-v1.3.1.md` (shopping_lists, shopping_list_items)

## QA / Test Data Plan
- **Fixture baseline**:
  - 로그인 유저 1명 (auth override)
  - `shopping_lists` × 2개 (하나는 `is_completed=false`, 하나는 `is_completed=true`)
  - `shopping_list_items` × 다수 (구매 섹션 / 제외 섹션 혼합)
  - `ingredients` × 다수 (재료 마스터)
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - seed script로 위 baseline 데이터 생성 후 브라우저에서 장보기 상세 → `[공유(텍스트)]` 버튼 클릭 → 클립보드 복사 / 공유 시트 확인
- **Bootstrap 요구사항**:
  - 10a에서 이미 확보된 shopping 관련 테이블/seed 활용
  - `meal_plan_columns` (회원가입 시 자동 생성, 4끼 고정)
  - `recipe_books` (회원가입 시 기본 3개 생성)
  - owning flow: 회원가입 → 자동 생성 로직 (slice 01 bootstrap)
- **Blocker 조건**:
  - `shopping_lists`, `shopping_list_items` 테이블 부재
  - 로컬 Supabase에 seed가 없어서 리스트 조회 시 404만 나오는 상태

## Key Rules
- **공유 대상 필터**: `is_pantry_excluded=false` 항목만 공유 텍스트에 포함
  - 이유: 팬트리 제외 섹션 = "안 사는 항목"이므로 공유 목록에 포함하면 혼란
- **완료 리스트 공유 허용**: `is_completed=true`인 리스트도 공유 텍스트 생성 가능
  - read-only 정책은 수정 제한이며 조회/공유는 허용
- **소유자 검증**: `shopping_lists.user_id = 요청 user_id` (타인 리소스 403)
- **멱등성**: 동일 리스트 반복 호출 시 항목 상태 불변이면 동일 텍스트 반환
- **정렬 규칙**: `sort_order ASC`, 동일 시 `id ASC` (10a와 동일)
- **텍스트 형식**: API가 완성된 텍스트를 반환하며, 프론트는 그대로 공유/복사

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. SHOPPING_DETAIL 화면 진입 (10a에서 이미 구현된 흐름)
2. 상단 액션 영역의 `[공유(텍스트)]` 버튼 탭
3. API가 구매 섹션 항목만 포함한 텍스트 체크리스트 반환
4. Web Share API 지원 시 OS 공유 시트 표시 / 미지원 시 클립보드 복사 + "복사되었습니다" toast

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 Codex rebuttal을 받아들인 checklist는 checkbox를 바꾸지 않고 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가해 닫는다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 멱등성 테스트 <!-- omo:id=delivery-idempotency-tests;stage=2;scope=backend;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
