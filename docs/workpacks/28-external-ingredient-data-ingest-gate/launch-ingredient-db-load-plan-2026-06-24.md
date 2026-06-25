# Launch Ingredient DB Load Plan - 2026-06-24

## Decision

정식 배포 전 ingredient DB 보강은 **RDA 전체 source fetch -> dedupe/review -> approved seed promotion** 방식으로 진행한다.

운영 DB에는 외부 source row를 그대로 bulk insert하지 않는다. 대신 대표 재료 1개는 `ingredients`에 넣고, 같은 재료임이 확실한 별칭만 `ingredient_synonyms`에 넣는다. `ingredient_bundles`와 `ingredient_bundle_items`는 재료 DB 반영이 끝난 뒤 같은 launch 작업의 후속 PR로 추가한다.

이 계획은 manual UI/UX round3 68번의 실행 계획이다. 기존 slice 28 tooling은 유지하되, 현재 live fetch script가 page 1만 가져오는 구조이므로 full-source fetch 전 pagination tooling을 먼저 보강한다.

## Source Status

| Source | Role | Current decision |
| --- | --- | --- |
| 공공데이터포털 `전국통합식품영양성분정보(가공식품)표준데이터` | MFDS 가공식품/대표식품 source evidence | source evidence로 사용하되 broad processed category name은 기본 보류 |
| RDA 농식품 국가표준식품성분정보 | home-cooking canonical ingredient 후보의 1차 source | 전체 수집 후 대표 재료/동의어 후보로 분리 |
| 기존 curated seed/migration rows | duplicate guard와 category truth | 항상 우선, 기존 row overwrite 금지 |

공공데이터포털 데이터는 2026-06-24 확인 시점에 2026-06-22 기준으로 수정된 데이터셋이며, 공공데이터포털 정책은 데이터별 이용허락 범위와 공공누리 유형 확인을 요구한다. RDA OpenAPI 안내는 공공누리 제1유형(출처표시) 조건을 표시한다. 따라서 production promotion 전에는 source URL, dataset update date, license token을 artifact에 함께 남긴다.

## Non-Negotiable Rules

1. 운영 `ingredients`, `ingredient_synonyms`, `ingredient_bundles`, `ingredient_bundle_items`에 외부 source row를 직접 bulk insert하지 않는다.
2. `candidate-report.json`에서 사람이 승인한 `source_fingerprint`만 seed promotion 후보가 된다.
3. 기존 `ingredients.standard_name`이 있으면 category/default_unit을 덮어쓰지 않는다.
4. 중복 row 전체를 `ingredient_synonyms`로 자동 승격하지 않는다.
5. synonym은 같은 재료의 표기 차이, 통칭, 안전한 별칭일 때만 승인한다.
6. 조리 상태, 가공 상태, 부위, 상품/브랜드, 레시피명, 너무 넓은 분류명은 synonym으로 넣지 않는다.
7. MFDS의 브랜드 상품명, 가공식품 대분류명, 너무 넓은 대표식품명은 기본 `pending_review` 또는 `rejected`로 둔다.
8. source license가 확인되지 않은 row는 `needs_source_check`로 둔다.
9. 승인 migration은 idempotent해야 하며 `on conflict`를 유지한다.
10. bundle item은 승인 완료된 `ingredients.standard_name`에 join해서만 넣는다. 누락 ingredient는 자동 skip하지 않고 report에 남긴다.
11. rollback SQL 또는 제거 대상 standard name/synonym/bundle 목록을 PR 본문과 artifact에 남긴다.
12. public API shape와 `GET /ingredients` response 계약은 바꾸지 않는다.

## Category Alignment Status

현재 공식 계약은 `과일`을 포함한 v1 canonical 8종 category다.

launch-sized load 전 category 정렬 기준은 다음과 같다.

1. `scripts/external-ingredient-file-dry-run.mjs`는 canonical 8종 label인 `채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`만 승인 후보 category로 사용한다.
2. RDA food group `K/L`은 `해산물`로 매핑한다.
3. RDA food group `I/J`는 `육류`로 매핑한다.
4. RDA food group `M`은 `유제품`으로 매핑한다.
5. RDA food group `H` 과일류와 `E` 견과류/종실류는 `과일`로 매핑한다.
6. RDA food group `A/B/D`는 `곡류`로 매핑한다.
7. RDA food group `F/G`는 `채소`로 매핑한다.
8. RDA food group `C/N/R`은 `양념`으로 매핑한다.
9. `과일` category row가 `기타`로 승격되는 candidate report가 나오면 launch promotion을 중단한다.

## RDA Full Fetch Size And API Traffic

2026-06-24 preflight 기준 RDA group별 `total_Count`는 다음과 같다.

| RDA group | Name | total_Count |
| --- | --- | ---: |
| A | 곡류 및 그 제품 | 440 |
| B | 감자 및 전분류 | 77 |
| C | 당류 | 55 |
| D | 두류 | 85 |
| E | 견과류 및 종실류 | 76 |
| F | 채소류 | 611 |
| G | 버섯류 | 94 |
| H | 과일류 | 263 |
| I | 육류 | 422 |
| J | 난류 | 34 |
| K | 어패류 | 157 |
| L | 해조류 | 10 |
| M | 우유 및 유제품류 | 58 |
| N | 유지류 | 32 |
| R | 조미료류 | 135 |
| **Total** |  | **2,549** |

공공데이터포털 이용가이드는 개발계정이 하루 평균 1,000건 규모, 운영계정이 하루 최대 10만 건 규모의 트래픽을 제공한다고 안내한다. 참고: https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do

전체 fetch는 호출 제한 안에서 가능하다.

- 2026-06-24 실제 API preflight 결과, RDA 조회 서비스는 `Page_Size=20`까지 정상이고 `Page_Size=30`부터 `요청 페이지 형식 오류`를 반환한다.
- 따라서 full fetch는 `Page_Size=20`으로 실행한다.
- RDA 전체 2,549개 기준 본 fetch는 약 134회다.
- 재시도, metadata 확인, 실패 group 재호출을 포함해도 1일 1,000회 제한보다 낮지만, 과호출 방지를 위해 실행당 `--max-requests-per-run 200`을 둔다.

안전 운영 규칙:

- fetch는 직렬 또는 낮은 concurrency로 실행한다.
- 같은 날짜의 raw source artifact가 있으면 재사용하고 불필요하게 API를 다시 호출하지 않는다.
- `429`, quota, service error가 나오면 당일 재시도 loop를 중단하고 다음 날 이어서 실행한다.
- key 값은 log, artifact, PR 본문에 남기지 않는다.

## Execution Plan

### Phase 0. Source and Credential Lock

- live fetch에 필요한 key를 운영자 환경에 넣는다.
  - MFDS 공공데이터포털 표준데이터: `DATA_GO_KR_API_KEY`
  - RDA 공공데이터포털 조회 서비스: `DATA_GO_KR_API_KEY`
- RDA 실행 중 quota/rate limit이 발생하면 보조 공공데이터포털 key를 순서대로 사용할 수 있다.
  - `DATA_GO_KR_API_KEY`
  - `DATA_GO_KR_API_KEY1`
  - `DATA_GO_KR_API_KEY2`
  - 이후 숫자 suffix 증가
- key는 repo root의 `.env.local`에 넣거나 현재 shell session에 `export`로 넣는다.
- `.env.local`은 local secret 파일이므로 commit하지 않는다.
- artifact와 log에는 실제 key 값이 아니라 key source name만 남긴다.
- source URL, dataset update date, license token을 `source-lock.md`에 기록한다.
- output root는 날짜별로 고정한다.

.env.local 예시:

```dotenv
DATA_GO_KR_API_KEY=공공데이터포털_인증키
DATA_GO_KR_API_KEY1=공공데이터포털_보조_인증키
```

```bash
export LOAD_DATE=2026-06-24
export LOAD_DIR=.artifacts/external-ingredient-ingest/launch-${LOAD_DATE}
```

### Phase 1. Pagination Tooling Update

현재 `scripts/external-ingredient-live-fetch.mjs`는 RDA group별 page 1만 가져온다. full-source fetch 전 다음을 먼저 구현한다.

- `--rda-fetch-all` 옵션 추가.
- RDA response의 `total_Count`를 읽고 `Page_No`를 증가시키며 모든 page를 수집.
- group별 request count, row count, first/last page를 `source-lock.md` 또는 별도 summary에 기록.
- `--max-requests-per-run` 기본값을 둬서 실수로 과호출하지 않게 한다.
- 같은 output dir에 이미 완료된 group artifact가 있으면 skip 또는 resume할 수 있게 한다.
- `tests/external-ingredient-live-fetch-script.test.ts`에 pagination, resume, quota/error 중단 case를 추가한다.

### Phase 2. RDA Full Source Fetch

초기 launch pack은 RDA를 우선하고, MFDS는 evidence 보조 source로만 사용한다.

Target command after Phase 1:

```bash
pnpm external:ingredients:live-fetch -- \
  --providers rda \
  --output-dir "$LOAD_DIR/rda-full-source" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z" \
  --rda-groups A,B,C,D,E,F,G,H,I,J,K,L,M,N,R \
  --rda-page-size 20 \
  --rda-fetch-all \
  --max-requests-per-run 200
```

2026-06-24 실행 기록:

- Phase 1 pagination/resume tooling 구현 후 위 명령을 실행했다.
- 1차 실행에서 RDA group `A`, `B`, `C`는 수집 완료되어 `$LOAD_DIR/rda-full-source/rda-A-full-source.json`, `rda-B-full-source.json`, `rda-C-full-source.json` 캐시가 생성됐다.
- 1차 실행은 `D` group 시작 시 공공데이터포털 응답이 `HTTP_429 API token quota exceeded`로 바뀌어 중단됐다.
- quota/rate limit이 발생한 partial source에서는 후보 dry-run을 실행하지 않고, stale `candidate-report.json`과 `approved-seed-promotion-artifact.json`을 제거한다.
- `DATA_GO_KR_API_KEY1` failover 지원을 추가했다.
- 2차 실행에서 완료된 `A/B/C`는 cache hit로 재사용했고, `D` 이후 group은 `DATA_GO_KR_API_KEY1`로 정상 수집됐다.
- full-source 결과는 `15/15` providers success, RDA source row `2,549`, production DB writes `0`이다.
- dry-run 결과는 candidate `2,549`, duplicate candidate `2,222`, pending review `2,549`, needs source check `0`이다.

MFDS는 별도 evidence sample로만 받는다.

```bash
pnpm external:ingredients:live-fetch -- \
  --providers mfds \
  --output-dir "$LOAD_DIR/mfds-evidence-source" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z" \
  --mfds-rows 100
```

`H` 과일류와 `E` 견과류/종실류는 dry-run에서 `과일`로 검증된다.

### Phase 3. Dedupe, Canonical, Synonym Candidate Review

full source artifact를 기준으로 다음 review pack을 만든다.

- `canonical-ingredient-candidates.json`
- `synonym-candidates.json`
- `rejected-source-rows.json`
- `candidate-review-summary.md`

```bash
pnpm external:ingredients:review-pack -- \
  --candidate-report "$LOAD_DIR/rda-full-source/candidate-report.json" \
  --output-dir "$LOAD_DIR/review-pack" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z"
```

2026-06-24 실행 결과:

- 원본 후보 row: `2,549`
- 대표 재료 후보: `695`
- 동의어 후보: `1,077`
- 보류/제외 source row: `4,826`
- 우선 수동 검토 필요 대표 후보: `9`
- 동의어 후보에는 RDA raw name의 comma segment에서 온 품종/가공형/상태 후보가 섞일 수 있으므로 bulk approve하지 않는다.
- `rejected-source-rows.json`은 실제 삭제/거절 확정 목록이 아니라 자동 삽입하지 않을 duplicate source row와 synonym 제외 근거 확인용이다.

대표 ingredient 승인 기준:

- 한국 가정 요리에서 재료명으로 바로 검색할 만한 표준명이다.
- normalized name이 브랜드, 완제품명, 레시피명, 너무 넓은 분류명이 아니다.
- category가 현재 v1 canonical 8종 중 하나로 확정 가능하다.
- 같은 normalized name cluster에서 하나의 representative fingerprint만 고른다.
- 기존 seed/migration에 이미 있는 standard name은 새 insert 대상에서 제외한다.

synonym 승인 기준:

- 같은 ingredient를 가리키는 띄어쓰기, 맞춤법, 한글/외래어 표기 차이다.
- 사용자가 검색창에 입력할 만한 통칭이다.
- `lower(trim(synonym))`이 representative `standard_name`과 같으면 제외한다.
- 같은 synonym이 여러 ingredient에 붙을 가능성이 있으면 제외한다.
- 조리 상태나 가공 상태가 의미를 바꾸면 제외한다. 예: `삶은`, `볶은`, `튀긴`, `건조`, `분말`.
- 부위나 손질 형태가 별도 재료 경험을 만들면 제외한다. 예: `다진`, `채썬`, `껍질`, `뼈`.
- 상품명, 브랜드명, 레시피명, 음식명은 제외한다.

보류 기준:

- `기타 가공품`, `비스킷 쿠키 크래커`, `기타 사탕`처럼 너무 넓은 MFDS category.
- source row만으로 canonical 재료명을 확정하기 어려운 row.
- fruit/nut row 중 canonical 재료명으로 확정하기 어려운 row.
- source license token이 비어 있거나 dataset metadata가 함께 보존되지 않은 row.

### Phase 4. Approved Artifact Dry Run

```bash
pnpm external:ingredients:dry-run -- \
  --input "$LOAD_DIR/rda-full-source/live-source-export.json" \
  --review-decisions "docs/workpacks/28-external-ingredient-data-ingest-gate/review-decisions-launch-${LOAD_DATE}.json" \
  --output-dir "$LOAD_DIR/reviewed-seed-candidates" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z"
```

Promotion 전 통과 조건:

- `candidate-report.json`의 `blocked`가 `false`다.
- 승인 row 중 `needs_source_check`가 없다.
- `approved-seed-promotion-artifact.json.seed_rows`가 review decision과 일치한다.
- synonym artifact가 있으면 representative `standard_name`이 모두 `seed_rows` 또는 기존 `ingredients`에 존재한다.
- synonym artifact에서 같은 synonym이 여러 standard name으로 승인되지 않는다.
- generated artifact summary에 `Production DB writes: 0`이 남는다.
- 중복 standard name은 migration 대상에서 제외된다.

### Phase 5. Ingredient And Synonym Promotion PR

별도 PR에서 다음만 반영한다.

- `review-decisions-launch-${LOAD_DATE}.json`
- `launch-candidate-review-${LOAD_DATE}.md`
- idempotent DML migration 또는 controlled import script
- rollback note

Migration 형태:

```sql
with approved_ingredients(standard_name, category, default_unit) as (
  values
    ('예시재료', '채소', null)
)
insert into public.ingredients (standard_name, category, default_unit)
select standard_name, category, default_unit
from approved_ingredients
on conflict (standard_name) do nothing;

with approved_synonyms(standard_name, synonym) as (
  values
    ('예시재료', '예시 별칭')
)
insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(s.synonym))
from approved_synonyms s
join public.ingredients i on i.standard_name = s.standard_name
where lower(trim(s.synonym)) <> lower(trim(s.standard_name))
on conflict (ingredient_id, synonym) do nothing;
```

기존 row update, public API 변경은 이 PR에 포함하지 않는다.

### Phase 6. Ingredient Bundle Promotion PR

ingredient/synonym promotion이 remote DB에 반영되고 smoke가 끝난 뒤 `ingredient_bundles`와 `ingredient_bundle_items`를 추가한다.

Bundle은 source에서 자동 생성하지 않고, 첫 사용자가 팬트리에 빠르게 추가할 만한 curated bundle로 만든다.

초기 후보:

- `한식 기본 양념`
- `국/찌개 기본`
- `볶음/반찬 기본`
- `채소 기본`
- `과일/견과`
- `육류 기본`
- `해산물/해조`
- `유제품/계란`
- `베이킹/디저트`

Migration 원칙:

- `ingredient_bundles`는 fixed UUID와 `display_order`를 사용한다.
- 해당 launch bundle의 기존 `ingredient_bundle_items`만 삭제 후 재삽입한다.
- item은 `ingredients.standard_name` join으로만 넣는다.
- join되지 않은 standard name은 PR 전 단계에서 failure report로 남기고 migration에 포함하지 않는다.
- `on conflict (bundle_id, ingredient_id) do nothing`을 유지한다.

Migration 형태:

```sql
insert into public.ingredient_bundles (id, name, display_order)
values
  ('00000000-0000-0000-0000-000000000000', '한식 기본 양념', 10)
on conflict (id) do update
set name = excluded.name,
    display_order = excluded.display_order;

with seed_bundle_items(id, bundle_id, standard_name) as (
  values
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '간장')
)
insert into public.ingredient_bundle_items (id, bundle_id, ingredient_id)
select s.id::uuid, s.bundle_id::uuid, i.id
from seed_bundle_items s
join public.ingredients i on i.standard_name = s.standard_name
on conflict (bundle_id, ingredient_id) do nothing;
```

### Phase 7. Apply and Smoke

Remote apply 전:

```bash
supabase db push --linked --dry-run
pnpm exec vitest run \
  tests/external-ingredient-live-fetch-script.test.ts \
  tests/external-ingredient-file-dry-run-script.test.ts \
  tests/external-ingredient-ingest.test.ts \
  tests/ingredient-categories.test.ts
pnpm typecheck
pnpm lint
```

Remote apply 후:

- `GET /api/v1/ingredients?query=<new-standard-name>` smoke.
- synonym matching이 적용되는 backend path에서 `query=<approved-synonym>` smoke.
- 팬트리 재료 추가 검색에서 신규 row가 category별로 노출되는지 확인.
- 팬트리 묶음 추가에서 신규 bundle과 item이 노출되는지 확인.
- YouTube/manual ingredient registration category validation이 새 category를 거부하지 않는지 확인.
- production data quality scan에 forbidden fixture/demo text가 없는지 확인.

## Launch Pack Target

첫 launch는 전체 RDA source를 수집하되, DB 반영은 검토된 row만 넣는다.

- 수집 목표: RDA 15개 group 전체, 현재 기준 2,549 row.
- promotion 목표: 대표 ingredient는 review가 끝난 row 전부. 단, PR이 너무 커지면 category별로 나눠 merge한다.
- synonym 목표: 승인된 대표 ingredient에 붙일 수 있는 안전한 alias만.
- broad processed category는 0개 승인한다.
- bundle 목표: ingredient promotion 후 실제 존재하는 ingredient만 묶음에 포함한다.

## Deferred Work

- 관리자 review UI.
- DB staging table.
- `GET /ingredients` response 확장.
- taxonomy v2 registry/FK cutover.
- scheduled live sync.
- source freshness monitor.

## Exit Criteria For Manual UI/UX Round3 Item 68

68번은 이 문서가 main에 들어가면 **계획 확정**으로 닫는다. 실제 데이터 적재는 별도 실행 항목으로 추적한다.

실제 적재 항목은 다음 완료 조건을 가진다.

- full RDA fetch pagination tooling 검증 통과.
- fruit/category alignment 검증 통과.
- approved review decision artifact 생성.
- ingredient/synonym promotion migration PR merge.
- bundle promotion migration PR merge.
- remote DB smoke와 API/search/bundle smoke 통과.
- source/license evidence 보존.
