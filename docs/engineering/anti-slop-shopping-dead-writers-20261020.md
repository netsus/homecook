# 장보기 생성 미사용 타입 정리

기준 `e7f59dc69c2a8dad388b485a5fc44ddf00c4de7c`. 기존 `routeClient as unknown as ShoppingCreateDbClient & ...` 경계는 그대로 남긴다. JSON 검증 강화나 native 스키마 전환, 원래 잔여 진단 해결로 세지 않는다.

## 이번 작은 변경

POST의 실제 `.from` 소비는 meals/recipes/recipe_ingredients/ingredients/pantry_items 5표 읽기다. 원자 쓰기는 기존 `create_shopping_list_with_snapshot_authority` RPC다. 따라서 사용하지 않는 shopping_lists/shopping_list_recipes/shopping_list_items writer 3표, meals insert/update 및 이들의 반환 선언을 삭제했다. 남은 select/필터를 실제 문자열 literal로 제한하고 재귀 query 반환 대신 소비하는 단방향 결과를 선언했다. 제품 타입 12줄 추가/109줄 삭제, 순 97줄 감소다.

실행 쿼리·인증/owner·registered/menu 선택·snapshot 우선/recipe fallback·원문/수량/revision·원자 RPC·완료/팬트리 의미·보상 실행 순서는 변경하지 않는다. 새로운 단언/adapter/억제나 검사 완화는 없다.

## 검증

- 수정 전/후 `shopping-create-sdk-contract` 10 + `shopping-preview.backend`/`recipe-shopping-reconciliation` 48 = 3suite **58 PASS**, skip 0.
- 실제 기본 SDK/fake-fetch는 legacy 5표와 pinned 3표의 읽기 순서, 소유권 거부, 읽기 실패, 동일 request client의 bootstrap/growth, 원자 RPC만 쓰기, 원래 100g payload를 검증한다. 새 SDK 검사는 직접 SDK→수기 제품 계약의 구조 호환을 증명하는 검사가 아니다.
- `{}` JSON/[null]은 기존 TypeError, 사용하지 않는 숫자 label은 기존 201, null ingredients/null base는 기존 빈 payload와 snapshot 우선 동작을 그대로 확인했다. 이 batch에서는 malformed 정책도 바꾸지 않는다.
- 전체 비증분 `tsc --noEmit --incremental false`, 변경 파일 ESLint `--max-warnings 0`, `git diff --check`: exit 0.
- `verify:anti-slop` 전체 fixture/tool type/product 검사 exit 0: **118/baseline207/신규0**, 규칙·baseline 변경0. 이 batch의 진단 감소는 0이다.
- TypeScript ES2022/ESNext emit은 전체 제품 파일이 기준과 byte-identical: SHA256 `f8179a2336fd36a4016966c9d02b59e89ac2b20c0780061539cd9fb13a3fc4b3`.

## 후속 호환 설계 — 아직 구현하지 않음

이전 별도 작업트리의 직접 대입 TS2589·JSON 8필드 일괄 guard 미채택 증거는 보존한다. 이것을 모든 후속 변경의 불가능 판정이나 새로운 승인 gate로 사용하지 않는다.

`aggregateShoppingIngredients`는 문자열 amount를 숫자로 coercion하지 않는다. Number.isFinite가 false이면 text fallback이다. 입력의 amount/unit/display_text/ingredient_type만 unknown으로 정확히 받고, amount의 typeof 검사를 기존 Number.isFinite와 동치인 위치에 두는 후보가 있다. unit.trim은 숫자 양수 QUANT 경로에서만, display_text.trim은 truthy text fallback 경로에서만 확인해야 사용하지 않는 잘못된 label의 기존 201과 null/skip 동작을 보존할 수 있다. 새로운 변환이나 누락 채우기가 아니다.

상품 경로는 이미 route에서 amount typeof-number로 수량 산출을 제한한다. `scaleProductAmount`와 `convertProductQuantity`도 Number.isFinite 실패를 null로 닫으며 문자열 amount를 수치로 바꾸지 않는다. 따라서 수학 본체를 바꾸기보다 `productPurchaseSuggestion`의 소비 입력만 amount/unit unknown으로 분리하고, 실제 변환 진입 시 좁히는 방법을 검토할 수 있다. 상품 label은 해당 상품 분기에 들어왔을 때 `.trim`을 호출하므로 generic의 미사용 label과 다르게 다뤄야 한다.

확장 최소 후보는 route + `lib/server/shopping.ts` + `lib/server/recipe-product-quantity.ts`와 관련 회귀다. 다만 unknown JSON의 ingredient/product identity를 기존 truthy 분기·readProductQuantityContexts의 문자열 pin 계약·실제 원자 RPC payload에 어떻게 연결할지도 별도로 검증해야 한다. 기존에 허용한 malformed identity의 처리를 모른 채 string guard를 추가하거나 새 타입 단언으로 숨기지 않는다. 먼저 기존 scalar/누락/단위/label/상품 ID별 결과와 전달 payload를 작은 회귀로 고정한 뒤 단계별로 판단한다. 이 설계 확장은 이번 작업에 구현하지 않았다.
