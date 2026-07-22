# prepared-food-search-relevance

> Stage 1 contract lock. Approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines). Official baseline: requirements v1.7.22, screens v1.5.28, flow v1.3.25, DB v1.3.23, API v1.2.27.

## Goal

사용자가 `연세크림빵`처럼 브랜드와 제품명의 일부를 붙여 입력해도 제품·재료 전체에서 관련도 높은 결과를 한 목록과 한 cursor로 안정적으로 찾게 한다.

## Branches

- Stage 1 docs: `docs/prepared-food-search-relevance`
- Stage 2 backend/data: `feature/be-prepared-food-search-relevance`
- Stage 4 client behavior: `feature/fe-prepared-food-search-relevance`
- Release train: A. 다른 product/meal-log train을 기다리지 않고 이 slice의 gate만으로 출고할 수 있다.
- 모든 author, internal 1.5 reviewer, implementation owner, security/performance/5-axis reviewer는 사용자 승인대로 서로 다른 Codex 세션을 사용하며 Claude는 사용하지 않는다.

## In Scope

- official `GET /api/v1/food-catalog/search`
  - query: `q`, `types=ingredient,food_product`, optional `source=public|community|mine`, opaque `cursor`, `limit`
  - response: `{ success, data: { items, next_cursor, has_next }, error }`; item은 `type=ingredient|food_product` discriminated union
  - unsupported `types`/`source`, client `visibility`, malformed cursor는 결과 없이 `400 INVALID_SEARCH_FILTER`
- additive SQL migration
  - immutable Unicode NFKC/lowercase/whitespace normalization과 punctuation-stripped compact projection
  - `brand + name` normalized/compact search document
  - public catalog와 owner-private product의 분리 index/candidate path
  - ingredient/product scope를 먼저 적용한 bounded indexed candidate retrieval과 ranked typed-union RPC
  - integer/fixed v2 tuple과 query/filter fingerprint를 포함한 opaque cursor
- relevance
  - exact name/brand → compact contiguous → all-fragment coverage → trigram
  - query가 있으면 relevance가 source/recency보다 먼저이고 source/type/created/stable ID는 tie-break다.
  - 1~2글자는 fuzzy 없이 prefix/substring만, 공백 없는 4글자 이상은 양쪽 2글자 이상 split을 평가한다.
  - 한 fragment만 맞는 결과는 두 fragment coverage 결과보다 앞설 수 없다.
- compatibility
  - 기존 v1 `created_at + id` cursor를 dual decode하고 v1 query page는 기존 의미로 끝까지 처리한다.
  - 새 first page만 v2 cursor를 발급하며 v2 tuple은 `(algorithm_version, match_bucket, coverage_bucket, quantized_score, source_partition, type_partition, created_at, stable_id)`를 잠근다.
  - query/filter fingerprint가 다른 cursor replay는 fail closed한다. raw float similarity와 DB 계획값은 cursor에 넣지 않는다.
  - query가 없으면 기존 stable browse 의미를 유지한다.
  - legacy `GET /food-products`의 `all|public_dataset|manual`, current nutrition version, moderation, owner-private, pagination 계약을 회귀 검증한다.
- client behavior
  - 200~300ms debounce, IME composition 종료 뒤 요청, request generation 최신값만 반영
  - source/type 변경 또는 새 query는 page/cursor를 원자 초기화하며 stale response를 append하지 않는다.
  - ranked candidate가 실제 0일 때만 empty를 표시한다.
- actual local catalog 287,041 rows에서 labeled relevance, EXPLAIN ANALYZE, DB/route p95 evidence를 남긴다.

Schema Change:
- [ ] 없음
- [x] 있음 — 기존 migration은 수정하지 않고 official DB K의 search projection/index/ranked RPC를 additive migration으로 추가한다.

## Out of Scope

- HOME 검색에 product/ingredient를 섞는 변경
- product→canonical ingredient link와 pantry effective ingredient (#2)
- MEAL_LOG 저장, custom recipe product attach, meal-log UI (#9/#12)
- 초성 검색, 자동 교정 문구, 외부 검색엔진, runtime provider query, 광범위 1글자 typo
- 공식 문서에 없는 request/response field, source/status/error, visibility override
- 기존 product planner 신규 추가 UI 복원 또는 PLANNER_WEEK 재설계
- production/staging 데이터 write, unmerged migration remote 적용

## Dependencies

- PR #1072 official cooking/meal-log contract gate merged
- `nutrition-products-cross-slice-release-qa` merged at `c9315520`
- public catalog evidence: 287,041 visible public products, duplicate key 0, missing current version 0
- `prepared-food-catalog`, `community-prepared-food-catalog`, `public-prepared-food-catalog-import`, `prepared-food-standard-basis-ux` merged
- F0 Stage 1 docs PR #1073 merged; runtime F0 activation is not a dependency for this independent read-only train.

## Backend First Contract

### Route and parser

- authentication follows official 🔒 endpoint policy and keeps the common wrapper/error object `{ code, message, fields[] }`.
- parser allowlists only official filters. `visibility` is rejected even if its value looks valid; unknown/duplicate-conflicting filter values are not silently coerced.
- `q` is NFKC-normalized with a measured length cap before DB work. The exact cap and candidate cap are implementation constants locked by tests and performance evidence, not new public fields.
- response never exposes owner UUID, moderation internals, stable private keys, raw ranking score, cursor tuple, query fingerprint, or provider payload.

### Scope before ranking

- ingredient and food-product candidates apply their own read/visibility predicates before union/ranking.
- `source=mine` adds only the authenticated caller's eligible private product rows. It cannot widen public/community moderation or select another owner.
- deleted, hidden by report/operator, invalid-current-version, or other-owner private products are absent from item, count, cursor, timing comparison, and error detail.
- public dataset products must still resolve the exact current approved nutrition version/source/profile/value chain. An older version is never substituted silently.

### Database and ACL

- normalizer is immutable and search document/index expressions are deterministic. Search path is safe with `pg_temp` last and no writable untrusted schema.
- public and private candidate indexes are physically/logically separated so private presence and scale do not affect public result eligibility.
- ranked RPC is application-controlled read-only, accepts server-derived actor/filter inputs, and is added to the function inventory/checksum regression. `PUBLIC`/`anon` direct execute is denied; exact intended server principal only is granted.
- all indexes/RPC/grants are replay-safe. Existing/fresh/replay migration tests compare signatures, ACL, plans, row digests, and legacy cursor behavior.

### Ranking and pagination

- indexed exact/fragment/trigram retrieval is bounded before ranking. Candidate cap is the smallest measured cap that retains Recall@20.
- raw trigram similarity may contribute only after candidate admission and is quantized before ordering/cursor encoding.
- order comparison, SQL `ORDER BY`, cursor encode/decode, and next-page predicate use the exact same tuple and direction.
- no duplicate or omission is allowed across same-score/type/source/timestamp boundaries; filter/query/cursor algorithm mismatch returns `400 INVALID_SEARCH_FILTER`.

## Frontend Delivery Mode

- shared search client/parser and existing product search control behavior only; no layout, navigation, card hierarchy, copy hierarchy, or anchor screen change.
- debounce is 200~300ms and pauses during Korean IME composition. composition end issues one current query request.
- an AbortController may save work, but correctness is owned by monotonically increasing request generation so a late response cannot replace or append to newer results.
- existing loading/empty/error/read-only/unauthorized behavior and return context remain; this slice does not re-enable removed product planner creation.

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: none; HOME and PLANNER_WEEK visual structures are unchanged.
- Visual artifact: N/A — cursor, debounce, IME, and stale-response control are behavior-only and reuse existing components/tokens.
- Authority status: `not-required` for Stage 1; Stage 5 independently reviews behavior/accessibility regression. Any later layout or anchor change requires a separate design artifact/authority gate.

## Design Status

`N/A`. No new screen or visual system change. Existing UI states are regression-tested at Stage 4/5.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.22.md` G
- `docs/화면정의서-v1.5.28.md` MEAL_LOG product/ingredient search behavior
- `docs/유저flow맵-v1.3.25.md` ⓰
- `docs/db설계-v1.3.23.md` K
- `docs/api문서-v1.2.27.md` I / `GET /food-catalog/search`
- `docs/workpacks/{prepared-food-catalog,community-prepared-food-catalog,public-prepared-food-catalog-import,prepared-food-standard-basis-ux}/`
- `docs/workpacks/nutrition-products-cross-slice-release-qa/evidence/2026-07-18-stage2-real-db.md`
- approved master plan section 5 and successor #1

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs current validators only: SOT/workflow/workpack/automation/bookkeeping/doc-gate, focused workflow Vitest, lint, typecheck, dependency audit, and diff check. GitGuardian independently scans the PR head for secret exposure.
- Stage 2 first creates failing tests and observes RED before production code. Planned targets include route/parser/cursor/ranking/security tests, isolated PostgreSQL existing/fresh/replay runner, 287,041-row relevance/performance runner, and merged-exact-SHA remote read-only verifier.
- Stage 4 creates client debounce/IME/stale-generation tests and focused Playwright behavior coverage. Missing planned commands/files fail implementation/closeout; Stage 1 does not claim they already execute.

### Relevance and performance fixture

- 50~100 human-labeled queries with positive/negative relevance sets; no raw private user data or secret is committed.
- required positives: `연세크림빵`, `연세 크림빵`, `연세우유`, `생크림빵`, whitespace/punctuation variants.
- required negatives: `연세`-only non-bread and `크림빵`-only non-연세 products.
- `연세크림빵` designated three products are on page 1; all-fragment coverage precedes one-fragment matches.
- gates: Recall@20 ≥90%, Precision@20 ≥75%, 287,041-row limit-20 DB p95 ≤300ms and route p95 ≤600ms.
- EXPLAIN ANALYZE: `연세크림빵`, spaced compound, 1~2 char, unified source filters, legacy `all/manual`, and owner-private-inclusive authenticated query. Plans must use bounded indexed candidates rather than full-table ranking.
- cold/warm samples, runner hardware/runtime, iteration count, candidate cap, row counts, sanitized plan summary, and external write count 0 are recorded.

### Security and compatibility

- A/B owners plus anon/authenticated/server exact-principal matrix; other-owner/hidden/reported/deleted/private existence leak 0.
- same-score cursor boundaries, v1→completion, new v2, query/filter mismatch, algorithm version mismatch, duplicate/omission 0.
- current nutrition version/source provenance remains exact; report/moderation transitions remove new search eligibility without deleting pinned history.
- runtime external provider requests, secrets/raw payloads, and production/staging writes are 0.

## Key Rules

- official typed union and one server cursor are the only relevance authority; client merge is forbidden.
- visibility is server-derived and always applied before ranking.
- float similarity never crosses the cursor contract.
- query relevance outranks source/recency when q is present; empty browse compatibility stays stable.
- legacy v1 cursor pages complete with legacy ordering; only a new first page begins v2.
- performance gain may not weaken recall, precision, current-version admission, owner isolation, or moderation.
- no official contract or DB/API field is invented in implementation.

## Primary User Path

1. An authenticated user enters a product/ingredient query in an approved consumer, not HOME.
2. The client waits 200~300ms and does not request during IME composition.
3. The server validates filters/cursor, derives caller scope, retrieves bounded indexed candidates, and globally ranks the typed union.
4. The user sees the designated full-coverage products before partial matches and can load the next page with the single opaque cursor.
5. A newer query/filter generation invalidates late old responses without mixed pages or false empty state.

## Delivery Checklist

- [ ] additive normalizer/search-document/public-private index migration and replay safety <!-- omo:id=delivery-search-schema-index;stage=2;scope=backend;review=3,6 -->
- [ ] official unified route/parser/filter/error wrapper only <!-- omo:id=delivery-search-route-contract;stage=2;scope=backend;review=3,6 -->
- [ ] scope-before-ranking, current nutrition version, moderation and owner isolation <!-- omo:id=delivery-search-scope-security;stage=2;scope=backend;review=3,6 -->
- [ ] v1 dual decode and integer v2 tuple/fingerprint pagination without duplicate/omission <!-- omo:id=delivery-search-cursor-v2;stage=2;scope=backend;review=3,6 -->
- [ ] 50~100 labels, designated three, Recall/Precision and 287,041 p95/EXPLAIN gates <!-- omo:id=delivery-search-relevance-performance;stage=2;scope=backend;review=3,6 -->
- [ ] legacy `/food-products` source/current-version/moderation/pagination regression <!-- omo:id=delivery-search-legacy-regression;stage=2;scope=shared;review=3,6 -->
- [ ] client debounce, IME composition and latest-generation-only response handling <!-- omo:id=delivery-search-client-control;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/read-only/unauthorized and no-layout/no-anchor regression <!-- omo:id=delivery-search-ui-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] local existing/fresh/replay, exact ACL/function inventory, secret/provider/write-zero evidence <!-- omo:id=delivery-search-security-evidence;stage=2;scope=shared;review=3,6 -->
- [ ] independent performance, security, five-axis, Stage 5 and Stage 6 approvals plus current-head checks <!-- omo:id=delivery-search-independent-closeout;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- [ ] 실제 production/staging migration 또는 data load는 merged exact SHA와 별도 release gate에서만 수행한다.
- [ ] 실제 모바일 기기의 한국어 IME 종류별 조합 감각 확인은 자동화 이후 수동 보조 evidence다.
