# Slice: 23-youtube-quality-corpus

## Goal

YouTube 설명란 파서의 품질을 증거 기반으로 측정하고 개선할 수 있도록, 품질 코퍼스(fixture 모음)와 결정론 채점 하네스를 설계한다. 현재 파서가 실제 유튜브 설명란에서 재료와 조리 과정을 사용자 체감 약 10/100 수준으로 추출하는 상태를 기준선으로 잡고, 후속 슬라이스에서 파서/사전/LLM 개선을 진행할 때 80/100 이상 도달을 추적할 수 있는 측정 인프라를 이 슬라이스에서 잠근다.

## Branches

- 백엔드: `feature/be-23-youtube-quality-corpus`

## In Scope

- 화면: 없음 (BE/test tooling 슬라이스, Stage 1은 문서화만 수행)
- API: 없음 (public API 계약 변경 없음)
- 상태 전이: 없음
- DB 영향: 없음 (읽기 전용 — `youtube_extraction_sessions`, `ingredients`, `ingredient_synonyms` 참조만)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### 구현 범위 (Stage 2에서 Codex가 구현)

1. **코퍼스 fixture 포맷 + 초기 fixture set**
   - JSON fixture 형식: `{ id, category, source, description, expected_ingredients[], expected_steps[], metadata }`
   - 카테고리 분류: `structured` (명확한 재료/조리법 섹션), `semi-structured` (부분적 구조), `weak` (자유 서술), `noise` (비레시피), `multi-recipe` (다중 레시피)
   - 최소 36개 fixture 유지 (`docs/engineering/youtube-description-parser-scoring.md` Fixture Minimum 준수)
   - 카테고리별 최소 3개
   - 24개 이상은 실제 채널 설명란에서 개인정보/링크를 제거한 real-description 기반
   - fixture 저장 경로: `tests/fixtures/youtube-corpus/`

2. **결정론 채점 하네스 계약**
   - 입력: corpus fixture path + parser output
   - 출력: per-fixture `{ precision, recall, f1 }` + aggregate `{ category_avg, corpus_avg, wild_avg }`
   - `docs/engineering/youtube-description-parser-scoring.md`의 Accuracy Contract 수치 기준:
     - In-corpus fixture F1 >= 0.90
     - 구조화된 real-description wild sample F1 >= 0.85
     - 약한 구조 wild sample F1 >= 0.70
   - harness CLI: `pnpm test:youtube-corpus` (Vitest suite) 또는 standalone script
   - 보고서 JSON artifact: `tests/fixtures/youtube-corpus/reports/`

3. **현재 기준선 측정**
   - 기존 deterministic parser v2 (`lib/server/youtube-import.ts`)의 corpus 전체 점수 baseline 기록
   - baseline report를 `tests/fixtures/youtube-corpus/reports/baseline-v2.json`에 저장

4. **Wild sample 측정 가이드**
   - 최소 5개 채널, 10개 영상의 live URL smoke 가이드 (Manual Only)
   - wild sample은 in-corpus 점수와 분리 보고

5. **보고서 artifact 형식**
   - JSON report: `{ run_id, timestamp, parser_version, corpus_version, per_fixture[], aggregate, wild_sample_aggregate? }`

## Out of Scope

- 파서 규칙 변경 (regex, line scoring threshold 수정)
- `ingredient_synonyms` seed 확장
- 대량 ingredient registration UX
- LLM 기반 extraction (`HOMECOOK_YOUTUBE_LLM_EXTRACT` flag off)
- Caption/ASR/OCR 소스 확장
- 공식 API 계약 변경 (`POST /recipes/youtube/extract` 응답 구조 변경 없음)
- 공식 DB 계약 변경
- 프로덕션 UI 변경
- YouTube Data API quota 사용 (corpus fixture는 오프라인)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |
| `21-ingredient-dictionary` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |

> 슬라이스 19~22의 모든 파서/사전/등록 인프라가 main에 merge된 후 시작한다.

## Backend First Contract

### 내부 계약 (public API 변경 없음)

이 슬라이스는 public API/DB 계약을 변경하지 않는다. 새로 정의하는 것은 테스트/측정 인프라의 내부 계약이다.

**Corpus fixture schema:**

```json
{
  "id": "corpus-001",
  "category": "structured",
  "source": "real-description",
  "channel_hint": "anonymized-channel-A",
  "description": "실제 설명란 텍스트 (개인정보/링크 제거)",
  "expected_ingredients": [
    {
      "name": "김치",
      "amount": 200,
      "unit": "g",
      "type": "QUANT"
    }
  ],
  "expected_steps": [
    {
      "step_number": 1,
      "instruction_pattern": "김치.*썬다"
    }
  ],
  "metadata": {
    "video_category": "recipe",
    "has_component_structure": false,
    "multi_recipe": false,
    "notes": "단일 레시피, 명확한 재료/조리법 섹션"
  }
}
```

**Scoring harness output schema:**

```json
{
  "run_id": "uuid",
  "timestamp": "ISO-8601",
  "parser_version": "v2",
  "corpus_version": "v1",
  "per_fixture": [
    {
      "id": "corpus-001",
      "category": "structured",
      "ingredients": { "precision": 0.95, "recall": 0.90, "f1": 0.92 },
      "steps": { "precision": 0.88, "recall": 0.85, "f1": 0.86 },
      "overall_f1": 0.89,
      "errors": []
    }
  ],
  "aggregate": {
    "corpus_avg_f1": 0.45,
    "category_avg": {
      "structured": 0.72,
      "semi-structured": 0.40,
      "weak": 0.20,
      "noise": 1.00,
      "multi-recipe": 0.15
    }
  },
  "wild_sample_aggregate": null
}
```

**Harness invocation:**

```bash
# Vitest suite
pnpm test:youtube-corpus

# 또는 standalone
pnpm youtube:corpus:score -- --fixtures tests/fixtures/youtube-corpus/ --output tests/fixtures/youtube-corpus/reports/
```

### Error cases

- fixture 파일 형식 오류 → harness가 fixture-level error 기록, 다른 fixture 계속 진행
- parser crash → fixture-level error + `f1: 0` 처리
- fixture 수 < 36 → harness warning
- 카테고리별 < 3 → harness warning

### Permission / State / Idempotency

- harness는 순수 읽기 + 계산. DB 쓰기 없음.
- 같은 corpus로 여러 번 실행해도 동일 결과 (deterministic).
- 보고서 파일은 덮어쓰기 가능 (timestamp로 구분).

## Frontend Delivery Mode

- N/A — docs + backend/test tooling only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Design Authority

- UI risk: `none` (제품 UI 변경 없음, 테스트/측정 인프라만)
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 제품 UI 변경이 전혀 없으므로 design authority가 필요하지 않다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/youtube-description-parser-scoring.md` — 파서 채점 루브릭 (Accuracy Contract, Fixture Minimum, Line Features, Thresholds)
- `docs/workpacks/20-youtube-real-import/README.md` — 실제 YouTube API 추출 + description parser v2
- `docs/workpacks/21-ingredient-dictionary/README.md` — synonym 매칭 확장
- `docs/workpacks/22-youtube-ingredient-registration/README.md` — 미등록 재료 등록
- `docs/요구사항기준선-v1.7.0.md` §2-4 유튜브 레시피 추출 정책
- `docs/화면정의서-v1.5.7.md` §10 YT_IMPORT
- `docs/api문서-v1.2.10.md` §6 유튜브 레시피 등록
- `docs/db설계-v1.3.6.md` — `youtube_extraction_sessions`, `ingredients`, `ingredient_synonyms`
- [lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts) — deterministic parser v2 구현체

## QA / Test Data Plan

- **Fixture baseline**:
  - corpus fixture: `tests/fixtures/youtube-corpus/` 에 최소 36개 JSON fixture
  - 24개 이상은 실제 채널 설명란에서 개인정보/링크를 제거한 sanitized real-description
  - 카테고리별 최소 3개: structured, semi-structured, weak, noise, multi-recipe
  - expected_ingredients와 expected_steps는 사람이 수동 검증한 ground truth
- **Real DB smoke 경로**:
  - corpus fixture는 DB 접근 없이 순수 파서 입출력만 테스트
  - `pnpm test:youtube-corpus` 로 로컬 실행
- **Seed / reset 명령**: N/A (DB 의존 없음)
- **Bootstrap 선행 조건**:
  - deterministic parser v2 코드 (`lib/server/youtube-import.ts`) 존재
  - `docs/engineering/youtube-description-parser-scoring.md` 채점 루브릭 존재
- **Blocker 조건**:
  - parser v2 코드가 main에 없으면 scoring 대상 없음
  - fixture 수 < 36이면 Accuracy Contract 측정 기준 미달

## Stage 2 Baseline Result

- baseline artifact: `tests/fixtures/youtube-corpus/reports/baseline-v2.json`
- parser version: `v2`
- corpus version: `v1`
- corpus average F1: `0.4932`
- category average F1:
  - `structured`: `0.9145`
  - `semi-structured`: `0.1799`
  - `weak`: `0`
  - `multi-recipe`: `0.5`
  - `noise`: `1`

> 전체 평균은 `noise` true-negative와 명확한 `structured` 설명란이 끌어올린 값이다.
> 사용자가 체감하는 낮은 품질은 `semi-structured` / `weak` 설명란에서 그대로 드러나며, 후속 파서/사전/LLM 개선은 이 두 카테고리를 우선 개선 대상으로 본다.

## Key Rules

- corpus fixture는 오프라인 테스트 전용이며, YouTube Data API quota를 사용하지 않는다.
- fixture의 expected 값은 사람이 검증한 ground truth로, 파서 출력과 비교해 precision/recall/F1을 계산한다.
- 재료 매칭은 `standard_name` 기준 exact match. 수량/단위 불일치는 partial credit (0.5).
- 조리 과정 매칭은 `instruction_pattern` regex 기반. 순서 일치 시 full credit, 순서 불일치 시 partial credit (0.7).
- in-corpus 점수와 wild sample 점수를 반드시 분리 보고한다.
- `noise` 카테고리 fixture는 비레시피 설명란이며, 파서가 빈 결과를 반환하면 F1=1.0 (true negative 처리).
- harness는 `docs/engineering/youtube-description-parser-scoring.md`의 Accuracy Contract 수치를 threshold로 사용하되, 현 시점에서 미달은 blocker가 아니라 baseline 기록이다.
- fixture에 포함되는 실제 설명란 텍스트는 개인정보(이름/연락처/주소), 외부 링크(쇼핑/SNS), 브랜드 협찬 정보를 제거하고 anonymize한다.

## Contract Evolution Candidates (Optional)

| 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- |
| 미등록 재료는 사용자가 하나씩 등록 | 여러 미등록 재료를 검토 후 일괄 등록/매칭 | YouTube import 후 검수 부담 감소 | 요구사항, 화면정의서, API 문서 | user-approval-required |
| 설명란 deterministic parser만 사용 | LLM 기반 설명란 구조화 보조 추출을 feature flag로 추가 | 구조가 약한 설명란에서도 재료/조리법 추출률 개선 | 요구사항, API 문서, 운영/비용 정책 | user-approval-required |
| YouTube description만 추출 원천 | caption/ASR/OCR 등 추가 원천을 단계적으로 허용 | 설명란이 부실한 영상까지 커버리지 확장 | 요구사항, API 문서, 보안/저작권/운영 정책 | user-approval-required |

> 위 후보는 이 슬라이스의 acceptance에 포함하지 않는다. 이 슬라이스는 코퍼스와 채점 하네스만 잠그고, 파서 개선/대량 등록/LLM/자막 확장은 후속 슬라이스에서 별도 계약으로 진행한다.

## Primary User Path

1. 개발자가 `tests/fixtures/youtube-corpus/` 에 새 fixture를 추가하거나 기존 fixture를 수정한다.
2. `pnpm test:youtube-corpus` 를 실행해 현재 parser v2의 corpus 전체 점수를 확인한다.
3. per-fixture 결과에서 F1이 낮은 fixture를 식별하고, 파서 개선 후보를 파악한다.
4. 파서 규칙을 변경한 뒤 (후속 슬라이스) 같은 harness로 개선 효과를 측정한다.
5. baseline report와 비교해 회귀 여부를 확인한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> BE-only 슬라이스이므로 Stage 4~6은 스킵. Stage 3 merge 시 슬라이스 종료.

- [x] corpus fixture 포맷 확정 + 스키마 검증 <!-- omo:id=23-corpus-fixture-schema;stage=2;scope=backend;review=3 -->
- [x] 초기 fixture set 36개 이상 작성 (24개 이상 real-description 기반) <!-- omo:id=23-initial-fixture-set;stage=2;scope=backend;review=3 -->
- [x] 카테고리별 최소 3개 fixture 확보 <!-- omo:id=23-category-coverage;stage=2;scope=backend;review=3 -->
- [x] 결정론 채점 하네스 구현 (precision/recall/F1 계산) <!-- omo:id=23-scoring-harness;stage=2;scope=backend;review=3 -->
- [x] 하네스 출력이 보고서 artifact schema를 따름 <!-- omo:id=23-report-artifact-schema;stage=2;scope=backend;review=3 -->
- [x] 현재 parser v2 baseline 측정 + 보고서 저장 <!-- omo:id=23-baseline-measurement;stage=2;scope=backend;review=3 -->
- [x] `pnpm test:youtube-corpus` 명령으로 실행 가능 <!-- omo:id=23-harness-cli;stage=2;scope=backend;review=3 -->
- [x] wild sample 측정 가이드 문서화 <!-- omo:id=23-wild-sample-guide;stage=2;scope=backend;review=3 -->
- [x] fixture 개인정보/링크 제거 sanitization 확인 <!-- omo:id=23-fixture-sanitization;stage=2;scope=backend;review=3 -->
- [x] 기존 youtube-import 테스트 회귀 없음 <!-- omo:id=23-regression;stage=2;scope=backend;review=3 -->
