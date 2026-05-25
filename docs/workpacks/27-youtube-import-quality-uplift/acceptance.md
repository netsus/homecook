# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Extraction Quality

- [ ] In-corpus 재료 추출 F1 >= 0.90 (50건 corpus 기준) <!-- omo:id=accept-ingredient-f1;stage=2;scope=backend;review=3,6 -->
- [ ] In-corpus 조리 과정 추출 F1 >= 0.90 (50건 corpus 기준) <!-- omo:id=accept-step-f1;stage=2;scope=backend;review=3,6 -->
- [ ] 구조화된 real-description wild fixture sample F1 >= 0.85 (최소 5채널 10영상 설명란 텍스트 fixture) <!-- omo:id=accept-wild-structured-f1;stage=2;scope=backend;review=3,6 -->
- [ ] 약한 구조/반구조 wild fixture sample F1 >= 0.70 (설명란 텍스트 fixture 기준 별도 측정) <!-- omo:id=accept-wild-weak-f1;stage=2;scope=backend;review=3,6 -->
- [ ] Multi-component recipe에서 컴포넌트별 재료 그룹화가 flat output에 반영된다 <!-- omo:id=accept-component-flat;stage=2;scope=backend;review=3,6 -->
- [ ] 다중 레시피 감지 시 `ambiguous_multi_recipe` 또는 `selected_first_candidate` 진단이 올바르다 <!-- omo:id=accept-multi-recipe-detect;stage=2;scope=backend;review=3,6 -->

## Import Readiness

- [ ] Corpus 평균 import readiness score >= 0.80 (가중 공식 적용) <!-- omo:id=accept-readiness-gate;stage=2;scope=backend;review=3,6 -->
- [ ] 추출된 재료 중 `resolved` 비율이 baseline 대비 개선된다 <!-- omo:id=accept-resolution-rate;stage=2;scope=backend;review=3,6 -->
- [ ] 추출된 step 중 instruction + cooking_method 모두 있는 비율이 baseline 대비 개선된다 <!-- omo:id=accept-step-completeness;stage=2;scope=backend;review=3,6 -->
- [ ] Blocking issue가 있는 fixture 비율이 baseline 대비 감소한다 <!-- omo:id=accept-blocking-reduction;stage=2;scope=backend;review=3,6 -->

## Corpus & Fixture

- [ ] Evidence corpus 50건 이상 확보 (기존 36+ 유지 + 신규 추가) <!-- omo:id=accept-corpus-50;stage=2;scope=backend;review=3,6 -->
- [ ] 카테고리별 최소 5건 fixture (structured / semi-structured / weak / noise / multi-recipe) <!-- omo:id=accept-category-coverage;stage=2;scope=backend;review=3,6 -->
- [ ] 전체 fixture 중 30건 이상은 real-description 기반 (개인정보/링크 제거) <!-- omo:id=accept-real-description-ratio;stage=2;scope=backend;review=3,6 -->
- [ ] Import readiness 채점 하네스가 CI에서 실행 가능하다 <!-- omo:id=accept-readiness-harness-ci;stage=2;scope=backend;review=3,6 -->
- [ ] 채점 하네스가 YouTube Data API / LLM 없이 fixture만으로 동작한다 <!-- omo:id=accept-ci-deterministic;stage=2;scope=backend;review=3,6 -->

## Happy Path

- [ ] 구조화된 설명란 YouTube URL로 추출 시 재료/과정이 정확히 추출된다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [ ] 추출 결과 검수 화면에서 resolved 재료가 수정 없이 바로 사용 가능하다 <!-- omo:id=accept-resolved-usable;stage=4;scope=frontend;review=5,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [ ] 상태 전이가 공식 문서와 일치한다 (draft → consumed / expired) <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [ ] read-only 정책이 지켜진다 (consumed session 재사용 불가) <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [ ] 중복 호출에도 결과가 꼬이지 않는다 (멱등성) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] Taxonomy freeze contract 준수: legacy 7 category만 사용 <!-- omo:id=accept-taxonomy-freeze;stage=2;scope=shared;review=3,6 -->
- [ ] Shared source 위임: `lib/ingredient-categories.ts`, `lib/cooking-method-colors.ts` <!-- omo:id=accept-shared-source;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (추출 결과 없음) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (추출 실패) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (401 → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리 흐름이 있다 (409 consumed/mismatch) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] non_recipe 분류 시 차단 + 재입력 안내가 올바르다 <!-- omo:id=accept-non-recipe-block;stage=4;scope=frontend;review=5,6 -->
- [ ] 세션 만료(410) 처리가 올바르다 <!-- omo:id=accept-session-expired;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 타인 리소스를 수정할 수 없다 (session ownership) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [ ] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [ ] 파생 필드와 비정규화 값이 맞다 (extraction_meta_json 진단 정보) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [ ] 사전 시딩 migration이 기존 데이터와 충돌하지 않는다 <!-- omo:id=accept-seed-no-conflict;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (50건 corpus) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Regression Protection

- [ ] 기존 36+ corpus fixture가 regression 없이 통과한다 <!-- omo:id=accept-corpus-regression;stage=2;scope=backend;review=3,6 -->
- [ ] pre-27 taxonomy consumer alignment 변경 사항이 유지된다 <!-- omo:id=accept-pre27-compat;stage=2;scope=shared;review=3,6 -->
- [ ] `POST /extract` 응답 shape이 변경되지 않았다 (기존 클라이언트 호환) <!-- omo:id=accept-extract-shape-compat;stage=2;scope=backend;review=3,6 -->
- [ ] dictionary resolution rate가 baseline(1.0000) 이하로 떨어지지 않는다 <!-- omo:id=accept-resolution-no-regress;stage=2;scope=backend;review=3,6 -->

## Manual QA
- verifier: 사용자 또는 수동 QA 담당자
- environment: `pnpm dev:demo` (local Supabase + demo dataset)
- scenarios:
  1. 구조화된 한국어 요리 영상 URL 5건 → 추출 → 검수 → 등록까지 full flow
  2. 반구조/약한 구조 영상 URL 3건 → 추출 결과 부분 추출 확인 + blocking issue 안내
  3. non_recipe 영상 URL 2건 → 차단 메시지 확인
  4. 미등록 재료 포함 영상 → needs_review/unresolved badge + 등록/대체 flow
  5. multi-component recipe 영상 → flat output에 component context 보존 확인

## Automation Split

### Vitest
- [ ] 파서 규칙 유닛 테스트: line feature scoring, heading detection, component recognition <!-- omo:id=accept-vitest-parser-unit;stage=2;scope=backend;review=3,6 -->
- [ ] Corpus 채점 하네스: 50건 fixture × F1 측정 (in-corpus gate) <!-- omo:id=accept-vitest-corpus-harness;stage=2;scope=backend;review=3,6 -->
- [ ] Import readiness 하네스: 가중 공식 기반 readiness score 측정 <!-- omo:id=accept-vitest-readiness;stage=2;scope=backend;review=3,6 -->
- [ ] Dictionary resolution 테스트: seed migration 후 resolution rate 측정 <!-- omo:id=accept-vitest-dictionary;stage=2;scope=backend;review=3,6 -->
- [ ] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright
- [ ] YT_IMPORT full flow E2E: URL 입력 → 추출 → 검수 → 등록 (fixture-backed) <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] 실제 YouTube Data API를 사용한 live extraction 테스트 (5+ real URLs)
- [ ] YouTube API quota 소진 시 429 응답 확인
- [ ] 실제 YouTube 영상 설명란 변경 후 재추출 결과 비교
