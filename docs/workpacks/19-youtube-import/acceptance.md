# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Happy Path

- [ ] URL 입력 → 검증(레시피 영상 확인) → 추출 → 검수/수정 → [레시피 등록] → 레시피 생성 성공 <!-- omo:id=19-accept-happy-import-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] `POST /recipes/youtube/validate` 응답이 `{ success: true, data: { is_valid_url, is_recipe_video, video_info }, error: null }` 형식 <!-- omo:id=19-accept-validate-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] `POST /recipes/youtube/extract` 응답이 `{ success: true, data: { extraction_id, title, ingredients, steps, new_cooking_methods, ... }, error: null }` 형식 <!-- omo:id=19-accept-extract-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] `POST /recipes/youtube/register` 응답이 `{ success: true, data: { recipe_id, title }, error: null }` 형식 <!-- omo:id=19-accept-register-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 타입과 프론트 타입 일치 (request/response/error 형식) <!-- omo:id=19-accept-types-match;stage=4;scope=shared;review=6 -->
- [ ] 등록 완료 후 my_added 가상 책 반영 확인 (MYPAGE → my_added → 방금 등록한 레시피 존재, `recipes.created_by + source_type='youtube'` 조건) <!-- omo:id=19-accept-my-added-reflection;stage=4;scope=frontend;review=6 -->

## State / Policy

- [ ] 비레시피 영상 판정 시 `[다시 입력]` / `[그래도 진행]` 분기 동작 <!-- omo:id=19-accept-non-recipe-branch;stage=4;scope=frontend;review=5,6 -->
- [ ] 추출 단계에서 미분류 조리방법이 `cooking_methods` INSERT됨 (`is_system=false`, `color_key='unassigned'`) <!-- omo:id=19-accept-new-cooking-method;stage=2;scope=backend;review=3,6 -->
- [ ] 등록 시 `source_type='youtube'`, `created_by=current_user.id` 자동 설정 <!-- omo:id=19-accept-source-type-owner;stage=2;scope=backend;review=3,6 -->
- [ ] 등록 시 `recipe_sources` INSERT 완료 (`youtube_url`, `youtube_video_id`, `extraction_methods`, `extraction_meta_json`, `raw_extracted_text`) <!-- omo:id=19-accept-recipe-sources-insert;stage=2;scope=backend;review=3,6 -->
- [ ] my_added 가상 책은 `recipes.created_by + source_type IN ('youtube','manual')` 조건으로 구현, `recipe_book_items` INSERT 없음 <!-- omo:id=19-accept-my-added-virtual-book;stage=2;scope=backend;review=3,6 -->
- [ ] `ingredient_type='QUANT'` 재료는 `amount > 0`, `unit` 필수 <!-- omo:id=19-accept-quant-validation;stage=2;scope=backend;review=3,6 -->
- [ ] `ingredient_type='TO_TASTE'` 재료는 `amount=null`, `unit=null` <!-- omo:id=19-accept-to-taste-validation;stage=2;scope=backend;review=3,6 -->
- [ ] `step_number`는 1부터 시작, 중복 불가 <!-- omo:id=19-accept-step-number-unique;stage=2;scope=backend;review=3,6 -->
- [ ] `cooking_method_id` 필수이며 존재하는 조리방법이어야 함 (부재 시 422) <!-- omo:id=19-accept-cooking-method-exists;stage=2;scope=backend;review=3,6 -->
- [ ] 검수 단계에서만 수동 편집 허용 (URL 입력/추출 단계에서는 사용자 직접 입력 불가) <!-- omo:id=19-accept-manual-edit-review-only;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] 비로그인 시 `POST /recipes/youtube/validate` 호출 → `401 Unauthorized` <!-- omo:id=19-accept-validate-unauthorized;stage=2;scope=backend;review=3,6 -->
- [ ] 비로그인 시 `POST /recipes/youtube/extract` 호출 → `401 Unauthorized` <!-- omo:id=19-accept-extract-unauthorized;stage=2;scope=backend;review=3,6 -->
- [ ] 비로그인 시 `POST /recipes/youtube/register` 호출 → `401 Unauthorized` <!-- omo:id=19-accept-register-unauthorized;stage=2;scope=backend;review=3,6 -->
- [ ] 유효하지 않은 URL 형식 시 `422 Validation Error` + fields 상세 <!-- omo:id=19-accept-invalid-url-422;stage=2;scope=backend;review=3,6 -->
- [ ] register 필수 필드 누락 시 `422 Validation Error` + fields 상세 <!-- omo:id=19-accept-register-validation-422;stage=2;scope=backend;review=3,6 -->
- [ ] 추출 실패(외부 서비스 장애 등) 시 `500` 적절 처리 <!-- omo:id=19-accept-extract-500;stage=2;scope=backend;review=3,6 -->
- [ ] UI에서 `loading` 상태 존재 (검증 중, 추출 중, 등록 중) <!-- omo:id=19-accept-loading-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] UI에서 `error` 상태 존재 (검증 실패, 추출 실패, 등록 실패 시 에러 안내 + [다시 시도]) <!-- omo:id=19-accept-error-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 시 로그인 게이트 → 로그인 후 import 폼 자동 복귀 (return-to-action) <!-- omo:id=19-accept-login-gate-return;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 등록 시 `recipe_sources.youtube_video_id`가 URL에서 올바르게 파싱됨 <!-- omo:id=19-accept-video-id-parse;stage=2;scope=backend;review=3,6 -->
- [ ] `extraction_methods` 배열이 실제 사용된 추출 방식만 포함 <!-- omo:id=19-accept-extraction-methods-accurate;stage=2;scope=backend;review=3,6 -->
- [ ] 동일 레시피에서 재료 `sort_order` 중복 없음 <!-- omo:id=19-accept-ingredient-sort-unique;stage=2;scope=backend;review=3,6 -->
- [ ] 동일 레시피에서 스텝 `step_number` 중복 없음 <!-- omo:id=19-accept-step-number-unique-db;stage=2;scope=backend;review=3,6 -->
- [ ] `display_text`는 추출/수정 결과 원문 보존 <!-- omo:id=19-accept-display-text-preserve;stage=2;scope=backend;review=3,6 -->
- [ ] 미분류 조리방법 중복 생성 방지 (같은 label/code가 이미 존재하면 기존 ID 반환) <!-- omo:id=19-accept-cooking-method-dedup;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] fixture에 조리방법 seed 8종 존재 <!-- omo:id=19-accept-fixture-cooking-methods;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 조리방법 seed 투입 확인 <!-- omo:id=19-accept-real-cooking-methods;stage=2;scope=shared;review=3,6 -->
- [ ] `recipe_sources` 테이블이 DB에 존재 확인 <!-- omo:id=19-accept-recipe-sources-table;stage=2;scope=shared;review=3,6 -->
- [ ] fixture에 재료 마스터 최소 10종 이상 존재 <!-- omo:id=19-accept-fixture-ingredients;stage=2;scope=shared;review=3,6 -->
- [ ] 회원가입 시 my_added 시스템 책 row 자동 생성 확인 <!-- omo:id=19-accept-bootstrap-my-added-row;stage=2;scope=shared;review=3,6 -->
- [ ] 회원가입 시 meal_plan_columns 4개 자동 생성 확인 <!-- omo:id=19-accept-bootstrap-columns;stage=2;scope=shared;review=3,6 -->
- [ ] YouTube 추출 stub fixture 존재 (유효 레시피 영상, 비레시피 영상, 추출 실패 시나리오) <!-- omo:id=19-accept-youtube-stub-fixture;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Codex Stage 4/5/6 closeout
- environment: local Playwright fixtures (`http://127.0.0.1:3100`), local visual authority capture, local Supabase smoke (`http://127.0.0.1:3128`), demo smoke (`http://127.0.0.1:3130`)
- scenarios:
  - 유튜브 URL 입력 → 검증 (레시피 영상) → 추출 → 검수(재료/스텝 편집) → 등록 → my_added 확인
  - 비레시피 영상 URL → "이 영상은 요리 레시피가 아닌 것 같아요" → [다시 입력] → 새 URL 입력
  - 비레시피 영상 URL → [그래도 진행] → 추출 → 검수 → 등록 성공
  - 등록 후 "이 끼니에 추가" → 계획 인분 입력 → MEAL_SCREEN 복귀 → 식사 존재 확인
  - 비로그인 상태에서 URL 입력 시도 → 로그인 게이트 → 로그인 후 import 폼 복귀 확인
  - 추출 결과에 미분류 조리방법 포함 → "신규" 라벨 표시 확인 → 검수에서 다른 조리방법으로 변경 가능 확인

## Automation Split

### Vitest

- [ ] URL 검증 로직 (유효 URL/무효 URL 판정, 비레시피 영상 분기) <!-- omo:id=19-vitest-url-validate;stage=2;scope=backend;review=3,6 -->
- [ ] 추출 파이프라인 로직 (설명란 파싱, 미분류 조리방법 생성) <!-- omo:id=19-vitest-extract;stage=2;scope=backend;review=3,6 -->
- [ ] register validation 로직 (필수 필드, 재료 타입, 스텝 번호 중복) <!-- omo:id=19-vitest-register-validation;stage=2;scope=backend;review=3,6 -->
- [ ] recipe_sources INSERT 로직 (youtube_video_id 파싱, extraction_methods 저장) <!-- omo:id=19-vitest-recipe-sources;stage=2;scope=backend;review=3,6 -->
- [ ] 미분류 조리방법 중복 방지 로직 <!-- omo:id=19-vitest-cooking-method-dedup;stage=2;scope=backend;review=3,6 -->
- [ ] my_added 가상 책 반영 로직 (`source_type='youtube'` 조건) <!-- omo:id=19-vitest-my-added;stage=2;scope=backend;review=3,6 -->

### Playwright

- [ ] 유튜브 레시피 import happy path (URL 입력 → 검증 → 추출 → 검수 → 등록 → 성공) <!-- omo:id=19-playwright-happy-import;stage=4;scope=frontend;review=5,6 -->
- [ ] 비레시피 영상 분기 (URL 입력 → 검증 → "다시 입력" / "그래도 진행") <!-- omo:id=19-playwright-non-recipe-branch;stage=4;scope=frontend;review=5,6 -->
- [ ] 검수 편집 flow (추출 결과에서 재료 수정, 스텝 수정, 조리방법 변경) <!-- omo:id=19-playwright-review-edit;stage=4;scope=frontend;review=5,6 -->
- [ ] 등록 후 끼니 추가 flow (등록 → "이 끼니에 추가" → 계획 인분 입력 → MEAL_SCREEN 복귀) <!-- omo:id=19-playwright-post-register-meal;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 + return-to-action (비로그인 import 시도 → 로그인 → import 폼 복귀) <!-- omo:id=19-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] my_added 가상 책 반영 확인 (MYPAGE → my_added → 방금 등록한 유튜브 레시피 존재) <!-- omo:id=19-playwright-my-added-check;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 YouTube Data API를 사용한 live 영상 검증/추출 확인 (외부 서비스 의존, deterministic 불가)
- [ ] 다양한 유튜브 URL 형식 호환성 확인 (youtu.be, youtube.com/shorts, 플레이리스트 내 영상 등 — 실제 YouTube URL 파서 동작 의존)
- [ ] 미분류 조리방법 색상 시각 구분 확인 (`color_key='unassigned'` fallback 색상이 시각적으로 명확한지 — COOK_MODE에서 확인)
