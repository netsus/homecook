# Acceptance Criteria: wave1-port-account-library-leftovers

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### MYPAGE

- [ ] MYPAGE 화면에서 프로필, 레시피북 탭, 장보기 기록 탭이 기존 API 계약으로 표시된다 <!-- omo:id=accept-mypage-base;stage=4;scope=frontend;review=5,6 -->
- [ ] profile 영역의 icon-only top gear가 제거되거나 텍스트형 설정 진입으로 정리된다 <!-- omo:id=accept-mypage-gear-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] 계정 정보 영역에는 회원탈퇴 trigger가 표시되지 않는다 <!-- omo:id=accept-mypage-no-withdrawal;stage=4;scope=frontend;review=5,6 -->
- [ ] saved recipes가 중복 section으로 노출되지 않고 레시피북 탭의 system book으로 흡수된다 <!-- omo:id=accept-mypage-saved-absorbed;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피북 탭과 장보기 기록 탭이 320px에서 label/count/action clipping 없이 동작한다 <!-- omo:id=accept-mypage-narrow-fit;stage=4;scope=frontend;review=5,6 -->

### SETTINGS

- [ ] SETTINGS 화면에서 screen wake lock, nickname, planner columns, logout, delete account가 기존 계약대로 표시된다 <!-- omo:id=accept-settings-base;stage=4;scope=frontend;review=5,6 -->
- [ ] `로그아웃` 텍스트 자체가 confirm dialog trigger로 동작한다 <!-- omo:id=accept-settings-logout-trigger;stage=4;scope=frontend;review=5,6 -->
- [ ] `회원탈퇴` 텍스트 자체가 confirm dialog trigger로 동작한다 <!-- omo:id=accept-settings-delete-trigger;stage=4;scope=frontend;review=5,6 -->
- [ ] SETTINGS account/action category가 중복 없이 정리된다 <!-- omo:id=accept-settings-category-cleanup;stage=4;scope=frontend;review=5,6 -->
- [ ] planner column management는 기본 3개, 1~5개 제한, 빈 컬럼만 삭제 가능 정책을 유지한다 <!-- omo:id=accept-settings-column-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] nickname sheet, logout confirm, delete account confirm, column dialogs가 320px에서 CTA clipping 없이 표시된다 <!-- omo:id=accept-settings-dialog-fit;stage=4;scope=frontend;review=5,6 -->

### LEFTOVERS

- [ ] LEFTOVERS 화면에서 남은요리 목록이 기존 `GET /leftovers` 계약으로 표시된다 <!-- omo:id=accept-leftovers-list;stage=4;scope=frontend;review=5,6 -->
- [ ] 남은요리 카드의 `다먹음` / `플래너에 추가` action이 320px에서 잘리지 않는다 <!-- omo:id=accept-leftovers-buttons-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] `플래너에 추가`는 기존 `POST /meals` + `leftover_dish_id` 경로를 유지한다 <!-- omo:id=accept-leftovers-planner-add-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] leftover meta는 현재 공식 응답에서 가능한 정보만 표시하고 문서에 없는 끼니명/인분 필드를 요구하지 않는다 <!-- omo:id=accept-leftovers-meta-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] 다먹음 처리 성공/실패 피드백은 기존 멱등 API 결과와 일치한다 <!-- omo:id=accept-leftovers-eat-feedback;stage=4;scope=frontend;review=5,6 -->

### ATE_LIST

- [ ] ATE_LIST 화면에서 eaten 목록이 기존 `GET /leftovers?status=eaten` 계약으로 표시된다 <!-- omo:id=accept-ate-list-base;stage=4;scope=frontend;review=5,6 -->
- [ ] ATE_LIST description/meta에서 반복 `다먹음` 텍스트가 제거되거나 최소화된다 <!-- omo:id=accept-ate-remove-repeated-eaten-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] `덜먹음` API는 유지되고, UI 노출/문구 변경 근거가 workpack 또는 authority report에 남는다 <!-- omo:id=accept-ate-uneat-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] ATE_LIST card/action layout이 320px에서 clipping 없이 표시된다 <!-- omo:id=accept-ate-narrow-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] eaten -> leftover 복귀 경로를 숨기거나 보조화하더라도 기존 backend/API 테스트는 깨지지 않는다 <!-- omo:id=accept-ate-api-preserved;stage=4;scope=frontend;review=5,6 -->

### RECIPEBOOK_DETAIL

- [ ] RECIPEBOOK_DETAIL에서 레시피 목록과 recipe removal 정책이 기존 17b 계약대로 유지된다 <!-- omo:id=accept-recipebook-detail-base;stage=4;scope=frontend;review=5,6 -->
- [ ] custom book에서 book-level kebab menu를 구현하는 경우 `이름 변경` / `삭제`는 기존 PATCH/DELETE `/recipe-books/{book_id}`를 사용한다 <!-- omo:id=accept-recipebook-custom-menu;stage=4;scope=frontend;review=5,6 -->
- [ ] system book(`my_added`, `saved`, `liked`)에는 book rename/delete menu가 표시되지 않는다 <!-- omo:id=accept-recipebook-system-no-menu;stage=4;scope=frontend;review=5,6 -->
- [ ] book-level action과 recipe-level removal action이 시각적으로 충돌하지 않는다 <!-- omo:id=accept-recipebook-action-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [ ] drift proof가 없으면 RECIPEBOOK_DETAIL 전체 재디자인은 하지 않고 low-risk reused로 유지한다 <!-- omo:id=accept-recipebook-low-risk-reused;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] `leftover_dishes.status`는 `leftover` / `eaten`만 사용한다 <!-- omo:id=accept-leftover-status-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] `POST /leftovers/{id}/eat`과 `POST /leftovers/{id}/uneat` 멱등성 기대를 유지한다 <!-- omo:id=accept-leftover-idempotency;stage=4;scope=frontend;review=5,6 -->
- [ ] `planner-column-customization` 계약을 다시 만들거나 완화하지 않는다 <!-- omo:id=accept-planner-column-contract-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] system recipe book rename/delete 금지 정책을 유지한다 <!-- omo:id=accept-system-book-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] 회원 탈퇴는 confirm dialog와 soft-delete 계약을 유지한다 <!-- omo:id=accept-delete-account-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] API 응답 `{ success, data, error }` wrapper 기대를 유지한다 <!-- omo:id=accept-api-envelope-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] 비로그인 MYPAGE 접근 시 login gate와 `/mypage` return-to-action이 유지된다 <!-- omo:id=accept-mypage-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 SETTINGS 접근 시 login gate와 `/settings` return-to-action이 유지된다 <!-- omo:id=accept-settings-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 LEFTOVERS/ATE_LIST 접근 시 현재 route return-to-action이 유지된다 <!-- omo:id=accept-leftovers-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 RECIPEBOOK_DETAIL 접근 시 detail route return-to-action이 유지된다 <!-- omo:id=accept-recipebook-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] MYPAGE/SETTINGS/LEFTOVERS/ATE_LIST/RECIPEBOOK_DETAIL loading, empty, error 상태가 유지된다 <!-- omo:id=accept-screen-states;stage=4;scope=frontend;review=5,6 -->
- [ ] logout/delete account 실패 시 confirm dialog 안에 오류가 유지되고 사용자가 복구할 수 있다 <!-- omo:id=accept-destructive-error-recovery;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] MYPAGE fixture에 profile, system books 3개, custom book 1개 이상, shopping history가 있다 <!-- omo:id=accept-fixture-mypage;stage=4;scope=frontend;review=5,6 -->
- [ ] SETTINGS fixture에 profile/settings와 planner columns 3개 이상이 있다 <!-- omo:id=accept-fixture-settings;stage=4;scope=frontend;review=5,6 -->
- [ ] LEFTOVERS fixture에 leftover items 2개 이상과 eaten items 1개 이상이 있다 <!-- omo:id=accept-fixture-leftovers;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPEBOOK_DETAIL fixture에 custom/system book case가 모두 있다 <!-- omo:id=accept-fixture-recipebook-detail;stage=4;scope=frontend;review=5,6 -->

## Design Evidence

- [ ] MYPAGE 390px + 320px screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-mypage;stage=4;scope=frontend;review=5,6 -->
- [ ] SETTINGS 390px + 320px screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-settings;stage=4;scope=frontend;review=5,6 -->
- [ ] LEFTOVERS 390px + 320px screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-leftovers;stage=4;scope=frontend;review=5,6 -->
- [ ] ATE_LIST 390px + 320px screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-ate-list;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPEBOOK_DETAIL을 실제로 건드린 경우 390px + 320px screenshot evidence가 생성된다 <!-- omo:id=accept-evidence-recipebook-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] `WAVE1_ACCOUNT_LIBRARY_LEFTOVERS` authority report가 blocker 0으로 남는다 <!-- omo:id=accept-authority-report;stage=5;scope=frontend;review=5,6 -->

## Manual Verification

### Manual Only

- [ ] 실제 기기에서 SETTINGS destructive dialog의 focus/keyboard behavior 확인
- [ ] 실제 local Supabase seed에서 custom/system recipe book menu 정책 확인
- [ ] 실제 local Supabase seed에서 leftover eaten/uneaten 흐름 확인

## Automation Split

### Vitest

- [ ] MYPAGE: 설정 진입 UI, saved section 흡수, account destructive action 미노출 확인 <!-- omo:id=test-vitest-mypage-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] SETTINGS: logout/delete text trigger, category cleanup, planner column contract regression 확인 <!-- omo:id=test-vitest-settings-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] LEFTOVERS: CTA layout/copy, planner add payload, eat feedback 확인 <!-- omo:id=test-vitest-leftovers-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] ATE_LIST: repeated copy removal, uneat API preservation 또는 UI policy 확인 <!-- omo:id=test-vitest-ate-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPEBOOK_DETAIL: custom book menu/system book no-menu/recipe removal regression 확인 <!-- omo:id=test-vitest-recipebook-detail-polish;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/unauthorized 상태 회귀 확인 <!-- omo:id=test-vitest-states;stage=4;scope=frontend;review=5,6 -->

### Playwright E2E

- [ ] MYPAGE E2E regression <!-- omo:id=test-e2e-mypage;stage=4;scope=frontend;review=5,6 -->
- [ ] SETTINGS E2E regression <!-- omo:id=test-e2e-settings;stage=4;scope=frontend;review=5,6 -->
- [ ] LEFTOVERS / ATE_LIST E2E regression <!-- omo:id=test-e2e-leftovers-ate;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPEBOOK_DETAIL E2E regression <!-- omo:id=test-e2e-recipebook-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px/390px button clipping screenshot evidence E2E <!-- omo:id=test-e2e-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->

### Exploratory QA

- [ ] `pnpm qa:explore -- --slice wave1-port-account-library-leftovers` 실행 또는 low-risk skip 근거 기록 <!-- omo:id=test-qa-explore;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA를 실행했다면 `pnpm qa:eval` score가 통과한다 <!-- omo:id=test-qa-eval;stage=4;scope=frontend;review=5,6 -->
