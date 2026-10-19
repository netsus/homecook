# 끼니·삭제 JSON 안전 분리6

## 완료 — PR1837·운영87

[PR1837](https://github.com/netsus/homecook/pull/1837)은 최종 검토head e3e251493과 동일tree인 merge `62c20d4bd30570842689873db8a0554f3d12cfb5`로 반영됐다. source 및 최종metadata 독립 APPROVE·GitGuardian SUCCESS 뒤 일반 병합했다. 공식 기존DB238 app-only plan/deploy는 각각 exit0이며 실제 단일배포 build `prelaunch-62c20d4bd305-ktOrhp`·loaded=true·DB238 ready·Anti87/new0이다. SQL/환경/worker/인증설정/R2가드 변경0이다.

선택웹1473 PASS/133 명시적 이름필터SKIP·compile99초/static94/기존경고3, 새manifest200·비로그인 users/me/planner GET wrapped401을 확인했다. 원planSHA a8795f5e와 readerFloor48c4·closedR2·복구대기없음을 유지한다. 고정 READ ONLY9개 지문은 이번 창22:11:53Z→22:18:44Z에서 모두 같았다. [새 배포 증거](evidence/anti-slop-meal-safe-split-data-preservation-20261020.json)는 원승인/PIN/baseline 교체나 전체복원 증명이 아니다. 실제삭제0·새인증QA/legacy실제완료 미실행을 숨기지 않는다. Draft1836은 원HEAD3c7f720/OPEN/DRAFT 그대로이며 provider1과 원거절을 보존했다. 아래 로컬 단계 문장은 당시 기록이다.

사용자 지시로 Draft [1836](https://github.com/netsus/homecook/pull/1836)의 provider1을 보존하고 끼니5·삭제 JSON1만 master5ea에서 분리했다. 제품 b7c27efa2/a69acef9f의7파일은 승인된 원본과 byte동일하다. marketing·Supabase factory·SQL·scripts·환경·가드 변경0. 원 R2 plan 거절은 유효하며 다른 모드나 경로 이동으로 우회하지 않는다.

## 행동 잠금과 검증

끼니의 수기 재귀 query 계약·미사용 writer protocol을 실제 SDK 선택열 계약으로 바꿨다. owner/status/멱등성·scoped RPC는 동일하다. 삭제 RPC는 실제 Args/unknown JSON을 소비하며 기존 deleted truthiness를 유지한다. 새 validator·권한 완화·service-role fallback 제거·실제 삭제0. null/scalar/array/object와 false/0/빈문자/true/1/string/array/object14경우를 먼저 잠갔다.

적용 전7suite121 PASS/기존 stale fixture1 FAIL. 정상 fixture를 제품 RPC 계약에 맞게 satisfies로 고치고 기존 malformed500 검사를 별도 유지했다. 제품 버그 해결이나 검사 완화가 아니다. 적용 후9suite141 PASS/0skip·전체 비증분 타입·변경 lint(max0)·diff·verify:anti-slop PASS. 독립8suite105 PASS·전체 타입/lint/diff APPROVE는 중복 합산하지 않는다.

Anti87/신규0(assert25/array37/conditional25), baseline207 불변. 원16376해결/87잔여. Draft1836의86과1차이는 제외한 provider다. 원163×8식별필드와 과거52/19/117/191 snapshot 불변. 권한3/static3/보류444/별도49미발견·YouTube17 dirty·legacy 실제완료 미실행은 보존한다.

## 실제 상태와 후속

분리 소스검토 당시에는 미배포였고 실제5ea486e53472/build prelaunch-5ea486e53472-wPutWL·Anti93·DB238이었다. 이전 공식 배포1473 PASS/133 이름필터SKIP·빌드99초/static94/기존경고3·manifest200/보호GET2 wrapped401·고정 읽기전용9지문 동일은 [이전 증거](evidence/anti-slop-planner-data-preservation-20261020.json)로 보존한다. 이 과거 창을 이번 새분리 배포나 새 인증QA 증거로 재사용하지 않는다.

후속4는 영양 JSON1·meal snapshot JSON1·legacy capability2다. malformed 처리와 실제 소비 계약의 행동 보존을 확인한다. legacy2는 역사적29완료와 다른 신규 항목이고 factory 보호 경로도 별도 제약이다. 숫자 감소용 parser/adapter나 분기 삭제는 하지 않는다. provider는 Draft1836에 남기며 새 R2 검증 없는 배포는 보류한다. [고정ID 증거](evidence/anti-slop-meal-safe-split-review-20261020.json)를 따른다.

## 후속4 읽기 조사 — 미해결과 불가를 구분

정확 병합62c20d4bd에서 기존 동작을7개 mock suite103 PASS/0skip로 잠갔다: recipe-nutrition-snapshot, meal-recipe-snapshot, recipe-snapshot-entrypoint-projection, supabase-server의4suite71과 planner-nutrition-read-model, planner-nutrition-api, meal-recipe-snapshot-route의3suite32다. 처음 명령에 존재하지 않는 planner-nutrition-summary/route 파일명2개를 넣어4suite만 실행됐고, 실제 read-model/api 파일을 확인해 누락3suite를 별도 실행했다. 요청 파일 수를 실행 suite 수로 과장하지 않는다. 운영 인증이나 실제 삭제 QA가 아니다.

영양JSON1은 독립 읽기검토 결과 제품 결정이 아닌 다음 공학배치다. 수기 query를 실제 SDK 선택열/FK(JSONB unknown)로 바꾸고, 기존 mapper/의미검증기의 정확한 narrowing을 표현하며, scaleNutritionForServings의 실제 소비4필드 계약을 좁힌다. planner가 이미 검증된 mapped 값을 직접 사용하면 rawrow로17줄 계산 객체를 다시 만드는 중복도 지울 수 있다. server-view의 같은 단언 helper도 함께 확인해야 단언 이동으로 끝나지 않는다. malformed 한 행만 unavailable, 조회/RPC 오류만 전체500, content pin 우선·legacy fallback·owner/date/order·warning/source 정책을 유지한다. 이 계획은 아직 코드 수정·해결 집계0이며 새 native SDK fixture·각JSON malformed matrix·mapper/quantity-v4/server-view 회귀·전체타입·독립리뷰 뒤 채택한다.

meal snapshot1은 현재 projector가 배열 여부만 검사한 뒤 CookingIngredientRow/StepRow의 산술·문자열·정렬 연산을 수행한다. 새 원소 guard로409를 반환하면 기존 coerce/500과 다를 수 있다. 기존 shape의 실제 writer 계약과 malformed 행 처리 matrix부터 증명해야 하며, 무조건 불가나 새 strict 정책 승인대기로 단정하지 않는다.

legacy2는 factory가 local에서rpc만, 호환 경로에서전체client를 반환하나 consumer가 authority를 다시 읽어 capability 연관이 타입에 남지 않는 문제다. `from in client`로 분기를 대체하면 환경 변경/임의 client 입력의 기존 선택과 같다는 증명이 필요하다. 기존 테스트는 local에서 from미노출·RPC·오류분류를 보장하지만 이 전체 동등성을 증명하지 않는다. 보호된 lib/supabase 경로 및 인증 의미 변경은 별도 제약이며, 분기삭제·wrapper추가·보호경로이동으로 숫자를 줄이지 않았다. 권한3·보류444 실패를 해결했다고 주장하지 않는다.
