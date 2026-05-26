# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Provider Adapter & Capability Gate

- [x] `TranscriptProvider` adapter 인터페이스가 구현되어 있다 (source 교체/비활성화가 구현체 교체만으로 가능) <!-- omo:id=accept-provider-adapter;stage=2;scope=backend;review=3,6 -->
- [x] `videos.list contentDetails.caption` 필드를 자막 존재 여부의 저비용 capability 신호로 사용한다 <!-- omo:id=accept-caption-capability-signal;stage=2;scope=backend;review=3,6 -->
- [x] Stage 2 feasibility 검증 결과가 README 또는 PR에 문서화되어 있다 (compliant source 사용 가능 여부) <!-- omo:id=accept-feasibility-documented;stage=2;scope=backend;review=3,6 -->

## Transcript Fallback Extraction (provider가 있는 경우)

- [x] Description에서 재료 >= 1건 추출, concrete step == 0건일 때 transcript fallback이 자동 시도된다 <!-- omo:id=accept-transcript-trigger;stage=2;scope=backend;review=3,6 -->
- [x] Compliant provider가 transcript를 제공하면 결정론 파서로 조리 과정을 추출한다 <!-- omo:id=accept-transcript-step-extract;stage=2;scope=backend;review=3,6 -->
- [x] Transcript에서 추출된 step이 `data.steps[]` 기존 shape에 맞게 반환된다 <!-- omo:id=accept-transcript-step-shape;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_methods`에 `"caption"`이 포함된다 (compliant provider가 실제 step 텍스트를 제공하고 파서가 step을 추출한 경우에만) <!-- omo:id=accept-extraction-methods-caption;stage=2;scope=backend;review=3,6 -->
- [x] `extraction_meta_json`에 provider 사용 여부 / transcript 가용성 진단 정보가 기록된다 <!-- omo:id=accept-transcript-meta-diagnostic;stage=2;scope=backend;review=3,6 -->
- [x] Transcript 시도했지만 step 추출 실패 시 `extraction_methods`는 `["description"]`만 남긴다 <!-- omo:id=accept-extraction-methods-no-false-caption;stage=2;scope=backend;review=3,6 -->

## No-Provider Fallback Path

- [x] Transcript provider가 미가용/비활성일 때 extraction이 description-only partial draft를 정상 반환한다 <!-- omo:id=accept-no-provider-description-only;stage=2;scope=backend;review=3,6 -->
- [x] Provider 미가용 시 `extraction_methods`는 `["description"]`만 포함한다 (caption을 거짓으로 포함하지 않음) <!-- omo:id=accept-no-provider-methods-honest;stage=2;scope=backend;review=3,6 -->
- [x] Provider 미가용 시 `extraction_meta_json`에 provider 상태가 기록된다 (no_provider / disabled / error 등) <!-- omo:id=accept-no-provider-meta-recorded;stage=2;scope=backend;review=3,6 -->
- [x] Provider adapter가 no-op인 경우에도 부분 draft가 세션에 저장되고 사용자가 검수할 수 있다 <!-- omo:id=accept-no-provider-draft-saved;stage=2;scope=backend;review=3,6 -->
- [x] UI에서 caption fallback이 발생하지 않았음을 pretend하지 않는다 (description-only 결과를 그대로 표시) <!-- omo:id=accept-no-provider-ui-honest;stage=4;scope=frontend;review=5,6 -->
- [x] Provider 미가용 시 사용자에게 step 수동 추가를 안내하는 UX가 동작한다 ("조리 과정을 직접 입력해주세요") <!-- omo:id=accept-no-provider-manual-guidance;stage=4;scope=frontend;review=5,6 -->

## Partial Draft UX

- [x] 재료는 있지만 step이 없는 부분 추출 draft가 세션에 저장된다 <!-- omo:id=accept-partial-draft-save;stage=2;scope=backend;review=3,6 -->
- [x] 검수 화면에서 부분 추출 안내 메시지가 표시된다 ("조리 과정을 직접 입력해주세요") <!-- omo:id=accept-partial-draft-guidance;stage=4;scope=frontend;review=5,6 -->
- [x] 부분 추출 상태에서 사용자가 step을 수동 추가하면 등록 활성화 조건을 만족할 수 있다 <!-- omo:id=accept-partial-manual-step-add;stage=4;scope=frontend;review=5,6 -->
- [x] `extraction_methods` 배열이 검수 화면에서 표시된다 (실제 사용된 소스만) <!-- omo:id=accept-extraction-methods-display;stage=4;scope=frontend;review=5,6 -->

## Happy Path

- [x] Transcript provider 가용 영상: 재료(description) + 조리 과정(transcript) 추출 → 검수 → 등록 full flow 동작 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] Provider 미가용 영상: 재료(description) 추출 → 부분 draft 안내 → 사용자 step 입력 → 등록 full flow 동작 <!-- omo:id=accept-happy-path-no-provider;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] 상태 전이가 공식 문서와 일치한다 (draft → consumed / expired) <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] read-only 정책이 지켜진다 (consumed session 재사용 불가) <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다 (멱등성) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] Taxonomy freeze contract 준수: legacy 7 category만 사용 <!-- omo:id=accept-taxonomy-freeze;stage=2;scope=shared;review=3,6 -->
- [x] Description/transcript 모두에서 구체적 조리 텍스트가 없는 영상은 registration-ready로 주장하지 않는다 <!-- omo:id=accept-no-false-ready;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] loading 상태가 있다 (ExtractionProgressStep: transcript fallback 시도 포함) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (재료/과정 모두 없음 → 기존 메시지 유지) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (추출 실패 → ExtractionErrorStep 유지) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (401 → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름이 있다 (409 consumed/mismatch → error modal) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] 세션 만료(410) 처리가 올바르다 <!-- omo:id=accept-session-expired;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 (session ownership) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 파생 필드와 비정규화 값이 맞다 (extraction_meta_json 진단 정보) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [x] Transcript raw text가 `raw_source_text` 또는 `extraction_meta_json`에 보존된다 (provider 사용 시) <!-- omo:id=accept-transcript-text-preserved;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (transcript fixture + provider adapter mock 포함) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 (신규 DDL/seed 없음, 기존 YouTube import tables/RPC 사용) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 (N/A: 신규 system row 없음) <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Regression Protection

- [x] 기존 slice 27 corpus 50건 fixture가 regression 없이 통과한다 <!-- omo:id=accept-corpus-regression;stage=2;scope=backend;review=3,6 -->
- [x] `POST /extract` 응답 shape이 변경되지 않았다 (기존 클라이언트 호환) <!-- omo:id=accept-extract-shape-compat;stage=2;scope=backend;review=3,6 -->
- [x] dictionary resolution rate가 baseline(1.0000) 이하로 떨어지지 않는다 <!-- omo:id=accept-resolution-no-regress;stage=2;scope=backend;review=3,6 -->
- [x] 기존 description-only 추출 경로가 transcript fallback 추가 후에도 동일 결과를 반환한다 <!-- omo:id=accept-description-only-compat;stage=2;scope=backend;review=3,6 -->

## Manual QA
- verifier: 사용자 또는 수동 QA 담당자
- environment: `pnpm dev:demo` (local Supabase + demo dataset)
- scenarios:
  1. Live smoke 5건 partial blocked 영상 (재료 있지만 step 없음) → transcript fallback 시도 → 결과 확인
  2. Transcript provider 가용 영상 → extraction_methods에 caption 표기 확인
  3. Provider 미가용 영상 → description-only 결과 + 부분 draft 안내 확인 + caption pretend 없음 확인
  4. 부분 draft에서 사용자 step 수동 추가 → 등록까지 full flow
  5. 기존 구조화된 설명란 영상 → transcript fallback 시도 없이 정상 추출 확인 (regression)
  6. No-provider adapter 상태에서 전체 YT_IMPORT flow가 정상 동작하는지 확인

## Automation Split

### Vitest
- [x] TranscriptProvider adapter 인터페이스 / no-op 구현 유닛 테스트 <!-- omo:id=accept-vitest-provider-adapter;stage=2;scope=backend;review=3,6 -->
- [x] Transcript fallback 트리거 조건 유닛 테스트 (재료 있고 step 없을 때만 시도) <!-- omo:id=accept-vitest-transcript-trigger;stage=2;scope=backend;review=3,6 -->
- [x] Transcript 텍스트에서 step 파싱 유닛 테스트 (provider가 있는 경우) <!-- omo:id=accept-vitest-transcript-parser;stage=2;scope=backend;review=3,6 -->
- [x] Provider mock 통합 테스트 (가용/미가용/실패/no-op 케이스) <!-- omo:id=accept-vitest-provider-integration;stage=2;scope=backend;review=3,6 -->
- [x] Extraction methods 배열 정직성 테스트 (실제 step 제공 시에만 caption, 아니면 description-only) <!-- omo:id=accept-vitest-extraction-methods;stage=2;scope=backend;review=3,6 -->
- [x] No-provider path 통합 테스트 (adapter no-op → description-only partial draft 정상 반환) <!-- omo:id=accept-vitest-no-provider-path;stage=2;scope=backend;review=3,6 -->
- [x] 기존 corpus regression 하네스 통과 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright
- [x] Transcript fallback full flow E2E: 재료(description) + step(transcript) → 검수 → 등록 (fixture-backed, provider mock) <!-- omo:id=accept-playwright-transcript-flow;stage=4;scope=frontend;review=5,6 -->
- [x] Partial draft / no-provider flow E2E: 재료만 추출 → 부분 안내 → step 수동 입력 → 등록 <!-- omo:id=accept-playwright-partial-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 description-only flow regression E2E <!-- omo:id=accept-playwright-description-regression;stage=4;scope=frontend;review=5,6 -->
- [x] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] 실제 YouTube transcript source를 사용한 live transcript fallback 테스트 (5건 partial blocked URLs)
- [ ] YouTube API quota 소진 시 transcript provider graceful degradation 확인
- [ ] Feasibility 검증: compliant no-LLM transcript source 사용 가능 여부 실제 테스트
