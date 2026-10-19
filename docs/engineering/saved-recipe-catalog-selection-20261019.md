# 저장 YouTube 재료의 명시 식품 연결 — 2026-10-19 로컬 후보

현재 목차 후속 웹d09ab4·DB238이다. 아래48c4에서 확인한 데이터/완료 저장 근거는 그대로 유효하며 [최종 운영 기록](cooking-experience-operating-checks-20261019.md)을 따른다.

최종 통합/운영은 웹48c4·DB238이다. 실제 두 오일 행의 소유자 CAS와 새 nutrition/content pin,원문/수량/과거 기록 보존을 확인했다. [현재 운영·검증·남은 원천](cooking-experience-operating-checks-20261019.md)을 우선한다. 아래는 원 작성 worktree의 단계별 후보 기록이며 당시 미반영/Anti Slop 기존5 문구를 현재 상태로 읽지 않는다.

기준 `4819d70fc`, 별도 branch `codex/saved-recipe-catalog-link-20261019`에서만 구현했다. 운영 두 레시피/DB·배포·정책·키·worker·원격·커밋 변경은 0이다. #8 전체 완료가 아니다. 이 문서는 명시 식품 연결과 기존 발행 경로를 재사용하는 로컬 후보를 기록한다. 실 운영 두 대상과 실제 브라우저 확인은 아직 이 후보의 검증 범위 밖이다.

## 계약과 구현

재료의 optional `catalog_ingredient_id`는 소유자가 선택한 UUID 또는 명시 해제 null이다. 실제 `ingredients` 행의 존재와 기존 selectable predicate를 모두 확인한다. predicate만으로 실제 존재가 증명되지 않는다. field 생략은 같은 행/이름의 기존 명시 선택을 보존하며 기존8key 행에는 null을 덧붙이지 않는다. 이름 변경은 이전 선택을 지운다. receipt 재시도는 해당 receipt의 서버 보관 선택을 먼저 복원하므로 이후 연결/해제에도 원 응답을 재생한다.

저장 UI의 검색/후보/등록 선택은 원 `standard_name`, 현재량/단위/미확인 상태, 표시 원문, component와 source pointer를 유지한다. 선택한 식품명은 별도 보조행으로 표시한다. 수정 중인 수량은 먼저 저장한 뒤 식품을 연결하며, 선택 후 수량 편집은 저장해 새 context를 읽을 때까지 잠긴다. 원천에서 파생된 ID를 소유자 명시 선택으로 자동 저장하지 않는다.

`20261019120000_youtube_saved_catalog_selection.sql`은 다음 **5함수의 본문만** 같은 OID로 교체한다.

- `private.validate_youtube_saved_recipe_editable_content(jsonb,jsonb)`
- `private.project_youtube_saved_recipe_ingredient_links(public.youtube_saved_recipe_results)`
- `private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results)`
- `private.sync_youtube_saved_recipe_canonical()`
- `public.read_public_youtube_saved_recipe_detail(uuid)`

기존 public write RPC/session/owner/CAS/멱등 receipt, table/RLS/ACL/owner/volatility/security/config와 과거 migration은 그대로다. source JSON을 재작성하지 않는다. food-dependent frozen spoon/count/density 수량은 다른 식품에 재사용하지 않고 `QUANTITY_INPUT_REQUIRED`로 거절한다. 검증된 SI direct mass/volume snapshot만 metadata 선택과 함께 보존한다. 미확인량에 임의 g/ml 값을 만들지 않는다.

공개 projection의 `catalog_selection_present`는 UUID 선택 **및 null 해제 field 존재**를 전달하는 boolean이다. owner/source/receipt 내용을 노출하지 않는다. 이 flag가 있으면 현재 공개 상세 영양은 current row/profile로 계산하며 오래된 persisted snapshot으로 fallback하지 않는다. 계산 실패는 일시 불가다. 선택 없는 기존 canonical의 persisted snapshot 우선과 제품 경계는 유지한다.

명시 선택이 old/new 재료에 있고 title/steps/재료/기본 인분이 바뀌면 canonical owner 확인 뒤 기존 nutrition writer marker로 `is_current`만 해제하고 이전 marker를 복원한다. 과거 영양 payload와 meal/cook pin ID는 바꾸지 않는다. 새 meal은 현재 ingredient ID/량의 content pin을 만들지만 **아직 새 영양 발행이 없으므로 nutrition pin은 null**이다. 기존 완료 resolver는 이 경우 unavailable을 반환한다. source 불변 guard가 실패하면 같은 TX의 recipe 변경/current 해제도 모두 롤백된다.

## 236 최초 보존 산출물과 검증

- 합성 API/UI/공개 projection·영양 5파일 **68 PASS**. 실제 browser/mobile/desktop 화면 검사는 미실행이다.
- `scripts/run-saved-recipe-catalog-postgres.mjs`: 승인된 SHA 고정 schema-only232(153 tables/0 rows), 원233/234/235와 새236을 신규 소유 PG에 적용했다. 36역할/23membership 및 nonsecret role setting을 복원하며 `--network none`, port/mount 0, synthetic account/session만 사용한다. 실 PostgREST HTTP 검사는 이번 runner 범위가 아니다.
- 실제 service_role saved RPC 포함 **15 SQL PASS**: known/unknown 연결, owner 거부, 미존재 거부, CAS/키 재사용/원 receipt replay, 구8key와 선택 생략/해제, frozen SI 보존/추정 거부, 공개 해제 marker, 기존 영양 payload·과거 meal pin 불변, 새 meal 현재 catalog pin, 같은 TX marker 원복, immutable-source 실패 전체 롤백.
- 실제 pg_proc 비교에서 위5 body만 바뀌고 그 OID/owner/ACL/config/volatility/security 및 다른 public/private 함수가 같다. 원 worker expected-schema의 실제 readiness SQL을 synthetic gen50/policy로 실행해 전후 같은 ready/catalog fingerprint를 확인했다. 운영 worker/auth 동등성 또는 migration 배포 승인은 아니다. 소유 컨테이너 cleanup/absence 확인 성공.
- typecheck와 관련 ESLint exit0. `pnpm verify:anti-slop`은 기존5 baseline 초과 때문에 fixture-probe 단계 exit1이다. direct 검사도 같은5개이고 해당 파일은 base와 byte-identical, 이번 제품 변경 파일 신규 finding0이다. baseline은 갱신하지 않았다.
- build 및 실제 Chrome은 미실행. 운영 적용 authority·독립 코드 리뷰는 별도다.

최초 SQL 시도는 기존235 seed의 과거 SHA를 잘못 고정해 seed 전에 종료했다. 현 base seed SHA `2a1d51a328205296c87aceecc0e443815dae23f8228a451b0dcd29d48102c0d2`로 고정했다. 다음 음성회귀에서 selectable predicate만으로 미존재 UUID를 수락하는 신규 validator 결함을 발견해 실제 row EXISTS를 추가했다. current-retire 3검사의 첫 실패는 raw bool t/f JSON 파싱과 retired row RLS 관측의 fixture 오류였고, 실제 RPC는 service_role로 유지하며 검증용 retired payload 조회만 fixture 관리자 role로 분리했다. 이 실패를 운영 결함이나 통과로 표현하지 않는다.

고정 fixture가 있는 같은 로컬 환경에서만 다음 명령을 실행할 수 있다. 운영 target/connection 인수는 받지 않는다. 다른 Mac에서 경로만 복사해 실행 가능한 범용 도구가 아니다.

```sh
/Users/cwj/.nvm/versions/node/v22.19.0/bin/node scripts/run-saved-recipe-catalog-postgres.mjs
/Users/cwj/.nvm/versions/node/v22.19.0/bin/node node_modules/vitest/vitest.mjs run tests/youtube-saved-recipes-route.test.ts tests/youtube-saved-quantity.ui.test.tsx tests/youtube-saved-public-recipe.test.ts tests/youtube-public-nutrition-route.test.ts tests/youtube-public-recipe-nutrition.test.ts
```

로컬 SQL 보고서는 `/tmp/homecook-saved-catalog-postgres-report.json`, 로그는 `/tmp/homecook-saved-catalog-vitest.log`다. 고정 archive SHA와 suite/DDL SHA 및 한계는 [검증 요약 JSON](data/saved-recipe-catalog-selection-checks-20261019.json)에 보존한다.

## 영양 발행 후속 설계와 구현 범위

현재 `prepareRecipeNutritionSnapshot`/`recalculateRecipeNutritionSnapshot`는 `recipe_ingredients`만 읽고 `write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)`를 호출한다. saved canonical의 재료는 editable JSON/build snapshot에만 있어 단순 재호출은 빈 재료 계산이다. saved PATCH와 meal 등록 전 자동 ensure는 없다. #8의 새 meal/완료 영양 누락 해결에는 다음 별도 최소 계약이 필요하다.

1. **기존 public guard wrapper만 확장**: `public.build_recipe_nutrition_input_guard(uuid)`에 saved canonical 분기를 둔다. 동일 recipe revision/current content hash와 현재 projection의 순서·선택 ID·amount/unit·frozen quantity를 서버에서 결속하고 기존 profile/conversion/piece/source evidence guard와 합친다. physical `recipe_ingredients` 경로는 원문 그대로 유지한다. `private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)` 및 private draft/piece helpers는 수정하지 않는다. 기존 public draft predecessor builder 재사용은 후보이나, 현재 `canonicalize_recipe_future_draft`가 빈 steps를 거절하므로 saved의 합법적인 빈 steps를 dummy로 위조해서 통과시키지 않는다. 이 경우를 포함한 구체 projection 동등성 검증이 먼저다.
2. **기존 writer의 lock 집합만 확장**: `public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)`가 기존 recipe advisory/row lock 아래 canonical projected IDs를 읽어 동일 ingredient lock helper에 전달한다. 지금은 physical rows만 모아 빈 lock 집합이 된다. owner PATCH와 recipe 잠금 순서를 뒤집지 않으며 saved row 추가 lock으로 deadlock을 만들지 않는다. expected updated_at CAS, 실제 guard 동일성, source 별도 검증, v4/v5 `private.recipe_quantity_guard_v4`의 context+recipe revision, snapshot identity/payload 불변 검사는 유지한다.
3. **TS/호출부 재사용**: `recipe-nutrition-service.ts`에서 canonical branch에 한해서 owner 승인 결과와 동일 recipe revision/updated_at/current projection을 입력으로 사용하고 미확인량·frozen evidence를 보존해 기존 calculator와 payload writer를 사용한다. 저장 handler의 owner/CAS RPC **성공 후 받은 revision과 일치할 때만** 발행한다. 단순한 "최신 revision으로 다시 시도"는 다른 편집을 덮는 것으로 금지한다. DB expected updated_at와 canonical revision/hash가 성공 시점까지 같은지 함께 확인한다. publication 실패를 저장 실패처럼 보이게 해 멱등 응답을 깨지 않고, 재개 가능한 pending/불가 상태로 알린다. 새 RPC/worker/key나 기존 보호 predicate 완화는 하지 않는다.
4. **필수 실제 회귀**: PATCH 승계중 경쟁 revision→발행 거부/잘못된 current0; profile/evidence drift→guard 거부; source mismatch; v4 frozen quantity 원본 보존과 unknown partial; 동일 요청 재시도/발행 재시도; 새 meal/독립 cooking pin 및 완료 값이 새 snapshot을 사용; 과거 pin/값 불변; publication 실패 후 stale 값 노출0. 격리 fixture에서 worker fingerprint/private piece 함수 byte 불변을 다시 확인한다.

정정: worker 공유 dependency contract 실제 목록에는 exact matcher 2개와 YouTube quantity helper/admission가 있고 nutrition input guard는 없다. private pre-product guard의 exact 고정은 piece-unit 보호엔진에 있다(`scripts/lib/prelaunch-piece-unit-readiness.mjs:56`). 따라서 public wrapper의 canonical 분기는 검토할 여지가 있지만, 이는 새 검증·운영 authority가 필요 없다는 뜻은 아니다. 최초236 산출물은 아래 patch로 보존했고, 후속237을 별도 forward migration으로 작성했다. 아래 구현 검증과 운영 미적용을 구분한다.


## 237 구현 후보 — 저장 후 동일 revision 영양 발행

최초236 산출물은 `/tmp/homecook-saved-catalog-stage1-20261019.patch` (SHA256 `b03cb26cbc2b141512e6865a8da5fe8b81cd40029ef3bcde9233777c78fec264`)와 최초15검사 보고서(별도 stage1 copy SHA256 `95850506de9daa9eab9637bcd5a54b1dd2ddc12c7ee95577b051501f45941b2e`)에 보존했다. 이 과거68/15 결과는 이후 변경의 새 검증 결과가 아니다.

후속236 owner DTO에 읽기 전용 `canonical_content_hash`를 추가했다. 기존 owner/session gate 아래 현재 canonical snapshot input의 hash를 제공하며 공개 source projection에는 노출하지 않는다. 같은5함수 범위다.

`lib/server/youtube-saved-recipe-nutrition.ts`는 owner 저장 RPC가 성공한 **그 원 receipt**의 draft/recipe/revision/updated_at/hash를 다시 확인한다. 최신 편집으로 자동 추종하지 않는다. 현재 editable row UUID와 공개 canonical projection, 기존 승인 DB profile/conversion/piece predecessor만 사용해 기존 calculator/payload writer를 준비한다. v4가 있으면 확실한 SI 입력만 허용하고 나머지 양은 결측이다. 빈 steps는 그대로 보존한다. 서비스 role로 owner-only guard를 직접 읽거나 범용 writer를 호출하지 않고 기존 authenticated `write_owned_youtube_recipe_nutrition_snapshot` wrapper를 재사용한다.

237의 public input guard는 canonical 분기에서 기존 private pre-product evidence SELECT의 현재 source 조건을 그대로 사용하며 입력행만 canonical projection으로 바꾼다. physical 분기는 기존 expression 그대로다. 기존 public writer는 recipe 잠금 뒤 canonical ingredient 집합을 기존 ingredient lock에 포함하고 owner/CAS/revision/hash/actual evidence/source/immutable identity를 확인한다. 성공 TX에서 영양 pin과 일치하는 immutable content pin을 함께 확보한다. private pinned piece guard/worker/shared helper/ACL/scope/자격/정책/세대는 수정하지 않는다.

저장 성공 응답의 durable data는 그대로 두고 `nutrition_publication.status=ready|pending|stale`를 부가한다. 이는 receipt에 저장하지 않는 현재 시도 결과여서 같은 저장 키 재시도에서도 발행 상태는 달라질 수 있다. 발행 실패를 저장 실패로 바꾸지 않는다. UI는 saved 성공과 영양 재확인 필요를 함께 알린다. 공개 상세는 명시 해제 후에도 current projection 계산을 유지해 stale snapshot으로 fallback하지 않는다.

영양 source evidence만 바뀌고 content hash가 같은 경우 기존 immutable identity가 새 결과와 충돌할 수 있다. 이 후보는 과거 payload를 덮어쓰거나 hash 정책을 바꾸지 않고 pending으로 둔다. 별도 정책이 필요한 한계다. GET/meal 등록에 새 retry/ensure service를 추가하지 않았으며, 발행 실패 중 새 meal/cooking에 영양이 없으면 unavailable을 유지한다. 운영 두 대상의 정확량/profile 존재와 실제 사용자 흐름 검증 전에는 #8 전체 완료라고 하지 않는다.


A→B→A 실제 회귀에서 원 start 함수는 현재A(20kcal) 대신 더 늦게 만들어진B(40kcal) content pin을 선택했다. 실제15검사 중 해당1개 FAIL/14 PASS로 확인했다. 과거 pin의 timestamp를 수정하지 않고, 승인된 세번째 기존 public 함수 `start_snapshot_v2_cooking_session`의 canonical standalone 선택 조건만 현재 content hash/current nutrition ID 일치로 제한했다. physical branch, 원 잠금/소유권/receipt/상태/권한은 그대로다. 발행 실패로 matching pin이 없으면 기존 RESOURCE_NOT_FOUND로 거절하며, 이 후보에서 재시도 서비스나 새 오류 정책을 만들지 않았다. 기존 선택 없는 canonical의 matching null-nutrition pin은 계속 허용한다.

237은 따라서 기존 public **3함수**만 교체한다. start 함수 exact preimage `md5(prosrc)=6b576d455b8812917ce19d77de0622d0`를 확인한 뒤 교체하며, pinned private 함수와 worker shared contract의5 helper에는 이 함수가 없다. 실제 metadata·worker readiness 비교 결과는 아래 최종 검증과 함께 기록한다.


## 독립 리뷰 전 후보의 로컬 확인 — 15/18

- 현재236의 기존 **15 actual SQL PASS** (runId `ebdbc1f622b10bb6f0af77dd1f848c32`), 현재236+237의 별도 **18 actual SQL PASS** (runId `388418183c616b74fc378e775b656784`). 두 소유 컨테이너 cleanup/absence 확인 성공이다. 최초 stage1 보존 보고서와 구분한다.
- 237은 실제 TS publisher→기존 authenticated wrapper→native SQL을 실행했다. 정확량20kcal/미확인 unavailable/v4 직접량/혼합 partial/나트륨 null, owner/CAS/원 receipt replay/경쟁 편집과 evidence revoke/입력hash·guard·source 위조 거부, 명시 null 해제 후 옛 영양 미복원, 빈 steps, 새 meal·standalone 완료40kcal, A→B→A20kcal 복귀·과거 pin 불변을 확인했다. 새 meal은 registered→shopping_done→cook_done 순서이며 독립 완료는 meal을 바꾸지 않는다. 일반 physical pin과 선택 없는 canonical null-nutrition pin의 기존 경로도 통과했다.
- 실제 `pg_proc` 전체 비교에서236의5본문, 이후237의3본문만 변경했다. guard 언어 SQL→PLpgSQL 외 OID/owner/ACL/config/security/volatility가 같고 private 함수는 모두 불변이다. 원 worker readiness SQL을 합성 gen50/policy로 실행해 전후 같은 ready/catalog fingerprint다. 운영 worker의 실행·권한·인증 동등성이나 새 migration authority 승인이 아니다.
- 관련 API/UI/공개 projection·영양 **5파일72 PASS**, 최종 typecheck/관련 ESLint exit0. `verify:anti-slop`은 기존5 finding 때문에 fixture-probe exit1, direct도 기존5/신규0이다. public nutrition helper는 `export` 한 단어만 추가해 기존 finding 구문을 그대로 뒀으며 나머지4 finding 파일은 base와 같다. baseline 변경0.
- build/실제 PostgREST HTTP/실제 Chrome mobile·desktop은 미실행이다. 실제 운영 두 recipe/원천행 수정·권한·키·worker·세대·배포·원격·커밋 변경0. root의 별도 frozen quantity 수치 echo238을 이 patch에 섞지 않았다.

```sh
/Users/cwj/.nvm/versions/node/v22.19.0/bin/node scripts/run-saved-recipe-catalog-postgres.mjs --publication-regression
```

위 두 SQL runner 명령은 같은 SHA 고정 private schema-only fixture와 로컬 Docker image가 있는 이 Mac에서만 재현된다. target/connection 인수를 받지 않는다. nonsecret source-only dump를 읽어 신규 network-none PG를 만들며 live DB/앱 데이터/비밀번호/외부 모델을 읽지 않는다. 이번 suite의 증거 facade는 고정 합성 profile을 기존 TS loader 형식으로 제공하고 native owner RPC/기존 writer와 source guard는 실제 PG에서 실행한다. 실제 Supabase HTTP transport/운영 인증 흐름을 대신한 검사라고 주장하지 않는다.

수정 전 보존 보고서: `/tmp/homecook-saved-catalog-pre-retire-fix-report-20261019.json` (SHA256 `5534041db01b3254914171fb9ea89eb33f6def1f8bef83d66fd0ebb8431160d7`), `/tmp/homecook-saved-publication-pre-retire-fix-report-20261019.json` (SHA256 `8dbacf3e202bd1ca39880bdddd251ef450cbe3660a1bd95df46d24114e1f359f`). 실제 코드/DDL/suite hash는 [검증 요약 JSON](data/saved-recipe-catalog-selection-checks-20261019.json)에 기록한다.


## 독립 리뷰 후 title/steps pin 보존 보완

기존18 SQL PASS 후보의236 trigger는 재료/기본 인분만 current 영양 해제 조건에 포함했다. title/steps도 canonical content hash에 포함되므로, 이 두 필드만 바꾸고 발행이 pending이면 future-meal trigger가 기존 current nutrition ID로 과거A content pin을 재사용할 수 있었다. 새 두 actual 회귀가 수정 전 **18 PASS / 2 FAIL**로 이 current marker 잔존을 확인했다. 원 후보 patch `b347c1d0b63d6338e15f62c33364a9fea2b8ff0997c35ecce64078d1a395c9e0`는 그대로 보존했다.

236의 기존 sync 함수 retire 조건에 title과 steps 비교 두 줄만 추가했다. 기존 명시 선택/해제 key 존재 조건, owner 확인 후 같은 TX의 marker 원복/실패 롤백을 유지한다. 영양 숫자가 같아도 새 content가 과거 pin을 선택하지 않도록 하는 보완이며 과거 payload/pin/timestamp는 바꾸지 않는다. 함수 수는236의5개/237의3개 그대로이고 root의238·운영도구 변경을 포함하지 않는다.

새 회귀는 각각 title-only/steps-only에 대해 publishA→saveB→publication pending→새meal의 B content/영양null→재발행B→다음새meal의 B content/new nutrition, 과거A meal/영양 payload와 pending 중 만든 immutable pin의 불변을 확인한다. red 로그는 `/tmp/homecook-saved-title-steps-retire-red-20261019.log`에 보존한다. 수정 후 결과와 현재 파일 SHA는 검증 JSON에 별도 기록한다.


추가20검사의 첫 수정 후 실행은 assertion 결과를 내기 전에 기존 Vitest 호출 전체60초 상한으로 종료143이었다(cleanup 성공). `scripts/run-saved-recipe-catalog-postgres.mjs`에서 소유 fixture Vitest 호출 한 곳만120초로 제한을 조정했다. Docker/SQL 등 나머지 명령의60초 상한과 network-none/무target인수·정리 보호는 유지했다. 해당 실패 보고서는 `/tmp/homecook-saved-title-steps-retire-timeout-report-20261019.json`에 보존한다.


보완 후 최종: 현재236 **15 actual SQL PASS** (runId `a2e67400515f22ce928a4f3bf540b1dc`), 현재236+237 **20 actual SQL PASS** (runId `3fa9aa45b36d4a55bda977ccd21cd380`), 양쪽 cleanup/absence 확인 성공이다. 두 새 title/steps pending→새meal→재발행 흐름이 통과했다. typecheck/관련 ESLint/diff 검사 exit0이며, 기존 API/UI72 및 Anti Slop 기존5/신규0 결과는 제품 TS 변경 없이 유지한다. 현재236 SHA256 `b7df06e51c2cb9ea95eb03154cf4b80e0268c949c4d104be4f72d464d2e88ac6`,237 SHA는 `fc9f65b1d592ae60062fbc7a3eaa40da8b8fa6a3d17d6b9f676e053e6ad7e60e`로 불변이다. 운영/원격/커밋/통합tree/238 변경0, build/실제 Chrome/HTTP 미실행 한계는 그대로다.
