# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 확인처럼 evidence가 생긴 뒤에만 한다.
> BE-only 슬라이스이므로 Stage 3 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] 개선된 파서로 corpus fixture 전체를 채점한 결과 in-corpus 평균 F1 >= 0.80 — hardening 0.9160 <!-- omo:id=accept-corpus-avg-f1;stage=2;scope=backend;review=3 -->
- [x] parser-hardening 보고서가 `tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json`에 저장된다 <!-- omo:id=accept-hardening-report-saved;stage=2;scope=backend;review=3 -->
- [x] 보고서 JSON이 기존 baseline-v2 artifact schema와 동일 형식을 따른다 <!-- omo:id=accept-report-schema-match;stage=2;scope=backend;review=3 -->
- [x] baseline-v2 대비 before/after 비교가 가능하다 (같은 corpus, 같은 schema) <!-- omo:id=accept-before-after-comparable;stage=2;scope=backend;review=3 -->
- [x] `POST /api/v1/recipes/youtube/extract` 의 public response envelope `{ success, data, error }`가 변경되지 않았다 <!-- omo:id=accept-api-envelope-unchanged;stage=2;scope=backend;review=3 -->

## State / Policy

- [x] 파서 개선이 결정론적이다 — 같은 설명란 입력에 항상 같은 추출 결과 <!-- omo:id=accept-deterministic-parser;stage=2;scope=backend;review=3 -->
- [x] semi-structured 카테고리 평균 F1이 baseline(0.1799) 대비 개선되었다 — hardening 0.9356 <!-- omo:id=accept-semi-structured-improved;stage=2;scope=backend;review=3 -->
- [x] weak 카테고리 평균 F1이 baseline(0) 대비 개선되었다 — hardening 0.9577 <!-- omo:id=accept-weak-improved;stage=2;scope=backend;review=3 -->
- [x] structured 카테고리 평균 F1이 baseline(0.9145) 대비 0.05 이상 하락하지 않았다 (>= 0.8645) — hardening 0.9814 <!-- omo:id=accept-structured-no-regression;stage=2;scope=backend;review=3 -->
- [x] noise 카테고리 true-negative F1 = 1.0이 유지된다 <!-- omo:id=accept-noise-true-negative;stage=2;scope=backend;review=3 -->
- [x] multi-recipe 카테고리 평균 F1이 baseline(0.5) 대비 실질적으로 하락하지 않았다 — hardening 0.6633 <!-- omo:id=accept-multi-recipe-no-regression;stage=2;scope=backend;review=3 -->
- [x] corpus fixture의 ground truth (expected_ingredients, expected_steps)가 변경되지 않았다 <!-- omo:id=accept-ground-truth-unchanged;stage=2;scope=backend;review=3 -->

## Error / Permission

- [x] 파서가 빈 설명란에서 crash하지 않고 빈 draft를 반환한다 <!-- omo:id=accept-empty-description;stage=2;scope=backend;review=3 -->
- [x] 파서가 noise-only 설명란에서 빈 결과를 반환한다 (false positive 없음) <!-- omo:id=accept-noise-no-false-positive;stage=2;scope=backend;review=3 -->
- [x] 사전 시딩 migration이 추가되지 않았다 — parser-only로 목표 달성, 충돌 경로 N/A <!-- omo:id=accept-seed-idempotent;stage=2;scope=backend;review=3 -->
- [x] 사전 시딩 migration이 추가되지 않았다 — 2회 실행 idempotency 대상 N/A <!-- omo:id=accept-seed-rerun-safe;stage=2;scope=backend;review=3 -->

## Data Integrity

- [x] corpus fixture에 개인정보, 외부 링크, 브랜드 협찬 정보가 추가되지 않았다 <!-- omo:id=accept-fixture-sanitization;stage=2;scope=backend;review=3 -->
- [x] 사전 시딩에 재료를 추가하지 않았다 — parser-only로 목표 달성, 무작위 seed 없음 <!-- omo:id=accept-seed-evidence-based;stage=2;scope=backend;review=3 -->
- [x] 사전 시딩 migration이 기존 `ingredients` / `ingredient_synonyms` 데이터를 수정하거나 삭제하지 않는다 (migration 없음) <!-- omo:id=accept-seed-no-modify-existing;stage=2;scope=backend;review=3 -->
- [x] 파서 타입 인터페이스(`ParsedDescriptionDocument`, `RecipeCandidateSelection`, `FlatDraftAdaptation`)가 변경되지 않았다 <!-- omo:id=accept-parser-types-unchanged;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] baseline report `tests/fixtures/youtube-corpus/reports/baseline-v2.json`이 존재하고 before 기준으로 사용된다 <!-- omo:id=accept-baseline-exists;stage=2;scope=backend;review=3 -->
- [x] corpus fixture set (36개)이 `tests/fixtures/youtube-corpus/`에 변경 없이 존재한다 <!-- omo:id=accept-corpus-unchanged;stage=2;scope=backend;review=3 -->
- [x] 채점 하네스 `lib/server/youtube-corpus-scoring.ts`가 기존 동작을 유지한다 <!-- omo:id=accept-harness-intact;stage=2;scope=backend;review=3 -->
- [x] `ingredients` / `ingredient_synonyms` 테이블 DB smoke는 seed migration 없음으로 N/A — 슬라이스 21 merged 전제만 유지 <!-- omo:id=accept-tables-exist;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: 개발자 (실제 YouTube URL 접근 필요)
- environment: 실제 YouTube 영상 설명란 + 브라우저, 로컬 Supabase
- scenarios: 아래 Manual Only 참조

## Automation Split

### Vitest

- [x] 파서 개선 후 corpus 전체 채점이 F1 >= 0.80을 달성한다 (`pnpm test:youtube-corpus`) <!-- omo:id=accept-vitest-corpus-f1;stage=2;scope=backend;review=3 -->
- [x] structured 카테고리 F1 >= 0.8645 (baseline 0.9145 - 0.05 허용 마진) <!-- omo:id=accept-vitest-structured-floor;stage=2;scope=backend;review=3 -->
- [x] noise 카테고리 F1 = 1.0 <!-- omo:id=accept-vitest-noise;stage=2;scope=backend;review=3 -->
- [x] semi-structured 카테고리 F1 > 0.1799 (baseline 초과) <!-- omo:id=accept-vitest-semi-improved;stage=2;scope=backend;review=3 -->
- [x] weak 카테고리 F1 > 0 (baseline 초과) <!-- omo:id=accept-vitest-weak-improved;stage=2;scope=backend;review=3 -->
- [x] 기존 youtube-description-parser 단위 테스트 전체 통과 <!-- omo:id=accept-vitest-parser-tests;stage=2;scope=backend;review=3 -->
- [x] 기존 youtube-import backend 테스트 전체 통과 <!-- omo:id=accept-vitest-import-tests;stage=2;scope=backend;review=3 -->
- [x] 기존 youtube-corpus harness 테스트 전체 통과 <!-- omo:id=accept-vitest-corpus-harness;stage=2;scope=backend;review=3 -->
- [x] 사전 시딩 migration 없음 — idempotency 검증 테스트 N/A <!-- omo:id=accept-vitest-seed-idempotency;stage=2;scope=backend;review=3 -->

### Playwright

- N/A (제품 UI 변경 없음)

### Manual Only

- [ ] 실제 YouTube URL 5개 이상에서 설명란을 수동 복사하여 개선된 파서로 추출 결과를 spot-check — in-corpus 외 설명란에서도 false positive 폭증이 없는지 확인
- N/A: 사전 시딩 migration을 추가하지 않아 로컬 Supabase seed 실행 시나리오가 없다.
- [ ] 개선된 파서로 `POST /api/v1/recipes/youtube/extract` live URL 추출 시 (YouTube Data API key 필요) 기존 대비 추출 품질이 체감 개선되는지 확인
