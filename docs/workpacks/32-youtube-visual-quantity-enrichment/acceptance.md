# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] extract 응답 `ingredients[]`에 `quantity_source`, `quantity_confidence`, `quantity_raw_text`, `quantity_evidence_refs`, `quantity_review_required`, `quantity_user_confirmed` fields가 포함된다 <!-- omo:id=accept-extract-quantity-fields;stage=2;scope=backend;review=3,6 -->
- [x] visual enrichment 활성화 시 text-only 추출에서 빠진 수량이 `visual_explicit` source로 보강된다 <!-- omo:id=accept-visual-enrichment;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_candidates[].ingredients[]`와 candidate child draft에 quantity fields가 전파된다 <!-- omo:id=accept-multi-recipe-propagation;stage=2;scope=backend;review=3,6 -->
- [x] register 시 `draft_ingredient_id`와 `quantity_confirmation_status`가 서버에서 검증된다 <!-- omo:id=accept-register-confirmation;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [x] YT_IMPORT 검수 화면에서 수량 provenance 배지가 표시된다 <!-- omo:id=accept-quantity-badges;stage=4;scope=frontend;review=5,6 -->
- [x] review-required 수량에 대해 confirm/edit/clear 인터랙션이 동작한다 <!-- omo:id=accept-review-interaction;stage=4;scope=frontend;review=5,6 -->
- [x] 대표 사용자 흐름 (URL 입력 → 추출 → 수량 확인 → 등록)이 정상 동작한다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] `quantity_review_required=true`인 수량을 `not_required`로 register 시도하면 422 반환 <!-- omo:id=accept-review-required-guard;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_inferred` source는 항상 `quantity_review_required=true`로 시작한다 <!-- omo:id=accept-recipe-inferred-review;stage=2;scope=backend;review=3,6 -->
- [x] `confirmed_suggestion` 시 body가 draft suggestion과 canonical match해야 한다 <!-- omo:id=accept-confirmed-match;stage=2;scope=backend;review=3,6 -->
- [x] `edited_quantity` 시 유효한 QUANT amount/unit이어야 한다 <!-- omo:id=accept-edited-valid;stage=2;scope=backend;review=3,6 -->
- [x] `cleared_to_taste` 시 `ingredient_type="TO_TASTE"`, `amount=null`, `unit=null`이어야 한다 <!-- omo:id=accept-cleared-to-taste;stage=2;scope=backend;review=3,6 -->
- [x] quick import에서 `quantity_review_required=true`가 하나라도 있으면 auto-register 차단 <!-- omo:id=accept-quick-import-block;stage=4;scope=frontend;review=5,6 -->
- [x] visual extractor 비활성화/실패 시 public-text-only 결과로 fallback <!-- omo:id=accept-visual-fallback;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_methods`는 `description | comment | caption`만 기록 (visual은 `source_providers`에 기록) <!-- omo:id=accept-extraction-methods;stage=2;scope=backend;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다 (cache hit 경로) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] loading 상태가 있다 (visual enrichment 진행 중 포함) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (visual extractor 실패 시 graceful fallback) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름이 있다 (session consumed 409) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인 세션을 수정할 수 없다 (404로 숨김) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 서버가 클라이언트 보낸 `quantity_review_required`를 신뢰하지 않고 draft 기준으로 판정한다 <!-- omo:id=accept-server-side-review;stage=2;scope=backend;review=3,6 -->
- [x] visual cache에 raw video/frame/provider response/secret/레시피오 data를 저장하지 않는다 <!-- omo:id=accept-cache-sanitized;stage=2;scope=backend;review=3,6 -->
- [x] visual events에 raw provider response/secret을 저장하지 않는다 <!-- omo:id=accept-events-sanitized;stage=2;scope=backend;review=3,6 -->
- [x] `OEassmynRro` hardcoding이 source에 없다 <!-- omo:id=accept-no-hardcoding;stage=2;scope=shared;review=3,6 -->
- [x] 레시피오 결과 fixture가 source에 없다 <!-- omo:id=accept-no-recipio;stage=2;scope=shared;review=3,6 -->
- [x] `recipe_sources.extraction_methods` 설명이 실제 YouTube session 값(`description | comment | caption`)과 맞다 <!-- omo:id=accept-extraction-methods-doc;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture에서 필요한 baseline 데이터 (`visual-quantity-v1.json`)가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에서 `youtube_visual_extraction_cache`/`events` 테이블이 존재하고 RLS가 적용된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] 기존 `youtube_extraction_sessions` 테이블이 real DB에 존재한다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Eval Gates

- [x] triggered fixture set `amount_coverage_ratio`가 public-text baseline 대비 절대 +0.25 이상 개선 <!-- omo:id=accept-coverage-improvement;stage=2;scope=backend;review=3,6 -->
- [x] `false_explicit_count = 0` — explicit evidence 없는 explicit quantity 없음 <!-- omo:id=accept-false-explicit-zero;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_inferred`는 human confirmation 없이 register 불가 <!-- omo:id=accept-inferred-no-auto;stage=2;scope=backend;review=3,6 -->
- [x] multi-recipe candidate child가 quantity fields를 보존한다 <!-- omo:id=accept-candidate-quantity;stage=2;scope=backend;review=3,6 -->
- [x] provider disabled/failure 시 public-text-only fallback으로 동작한다 <!-- omo:id=accept-provider-fallback;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: human (live smoke)
- environment: `pnpm dev` with `YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=true`
- scenarios:
  - `https://www.youtube.com/watch?v=OEassmynRro`에서 두부 300g, 간장 2큰술, 물 1/2 종이컵(95~100ml)이 근거와 함께 reviewable하게 보이는지 확인
  - review-required 수량을 confirm/edit/clear한 뒤 정상 등록되는지 확인
  - visual extractor를 비활성화(`YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=false`)한 상태에서 기존 text-only 추출이 정상 동작하는지 확인

## Automation Split

### Vitest
- [ ] quantity source resolver priority 단위 테스트 <!-- omo:id=accept-vitest-resolver;stage=2;scope=backend;review=3,6 -->
- [ ] unit conversion (`1/2 종이컵` → 95~100ml, `두부 1모` → 300g) 단위 테스트 <!-- omo:id=accept-vitest-conversion;stage=2;scope=backend;review=3,6 -->
- [x] register confirmation status 검증 단위 테스트 <!-- omo:id=accept-vitest-confirmation;stage=2;scope=backend;review=3,6 -->
- [x] visual cache/events 무결성 단위 테스트 <!-- omo:id=accept-vitest-cache;stage=2;scope=backend;review=3,6 -->
- [x] eval harness (`youtube-visual-quantity-eval.test.ts`) 통과 <!-- omo:id=accept-vitest-eval;stage=2;scope=backend;review=3,6 -->

### Playwright
- [x] YT_IMPORT에서 수량 배지 표시, confirm/edit/clear, register 성공 흐름 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] quick import에서 review-required 수량 존재 시 auto-register 차단 → 검수 화면 fallback <!-- omo:id=accept-playwright-quick-import;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] `OEassmynRro` live smoke: 두부/간장/물 수량이 fixture 없이 실제 provider 경로에서 추출되어 reviewable하게 보이는지 확인
- [ ] visual extractor provider가 공개 YouTube URL을 실제로 지원하는지 확인 (provider 정책 변경 가능)
