# Acceptance Criteria: wave1-port-shopping-cooking

## Happy Path

### Shopping Flow

- [x] SHOPPING_FLOW 프리뷰에서 `#1` 번호 라벨이 제거된다 <!-- omo:id=accept-shopping-no-number;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_FLOW 프리뷰에서 끼니 이모티콘이 제거되고 텍스트만 표시된다 <!-- omo:id=accept-shopping-no-emoji;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_FLOW 하단 생성 버튼 라벨이 정리된다 <!-- omo:id=accept-shopping-create-label;stage=4;scope=frontend;review=5,6 -->
- [x] 장보기 목록 생성 후 SHOPPING_DETAIL로 정상 이동한다 <!-- omo:id=accept-shopping-create-nav;stage=4;scope=frontend;review=5,6 -->

### Shopping Detail

- [x] SHOPPING_DETAIL title 영역에 생성 날짜와 목록명이 표시된다 <!-- omo:id=accept-detail-title;stage=4;scope=frontend;review=5,6 -->
- [x] 구매 섹션과 팬트리 제외 섹션이 명확히 분리되어 표시된다 <!-- omo:id=accept-detail-sections;stage=4;scope=frontend;review=5,6 -->
- [x] 구매 섹션 아이템에 `이미있음` 토글 버튼이 표시된다 <!-- omo:id=accept-detail-already-have;stage=4;scope=frontend;review=5,6 -->
- [x] `이미있음` 클릭 시 해당 아이템이 팬트리 제외 섹션으로 이동한다 <!-- omo:id=accept-detail-exclude-move;stage=4;scope=frontend;review=5,6 -->
- [x] 팬트리 제외 섹션 아이템에 `되살리기` 토글 버튼이 표시된다 <!-- omo:id=accept-detail-restore;stage=4;scope=frontend;review=5,6 -->
- [x] `되살리기` 클릭 시 해당 아이템이 구매 섹션으로 복귀한다 <!-- omo:id=accept-detail-restore-move;stage=4;scope=frontend;review=5,6 -->
- [x] share 버튼이 적절한 위치에 배치된다 <!-- omo:id=accept-detail-share-position;stage=4;scope=frontend;review=5,6 -->
- [x] `장보기 완료` 버튼이 하단에 sticky로 배치된다 <!-- omo:id=accept-detail-complete-bottom;stage=4;scope=frontend;review=5,6 -->

### Shopping Complete + Pantry Reflect

- [x] `장보기 완료` 클릭 시 pantry 반영 modal이 표시된다 <!-- omo:id=accept-complete-modal;stage=4;scope=frontend;review=5,6 -->
- [x] pantry 반영 modal에서 팬트리 추가할 재료를 선택할 수 있다 <!-- omo:id=accept-pantry-select;stage=4;scope=frontend;review=5,6 -->
- [x] 완료 후 shopping list가 read-only 상태로 전환된다 <!-- omo:id=accept-complete-readonly;stage=4;scope=frontend;review=5,6 -->

### Cook Ready List

- [x] COOK_READY_LIST에서 요리 가능한 식사가 날짜별 그룹으로 표시된다 <!-- omo:id=accept-cook-ready-groups;stage=4;scope=frontend;review=5,6 -->
- [x] 그룹 라벨이 깔끔하게 정리되어 표시된다 <!-- omo:id=accept-cook-ready-labels;stage=4;scope=frontend;review=5,6 -->
- [x] `요리 시작` 클릭 시 COOK_MODE로 정상 진입한다 <!-- omo:id=accept-cook-start;stage=4;scope=frontend;review=5,6 -->

### Cook Mode (Planner)

- [x] COOK_MODE에서 전체 step이 단일 스크롤 뷰로 표시된다 <!-- omo:id=accept-cook-scroll-view;stage=4;scope=frontend;review=5,6 -->
- [x] 각 step 카드에 STEP 번호, 조리방법 라벨, 내용이 표시된다 <!-- omo:id=accept-cook-step-card;stage=4;scope=frontend;review=5,6 -->
- [x] 각 step 카드에 조리방법별 색상 left border가 표시된다 <!-- omo:id=accept-cook-method-color;stage=4;scope=frontend;review=5,6 -->
- [x] timer, note, pause, prev/next 컨트롤이 표시되지 않는다 <!-- omo:id=accept-cook-no-controls;stage=4;scope=frontend;review=5,6 -->
- [x] cancel 버튼과 `요리 완료` 버튼이 하단 sticky 영역에 배치된다 <!-- omo:id=accept-cook-sticky-buttons;stage=4;scope=frontend;review=5,6 -->
- [x] cancel/complete 버튼이 320px에서도 잘리지 않는다 <!-- omo:id=accept-cook-no-clipping;stage=4;scope=frontend;review=5,6 -->
- [x] `요리 완료` 클릭 시 consumed ingredient 선택 화면이 표시된다 <!-- omo:id=accept-cook-consumed;stage=4;scope=frontend;review=5,6 -->
- [x] consumed ingredient 화면에서 줄바꿈이 정상 처리된다 <!-- omo:id=accept-cook-wrap;stage=4;scope=frontend;review=5,6 -->
- [x] 요리 완료 후 결과 표시 및 정상 종료된다 <!-- omo:id=accept-cook-complete-result;stage=4;scope=frontend;review=5,6 -->

### Cook Mode (Standalone)

- [x] RECIPE_DETAIL에서 `요리하기` 클릭 시 standalone COOK_MODE로 진입한다 <!-- omo:id=accept-standalone-enter;stage=4;scope=frontend;review=5,6 -->
- [x] standalone COOK_MODE에서도 전체 step 스크롤 뷰가 동일하게 적용된다 <!-- omo:id=accept-standalone-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] standalone 완료 후 정상 종료된다 <!-- omo:id=accept-standalone-complete;stage=4;scope=frontend;review=5,6 -->

## State / Policy

### Read-only Completed Shopping List

- [x] 완료된 장보기 목록에서 아이템 체크/제외 UI가 숨겨진다 <!-- omo:id=accept-readonly-no-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] 완료된 장보기 목록에서 reorder가 비활성이다 <!-- omo:id=accept-readonly-no-reorder;stage=4;scope=frontend;review=5,6 -->
- [x] 완료된 장보기 목록에서 complete 버튼이 숨겨진다 <!-- omo:id=accept-readonly-no-complete;stage=4;scope=frontend;review=5,6 -->
- [x] 완료된 장보기 목록에서 share 버튼은 여전히 동작한다 <!-- omo:id=accept-readonly-share-ok;stage=4;scope=frontend;review=5,6 -->

### 409 Conflict — Completed List Mutation

- [x] 완료된 목록에서 mutation 시도 시 409 응답을 받으면 read-only 상태로 전환한다 <!-- omo:id=accept-409-readonly;stage=4;scope=frontend;review=5,6 -->

### Exclude / Uncheck Rule

- [x] `이미있음`(exclude) 설정 시 서버가 자동으로 `is_checked=false` 처리하며 FE가 이를 반영한다 <!-- omo:id=accept-exclude-uncheck;stage=4;scope=frontend;review=5,6 -->

### Pantry Add 3-Way Semantics

- [x] pantry 반영 modal 기본값(모두 추가)은 `add_to_pantry_item_ids: null`을 전송한다 <!-- omo:id=accept-pantry-default-null;stage=4;scope=frontend;review=5,6 -->
- [x] pantry 반영 modal에서 아무것도 선택하지 않으면 `add_to_pantry_item_ids: []`를 전송한다 <!-- omo:id=accept-pantry-select-none;stage=4;scope=frontend;review=5,6 -->
- [x] pantry 반영 modal에서 일부만 선택하면 선택한 item ids를 전송한다 <!-- omo:id=accept-pantry-selected-ids;stage=4;scope=frontend;review=5,6 -->
- [x] 유효하지 않은 item id가 `add_to_pantry_item_ids`에 포함되어도 서버가 무시하며 FE는 오류를 표시하지 않는다 <!-- omo:id=accept-pantry-invalid-ids;stage=4;scope=frontend;review=5,6 -->
- [x] 완료 응답의 `pantry_added` count가 실제 반영된 아이템 수와 일치한다 <!-- omo:id=accept-pantry-count-match;stage=4;scope=frontend;review=5,6 -->

### Planner vs Standalone Cooking Separation

- [x] planner 경로 요리 완료 시 `POST /cooking/sessions/{id}/complete`를 사용한다 <!-- omo:id=accept-planner-cook-api;stage=4;scope=frontend;review=5,6 -->
- [x] standalone 경로 요리 완료 시 `POST /cooking/standalone-complete`를 사용한다 <!-- omo:id=accept-standalone-cook-api;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] 비로그인 상태에서 shopping/cooking 화면 접근 시 login gate가 표시된다 <!-- omo:id=accept-err-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] 존재하지 않는 장보기 목록 접근 시 404 에러 처리가 동작한다 <!-- omo:id=accept-err-404-shopping;stage=4;scope=frontend;review=5,6 -->
- [x] 존재하지 않는 요리 세션 접근 시 404 에러 처리가 동작한다 <!-- omo:id=accept-err-404-cooking;stage=4;scope=frontend;review=5,6 -->
- [x] 타인의 장보기 목록 접근 시 403 에러 처리가 동작한다 <!-- omo:id=accept-err-403-shopping;stage=4;scope=frontend;review=5,6 -->

## Design Evidence

- [x] Screenshot evidence가 Stage 4 완료 시 생성된다 (390px + 320px) <!-- omo:id=accept-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE의 모바일 스크롤 UX evidence가 포함된다 <!-- omo:id=accept-cook-mode-evidence;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- 기존 QA fixture 서버의 shopping/cooking mock 데이터 사용
- 장보기 목록: 미완료 목록 1개 (아이템 5+, 팬트리 제외 아이템 2+), 완료된 목록 1개
- 요리 세션: `shopping_done` 상태 식사 2+ 포함, 레시피 1+
- 독립 요리: 레시피 1+ (ingredients, steps 포함)

## Manual Verification

### Manual Only

- [ ] 실제 기기에서 COOK_MODE 스크롤 UX 확인 (step 카드 가독성, sticky 버튼 위치)
- [ ] 실제 기기에서 Web Share API 동작 확인 (HTTPS 환경)

## Automation Split

### Vitest (Stage 4)

- [x] SHOPPING_FLOW: 번호 라벨 제거 확인 <!-- omo:id=test-vitest-shopping-no-number;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_FLOW: 이모티콘 제거 확인 <!-- omo:id=test-vitest-shopping-no-emoji;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL: 구매/제외 섹션 분리 렌더 확인 <!-- omo:id=test-vitest-detail-sections;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL: `이미있음`/`되살리기` 토글 확인 <!-- omo:id=test-vitest-detail-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL: title/date 표시 확인 <!-- omo:id=test-vitest-detail-title;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_DETAIL: complete 버튼 하단 배치 확인 <!-- omo:id=test-vitest-detail-complete-pos;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE: 전체 step 스크롤 뷰 렌더 확인 <!-- omo:id=test-vitest-cook-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE: timer/note/pause/prev/next 부재 확인 <!-- omo:id=test-vitest-cook-no-controls;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE: cancel/complete 하단 sticky 확인 <!-- omo:id=test-vitest-cook-sticky;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE: consumed ingredient 줄바꿈 확인 <!-- omo:id=test-vitest-cook-wrap;stage=4;scope=frontend;review=5,6 -->
- [x] COOK_MODE: standalone 동일 변경 확인 <!-- omo:id=test-vitest-standalone;stage=4;scope=frontend;review=5,6 -->

### Playwright E2E (Stage 4)

- [x] Shopping flow preview -> create -> detail E2E 회귀 <!-- omo:id=test-e2e-shopping-flow;stage=4;scope=frontend;review=5,6 -->
- [x] Shopping detail check/exclude/toggle E2E <!-- omo:id=test-e2e-shopping-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] Shopping complete + pantry reflect E2E 회귀 <!-- omo:id=test-e2e-shopping-complete;stage=4;scope=frontend;review=5,6 -->
- [x] Cook ready list -> session start E2E 회귀 <!-- omo:id=test-e2e-cook-start;stage=4;scope=frontend;review=5,6 -->
- [x] Cook mode scroll view + complete E2E <!-- omo:id=test-e2e-cook-mode;stage=4;scope=frontend;review=5,6 -->
- [x] Standalone cook mode E2E 회귀 <!-- omo:id=test-e2e-standalone;stage=4;scope=frontend;review=5,6 -->
- [x] Shopping detail read-only completed list E2E <!-- omo:id=test-e2e-shopping-readonly;stage=4;scope=frontend;review=5,6 -->
