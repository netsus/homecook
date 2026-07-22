# prepared-food-search-relevance Acceptance

## Happy Path

- [ ] `연세크림빵`의 designated 3 products가 first page에 모두 있고 two-fragment coverage가 one-fragment보다 앞선다 <!-- omo:id=accept-search-designated-three;stage=2;scope=backend;review=3,6 -->
- [ ] ingredient와 food product가 official discriminated union `items[]`와 single `next_cursor`로 전역 정렬된다 <!-- omo:id=accept-search-unified-page;stage=2;scope=backend;review=3,6 -->
- [ ] exact/compact/all-fragment/trigram 순서와 query-present relevance-first tie-break가 deterministic하다 <!-- omo:id=accept-search-ranking;stage=2;scope=backend;review=3,6 -->
- [ ] client는 200~300ms debounce와 IME composition end 뒤 최신 generation 결과만 표시한다 <!-- omo:id=accept-search-ime-generation;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] `types=ingredient,food_product`와 `source=public|community|mine`만 허용하고 visibility는 caller/server state에서 파생한다 <!-- omo:id=accept-search-filter-policy;stage=2;scope=backend;review=3,6 -->
- [ ] q가 있으면 relevance가 source/type/recency보다 우선하고 q가 없으면 legacy stable browse 의미를 유지한다 <!-- omo:id=accept-search-query-browse-policy;stage=2;scope=backend;review=3,6 -->
- [ ] 1~2글자는 fuzzy를 사용하지 않고 no-space 4+는 양쪽 2+ split만 평가한다 <!-- omo:id=accept-search-short-split-policy;stage=2;scope=backend;review=3,6 -->
- [ ] HOME은 recipe-only이고 product planner 신규 추가 UI는 되살아나지 않는다 <!-- omo:id=accept-search-consumer-boundary;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] invalid types/source/cursor 또는 visibility parameter는 `400 INVALID_SEARCH_FILTER`와 common fields array를 반환하고 result/cursor는 없다 <!-- omo:id=accept-search-invalid-filter;stage=2;scope=backend;review=3,6 -->
- [ ] other-owner private, hidden/reported/deleted product는 item/count/cursor/error/timing evidence에 노출되지 않는다 <!-- omo:id=accept-search-private-moderation;stage=2;scope=backend;review=3,6 -->
- [ ] ranked RPC의 exact signature/search_path/ACL이 inventory에 있고 PUBLIC/anon direct execute가 거부된다 <!-- omo:id=accept-search-rpc-acl;stage=2;scope=backend;review=3,6 -->
- [ ] runtime provider request, service secret, raw private query/user identifier가 response/log/evidence에 없다 <!-- omo:id=accept-search-secret-provider-zero;stage=2;scope=shared;review=3,6 -->

## Data Integrity

- [ ] normalizer/search projection/index/RPC migration이 additive이며 existing/fresh/replay에서 같은 signature/ACL/result를 만든다 <!-- omo:id=accept-search-migration-replay;stage=2;scope=backend;review=3,6 -->
- [ ] public/private candidate paths are separated and visibility/moderation/current-version predicates run before ranking <!-- omo:id=accept-search-candidate-isolation;stage=2;scope=backend;review=3,6 -->
- [ ] v2 cursor는 official integer tuple과 query/filter fingerprint만 담고 raw float를 담지 않는다 <!-- omo:id=accept-search-v2-cursor;stage=2;scope=backend;review=3,6 -->
- [ ] v1 cursor는 legacy ordering으로 끝까지 처리되고 new first page부터 v2가 발급된다 <!-- omo:id=accept-search-v1-compat;stage=2;scope=backend;review=3,6 -->
- [ ] same-score/type/source/time page boundary에서 duplicate/omission 0이고 mismatched fingerprint/version은 fail closed한다 <!-- omo:id=accept-search-pagination-integrity;stage=2;scope=backend;review=3,6 -->
- [ ] public product는 exact current approved nutrition version chain만 반환하며 older version을 대체하지 않는다 <!-- omo:id=accept-search-current-version;stage=2;scope=backend;review=3,6 -->
- [ ] existing `/food-products` all/public_dataset/manual, moderation, owner-private and pagination regressions stay green <!-- omo:id=accept-search-legacy-products;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [ ] actual local public catalog denominator is 287,041 with duplicate external key 0 and missing current version 0 <!-- omo:id=accept-search-denominator;stage=2;scope=backend;review=3,6 -->
- [ ] 50~100 labeled queries contain required positive/negative/spacing/punctuation/short-query/source/private cases <!-- omo:id=accept-search-labeled-fixture;stage=2;scope=backend;review=3,6 -->
- [ ] Recall@20≥90%, Precision@20≥75%, DB p95≤300ms and route p95≤600ms at limit 20 <!-- omo:id=accept-search-quality-performance;stage=2;scope=backend;review=3,6 -->
- [ ] `연세크림빵`, spaced compound, 1~2 char, unified `public|community|mine`, legacy `/food-products` `all|manual`, authenticated owner-private-inclusive mandatory EXPLAIN ANALYZE cases all prove bounded indexed candidate retrieval without full-table rank scan <!-- omo:id=accept-search-explain;stage=2;scope=backend;review=3,6 -->

## Manual QA

- [ ] desktop/390/320 existing search control preserves loading/empty/error/read-only/unauthorized without visual hierarchy change <!-- omo:id=accept-search-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Korean IME composition produces no intermediate request, one composition-end request and no stale result flash <!-- omo:id=accept-search-ime-manual-flow;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] real production/staging migration or data load is not performed before merged exact SHA release gate
- [ ] physical-device IME feel across installed keyboards remains manual supplementary evidence

## Automation Split

- [ ] Stage 1 runs only current docs validators, focused workflow tests, lint/typecheck, dependency audit and diff checks; GitGuardian scans the PR head independently <!-- omo:id=accept-search-stage1-gate;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 2 adds tests first, observes RED, then implements route/parser/cursor/SQL/security/performance artifacts <!-- omo:id=accept-search-tdd-red;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 4 adds debounce/IME/latest-generation unit and focused Playwright behavior tests <!-- omo:id=accept-search-stage4-client-tests;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 3 security/performance/5-axis and Stage 5/6 independent Codex reviews have unresolved P0/P1/P2 0 <!-- omo:id=accept-search-independent-reviews;stage=4;scope=frontend;review=5,6 -->
- [ ] Draft→Ready and every current-head started check finish success or documented normal skip before squash merge <!-- omo:id=accept-search-current-head-ci;stage=4;scope=frontend;review=5,6 -->
- [ ] merged exact SHA remote read-only smoke preserves public/private/moderation/current-version/cursor behavior and external writes 0 <!-- omo:id=accept-search-remote-smoke;stage=2;scope=shared;review=3,6 -->
