# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 3 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] Seed migration이 `ingredients` 테이블에 코퍼스 기반 표준명을 추가한다 <!-- omo:id=accept-seed-ingredients;stage=2;scope=backend;review=3 -->
- [ ] Seed migration이 `ingredient_synonyms` 테이블에 관찰된 동의어를 추가한다 <!-- omo:id=accept-seed-synonyms;stage=2;scope=backend;review=3 -->
- [ ] Dictionary resolution rate가 seed 적용 후 측정 가능하다 <!-- omo:id=accept-dict-rate-measurable;stage=2;scope=backend;review=3 -->
- [ ] 코퍼스 fixture의 expected ingredient 중 resolved 비율이 seed 적용 후 상승한다 <!-- omo:id=accept-dict-rate-improved;stage=2;scope=backend;review=3 -->
- [ ] Parser F1 >= 0.90 floor가 유지된다 (seed migration으로 parser 동작이 변경되지 않음) <!-- omo:id=accept-parser-f1-floor;stage=2;scope=backend;review=3 -->

## State / Policy

- [ ] Seed migration이 `ON CONFLICT DO NOTHING`으로 idempotent하다 <!-- omo:id=accept-idempotent;stage=2;scope=backend;review=3 -->
- [ ] 기존 curated ingredient row (`category`, `default_unit`)를 덮어쓰지 않는다 <!-- omo:id=accept-no-overwrite;stage=2;scope=backend;review=3 -->
- [ ] Synonym은 `lower(trim())` 정규화 후 INSERT된다 <!-- omo:id=accept-synonym-normalize;stage=2;scope=backend;review=3 -->
- [ ] Category 값이 DB 계약 enum 중 하나다 (`채소/육류/해산물/양념/유제품/곡류/기타`) <!-- omo:id=accept-category-enum;stage=2;scope=backend;review=3 -->
- [ ] Dictionary resolution 채점이 parser F1 채점과 독립적으로 실행 가능하다 <!-- omo:id=accept-scoring-independent;stage=2;scope=backend;review=3 -->
- [ ] Quality floor는 최소 허용 기준이지 중단 기준이 아니다 — floor 달성 후에도 추가 seed가 가능하다 <!-- omo:id=accept-floor-not-cap;stage=2;scope=backend;review=3 -->

## Error / Data Integrity

- [ ] Seed migration 반복 실행 시 에러 없이 완료된다 <!-- omo:id=accept-repeat-safe;stage=2;scope=backend;review=3 -->
- [ ] 동일 `standard_name` 중복 INSERT 시 기존 row가 보존된다 <!-- omo:id=accept-name-conflict-safe;stage=2;scope=backend;review=3 -->
- [ ] 동일 `(ingredient_id, synonym)` 중복 INSERT 시 기존 row가 보존된다 <!-- omo:id=accept-synonym-conflict-safe;stage=2;scope=backend;review=3 -->
- [ ] Migration이 DDL 변경을 포함하지 않는다 (DML-only) <!-- omo:id=accept-dml-only;stage=2;scope=backend;review=3 -->
- [ ] 기존 `findIngredientIds` 조회 로직이 확장된 사전으로 정상 동작한다 <!-- omo:id=accept-find-ids-works;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [ ] `ingredients`, `ingredient_synonyms` 테이블이 존재한다 <!-- omo:id=accept-tables-exist;stage=2;scope=backend;review=3 -->
- [ ] 슬라이스 21/22/23/24/25 seed migration이 선행 적용되어 있다 <!-- omo:id=accept-prior-seeds;stage=2;scope=backend;review=3 -->
- [ ] 코퍼스 fixture (`corpus-v1.json`)가 존재한다 <!-- omo:id=accept-corpus-exists;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: Claude / Codex
- environment: `pnpm local:reset:demo` 후 migration 적용
- scenarios:
  - Seed migration 적용 후 `local:reset:demo` → YouTube URL 추출 → 이전보다 더 많은 재료가 `resolved`로 나타나는지 확인

## Automation Split

### Vitest

- [ ] Dictionary resolution 채점 함수가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-dict-scoring;stage=2;scope=backend;review=3 -->
- [ ] Seed 적용 전/후 resolution rate 비교 테스트가 있다 <!-- omo:id=accept-vitest-pre-post;stage=2;scope=backend;review=3 -->
- [ ] Parser F1 regression 테스트가 통과한다 (`pnpm test:youtube-corpus`) <!-- omo:id=accept-vitest-parser-regression;stage=2;scope=backend;review=3 -->
- [ ] Seed migration SQL의 idempotency가 테스트로 검증된다 <!-- omo:id=accept-vitest-idempotency;stage=2;scope=backend;review=3 -->

### Playwright

- N/A (이 슬라이스에서 UI 변경 없음)

### Manual Only

- [ ] 실제 YouTube API를 통한 라이브 추출 → seed 적용 후 dictionary resolution 개선 확인 (외부 서비스 의존)
- [ ] 50개 live URL 전수 추출 및 증거 수집 (외부 서비스·quota 의존)
