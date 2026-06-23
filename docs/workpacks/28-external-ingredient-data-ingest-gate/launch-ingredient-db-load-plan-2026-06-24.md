# Launch Ingredient DB Load Plan - 2026-06-24

## Decision

정식 배포 전 ingredient DB 보강은 **직접 DB bulk insert가 아니라 approved seed promotion 방식**으로 진행한다.

이 계획은 manual UI/UX round3 68번의 실행 계획이다. 기존 slice 28 tooling은 유지하고, 운영 적재는 아래 순서를 통과한 row만 별도 migration 또는 controlled import script로 반영한다.

## Source Status

| Source | Role | Current decision |
| --- | --- | --- |
| 공공데이터포털 `전국통합식품영양성분정보(가공식품)표준데이터` | MFDS 가공식품/대표식품 source evidence | source evidence로 사용하되 broad processed category name은 기본 보류 |
| RDA 농식품 국가표준식품성분정보 | home-cooking canonical ingredient 후보의 1차 source | 우선 승인 후보 source |
| 기존 curated seed/migration rows | duplicate guard와 category truth | 항상 우선, 기존 row overwrite 금지 |

공공데이터포털 데이터는 2026-06-24 확인 시점에 2026-06-22 기준으로 수정된 데이터셋이며, 공공데이터포털 정책은 데이터별 이용허락 범위와 공공누리 유형 확인을 요구한다. RDA OpenAPI 안내는 공공누리 제1유형(출처표시) 조건을 표시한다. 따라서 production promotion 전에는 source URL, dataset update date, license token을 artifact에 함께 남긴다.

## Non-Negotiable Rules

1. 운영 `ingredients` / `ingredient_synonyms`에 외부 source row를 직접 bulk insert하지 않는다.
2. `candidate-report.json`에서 사람이 승인한 `source_fingerprint`만 seed promotion 후보가 된다.
3. 기존 `ingredients.standard_name`이 있으면 category/default_unit을 덮어쓰지 않는다.
4. MFDS의 브랜드 상품명, 가공식품 대분류명, 너무 넓은 대표식품명은 기본 `pending_review` 또는 `rejected`로 둔다.
5. source license가 확인되지 않은 row는 `needs_source_check`로 둔다.
6. 승인 migration은 idempotent해야 하며 `on conflict (standard_name) do nothing`을 유지한다.
7. rollback SQL 또는 제거 대상 standard name 목록을 PR 본문과 artifact에 남긴다.
8. public API shape와 `GET /ingredients` response 계약은 바꾸지 않는다.

## Category Alignment Status

현재 공식 계약은 `과일`을 포함한 v1 canonical 8종 category다.

launch-sized load 전 category 정렬 기준은 다음과 같다.

1. `scripts/external-ingredient-file-dry-run.mjs`는 canonical 8종 label인 `채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`만 승인 후보 category로 사용한다.
2. RDA food group `H` 과일류와 `E` 견과류/종실류는 `과일`로 매핑한다.
3. RDA food group `C` 당류와 `N/R` 유지/조미료 계열은 `양념`으로 매핑한다.
4. `과일` category row가 `기타`로 승격되는 candidate report가 나오면 launch promotion을 중단한다.

## Execution Plan

### Phase 0. Source and Credential Lock

- live fetch에 필요한 key를 운영자 환경에 넣는다.
  - MFDS 공공데이터포털 표준데이터: `DATA_GO_KR_API_KEY`
  - RDA 공공데이터포털 조회 서비스: `DATA_GO_KR_API_KEY`
- key는 repo root의 `.env.local`에 넣거나 현재 shell session에 `export`로 넣는다.
- `.env.local`은 local secret 파일이므로 commit하지 않는다.
- source URL, dataset update date, license token을 `source-lock.md`에 기록한다.
- output root는 날짜별로 고정한다.

.env.local 예시:

```dotenv
DATA_GO_KR_API_KEY=공공데이터포털_인증키
```

```bash
export LOAD_DATE=2026-06-24
export LOAD_DIR=.artifacts/external-ingredient-ingest/launch-${LOAD_DATE}
```

### Phase 1. Launch Candidate Fetch

초기 launch pack은 RDA를 우선하고, MFDS는 evidence 보조 source로만 사용한다.

```bash
pnpm external:ingredients:live-fetch -- \
  --providers mfds,rda \
  --output-dir "$LOAD_DIR/live-source" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z" \
  --rda-groups A,B,C,D,E,F,G,H,I,J,K,L,M,N,R \
  --rda-page-size 20 \
  --mfds-rows 100
```

`H` 과일류와 `E` 견과류/종실류는 dry-run에서 `과일`로 검증된다.

### Phase 2. Human Review Pack

`candidate-report.json`을 기준으로 `review-decisions-launch-${LOAD_DATE}.json`을 만든다.

승인 기준:

- 한국 가정 요리에서 재료명으로 바로 검색할 만한 표준명이다.
- normalized name이 브랜드, 완제품명, 레시피명, 너무 넓은 분류명이 아니다.
- category가 현재 v1 canonical 8종 중 하나로 확정 가능하다.
- 같은 normalized name cluster에서 하나의 fingerprint만 고른다.
- 기존 seed/migration에 이미 있는 standard name은 새 insert 대상에서 제외한다.

보류 기준:

- `기타 가공품`, `비스킷 쿠키 크래커`, `기타 사탕`처럼 너무 넓은 MFDS category.
- source row만으로 canonical 재료명을 확정하기 어려운 row.
- fruit/nut row 중 canonical 재료명으로 확정하기 어려운 row.
- source license token이 비어 있거나 dataset metadata가 함께 보존되지 않은 row.

### Phase 3. Approved Artifact Dry Run

```bash
pnpm external:ingredients:dry-run -- \
  --input "$LOAD_DIR/live-source/live-source-export.json" \
  --review-decisions "docs/workpacks/28-external-ingredient-data-ingest-gate/review-decisions-launch-${LOAD_DATE}.json" \
  --output-dir "$LOAD_DIR/reviewed-seed-candidates" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z"
```

Promotion 전 통과 조건:

- `candidate-report.json`의 `blocked`가 `false`다.
- 승인 row 중 `needs_source_check`가 없다.
- `approved-seed-promotion-artifact.json.seed_rows`가 review decision과 일치한다.
- generated artifact summary에 `Production DB writes: 0`이 남는다.
- 중복 standard name은 migration 대상에서 제외된다.

### Phase 4. Seed Promotion PR

별도 PR에서 다음만 반영한다.

- `review-decisions-launch-${LOAD_DATE}.json`
- `launch-candidate-review-${LOAD_DATE}.md`
- idempotent DML migration 또는 controlled import script
- rollback note

Migration 형태:

```sql
insert into public.ingredients (standard_name, category, default_unit)
values
  ('예시재료', '채소', null)
on conflict (standard_name) do nothing;
```

기존 row update, synonym 자동 생성, public API 변경은 이 PR에 포함하지 않는다.

### Phase 5. Apply and Smoke

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
- 팬트리 재료 추가 검색에서 신규 row가 category별로 노출되는지 확인.
- YouTube/manual ingredient registration category validation이 새 category를 거부하지 않는지 확인.
- production data quality scan에 forbidden fixture/demo text가 없는지 확인.

## Launch Pack Target

첫 launch pack은 한 번에 크게 넣지 않는다.

- 목표: 40-80개 canonical ingredient row.
- category floor: 각 주요 category 최소 3개 이상.
- MFDS-only approval은 전체 승인 row의 20% 이하로 제한한다.
- broad processed category는 0개 승인한다.

## Deferred Work

- 관리자 review UI.
- `ingredient_synonyms` 자동 promotion.
- DB staging table.
- `GET /ingredients` response 확장.
- taxonomy v2 registry/FK cutover.
- scheduled live sync.

## Exit Criteria For Manual UI/UX Round3 Item 68

68번은 이 문서가 main에 들어가면 **계획 확정**으로 닫는다. 실제 데이터 적재는 별도 실행 항목으로 추적한다.

실제 적재 항목은 다음 완료 조건을 가진다.

- fruit/category alignment 검증 통과.
- approved review decision artifact 생성.
- seed promotion migration PR merge.
- remote DB smoke와 API/search smoke 통과.
- source/license evidence 보존.
