# Anti Slop — 공유 계약과 후속 6건

소스 기준은 `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`다. **Anti117/baseline207/신규0, 원29계약29완료/0잔여**이며 전체275·별도49 완료가 아니다. 원163 ID의 해결46/잔여117, needs-contract-refactor는0이다. ID·snippet/hash/occurrence·원래 위치는 고정하고 해결6개만 추가했다.

후속6계약은 **머지6/운영 반영6**이다. 공식 앱-only plan/deploy exit0 후 실제 운영 ref `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`/build `prelaunch-50bcbe701e5c-JYsG4J`·loaded=true·DB238 ready를 확인했다. 공유 선행 PR1819와 미사용 정리 PR1825도 함께 반영됐으나 계약 감소와 중복 합산하지 않는다. 별도 작업트리에서 진행해 main legal dirty·catalog dirty·P5 clean WT·과거 실패 실험을 보존했다. 소스 장부만 기록하는 후속 docs PR 때문에 앱을 재배포하지 않는다.

## 실제 통합과 검사

| PR | 변경 | merge | 검사 |
| --- | --- | --- | --- |
| [1819](https://github.com/netsus/homecook/pull/1819) | native Gamification7·Progress owner3 match 선행 | `bd9aa784252e0cae2092434357497f246a87f533` | 관련138 PASS·독립76 PASS·전체 타입/lint; 진단감소0 |
| [1820](https://github.com/netsus/homecook/pull/1820) | 레시피북 생성 native1 | `d958c338f9e430d64aaa037932d5caa11466f2ee` | SDK+기존20/연결21 PASS·독립26 PASS |
| [1821](https://github.com/netsus/homecook/pull/1821) | 북 삭제 native3·능력 분리 | `c35ca89f256e950efb649e2b3a1da282a7b15515` | 표적23/root27 PASS·독립20 PASS |
| [1822](https://github.com/netsus/homecook/pull/1822) | 수동 POST native5·반환 identity 경계 | `fad86fef691baf52dfc07e63c59141979ec46589` | 표적/root57 PASS·독립 코드 검토 |
| [1823](https://github.com/netsus/homecook/pull/1823) | 장보기 완료 실제 client 직접 연결 | `5aa5e62262819dc136f8941b9d907bb48baf16a9` | 표적38/root28 PASS·독립21 PASS |
| [1824](https://github.com/netsus/homecook/pull/1824) | 팬트리 native5·view·nullable FK | `e7f59dc69c2a8dad388b485a5fc44ddf00c4de7c` | 최종42 PASS·독립29 PASS |
| [1825](https://github.com/netsus/homecook/pull/1825) | 장보기 미사용 writer·재귀 타입 순97줄 삭제 | `5208dcbdeb68bf6a229ca5a1c3156a868aa31148` | 전후/root58 PASS·제품 JS byte동일·진단감소0 |
| [1826](https://github.com/netsus/homecook/pull/1826) | 장보기 생성 native6·JSON 소비 호환 | `50bcbe701e5cf47f099b95eca7b7b1be7cccf548` | baseline30 PASS·최종/root/독립91 PASS·전체 타입/lint·APPROVE |

각 코드의 전체 비증분 typecheck·변경 lint max-warnings0·diff와 author-free 검토를 통과했다. 중복 검사 수를 더하지 않는다. e7 통합은 **43suite353 PASS**, 선택웹 **1466 PASS/133 이름필터 SKIP**, 전체 비증분 타입·Anti118/new0를 확인했다. 별도 최종 독립 검토는18suite161 PASS·타입/lint/Anti/diff, 코드 안전 finding0이며 오래된 CSoT/장부/inventory를 현재118/잔여1로 갱신해야 하는 문서 정합성 지적을 이 checkpoint에서 반영한다. PR1825는 실행 코드가 같으며 SDK10은 기존 JSON의 정상·실패 동작도 고정한다.

최종50bc 통합은 **45suite396 PASS**, 전체 비증분 타입·변경 lint·diff·Anti117/new0를 재확인했다. 별도 문서 검토는 원163 ID 불변과 상태 합계를 확인해 이전 P2를 해소했다. 마지막 배치는 source/test 독립91 PASS·전체 타입/lint/Anti와 SQL FK/nullable/enum 검토를 통과했다.

공식 배포의 선택웹은 **1466 PASS/133 명시적 이름필터 SKIP**, build PASS·98초 컴파일·정적94페이지·기존 경고4개다. 실제 status에서 readerPending=false/recoveryPending=false/normalDeploymentAllowed=true, 원 readerFloor `48c4ce03abaed534775095988a95a57525d5dd72`, databasePlanSha256 `a8795f5e5177cc77aa106ffb7b83a892260e0cfeddff3d5aabd6d1afac1a7692`와 closedR2Maintenance=true를 유지했다. rollbackAvailable=false도 그대로다. 새 build manifest200, recipe-books/shopping-lists/pantry GET의 비로그인401·success:false/data:null/UNAUTHORIZED/fields[]를 확인했다. 비공개 배포 로그는 `deploy-1792434274291.log`다. 새 SQL·환경·자격·권한·worker·정책/PIN 변경은 없고 새 전체DB 백업이나 전체 데이터 지문 재검증을 수행했다고 주장하지 않는다.

공유 Gamification 실행 JS는 동일하고 Progress3 읽기만 공식 SDK eq→match로 같은 owner URL을 만든다. 소유권/RLS/read-only/상태 전이/멱등성·보상 원장·부가 projection 실패 처리는 유지한다. 독립 검토는 타입 정확성만으로 DB/RLS 전체 안전이나 실제 인증 흐름 완료를 주장하지 않는다.

정상 수량·source/revision·canonical/public/private 분기·RPC 우선/없는 환경 호환·legacy taxonomy·optional join 이름 fallback·product-only null ingredient는 보존한다. 실행 차이는 수동 DML의 source/null owner 반환 identity·팬트리 분기별 identity의 malformed500과 장보기의 truthy 비문자열 ingredient/product ID를 후속 조회/RPC 전에 표준500으로 닫는 것이며 [공식 API43](../api문서-v1.2.43.md)에 기록했다. 장보기의 기존500은 SDK/fake22P02 관측이지 실제 운영 DB 오류 증거가 아니다. 팬트리의 두 API addendum 위치 충돌은 수동/팬트리 양쪽 원문을 모두 유지해 해결했고 source 충돌은 없었다.

## 숨기지 않는 초기 실패

- Progress 넓힌 첫 검사123 PASS/5 FAIL: 오래된 fixture2개의 match 미지원만 추가해128 PASS. native SDK 추가 후 최종 공유138 PASS.
- 북 생성 초안 교집합은 bootstrap의 동일 표 overload9건+공유2건을 노출했다. 동일 객체의 bootstrap 분리 후 공유2건만 남았고 선행 통합 후0이다.
- 수동 생성은 편집 전41 PASS/1 FAIL: derived quantity-context RPC가 빠진 fixture만 보완해42 PASS, 새 SDK8 포함50/공유 projection 포함57 PASS. 예전500 기대는 실제 기존409 UNIT_CONTEXT_STALE에 맞게 테스트만 교정했다.
- 팬트리 편집 전18 PASS/2 FAIL: 비UUID fixture와 예전 reason이었다. 실제 UUID/현행 invalid_or_empty_ids로만 복구해20 PASS, 최종 SDK15/연결 포함42 PASS. 초기 literal-parser/never-narrow 오류도 정확한 선택열/소비 view로 해결했다.
- 새 완료 fixture의 meal_ids=[]인데 growth를 기대한1실패는 실제 대표 meal 전제를 고쳤으며 제품은 바꾸지 않았다.
- 이전 permission3·보류444·과거 넓은10실패는 해결하지 않았다. 팬트리2의 원래 실패 원인·원문은 보존하되 지금 관련 테스트가 복구됐다는 사실과 구분한다.

## 마지막 계약의 실패와 채택

이전 `shopping/lists/route.ts` 직접 연결/정확한 단방향 phase/인수 분리/owner match 실험은 TS2589가 남았다. native6 실험에는 interface Row를 GenericSchema로 직접 넣은25개 진단이라는 수정 가능한 실험 결함도 있었으므로 native 설계 전체 불가능의 증거가 아니었다. 최종 PR1826은 native6/mapped Row/실제 nullable FK로 직접 할당을 통과해 request-client assertion1을 해결했다. 별도 명시 보류 service-client assertion은 해결로 세지 않았다.

JSON8필드 일괄 guard는 기존 미소비 숫자 label의201을500으로 바꿀 수 있어 채택하지 않았다. `{}` JSON/[null]의 기존 TypeError, null JSON/없는 base의 skip, 숫자 label 미소비201을 SDK로 구분했다. 원래 양·원문·revision을 바꾸거나 새 단언·any·옵션/검사를 완화하지 않았다. 실패 patch/test와 조사 문서는 `anti-slop-shopping-create-native-20261020` 작업트리에 보존했다.

최종 배치는 실제 소비 시에만 unknown을 좁힌다. generic amount 문자열의 text fallback, 미소비 숫자 label201, unit42 raw RPC/최종 summary와 suggestion:null, scalable!==false·빈 원소/nullJSON의 기존 동작을 보존한다. 중복 ID의 이미 확보된 이름 뒤 숫자 label을 읽던 초안은1FAIL로 재현 후 short-circuit를 복구했다. 정확5208 원본과 동일30사례 PASS, 새 조기5003사례를 별도 exact envelope/후속 read·RPC·growth0으로 검증했다. 실행 JS byte동일 변경은 아니다. [세부 증거와 한계](anti-slop-shopping-json-consumption-20261020.md)를 따른다. 전체275/별도49 완료나 모든 malformed/인증 흐름 검증을 뜻하지 않는다.

## 운영 QA 한계와 보존

부모의 이전 eb7 기존Chrome에서는 저장/북새로고침/분수 및 장보기완료/read-only/팬트리0이 통과했다. 새 후보의 인증 QA로 바꿔 세지 않는다. 실제 legacy 완료는 본인 진행 중 표본0으로 미실행이며 거부된 새 QA 끼니 생성을 재시도하지 않는다. 이 작업은 새 계정/토큰 추출/프로필 복제/데이터 쓰기/공개 상세 GET을 하지 않는다. 이전 공개 GET 조회수 증가와 읽기 전용 진단·원 PIN 보존은 과거 기록을 유지한다. DB238·SQL·키·인증/권한·worker·정책/PIN은 이번 앱 배포의 변경 범위가 아니다.
