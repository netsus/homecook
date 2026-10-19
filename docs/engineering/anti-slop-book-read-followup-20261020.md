# Anti Slop — 레시피북 조회 후속 2건

기준은 master `d90af7a976392eb052a1d6557d3ab8c2bebb7221`, 두 PR 통합 source는 `d7d865ac2fa86ad5ebc445ad8266ad78080a87dc`다. 기존 dirty 작업/P5·보류444·실패 실험을 보존하고 별도 작업트리에서 수정했다. anti-slop-cleaner의 테스트 우선·실질 복잡성 제거 원칙에 따라 손코딩 fluent 인터페이스를 실제 SDK 조회 계약으로 바꿨으며 검사 baseline207·규칙·scope를 바꾸지 않았다.

| 배치 | PR / merge | 검증 | 진단 |
| --- | --- | --- | --- |
| 목록 GET: native6표/FK·선택행 | [1816](https://github.com/netsus/homecook/pull/1816) / `a80f1ede73eade75df01e1e4856642d71207785f` | SDK+기존17 PASS·독립 동일17 PASS | 125→124 |
| 상세 GET: native10표/FK·JSON unknown | [1817](https://github.com/netsus/homecook/pull/1817) / `d7d865ac2fa86ad5ebc445ad8266ad78080a87dc` | SDK7+기존31=38 PASS·독립7suite60 PASS | 124→123 |

두 후보 통합은6suite45 PASS, 선택웹1466 PASS/133 이름필터 SKIP, 전체 비증분 typecheck·변경5파일 lint max-warnings0·diff PASS다. author-free 최종 검토7suite49 PASS/타입/lint/diff APPROVE이며 겹치는 검사를 더해 성공 수를 늘리지 않는다. 최종 master와 통합 검사본의 tree diff0을 확인했다. 두 route는 동일 request 객체의 alias 정규화 후 실행 AST가 같고, normalizer는 emitted JS byte 동일하다. native schema의 exact 선택타입을 검사하므로 any fallback 성공이 아니다.

소유권·RLS·guest401·owner403·membership/hidden404·canonical detail_href·product-only label·legacy fallback·수량·정렬·cursor·오류 wrapper를 유지한다. 상세 DELETE는 같은 객체의 읽기 alias만 분리했고 기존 mutation/권한/growth/단언은 남겼다. `RecipeStepsRow.ingredients_used`를 unknown으로 바꾼1줄은 기존 normalizer의 배열 검사에 실제 JSON 경계를 맡기는 타입 수정이며 실행 코드를 추가하지 않았다.

초기 새 fixture에서는 목록 canonical 테스트 데이터1건, 상세 Promise.all의 단계/재료 요청 순서 기대1건이 실패했다. 실제 실행을 바꾸지 않고 테스트를 교정했다. 상세 타입 테스트의 lint4건과 목록 테스트의 불필요 단언1개도 정리했다. 목록 첫 merge 요청은 잘못 전사한 match-head SHA 때문에 거절됐으며 정확한 로컬/원격 SHA 재조회 후 정상 merge했다. 안전 가드·검사 완화나 admin 우회는 없다.

## 운영 반영

정확 d7d865ac2에 대한 공식 plan은 exit0, web3/API2/support6·SQL0·환경키0, 기존 DB238 read-only로 판정했다. 부모의 eb7 인증 QA 종료 인계 후 공식 `pnpm deploy:dev -- --reviewed-ref <exact SHA> --already-applied-db ... --test-script test:feedback-batch:web`를 직렬 실행해 exit0으로 배포했다. 배포 단계 선택웹1466 PASS/133 이름필터 SKIP·빌드 PASS(컴파일101초·정적94페이지·기존 경고4)이며 새 build는 `prelaunch-d7d865ac2fa8-1VWr9s`다. 실제ref d7d865ac2/loaded=true/DB238 ready/readerPending=false/recoveryPending=false/normalDeploymentAllowed=true/원 readerFloor48c4·databasePlanSha a8795f5e5177cc77aa106ffb7b83a892260e0cfeddff3d5aabd6d1afac1a7692가 유지됐다. closedR2=true, integrated guard 없음, rollbackAvailable=false도 이전과 같다. 새 manifest200 및 목록·상세 API 비로그인401/UNAUTHORIZED/data:null/fields:[]를 확인했다. 이번 두 배치의 **머지2건/운영 반영2건**이며 인증 실제 흐름2건을 완료했다는 뜻은 아니다. SQL·DB 쓰기·환경키·권한·worker·정책/PIN 변경0이고 새 DB 전체 백업을 만들었다고 주장하지 않는다. 비공개 배포 로그는 `deploy-1792431344665.log`이며 자격/환경값을 문서에 복사하지 않았다.

## 남은 범위

Anti Slop123/신규0, 원29계약23완료/6잔여다. 원163개 ID·snippet/hash/occurrence·위치는 고정하고 해결2개만 추가했으며 해결40/잔여123이다. 전체275 및 별도49 완료가 아니다.

잔여는 shared progress/growth route4, 상세 DELETE1, manual POST1이다. Progress의 match 선행 후보 e823fbc34/9887d303c는 로컬128 PASS·타입·독립 리뷰 상태로 보존했지만 미머지·미배포다. native Gamification7은 메모리 대조만 통과했으므로 SQL/runtime 검증 없이 채택하지 않는다. 기존 실패 dirty3파일, permission3·보류444·pantry2·과거10 실패를 숨기지 않는다.

부모의 eb7 기존Chrome QA는 저장→북새로고침/분수 유지 및 장보기완료→read-only/팬트리0 PASS였다. 실제 legacy 완료는 본인 진행 중 표본0으로 미실행이며, 새 QA 끼니 생성 거부를 재시도하지 않는다. root는 인증 QA나 새 데이터 생성·수정·공개 상세 GET을 하지 않았고 이전 공개 GET 조회수 증가·READ ONLY 진단은 [과거 기록](anti-slop-db238-app-successor-review-20261019.md)에 그대로 남긴다. 새 후보 인증 흐름 QA와 전체 기능 검증을 주장하지 않는다.
