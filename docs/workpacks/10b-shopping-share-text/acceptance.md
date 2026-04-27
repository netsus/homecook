# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] 대표 사용자 흐름이 정상 동작한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
  - SHOPPING_DETAIL 진입 → `[공유(텍스트)]` 버튼 탭 → 공유 텍스트 생성 → 클립보드 복사 또는 OS 공유 시트
- [ ] 문서 기준 화면 상태와 액션이 맞다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
  - 상단 액션 영역에 `[공유(텍스트)]` 버튼 존재
  - 버튼 탭 시 공유 텍스트가 생성되어 공유/복사됨
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
  - `GET /shopping/lists/{id}/share-text` 응답 타입 `{ text: string }`

## State / Policy
- [x] 공유 텍스트에 `is_pantry_excluded=false` 항목만 포함된다 <!-- omo:id=accept-share-filter;stage=2;scope=backend;review=3,6 -->
  - `is_pantry_excluded=true` 항목은 공유 텍스트에서 제외
- [x] 완료 리스트(`is_completed=true`)에서도 공유 텍스트 생성이 가능하다 <!-- omo:id=accept-completed-list-share;stage=2;scope=backend;review=3,6 -->
  - read-only 정책은 수정 제한이며 조회/공유는 허용
- [x] 중복 호출에도 결과가 꼬이지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
  - 동일 리스트 반복 호출 시 항목 상태 불변이면 동일 텍스트 반환

## Error / Permission
- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
  - 공유 텍스트 API 호출 중 버튼 disabled 또는 spinner
- [ ] empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
  - 구매 섹션 항목이 0개일 때 (모두 `is_pantry_excluded=true`) 프론트엔드가 empty-state UX를 결정적으로 표시하고, 팬트리 제외 항목을 공유 텍스트에 포함하지 않는다
- [ ] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
  - API 호출 실패 시 에러 toast/snackbar
- [ ] unauthorized 처리 흐름이 있다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
  - 401 발생 시 로그인 안내 (실질적으로 드물지만 처리 포함)
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
  - 상위 플로우(장보기 생성)에서 이미 로그인 게이트 통과, N/A로 처리 가능

## Data Integrity
- [x] 타인 리소스의 공유 텍스트를 조회할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
  - `shopping_lists.user_id = 요청 user_id` 검증 (403), 읽기 전용 API이므로 수정이 아닌 무단 조회/공유 차단
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
  - 존재하지 않는 list_id → 404

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
  - 로그인 유저 1명
  - `shopping_lists` × 2개 (`is_completed=false` / `true`)
  - `shopping_list_items` × 다수 (구매/제외 섹션 혼합)
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
  - `shopping_lists`, `shopping_list_items` 테이블
  - seed script로 위 baseline 데이터 생성
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
  - 10a에서 이미 확보된 shopping 관련 테이블/seed 활용

## Manual QA
- verifier: (Stage 4에서 기입)
- environment: (Stage 4에서 기입)
- scenarios:
  1. SHOPPING_DETAIL 진입 → `[공유(텍스트)]` 버튼 확인
  2. 구매 섹션 항목이 있는 리스트에서 공유 → 텍스트에 구매 항목만 포함 확인
  3. 팬트리 제외 항목이 공유 텍스트에서 빠져 있는지 확인
  4. 완료된 리스트에서도 공유 버튼이 동작하는지 확인
  5. 구매 섹션이 비어 있을 때(모두 제외) 공유 시 안내 메시지 확인
  6. Web Share API 미지원 환경에서 클립보드 복사 + toast 확인

## Automation Split

### Vitest
- [x] 로직 / 유틸 / API helper 범위가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
  - 공유 텍스트 필터링 로직 단위 테스트 (`is_pantry_excluded=false`만 포함)
  - 텍스트 포맷팅 로직 단위 테스트
- [x] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->
  - `is_pantry_excluded=true` 항목이 공유 텍스트에 포함되지 않음
  - 완료 리스트에서도 공유 텍스트 생성 가능

### Playwright
- [ ] 실제 사용자 흐름, 라우팅, 모달, 권한 게이트가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
  - SHOPPING_DETAIL 진입 → `[공유(텍스트)]` 버튼 탭 → 클립보드 복사 확인
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->
  - N/A (외부 연동 없음)

### Manual Only
- [ ] 자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다
  - Web Share API는 HTTPS + 실제 디바이스에서만 동작하므로 OS 공유 시트 호출은 수동 확인 대상
