# Slice: 27-youtube-import-quality-uplift

## Goal
YouTube 설명란 파서의 추출 품질과 import readiness를 현재 baseline(in-corpus F1 0.9160, dictionary resolution 1.0000)에서 사용자가 최소한의 수정으로 레시피를 등록할 수 있는 수준(import readiness >= 0.80)으로 끌어올린다. 모든 개선은 LLM 없이 결정론 파서 규칙, 사전 시딩, 추출 후처리로 달성하며, 50건 evidence corpus에서 측정한다. pre-27 taxonomy contract lock과 기존 public API shape을 준수한다.

## Branches

- 백엔드: `feature/be-27-youtube-import-quality-uplift`
- 프론트엔드: `feature/fe-27-youtube-import-quality-uplift`

## In Scope
- 화면: `YT_IMPORT` (Step 2 추출 결과 품질 개선, Step 3 검수 UX friction 감소)
- API: 기존 `POST /recipes/youtube/extract` 응답 품질 개선 (응답 shape 변경 없음)
- 상태 전이: 변경 없음 (`draft` → `consumed` / `expired` 유지)
- DB 영향:
  - `youtube_extraction_sessions.draft_json` 내 추출 결과 품질 개선 (스키마 변경 없음)
  - `youtube_extraction_sessions.extraction_meta_json` 내 진단 정보 보강 (스키마 변경 없음)
  - `ingredients` / `ingredient_synonyms` 사전 시딩 추가 가능 (기존 seed migration 패턴)
- Schema Change:
  - [x] 없음 (DDL 변경 없음, 필요 시 DML-only seed migration)

### Quality Dimensions

1. **Extraction Quality (파서 정밀도/재현율)**
   - 재료 추출: 구조화된 설명란에서 재료명/수량/단위 정확 분리
   - 조리 과정 추출: step 분리, cooking method 자동 분류 정확도
   - 컴포넌트 인식: multi-component recipe에서 컴포넌트별 재료/과정 그룹화
   - 측정: line-level F1 (precision × recall) per fixture, per category

2. **Import Readiness (등록 준비도)**
   - `resolved` 비율: 추출 후 dictionary 매칭으로 즉시 resolved되는 재료 비율
   - blocking issue 수: 사용자가 등록 전 해결해야 하는 blocking field 수
   - step completeness: instruction + cooking_method 필수 필드 충족 비율
   - 측정: 가중 합산 readiness score (아래 공식)

3. **Ingredient Resolution Friction (재료 매칭 마찰)**
   - `needs_review` + `unresolved` 비율 감소
   - 동의어 커버리지 확대로 자동 매칭률 향상
   - 측정: corpus 전체 추출 재료 중 non-resolved 비율

### Import Readiness Score Formula

```
readiness = 0.35 × ingredient_f1
          + 0.25 × step_f1
          + 0.20 × resolution_rate
          + 0.10 × step_completeness_rate
          + 0.10 × (1 - blocking_issue_rate)
```

- `ingredient_f1`: corpus 전체 재료 추출 F1 (precision-recall harmonic mean)
- `step_f1`: corpus 전체 조리 과정 추출 F1
- `resolution_rate`: 추출된 재료 중 `resolved` 상태 비율 (0..1)
- `step_completeness_rate`: 추출된 step 중 instruction + cooking_method 모두 있는 비율 (0..1)
- `blocking_issue_rate`: 추출 결과 중 blocking issue가 있는 fixture 비율 (0..1)

**Gate**: corpus 평균 readiness >= 0.80

## Out of Scope
- LLM 기반 추출 (caption/ASR/estimation 포함) — 사용자 pause 상태
- public API response shape 변경 (`recipes[]` 배열, `component_label` 신규 필드 등)
- multi-recipe 선택 UI (현재 contract는 single recipe flat draft)
- `ingredient_categories` / `cooking_method_categories` 신규 DB registry table
- `cooking_methods.label varchar(5)` 과적재
- 외부 데이터(MFDS/KFRI) production 직적재
- legacy field 제거 (`ingredients.category`, `cooking_methods.color_key`)
- `GET /cooking-methods` 응답 필드 추가
- ingredient category 7종 확장
- 신규 화면 / 기존 화면 재설계
- YouTube caption/ASR/OCR extraction layer
- wild-video 90% 성공 보장 (corpus-only 품질 게이트)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `21-ingredient-dictionary` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `23-youtube-quality-corpus` | merged | [x] |
| `24-youtube-parser-dictionary-hardening` | merged | [x] |
| `25-youtube-bulk-ingredient-resolution` | merged | [x] |
| `26-youtube-dictionary-seed-uplift` | merged | [x] |
| `pre-27-taxonomy-consumer-alignment` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### 기존 엔드포인트 (shape 변경 없음)
- `POST /recipes/youtube/validate` — URL 검증 + oEmbed preview
- `POST /recipes/youtube/extract` — 추출 + 세션 생성 (개선 대상)
- `POST /recipes/youtube/ingredient-registration` — 미등록 재료 등록
- `POST /recipes/youtube/register` — 레시피 등록 (세션 기반)

### 추출 품질 개선 범위
- 파서 규칙 개선: line feature scoring 정밀화, heading/component 인식 강화
- 사전 시딩: corpus evidence 기반 재료 표준명/동의어 추가 migration
- 추출 후처리: 수량 정규화, 단위 표준화, step 번호 재정렬 개선
- 진단 정보: `extraction_meta_json`에 per-line scoring, confidence, parser version 기록

### 응답 envelope
- `{ success, data, error }` 기존 형식 유지
- `data.ingredients[]` shape 불변: `{ draft_ingredient_id, standard_name, amount, unit, ingredient_type, display_text, ingredient_id, resolution_status, confidence }`
- `data.steps[]` shape 불변: `{ step_number, instruction, cooking_method, duration_text, is_incomplete, missing_fields }`
- `data.extraction_methods` = `["description"]` (MVP)

### 권한 / 소유자 검증
- 기존 정책 유지: 🔒 로그인 필수, feature flag guard
- session ownership validation 변경 없음
- cross-user → 404, expired → 410, consumed → 409

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함
- FE 변경 범위: 추출 품질 개선에 따른 검수 화면 사용자 경험 개선 (기존 화면 내)
  - resolved 비율 증가에 따라 검수 단계에서 수정이 필요한 항목 감소
  - 추출 confidence 기반 UI 힌트 개선 가능 (기존 resolution_status badge 활용)

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음 (YT_IMPORT 내부 품질 개선, 화면 구조 변경 없음)
- Visual artifact: 없음 (기존 YT_IMPORT 화면 유지)
- Authority status: `not-required`
- Notes: 파서/사전 품질 개선이 주 범위이며, UI 변경은 추출 결과 품질 향상에 따른 자연스러운 UX 개선에 한정. 신규 화면, 레이아웃 변경, 컴포넌트 구조 변경 없음.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 주요 변경은 파서/사전/추출 품질 개선이지만, 기존 `YT_IMPORT` 화면에서 full-flow 확인과 low-risk UX 보수가 필요할 수 있으므로 `temporary`로 시작한다. 신규 화면, 레이아웃 재설계, authority review는 요구하지 않는다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.1.md` — §2-4 YouTube Recipe Extraction Policy
- `docs/화면정의서-v1.5.8.md` — §10 YT_IMPORT Screen
- `docs/유저flow맵-v1.3.8.md` — §⑨ YouTube Recipe Registration Journey
- `docs/db설계-v1.3.7.md` — §4-2 youtube_extraction_sessions
- `docs/api문서-v1.2.11.md` — §6 YouTube Recipe Import
- `docs/engineering/youtube-description-parser-scoring.md` — Scoring Rubric
- `.omx/plans/youtube-description-parser-ralplan.md` — Parser RALPLAN
- `.omx/plans/ingredient-cooking-taxonomy-ralplan-final-20260525.md` — Taxonomy Freeze Contract
- `docs/workpacks/pre-27-taxonomy-consumer-alignment/README.md` — Pre-27 Contract

## QA / Test Data Plan

### Fixture Baseline
- 기존 corpus: 36+ fixtures (24+ real-description, 12+ synthetic), 5 categories
- 이 슬라이스 목표: **50건 이상** evidence corpus (기존 36+ 유지 + 신규 14+ 추가)
  - 신규 fixture: 약한 구조, 반구조, 다국어 혼합, multi-component 등 edge case 보강
  - 카테고리별 최소 5건 (기존 3건 → 5건으로 상향)
- wild fixture sample: 최소 5개 채널, 10개 영상의 설명란 텍스트를 fixture로 고정해 별도 측정

### 채점 하네스
- `pnpm test:youtube-corpus` — in-corpus F1 측정 (기존 하네스 확장)
- `pnpm test:youtube-dictionary` — dictionary resolution rate 측정
- 신규: import readiness score 계산 harness (위 가중 공식 적용)

### CI Safety
- 모든 quality gate는 fixture 기반 결정론 테스트로 CI에서 실행 가능
- YouTube Data API 호출 없음 (fixture의 `raw_source_text` 사용)
- LLM 호출 없음

### Real DB Smoke
- `pnpm dev:demo` — local demo 환경에서 실제 YouTube URL 수동 테스트
- `pnpm local:reset:demo` — Supabase 리셋 + demo dataset 초기화
- Manual live smoke: 5+ real YouTube cooking video URLs로 수동 extraction 검증

### Seed / Migration
- corpus evidence 기반 `ingredients` / `ingredient_synonyms` seed migration
- 기존 slice 24/26 패턴 따름: `supabase/migrations/` 또는 test fixture seed

### Blocker 조건
- `youtube_extraction_sessions` 테이블 부재
- `ingredients` / `ingredient_synonyms` 테이블 부재
- `cooking_methods` 테이블 부재
- corpus fixture 파일 부재 (tests/fixtures/youtube-corpus/)

## Key Rules

1. **Taxonomy Freeze Contract**: v1 canonical ingredient category는 legacy 7종 (`채소/육류/해산물/양념/유제품/곡류/기타`). 확장 금지.
2. **No LLM Fallback**: LLM 기반 추출은 사용자 pause 상태. 모든 개선은 결정론 파서 + 사전으로만.
3. **Shared Source 사용**: ingredient category는 `lib/ingredient-categories.ts`, cooking method는 `lib/cooking-method-colors.ts` 위임.
4. **API Shape 불변**: `POST /extract` 응답의 `ingredients[]` / `steps[]` shape 변경 금지.
5. **Session Contract 유지**: 24h TTL, ownership validation, RPC atomic registration 불변.
6. **외부 데이터 staging-only**: MFDS/KFRI 등 외부 데이터는 production 직적재 금지.
7. **Cooking label 비과적재**: `cooking_methods.label varchar(5)`에 taxonomy 의미 과적재 금지.
8. **Corpus Evidence 기반**: 모든 파서 규칙 변경과 사전 시딩은 corpus fixture 증거로 정당화.
9. **Parser Scoring Rubric 준수**: `docs/engineering/youtube-description-parser-scoring.md` 기준 준수.
10. **Deterministic CI-safe**: 모든 quality gate는 외부 API/LLM 없이 fixture에서 결정론적으로 실행.

## Contract Evolution Candidates (Optional)

현재 이 슬라이스에서 계약 변경 후보는 없다. 파서/사전 품질 개선이 주 범위이며, public API contract 변경이 필요한 개선(multi-recipe UI, component_label 필드 등)은 별도 후속 슬라이스에서 다룬다.

## Primary User Path
1. 사용자가 `MENU_ADD` → [유튜브 링크로 추가] 선택
2. YouTube URL 입력 → `POST /validate` → oEmbed 미리보기
3. [가져오기] → `POST /extract` → 설명란 파서가 재료/과정 추출 (이 슬라이스에서 품질 개선)
4. 검수 화면에서 추출 결과 확인 → **이전보다 resolved 비율 높고, 수정 필요 항목 적음**
5. 필요 시 미등록 재료 등록/대체 → [레시피 등록] → `POST /register`
6. 플래너에 식사 추가

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] 파서 규칙 개선 및 테스트 <!-- omo:id=delivery-parser-rules;stage=2;scope=backend;review=3,6 -->
- [ ] 사전 시딩 migration <!-- omo:id=delivery-dictionary-seed;stage=2;scope=backend;review=3,6 -->
- [ ] Import readiness 채점 하네스 <!-- omo:id=delivery-readiness-harness;stage=2;scope=backend;review=3,6 -->
- [ ] Corpus 50건 확보 및 baseline 측정 <!-- omo:id=delivery-corpus-50;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [ ] In-corpus F1 >= 0.90 gate 통과 <!-- omo:id=delivery-f1-gate;stage=2;scope=backend;review=3,6 -->
- [ ] Import readiness >= 0.80 gate 통과 <!-- omo:id=delivery-readiness-gate;stage=2;scope=backend;review=3,6 -->
- [ ] Wild sample F1 보고 (structured >= 0.85, weak >= 0.70) <!-- omo:id=delivery-wild-sample-report;stage=2;scope=backend;review=3,6 -->
