# Slice 28 Real Source Sample Review - 2026-05-29

## Scope

실제 외부 source를 운영 `ingredients`에 직접 넣지 않고, file-backed ingest gate 입력으로 변환할 수 있는지 확인했다.

검토한 source:

- 식약처: 공공데이터포털 `전국통합식품영양성분정보(가공식품)표준데이터`
- 농식품올바로: 농촌진흥청 국가표준식품성분표 검색/OpenAPI 형태

## Source Evidence

- 공공데이터포털 가공식품 표준데이터: https://www.data.go.kr/data/15100066/standard.do
- 공공데이터포털 이용정책: https://www.data.go.kr/ugs/selectPortalPolicyView.do
- 농식품올바로 국가표준식품성분표 검색: https://koreanfood.rda.go.kr/kfi/fct/fctFoodSrch/list
- 농식품올바로 OpenAPI 이용안내: https://koreanfood.rda.go.kr/kfi/openapi/useGuidance

확인한 이용 조건:

- 공공데이터포털 정책은 공공데이터 이용허락 유형과 공공누리 유형을 기준으로 이용 범위를 표시한다.
- 농식품올바로 OpenAPI 이용안내는 해당 저작물이 공공누리 제1유형(출처표시) 조건이라고 표시한다.
- 이번 slice의 source license token은 `public-open-data`, `kogl-type-1`까지만 confirmed token으로 취급한다.

## Sample Rows

Fixture: `tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json`

식약처 공공데이터포털 sample:

- `P101-205000200-2401` / `망고맛 소프트 젤리` / 대표식품명 `젤리`
- `P120-600060000-1716` / `망고맛 열빙어알` / 대표식품명 `기타 수산가공품`
- `P109-802080200-2332` / `망고맛 음료분말` / 대표식품명 `농축음료/베이스`

농식품올바로 sample:

- `A001001A010a` / `귀리, 겉귀리, 도정, 생것`
- `A001002A010a` / `귀리, 쌀귀리, 도정, 생것`
- `A0020000009a` / `귀리, 오트밀`
- `A003000A010a` / `기장, 도정, 생것`
- `A003001A010a` / `기장, 찰기장, 도정, 생것`

## Manual Candidate Review

Generated through `tests/external-ingredient-ingest.test.ts` using the real source sample fixture.

Keyless file dry-run command:

```bash
pnpm external:ingredients:dry-run -- --input tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json --output-dir .artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z
```

Generated artifacts:

- `.artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29/candidate-report.json`
- `.artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29/approved-seed-promotion-artifact.json`
- `.artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29/summary.md`

Summary:

- total rows: 8
- candidate rows: 8
- blocked: false
- pending review: 8
- needs source check: 0
- automatically approved: 0
- production DB writes: 0

Representative mapping:

- `망고맛 열빙어알` -> original candidate `기타 수산가공품`, legacy category `해산물`, source system `mfds`
- `귀리, 겉귀리, 도정, 생것` -> original candidate `귀리`, legacy category `곡류`, source system `rda`

Decision:

- Source rows are acceptable for candidate-report generation.
- No row is approved for seed promotion in this review.
- Any production seed artifact still requires explicit review decisions after category/name review.

## Verification

Command:

```bash
pnpm exec vitest run tests/external-ingredient-ingest.test.ts
pnpm exec vitest run tests/external-ingredient-file-dry-run-script.test.ts tests/external-ingredient-ingest.test.ts
pnpm exec vitest run tests/external-ingredient-live-fetch-script.test.ts tests/external-ingredient-file-dry-run-script.test.ts tests/external-ingredient-ingest.test.ts
pnpm external:ingredients:dry-run -- --input tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json --output-dir .artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z
```

Result:

- 12 tests passed
- 14 focused tests passed when file dry-run CLI coverage was included
- 16 focused tests passed when live fetch CLI mock coverage was included
- real source adapter, confirmed license token gate, candidate report generation, and no direct production write regression all passed
- keyless file dry-run generated candidate report, empty approved seed artifact, and summary without API key or production DB write

## Remaining Risk

- 공공데이터포털 dataset별 세부 공공누리 유형 표시는 production seed promotion 전에 다시 원본 export 파일 또는 dataset metadata에서 함께 보관해야 한다.
- 농식품올바로 OpenAPI는 key 기반 접근이므로 CI/live fetch 경로에는 넣지 않았다. 이번 slice에서는 실제 검색/OpenAPI 형태를 file-backed sample로만 고정했다.
