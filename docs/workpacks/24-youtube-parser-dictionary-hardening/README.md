# Slice: 24-youtube-parser-dictionary-hardening

## Goal

슬라이스 23에서 잠근 코퍼스 채점 하네스를 기준으로, 결정론 설명란 파서의 라인 분류/점수 규칙과 소량의 증거 기반 재료 사전(ingredient/synonym) 시딩을 개선해 in-corpus 전체 평균 F1을 0.4932(baseline-v2) 이상에서 0.80 이상으로 끌어올린다. 특히 semi-structured(0.1799)와 weak(0) 카테고리의 추출 품질을 집중 개선하되, noise true-negative(1.0)를 유지하고 structured 카테고리의 실질적 회귀를 방지한다.

## Branches

- 백엔드: `feature/be-24-youtube-parser-dictionary-hardening`

## In Scope

- 화면: 없음 (BE/test/data-only 슬라이스)
- API: 기존 `POST /api/v1/recipes/youtube/extract` 내부 파서 동작 개선 (public API 응답 구조 변경 없음)
- 상태 전이: 없음 (기존 `resolution_status` resolved/needs_review/unresolved 판정이 더 정확해질 뿐 새 상태 추가 없음)
- DB 영향:
  - `ingredients` (optional idempotent seed INSERT — `ON CONFLICT DO NOTHING`)
  - `ingredient_synonyms` (optional idempotent seed INSERT — `ON CONFLICT DO NOTHING`)
- Schema Change:
  - [x] 없음 (기존 테이블에 idempotent seed INSERT만, DDL 변경 없음)
  - [ ] 있음

### 구현 범위 (Stage 2에서 Codex가 구현)

1. **파서 라인 분류/점수 규칙 개선** (`lib/server/youtube-description-parser.ts`)
   - semi-structured 설명란의 amountless ingredient 인식 개선: 명시적 ingredient heading 없이도 리스트 패턴(-, *, /) 뒤 짧은 명사구를 ingredient candidate로 분류
   - weak 설명란의 inline 재료/조리 힌트 탐지: 산문 속 "재료:" / amount+unit 패턴 fallback
   - 라인 점수 threshold 미세 조정 (scoreLine / classifyLine)
   - noise reset 범위 제한: noise keyword가 있어도 인접 ingredient/step section을 과도하게 차단하지 않음
   - cooking action 동사 목록 보완 (현재 누락된 한국어 조리 동사 추가)
   - 컴포넌트 heading 탐지 보강 (길이 제한 완화, 부분 매칭)

2. **재료 사전 시딩 확장** (idempotent migration)
   - corpus fixture 분석에서 드러난 미등록 표준 재료 소량 추가 (`ingredients` INSERT ON CONFLICT DO NOTHING)
   - corpus fixture 분석에서 드러난 누락 synonym 소량 추가 (`ingredient_synonyms` INSERT ON CONFLICT DO NOTHING)
   - 추가 근거: corpus fixture의 unresolved/needs_review 재료 중 실제로 DB에 표준명이 없거나 synonym이 없는 것만 대상
   - 기존 migration 패턴 (`supabase/migrations/`) 준수, 새 DDL 없음

3. **코퍼스 채점 회귀 테스트 강화**
   - `pnpm test:youtube-corpus` 에서 parser-hardening 결과 보고서를 생성 가능하도록 지원
   - 새 보고서 artifact: `tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json`
   - baseline-v2 대비 before/after 비교 가능

4. **기존 테스트 회귀 방지**
   - `tests/youtube-description-parser.test.ts` 기존 케이스 통과 유지
   - `tests/youtube-import.backend.test.ts` 기존 케이스 통과 유지
   - `tests/youtube-corpus.test.ts` 기존 harness 동작 유지

## Out of Scope

- LLM 기반 추출 (`HOMECOOK_YOUTUBE_LLM_EXTRACT` flag 사용 안 함)
- Caption/ASR/OCR 소스 확장
- 공식 API 응답 구조 변경 (`POST /recipes/youtube/extract` envelope/field 변경 없음)
- 공식 DB schema 변경 (DDL 없음)
- 프로덕션 UI 변경
- 대량 ingredient registration UX
- 광범위한 재료 마스터 확장 (corpus 증거 없이 무작위 시딩 금지)
- YouTube Data API quota 사용 (corpus fixture는 오프라인)
- wild-video 보편 정확도 보장 (in-corpus 결과만 주장)
- ground truth 약화를 통한 점수 인플레이션

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `20-youtube-real-import` | merged | [x] |
| `21-ingredient-dictionary` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `23-youtube-quality-corpus` | merged | [x] |

> 슬라이스 20~23의 파서/사전/등록/코퍼스 인프라가 전부 main에 merge된 후 시작한다.

## Backend First Contract

### 내부 계약 (public API 변경 없음)

이 슬라이스는 public API/DB 계약을 변경하지 않는다. 변경 대상은 내부 파서 규칙과 사전 seed 데이터뿐이다.

**파서 개선 범위:**

- `parseYoutubeRecipeDescription()` → `selectPrimaryRecipeCandidate()` → `adaptCandidateToFlatDraft()` 파이프라인의 내부 동작 개선
- 입출력 타입(`ParsedDescriptionDocument`, `RecipeCandidateSelection`, `FlatDraftAdaptation`)은 변경 없음
- 기존 public API response envelope `{ success, data, error }` 유지

**사전 시딩 범위:**

- `ingredients` 테이블: corpus fixture에서 드러난 미등록 표준 재료 (예상 10~30건 이하)
- `ingredient_synonyms` 테이블: corpus fixture에서 드러난 누락 동의어 (예상 10~30건 이하)
- 모든 INSERT는 `ON CONFLICT DO NOTHING` — 멱등, 기존 데이터 불변
- 새 DDL (CREATE TABLE, ALTER TABLE) 없음

**채점 보고서 계약:**

- 기존 `baseline-v2.json` 보고서 형식 그대로 사용
- 새 보고서: `tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json`
- corpus fixture는 수정하지 않음 (ground truth 불변)

### Error cases

- 파서 개선이 특정 fixture에서 회귀를 일으키면 해당 fixture의 F1 저하를 보고서에 기록하고, 전체 평균 목표(>=0.80)를 만족하는 한 개별 회귀는 허용
- 단, structured 카테고리 평균이 baseline(0.9145) 대비 0.05 이상 하락하면 수정 필요
- noise 카테고리는 1.0 유지 필수 — 비레시피에서 false positive 발생 시 즉시 수정

### Permission / State / Idempotency

- 파서는 순수 함수 — DB 쓰기 없음, 상태 없음
- 사전 시딩은 멱등 migration — 여러 번 실행해도 동일 결과
- 채점 harness는 순수 읽기 + 계산

## Frontend Delivery Mode

- N/A — BE/test/data-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Design Authority

- UI risk: `none` (제품 UI 변경 없음)
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
- `docs/engineering/youtube-description-parser-scoring.md` — 파서 채점 루브릭 (Accuracy Contract, Line Features, Thresholds)
- `docs/workpacks/23-youtube-quality-corpus/README.md` — 코퍼스 인프라 및 baseline
- `docs/workpacks/20-youtube-real-import/README.md` — 실제 YouTube API 추출 + description parser v2
- `docs/workpacks/21-ingredient-dictionary/README.md` — synonym 매칭 확장
- `docs/workpacks/22-youtube-ingredient-registration/README.md` — 미등록 재료 등록
- `docs/요구사항기준선-v1.7.0.md` 2-4 유튜브 레시피 추출 정책
- `docs/api문서-v1.2.10.md` 6 유튜브 레시피 등록
- `docs/db설계-v1.3.6.md` — `ingredients`, `ingredient_synonyms`
- `tests/fixtures/youtube-corpus/reports/baseline-v2.json` — 현재 baseline 채점 결과
- `lib/server/youtube-description-parser.ts` — 결정론 파서 v2 구현체
- `lib/server/youtube-corpus-scoring.ts` — 코퍼스 채점 하네스

## QA / Test Data Plan

- **Fixture baseline**:
  - corpus fixture: `tests/fixtures/youtube-corpus/` 에 기존 36개 JSON fixture (변경 없음)
  - baseline report: `tests/fixtures/youtube-corpus/reports/baseline-v2.json` (변경 없음, before 기준)
  - hardening report: `tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json` (신규 생성, after 기준)
- **Real DB smoke 경로**:
  - 파서 개선은 DB 접근 없이 순수 파서 입출력 테스트: `pnpm test:youtube-corpus`
  - 사전 시딩 migration은 로컬 Supabase 또는 `pnpm dev:local-supabase`에서 idempotent 실행 확인
- **Seed / reset 명령**:
  - 사전 시딩 migration: `supabase db reset` 또는 `supabase migration up`
  - corpus 채점: `pnpm test:youtube-corpus`
- **Bootstrap 선행 조건**:
  - deterministic parser v2 코드 존재 (`lib/server/youtube-description-parser.ts`)
  - corpus fixture set 존재 (`tests/fixtures/youtube-corpus/`)
  - baseline report 존재 (`tests/fixtures/youtube-corpus/reports/baseline-v2.json`)
  - scoring harness 존재 (`lib/server/youtube-corpus-scoring.ts`)
  - `ingredients` / `ingredient_synonyms` 테이블 존재 (슬라이스 21 merged)
- **Blocker 조건**:
  - corpus fixture가 main에 없으면 before/after 비교 불가 (슬라이스 23 merged이므로 해소됨)
  - `ingredients` / `ingredient_synonyms` 테이블이 없으면 사전 시딩 불가 (DB v1.3.6 기준 존재)

## Key Rules

- corpus fixture의 ground truth(expected_ingredients, expected_steps)를 변경하여 점수를 인위적으로 올리는 것은 금지한다.
- 파서 개선은 결정론적이어야 한다 — 같은 입력에 항상 같은 출력.
- noise 카테고리 true-negative(F1=1.0) 유지 필수.
- structured 카테고리 평균 F1이 baseline(0.9145) 대비 0.05 이상 하락하면 안 된다.
- semi-structured / weak 카테고리 개선이 다른 카테고리의 false positive를 유발하지 않아야 한다.
- 사전 시딩은 corpus fixture 분석에서 드러난 증거가 있는 재료/동의어만 대상으로 한다 (무작위 대량 시딩 금지).
- 사전 시딩 migration은 기존 패턴(`supabase/migrations/`)을 따르고, `ON CONFLICT DO NOTHING`으로 멱등성을 보장한다.
- in-corpus 점수 개선을 임의의 모든 유튜브 영상 정확도 보장으로 확대 주장하지 않는다.
- `docs/engineering/youtube-description-parser-scoring.md`의 Line Features, Thresholds 규칙을 기준으로 개선하되, 규칙 문서 자체의 수정이 필요하면 Stage 2 PR에 함께 포함한다.

## Contract Evolution Candidates (Optional)

| 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- |
| 설명란 deterministic parser만 사용 | LLM 기반 설명란 구조화 보조 추출을 feature flag로 추가 | 구조가 약한 설명란에서도 재료/조리법 추출률 대폭 개선 | 요구사항, API 문서, 운영/비용 정책 | user-approval-required |
| YouTube description만 추출 원천 | caption/ASR/OCR 등 추가 원천을 단계적으로 허용 | 설명란이 부실한 영상까지 커버리지 확장 | 요구사항, API 문서, 보안/저작권/운영 정책 | user-approval-required |

> 위 후보는 이 슬라이스의 acceptance에 포함하지 않는다. 이 슬라이스는 결정론 파서 규칙과 소량 사전 시딩만으로 달성 가능한 범위에 집중하고, LLM/자막 확장은 후속 슬라이스에서 별도 계약으로 진행한다.

## Primary User Path

1. 사용자가 YouTube URL을 입력하고 `POST /recipes/youtube/extract`로 추출을 요청한다.
2. 서버의 결정론 파서가 개선된 라인 분류 규칙으로 설명란을 파싱해 재료와 조리 과정을 추출한다.
3. 추출된 재료가 개선된 사전(synonym 포함)으로 매칭되어, 이전보다 더 많은 재료가 `resolved` 상태로 반환된다.
4. 사용자가 검수 화면에서 추출 결과를 확인하고, 이전보다 적은 수의 `unresolved`/`needs_review` 재료를 처리한 뒤 레시피로 등록한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> BE-only 슬라이스이므로 Stage 4~6은 스킵. Stage 3 merge 시 슬라이스 종료.

- [ ] 파서 라인 분류/점수 규칙 개선 구현 <!-- omo:id=24-parser-rule-improvement;stage=2;scope=backend;review=3 -->
- [ ] semi-structured 카테고리 F1 baseline(0.1799) 대비 개선 <!-- omo:id=24-semi-structured-improvement;stage=2;scope=backend;review=3 -->
- [ ] weak 카테고리 F1 baseline(0) 대비 개선 <!-- omo:id=24-weak-improvement;stage=2;scope=backend;review=3 -->
- [ ] noise 카테고리 true-negative F1=1.0 유지 <!-- omo:id=24-noise-true-negative;stage=2;scope=backend;review=3 -->
- [ ] structured 카테고리 F1 baseline(0.9145) 대비 0.05 이상 하락 없음 <!-- omo:id=24-structured-no-regression;stage=2;scope=backend;review=3 -->
- [ ] in-corpus 전체 평균 F1 >= 0.80 달성 <!-- omo:id=24-corpus-avg-f1-target;stage=2;scope=backend;review=3 -->
- [ ] parser-hardening 보고서 artifact 생성 <!-- omo:id=24-hardening-report;stage=2;scope=backend;review=3 -->
- [ ] 사전 시딩 migration (필요한 경우) — idempotent, ON CONFLICT DO NOTHING <!-- omo:id=24-dictionary-seed;stage=2;scope=backend;review=3 -->
- [ ] 기존 youtube-description-parser 테스트 회귀 없음 <!-- omo:id=24-parser-test-regression;stage=2;scope=backend;review=3 -->
- [ ] 기존 youtube-import backend 테스트 회귀 없음 <!-- omo:id=24-import-test-regression;stage=2;scope=backend;review=3 -->
- [ ] 기존 youtube-corpus 테스트 harness 동작 유지 <!-- omo:id=24-corpus-harness-regression;stage=2;scope=backend;review=3 -->
- [ ] scoring rubric 문서 갱신 (규칙 변경 시) <!-- omo:id=24-rubric-update;stage=2;scope=backend;review=3 -->
