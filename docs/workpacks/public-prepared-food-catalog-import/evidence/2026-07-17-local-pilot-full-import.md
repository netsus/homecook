# 2026-07-17 공공 완제품 local pilot/full import evidence

## Scope and safety

- 대상: 공공데이터포털 dataset `15100066`과 같은 식품안전나라 K-FIND 가공식품 DB 계열의 `2026-06-26` 공식 bulk snapshot
- 공식 출처: `https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do`
- 실행 환경: 격리된 local Supabase/PostgreSQL
- production/staging write: `0`
- secret, 인증 query, cookie, raw provider row의 commit/report/browser 노출: `0`
- 원본 행은 gitignored operator storage에만 유지하고, 이 evidence에는 집계와 checksum만 기록했다.

## Immutable source evidence

| 항목 | 값 |
| --- | --- |
| snapshot version / basis date | `2026-06-26` |
| official XLSX SHA-256 | `9c294425512aa71389e0ece44b7159c5adac0981fcd548ad7d04c97c4216fafd` |
| 17-field projection CSV SHA-256 | `0bde18ebdf423e1b1e55c69ce5b3ab8335a1e69b08301f75150d64f498f09029` |
| manifest raw snapshot SHA-256 | `b4c16b727f930331b81f8e9bd226eed835f078e72f11079dc76af52eb0a01c6e` |
| logical batch id | `c9c7125753e11f7a9bebfadf4cd60949cb7056ed722b1cb75673fbf48f474082` |
| schema | official workbook 165 columns → contract-approved 17-field projection |
| license disposition | 이용허락범위 제한 없음 |

## Normalize and review accounting

| 결과 | 건수 |
| --- | ---: |
| fetched raw | 298,288 |
| unique input | 298,287 |
| identical duplicate | 1 |
| normalized and review-approved | 287,041 |
| quarantined | 11,246 |
| quarantine — stable key conflict | 11,183 |
| quarantine — core nutrient missing | 63 |

Row accounting is closed: `287,041 + 1 + 11,246 = 298,288`.

- normalized content hash: `422259f741b7103664928736577090d2dd358e062bef7a7454e3aefed1547d0b`
- review checksum: `3ba0bf42aa50e7aedcc90a39e8d90a5371725fd94b667077122b89141ec7e4ff`
- approved full import content hash: `73c46359c89f0fc0e418c80fcce8a5236e9245de5f4bc69b0809a51a04104b35`
- review blocker count: `0`

결측 영양값을 `0`으로 만들지 않았고, 서로 다른 내용을 가진 같은 stable key를 자동 병합하지 않았다. 이 11,246건은 실패나 삭제가 아니라 재검토 가능한 quarantine이다.

## Pilot lifecycle

- deterministic pilot source SHA-256: `568763a8fbacb4c5f0a372841f43ec7d63eb9300d5f51644931e35ee6767de84`
- approved public products: `10,000`
- core nutrient rows: `50,000`
- same-content replay: `replayed=true`, `writes_committed=0`
- disable rehearsal: source만 inactive 처리하고 product/version payload `10,000`개는 보존
- disabled source 검색 결과: `0`

이 결과로 rollback/disable이 과거 immutable version을 삭제하지 않으면서 현재 검색 노출만 차단하는 것을 확인했다.

## Full local promotion and replay

| 항목 | 최초 apply | 같은 key replay |
| --- | ---: | ---: |
| source items / products | 287,041 | 287,041 |
| existing pilot version updates | 10,000 | 10,000 (registry result) |
| writes committed | 3,165,720 | 0 |
| replayed | false | true |
| production DB writes | 0 | 0 |
| secret leak count | 0 | 0 |

Full apply 뒤 local DB aggregate:

- public products: `287,041`
- active current products linked to approved/current source: `287,041`
- five-core current nutrition values: `1,435,205`
- duplicate public external key groups: `0`
- missing attribution products: `0`
- `list_food_products(..., limit=20)` returned items: `20`

Full source는 사용자가 실제 local 검색에 사용할 수 있도록 active 상태로 유지했다. 전체 disable은 수행하지 않았고, 동일 lifecycle의 pilot disable rehearsal로 안전한 비활성화 경로를 검증했다.

## Automated verification

- isolated PostgreSQL integration: `7/7` passed
  - partial checkpoint fail-closed
  - streamed 10,000-row apply and staged transport
  - immutable content update/replay/disable registry
  - RLS/read-only boundary
  - deterministic 10k/100k name prefix, substring, company, cursor limit-20 search p95 `<=300ms`
- focused Vitest: `34/34` passed
- TypeScript typecheck: passed
- changed-file ESLint: passed

The integration runner creates and removes a separate temporary PostgreSQL instance, so the final 287,041-row local catalog is not reset by test execution.
