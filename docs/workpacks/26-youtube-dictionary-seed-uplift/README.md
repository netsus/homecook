# Slice: 26-youtube-dictionary-seed-uplift

## Goal

슬라이스 23/24에서 구축한 코퍼스 채점 하네스(parser F1)와 별도로, **DB 재료 사전(ingredients + ingredient_synonyms)의 해소율**을 측정하는 dictionary-resolution 채점 레이어를 추가하고, 코퍼스 fixture에서 관찰된 증거 기반 재료·동의어 seed migration을 투입해 사전 해소 품질을 개선한다.

핵심 동기: 슬라이스 24에서 parser-only 개선이 F1 floor(0.80)을 달성한 뒤 seed migration을 생략했다. 그러나 F1 floor는 **최소 허용 기준(minimum acceptable floor)이지 중단 기준(stopping criteria)이 아니다**. 파서가 재료명을 정확히 추출해도 DB 사전에 해당 표준명이 없으면 사용자에게 `unresolved`로 노출되어 수동 등록이 필요하다. 이 슬라이스는 파서 출력 품질(F1)과 사전 해소 품질(dictionary resolution rate)을 분리하고, 후자를 체계적으로 끌어올린다.

## Branches

- 백엔드: `feature/be-26-youtube-dictionary-seed-uplift`

## In Scope

- DB 재료 사전 seed migration:
  - 코퍼스 36 fixture의 expected ingredient name 중 현재 `ingredients` 테이블에 없는 표준명을 idempotent seed migration으로 추가
  - 해당 재료의 관찰된 동의어를 `ingredient_synonyms`에 추가
  - 대상 재료는 36 corpus fixture expected name에서 도출 (예시): 양파, 두부, 고추장, 김치, 당근, 마요네즈, 식초, 감자, 굴소스, 깨, 꿀, 닭가슴살, 돼지고기, 된장, 떡국떡, 방울토마토, 베이컨, 삼겹살, 새우젓, 소면, 스파게티면, 아보카도, 양상추, 양송이버섯, 어묵, 오트밀, 전분가루, 참깨, 참나물, 참치캔, 청양고추, 치즈, 케첩, 콩나물, 토마토, 통깨, 플레인요거트, 햄 등
  - Stage 2에서 추가 증거(live URL 샘플 등)를 수집하면 후보가 확장될 수 있으나, 현재 확정 근거는 36 corpus fixture와 기존 슬라이스 21 seed migration이다
  - 기존 seed migration(`20260522070000`, `20260522073000`) 패턴 준수: `ON CONFLICT DO NOTHING`, DML-only, idempotent
- Dictionary-resolution 채점 레이어:
  - 기존 코퍼스 fixture의 expected ingredient name을 DB seed 사전 기준으로 해소(resolution) 가능 여부를 측정하는 Vitest 채점 함수
  - `findIngredientIds` 또는 동등한 사전 조회 로직으로 expected name → `resolved` / `needs_review` / `unresolved` 분류
  - fixture별·카테고리별 dictionary resolution rate 리포트 생성
  - parser F1 채점과 독립적으로 실행 가능 (별도 test suite 또는 test file)
- 코퍼스 fixture 정합성:
  - 기존 36 fixture의 expected ingredient name과 seed migration 표준명의 정합성 확인/업데이트
  - Stage 2에서 새로 수집·정제된 증거가 있으면 fixture 추가 가능 (선택적)
- Schema Change:
  - [x] 없음 (DDL 변경 없음, DML-only seed migration)
  - [ ] 있음

## Out of Scope

- LLM / caption / ASR / OCR 기반 추출
- 파서 라인 분류 규칙 변경 (슬라이스 24에서 완료)
- UI 변경 (프론트엔드 코드 수정 없음)
- `ingredients` / `ingredient_synonyms` 테이블 DDL 변경
- 전역 재료 관리 화면 또는 관리자 moderation queue
- ingredient category taxonomy 개편
- `register_youtube_ingredient` RPC 로직 변경
- Production 데이터 마이그레이션 (live DB에 대한 one-off 스크립트)
- Wild-video accuracy guarantee (코퍼스 기반 측정만 수행)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `21-ingredient-dictionary` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `23-youtube-quality-corpus` | merged | [x] |
| `24-youtube-parser-dictionary-hardening` | merged | [x] |
| `25-youtube-bulk-ingredient-resolution` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태다.

## Backend First Contract

### 계약 상태

기존 공식 문서 계약을 그대로 사용한다. 새 API endpoint, 새 RPC, schema DDL 변경이 없다.

### DB Seed Migration

새 seed migration 파일: `supabase/migrations/YYYYMMDDHHMMSS_26_youtube_dictionary_seed_uplift.sql`

패턴은 기존 슬라이스 21 seed와 동일:

```sql
-- Slice 26: evidence-based ingredient dictionary seed uplift.
-- DML-only, idempotent. Existing rows are not overwritten.

INSERT INTO public.ingredients (standard_name, category, default_unit)
VALUES
  ('된장', '양념', null),
  ('고추장', '양념', null),
  -- ... (코퍼스에서 관찰된 나머지 재료)
ON CONFLICT (standard_name) DO NOTHING;

INSERT INTO public.ingredient_synonyms (ingredient_id, synonym)
SELECT i.id, lower(trim(v.synonym))
FROM (VALUES
  ('된장', '된장'),
  ('고추장', '고추장'),
  -- ... (관찰된 동의어)
) AS v(standard_name, synonym)
JOIN public.ingredients i ON i.standard_name = v.standard_name
WHERE trim(v.synonym) <> ''
ON CONFLICT (ingredient_id, synonym) DO NOTHING;
```

### 기존 API 계약 영향

없음. `POST /api/v1/recipes/youtube/extract`의 `findIngredientIds` 조회 로직은 변경 없이 더 많은 재료를 `resolved`로 반환하게 된다 (사전 데이터 확장 효과).

### Permission / State / Idempotency

- Seed migration은 `ON CONFLICT DO NOTHING`이므로 반복 실행해도 안전
- 기존 curated `category` / `default_unit` 값을 덮어쓰지 않음
- ingredient_synonyms의 `(ingredient_id, synonym)` unique constraint로 중복 방지

## Frontend Delivery Mode

- N/A — 이 슬라이스는 BE/test/data-only이다. 프론트엔드 코드 변경 없음.
- Stage 4~6 스킵 대상.

## Design Authority

- UI risk: N/A
- Anchor screen dependency: 없음
- Visual artifact: 없음
- Authority status: `not-required`
- Notes: BE/test/data-only 슬라이스이므로 UI 변경 없음. Design authority 프로세스 해당 없음.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/23-youtube-quality-corpus/README.md`
- `docs/workpacks/24-youtube-parser-dictionary-hardening/README.md`
- `docs/engineering/youtube-description-parser-scoring.md`
- `docs/db설계-v1.3.6.md` — §2-1 `ingredients`, §2-2 `ingredient_synonyms`
- `docs/요구사항기준선-v1.7.0.md` — §2-4 YouTube 미등록 재료 등록 정책
- `supabase/migrations/20260522070000_21_ingredient_dictionary_synonyms.sql` — 기존 seed 패턴
- `supabase/migrations/20260522073000_21_youtube_pork_galbi_ingredient_seed.sql` — 추가 seed 패턴
- `supabase/migrations/20260525170000_26_youtube_dictionary_seed_uplift.sql` — slice 26 seed migration
- `tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json` — 현재 파서 F1 점수
- `tests/fixtures/youtube-corpus/reports/dictionary-resolution-v1.json` — 사전 해소율 pre/post 리포트
- `tests/fixtures/youtube-corpus/corpus-v1.json` — 코퍼스 fixture
- `tests/youtube-dictionary-resolution.test.ts` — dictionary-resolution scoring + seed migration regression

## QA / Test Data Plan

- **Fixture baseline**:
  - 기존 36 corpus fixture (`tests/fixtures/youtube-corpus/corpus-v1.json`) — real-description 24개 + synthetic 12개
  - 각 fixture의 expected ingredient name 목록
  - 기존 슬라이스 21 seed migration의 재료/동의어 목록
- **Dictionary resolution 측정**:
  - seed migration 적용 전/후의 dictionary resolution rate 비교
  - fixture별: expected name → `findIngredientIds` 결과 → `resolved` / `needs_review` / `unresolved` 분류
  - 카테고리별 평균 dictionary resolution rate
  - 전체 코퍼스 평균 dictionary resolution rate
  - Stage 2 결과: ingredient-weighted resolution rate `0.4795` → `1.0000`, unresolved `76` → `0`
- **Parser F1 회귀 방지**:
  - 기존 `pnpm test:youtube-corpus` 그대로 실행
  - parser F1 >= 0.90 floor 유지 확인
- **Seed / reset 명령**:
  - `pnpm local:reset:demo`
  - Stage 2 시도 결과: Docker image layer 등록 중 `no space left on device` + registry `toomanyrequests`로 local Supabase reset smoke는 미완료. SQL idempotency와 dictionary-resolution 동작은 Vitest로 고정.
- **Bootstrap 선행 조건**:
  - `ingredients`, `ingredient_synonyms` 테이블 존재
  - 슬라이스 21/22/23/24/25 merge 완료

## Key Rules

- Seed migration은 DML-only, idempotent (`ON CONFLICT DO NOTHING`)
- 기존 curated row를 덮어쓰지 않는다 — `standard_name` conflict 시 기존 row 재사용
- 이미 기존 synonym으로 안정 해소되는 alias(`국간장`→`간장`, `오이`→`청오이`, `올리브오일`→`올리브 오일`)는 새 표준명으로 중복 INSERT하지 않는다. 중복 표준명을 만들면 `findIngredientIds`가 multi-candidate로 `needs_review`를 만들 수 있다.
- Category 값은 `채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타` 중 하나 (DB 계약 준수)
- Synonym은 `lower(trim())` 정규화 후 INSERT
- Dictionary resolution 채점은 parser F1 채점과 독립적으로 실행 가능해야 한다
- Parser 라인 분류 규칙은 변경하지 않는다 (슬라이스 24에서 완료)
- Quality target은 최소 허용 기준(floor)이지 중단 기준이 아니다 — floor를 달성해도 추가 개선이 가능하면 진행한다
- Seed 후보의 1차 근거는 36 corpus fixture expected name이다. 50개 live URL 테스트는 추가 증거 수집용 Manual Only / 선택적 외부 smoke이며, 필수 scope가 아니다

## Contract Evolution Candidates

없음. 기존 API·DB DDL·RPC 계약 변경 없이 DML-only seed 데이터와 테스트 도구만 추가한다.

## Primary User Path

1. 사용자가 YouTube URL을 입력하고 "가져오기"를 누른다.
2. 서버가 설명란을 파싱해 재료 목록을 추출한다.
3. **이전**: 사전에 없는 재료가 `unresolved`로 표시되어 사용자가 하나씩 또는 일괄로 수동 등록해야 했다.
4. **이후**: seed migration으로 사전이 확장되어 더 많은 재료가 자동으로 `resolved`로 표시된다. 사용자의 수동 등록 부담이 감소한다.
5. 사용자 체감: "미등록 재료" 뱃지가 줄어들고, 검수 → 레시피 등록까지의 흐름이 빨라진다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE/test/data-only이므로 Stage 4~6은 스킵한다.

- [x] Seed migration SQL 작성 (evidence-based ingredient + synonym) <!-- omo:id=delivery-seed-migration;stage=2;scope=backend;review=3 -->
- [x] Dictionary-resolution 채점 함수 구현 <!-- omo:id=delivery-dict-scoring;stage=2;scope=backend;review=3 -->
- [x] Dictionary resolution rate 리포트 생성 (pre/post seed) <!-- omo:id=delivery-dict-report;stage=2;scope=backend;review=3 -->
- [x] Parser F1 회귀 방지 확인 (pnpm test:youtube-corpus) <!-- omo:id=delivery-parser-regression;stage=2;scope=backend;review=3 -->
- [x] Seed migration idempotency 확인 (반복 실행 안전성) <!-- omo:id=delivery-idempotency;stage=2;scope=backend;review=3 -->
- [x] 코퍼스 fixture 정합성 확인/업데이트 <!-- omo:id=delivery-fixture-update;stage=2;scope=backend;review=3 -->
- [x] Vitest 단위 테스트: dictionary resolution scoring <!-- omo:id=delivery-vitest-dict-scoring;stage=2;scope=backend;review=3 -->
- [x] 기존 Vitest 회귀 없음 확인 <!-- omo:id=delivery-vitest-regression;stage=2;scope=backend;review=3 -->
