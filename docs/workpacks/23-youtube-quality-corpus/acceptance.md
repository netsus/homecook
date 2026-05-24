# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> BE-only 슬라이스이므로 Stage 3 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] corpus fixture 36개 이상이 `tests/fixtures/youtube-corpus/`에 존재한다 <!-- omo:id=accept-corpus-minimum-count;stage=2;scope=backend;review=3 -->
- [x] 24개 이상 fixture가 real-description 기반 sanitized 텍스트다 <!-- omo:id=accept-real-description-ratio;stage=2;scope=backend;review=3 -->
- [x] 각 fixture의 expected_ingredients와 expected_steps가 수동 검증된 ground truth다 <!-- omo:id=accept-ground-truth-quality;stage=2;scope=backend;review=3 -->
- [x] `pnpm test:youtube-corpus` 실행 시 전체 corpus에 대해 per-fixture + aggregate 점수가 출력된다 <!-- omo:id=accept-harness-runs;stage=2;scope=backend;review=3 -->
- [x] 보고서 JSON이 정의된 artifact schema를 따른다 <!-- omo:id=accept-report-schema;stage=2;scope=backend;review=3 -->
- [x] baseline report가 `tests/fixtures/youtube-corpus/reports/baseline-v2.json`에 저장된다 <!-- omo:id=accept-baseline-saved;stage=2;scope=backend;review=3 -->

## State / Policy

- [x] harness가 deterministic하다 — 같은 corpus + parser로 재실행 시 동일 점수 <!-- omo:id=accept-deterministic-harness;stage=2;scope=backend;review=3 -->
- [x] in-corpus 점수와 wild sample 점수가 보고서에서 분리된다 <!-- omo:id=accept-score-separation;stage=2;scope=backend;review=3 -->
- [x] `noise` 카테고리 fixture에서 파서가 빈 결과를 반환하면 F1=1.0 처리된다 <!-- omo:id=accept-noise-true-negative;stage=2;scope=backend;review=3 -->

## Error / Permission

- [x] 형식 오류 fixture가 있어도 harness가 crash하지 않고 fixture-level error를 기록한다 <!-- omo:id=accept-fixture-error-resilience;stage=2;scope=backend;review=3 -->
- [x] fixture 수 < 36일 때 harness가 warning을 출력한다 <!-- omo:id=accept-fixture-count-warning;stage=2;scope=backend;review=3 -->
- [x] 카테고리별 < 3일 때 harness가 warning을 출력한다 <!-- omo:id=accept-category-count-warning;stage=2;scope=backend;review=3 -->
- [x] parser crash 시 해당 fixture의 f1=0 처리 + error 기록 <!-- omo:id=accept-parser-crash-handling;stage=2;scope=backend;review=3 -->

## Data Integrity

- [x] corpus fixture에 개인정보(이름/연락처/주소), 외부 링크, 브랜드 협찬 정보가 포함되지 않는다 <!-- omo:id=accept-sanitization;stage=2;scope=backend;review=3 -->
- [x] fixture JSON이 정의된 schema를 따르고 필수 필드가 누락되지 않는다 <!-- omo:id=accept-fixture-schema-valid;stage=2;scope=backend;review=3 -->
- [x] 카테고리 분포가 structured / semi-structured / weak / noise / multi-recipe를 모두 포함한다 <!-- omo:id=accept-category-distribution;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] deterministic parser v2 코드가 main에 존재한다 (슬라이스 20 merged) <!-- omo:id=accept-parser-exists;stage=2;scope=backend;review=3 -->
- [x] `docs/engineering/youtube-description-parser-scoring.md` 채점 루브릭이 존재한다 <!-- omo:id=accept-rubric-exists;stage=2;scope=backend;review=3 -->
- [x] corpus fixture 파일이 테스트에서 접근 가능한 경로에 존재한다 <!-- omo:id=accept-fixture-path-accessible;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: 개발자 (실제 YouTube URL 접근 필요)
- environment: 실제 YouTube 영상 설명란 + 브라우저
- scenarios: 아래 Manual Only 참조

## Automation Split

### Vitest

- [x] corpus fixture schema validation 테스트 <!-- omo:id=accept-vitest-fixture-schema;stage=2;scope=backend;review=3 -->
- [x] harness per-fixture scoring 정확성 테스트 (known input → expected F1) <!-- omo:id=accept-vitest-scoring-accuracy;stage=2;scope=backend;review=3 -->
- [x] harness aggregate 계산 정확성 테스트 <!-- omo:id=accept-vitest-aggregate-accuracy;stage=2;scope=backend;review=3 -->
- [x] harness error handling 테스트 (malformed fixture, parser crash) <!-- omo:id=accept-vitest-error-handling;stage=2;scope=backend;review=3 -->
- [x] noise category true-negative 처리 테스트 <!-- omo:id=accept-vitest-noise-handling;stage=2;scope=backend;review=3 -->
- [x] 기존 youtube-import 테스트 회귀 없음 <!-- omo:id=accept-vitest-regression;stage=2;scope=backend;review=3 -->

### Playwright

- N/A (제품 UI 변경 없음)

### Manual Only

- [ ] live YouTube URL 5개 채널 × 10개 영상에서 설명란을 수동 복사하여 wild sample fixture를 만들고, harness로 wild_sample_aggregate를 별도 측정
- [ ] 실제 YouTube Data API key + credential이 있는 환경에서 `POST /recipes/youtube/extract`로 live URL 추출 후, harness 결과와 실제 추출 결과를 비교해 fixture ground truth의 정확성을 spot-check
- [ ] YouTube API quota 제한 환경에서 corpus fixture가 quota를 전혀 소비하지 않는지 확인
