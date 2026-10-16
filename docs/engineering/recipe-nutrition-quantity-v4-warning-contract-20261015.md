# C04 영양 snapshot의 정확한 수량 사유 호환

## 2026-10-15 운영 반영 — DB229와 같은 요청 발행 복구

앱 #1715·기존 배포 도구 #1717/#1718/#1719로 DB228→229와 최종 웹 B `aad3135bca56870eb8f2da5ccce7be9d63d0fb29`·build `prelaunch-aad3135bca56-MMohRN`를 운영 확인했다. 배포 exit0·1,450 PASS·선택 범위 밖133 skipped, loaded=true·recoveryPending=false·source/applied229·pending0이다. 이 단위11경로는 배포 source와 일치한다. 아래 후보/미적용/실제 복구 대기 문장은 당시 기록이며 이 절이 최신이다. 원 SQL SHA `a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd`와 단일 validator·권한 보존 계약은 그대로다.

실제 같은 pending 요청은 호환 reader A `f0ae89064202fa63c5f13907dcfbd860494d65f8`+DB229에서 원 recipe1/receipt1·public·영양 snapshot1로 복구됐다. `recipe-nutrition-v4` partial·반영1/2·`DENSITY_REQUIRED`와 원1/3L·1/7kg를 유지했다. 실제 소유자320/375/1440의3인분0.5L·0.214kg·조리 원문, guest 공개 읽기/같은 상세 login next와 최종 B의 소유자/guest 재조회를 총괄이 확인했다. 성공 후 별도 fresh 중복 요청과 실제 OAuth는 실행하지 않았으며 격리 replay 검사로 이 빈 운영 표본을 채우지 않는다.

전후 지문의 기존4계획·2재료·3content snapshot·진행 세션은 동일하다. 공개 전환 대상 recipe 전체 지문은 달라졌으며 모든 recipe 행 불변이나 과거 영양 재계산을 주장하지 않는다. DB commit 요약의 보존 행/control 검사와 최종 source 결속에서 기존 C03/C01/C04·개인 확인 writer/worker policy 유지·R2 false를 확인했다.

실패 기록도 보존한다. 사전 READ ONLY 기대구조 투영 P1은 적용 전에 교정했다. 첫 DB 실행은 COMMIT dispatch 전 rollback 후 ledger228·원 보존 지문 동일과 `not_applied`를 확정했고 자동 재시도는0이었다. 첫 실제 예외 원문은 미보존이므로 원인을 확정하지 않는다. 순수 재현으로 확인한 동등 fingerprint 객체의 key 순서 비교2곳만 #1718에서 교정해 같은 필드/값 검사를 유지했고, 명시 재시도에서229 commit을 확인했다. 웹 인계 entry gate #1719 보완 뒤 B 배포를 마쳤다. A 복구 요약의 당시 ‘B 차단’ 한계는 최종 deploy/source 결속과 `progress.json.resume_latest`의 후속 확인으로 구분한다.

근거는 비공개 `mumeok-beta-nutrition-validator-20261015-uq1hcgt6`의 최신 진행·최종 status/source 결속·DB commit·실제 복구/영양·전후 history·첫 실패 요약이다. [최신 운영 장부](mumeok-beta-v9-progress-20261013.md#영양-수량-사유-db229와-수동-발행-복구-운영-확인--2026-10-15)를 따른다. 문서 작성에서는 지정 JSON만 대조했고 운영 명령·DB·브라우저를 재실행하지 않았다. backup/roles/env 원본·키를 열람하지 않았다. #1720은 병합됐으나 공식 범위에서 제외된 신규 완제품 계획을 대상으로 삼은 제안·구현의 범위 판단 오류로, 배포 없이 #1721에서 철회 완료됐다. 별도 비공개 `mumeok-beta-product-planner-unit-20261015-8ksf_me9`의 `withdrawal-complete.json`은 철회 source `ddfe55029a398094328879ff026bb9f324be6f7c`·master `4153669618b82025530cdeb35155e8f4c1ffa091`, 철회87 PASS·타입/lint·Anti Slop 신규0과 복원 FoodProductPicker의 운영 bytes 일치를 기록한다. 이는 영양 배포1,450검사와 별개이며 운영 B·DB229와 이 단위의 운영 신규 진입·실제 완제품 계획 데이터·신규 테스트 쓰기0은 그대로다. 기존 조사·검사·리뷰의 실패 이력은 보존하고 후속 U-A11은 실제 허용된 레시피 재료 입력을 대상으로 한다. C05는 운영 미적용·수집 OFF·기간 미정이며 새 AI/추출/P5·정확도 평가·전체 v9 완료가 아니다.

상태: `0bcf0133c7e9bd450897a7d6a10b46d39f211a34` 기반 `codex/mumeok-nutrition-v4-reasons`의 별도 후보다. 기존 #1712/97b 수동 공개 컨텍스트 수정과 수량 조회 묶음은 보존했다. 실제 운영 DB·키·브라우저·AI·worker는 변경하지 않았다.

## 확인한 실패와 변경

기존 v4 calculator는 정상 미상인 밀도 부족을 `DENSITY_REQUIRED` 경고와 행별 누락 사유로 반환했다. 실제 prepare 결과를 실제 snapshot payload creator에 연결하면 JS validator가 `INVALID_SNAPSHOT_STATUS`로 거절했다. SQL validator도 같은 상세 사유를 허용하지 않아 JS만 고쳐도 공개 transaction이 `INVALID_SNAPSHOT_PAYLOAD`로 rollback됐다. 상세 사유를 기존 상위 사유로 바꾸지 않고 두 검증 경계를 맞춘다.

| 정확 코드 | 의미 | missing reason |
| --- | --- | --- |
| `UNIT_DEFINITION_REQUIRED` | 원단위의 검토된 정의 없음 | `<code>:<row-id>` |
| `UNIT_DEFINITION_CONFLICT` | 단위 정의와 참조가 충돌 | `<code>:<row-id>` |
| `PIECE_IDENTITY_REQUIRED` | 같은 개수 단위·크기의 유효 무게 근거 없음 | `<code>:<row-id>` |
| `DENSITY_REQUIRED` | 무게·부피 사이의 유효 밀도 없음 | `<code>:<row-id>` |
| `AMBIGUOUS_EVIDENCE` | 사용할 근거를 하나로 정할 수 없음 | `<code>:<row-id>` |
| `UNIT_MEASUREMENT_ESTIMATE_USED` | 검토된 평균 측정값이 실제 계산에 기여 | 누락 사유로 허용하지 않음 |

새 쓰기는 JS와 SQL 모두 정확한 `recipe-nutrition-v4`에서만 이 추가 코드를 허용한다. 알려지지 않은 문자열·유사 version·중복·잘못된 행 사유 형식은 계속 거절한다. 평균 측정 경고는 estimated/mixed에 연결하고 direct는 거절한다. 미상은 null, 부분 계산은 partial/minimum이며 영양값·수량 계산식·원량·분수·hash/근거 선택 규칙은 바꾸지 않는다.

저장된 행의 읽기는 별도 경계다. `mapRecipeNutritionSnapshot`은 SQL writer를 통과한 행의 정확한 알려진 코드를 해석하면서 기존 수치·영양 상태·등급·출처·중복 검증을 유지한다. 읽기용 `snapshot-projection-v1`을 실제 계산 version으로 추론하지 않는다. 익명/사용자 SELECT·DTO·권한·허용 경로를 바꾸거나 version 필드를 새로 조회하지 않는다.

플래너의 기존 사유 dictionary에 6개 한글 설명을 추가했고, 레시피 카드의 기존 영양 더 보기 안에 평균 측정 안내 한 분기만 더했다. 원 코드나 임의 환산 숫자를 표시하지 않으며 새 입력·컨트롤은 없다.

## SQL의 정확 범위와 적용 경계

후보는 `20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql` 한 개다. 기존 `public.validate_recipe_nutrition_snapshot_payload(jsonb)`의 경고·누락 사유·추정 경고 분류만 checked preimage로 변경한다. 기존 함수 1개 외에 새 함수·테이블·열·RPC·grant는 없다. owner·ACL·security·search_path·volatility와 실제 writer의 recipe revision/input guard/source 검증은 유지한다. 기존 행을 UPDATE하거나 자동 재계산하지 않는다.

격리 DB228 구조에서 관측한 기준은 다음과 같다. 실제 적용 전에는 총괄이 운영 대상의 같은 함수/권한 기준을 별도로 확인해야 한다.

- SQL 파일 SHA256: `a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd`.
- 이전 함수 source MD5: `77871943de923d2be349d9a0a487f8c7`.
- 이전 함수 definition SHA256: `e355121fd91daef2006c678440e558608d4c76c0e3839d38d1aa04b5444aaf72`.
- 이후 함수 source MD5: `25806c0e6081cb90ff234114f8ef4bb6`.
- 이후 함수 definition SHA256: `40be1d8a0f50d589c9298c5eacafc8b54d0354e66ef683b18212d842641d649e`.

배포 순서는 새 코드를 읽을 수 있는 JS reader/UI 선행 → 기존 보호 경로의 DB228→229 단일 함수 변경 → 최종229 기준 결속이다. reader 선행 상태에서 legacy v3 저장/읽기는 성공하고 새 상세 경고를 내는 v4 공개는 DB228에서 비공개 pending으로 남는지 검사한다. 중간 상태를 최종 공개 성공으로 보고하지 않는다.

복구 시 현재 함수·snapshot/receipt 상태와 신규 v4 저장 여부를 확인한다. 새 snapshot이 생긴 뒤 reader를 새 코드를 모르는 구 버전으로 무조건 되돌리거나 상세 사유·원량을 삭제/재작성하지 않는다. 제공한 `validator-228-preimage.sql`은 격리 기준의 함수 원문이며 운영 자동 복구 권한이 아니다. 실제 대상·백업·maintenance·복구 검증과 적용은 총괄이 수행한다.

## 실제 구현을 연결한 격리 검사

총괄이 지정한 DB228 **구조만 있는** archive를 정확 SHA256으로 검증해 새 자기 소유 network-none PostgreSQL 컨테이너에 복원했다. host mount·공개 port는 없고 앱 테이블 153개의 행 0을 확인한 다음 합성 자료만 넣었다. 기존 운영 container나 DB에 접속하지 않았다. 검사 후 자신의 CID/tag를 대조해 제거한다.

실제 Next POST → `prepareRecipeNutritionSnapshot` → 기존 세션/revision reader → generic predecessor/context hydration → 실제 calculator → 실제 payload creator → `publishManualRecipe` → 실제 native SQL publication/runtime/snapshot writer → native SELECT → 실제 mapper를 연결한다. 해당 구현을 mocking하지 않는다. 인증 발견·클라이언트 전송·부가 bootstrap/activity 경계만 합성 adapter이며, 실제 SQL RPC가 합성 account generation/session과 기존 scope/권한을 검증한다. native SQL adapter는 source의 정확 predecessor select를 대조하며 실제 테이블/FK 자료를 조회한다. 실제 PostgREST HTTP/gateway·운영 데이터 검증을 대신하지는 않는다.

기존228에서 같은 요청은 정확 SQL validator 오류로 거절되고 private 1건/nutrition0이 남는다. 새 함수 적용 뒤 **같은 키·본문·recipe ID**의 재시도로 public·partial·`DENSITY_REQUIRED`와 행 사유가 저장되고 1/3L·1/7kg 원문/전체 ingredient row는 불변이다. 다시 재생해도 recipe/snapshot은 늘지 않는다. legacy v3 저장/읽기와 6개 코드의 SQL/JS version·quality 거절도 확인한다. 함수 전체 inventory에서 변경은 1개이며 기존 authority metadata와 control/worker row 지문은 불변이어야 한다.

## 변경 파일과 검증 증거

- 제품: `lib/server/recipe-nutrition-snapshot.ts`, `lib/planner/planner-nutrition-presentation.ts`, `components/recipe/recipe-nutrition-card.tsx`.
- DB: 위 단일 migration.
- 테스트: 새 v4 contract/native 검사·합성 fixture, 기존 recipe nutrition UI의 평균 측정 회귀.
- 공식 계약: API v1.2.43과 DB v1.3.38의 2026-10-15 addendum. 기존 공식 경로는 유지한다.

단순화는 기존 validator 본문을 재사용하고 읽기와 쓰기의 허용 경계만 구분한 것이다. 새 조회·예외 우회·경고 상위 치환·의존성을 추가하지 않았다.

검증 로그/함수 원문/metadata는 `/tmp/mumeok-nutrition-v4-reasons-evidence/`에 있다. JS 실제 producer→payload RED는 18개 중 7개 실패, 기존 거절 11개 통과다. 최종 관련 **15파일216 PASS·실패0·skip0**에는 native12개가 포함된다. 타입·변경7개 TypeScript 파일 ESLint·Anti Slop(신규0)·가짜 loopback 환경의 기본 빌드(정적94/94)·diff 검사는 모두 exit0이다. 빌드의 기존 변경 밖 경고4개는 유지한다. 함수 원문 파일의 SHA256도 위 definition SHA와 일치한다. 전체 Vitest나 운영 성공으로 확대하지 않는다. 운영 pending 레시피의 실제 완료는 총괄의 별도 검증 대상으로 남긴다.

동결 인계는 (A) DB228과 호환되는 JS/UI reader·unit/UI 테스트·공유 합성 fixture·API/이 engineering 문서, (B) 단일225000 SQL·native DB 테스트·공식 DB 문서로 구분한다. 정확 파일 목록·지문은 같은 폴더의 `freeze-manifest.json`에 있다. 실제 분리 커밋·PR·배포는 총괄이 진행한다.

[기존 수량 계약](ingredient-quantity-policy-v4-20261013.md), [공식 API](../api문서-v1.2.43.md), [공식 DB](../db설계-v1.3.38.md)를 따른다.
