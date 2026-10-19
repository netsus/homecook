# Anti Slop117 재분류와 다음 작은 정리

기준 master `3ebbf28716b5fc01a2fedfce60af8cece4ac57dd`, 운영 앱 `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`/DB238이다. 첫 결과는 운영 인증 QA 점유 중 **로컬 수정·검사·독립 리뷰까지 진행한 checkpoint**이며 이 시점의 push/PR/merge/배포/DB 변경은 없다. 기존 main/catalog dirty·P5·보류444fe1f6f·권한3건·과거 실패는 보존한다. 기존29계약 완료와 별개인 후속 후보1건이며 원 요청 전체 완료가 아니다.

이후 부모가50bc 운영 QA 종료와 다음 검증 배치의 순차 머지·DB238 앱 배포 진행 가능을 인계했다. 부모 QA에서 북 저장/재조회·완료 장보기 read-only·팬트리105개 재조회·승인 수량5개/대상 과거 기록 보존을 확인했으며 actual legacy 완료는 기존 소유 세션이 없어 미실행이다. 이것은 부모의 실제50bc QA 증거이지 새 로컬116 후보의 인증 QA가 아니다. 새로 보고된 마이페이지 장보기 상세 선택의 새로고침 소실은 별도 작은 읽기 조사/재현 대상으로 분리하며 데이터 유실·권한 실패·최근 리팩토링 부작용이라고 아직 단정하지 않는다.

## 실제117과 위험

현재 진단을 다시 실행하고 원163 inventory의 file/rule/snippet SHA256/occurrence에 대조했다.117개 모두 정확히 대응했고 미매칭0, 해결로 기록된 finding의 재등장0이다. 원본 inventory·baseline·규칙·scope는 변경하지 않았다. [117개별 재분류 JSON](evidence/anti-slop-residual-review-20261020.json)에 현재 위치와 다음 검토 순서를 남겼다.

| 정적 유형 | 수 | 판단 |
| --- | ---: | --- |
| 연쇄 단언 | 55 | DB/provider 계약41, JSON/projection 경계14. 실제 SQL·외부 입력 검증 근거가 필요한 우선 검토 영역이나 이 진단만으로 실제 권한 위반/취약점이 증명되지는 않는다. |
| 배열 map/filter 이중 순회 | 37 | 크기·지연·복잡성의 실질 근거가 있을 때만 정리한다. 희소 배열/콜백 순서/인덱스를 바꾸는 숫자 목적 루프 치환은 하지 않는다. |
| 조건부 빈 객체 spread | 25 | 키 부재와 own undefined/null의 차이를 보존해야 한다. 임시 객체나 무조건 spread로 치환하는 것만으로 개선은 아니다. |
| 누산 복사 두 규칙 | 0 | 현재 자동 검사 진단0이며 모든 성능 문제가 없다는 뜻은 아니다. |

현재 상태 분류는 YouTube/추출 병행52, 인증/세션 민감24, 플래너 병행23(합99), 고정 참고8, 명시 보류3(save444 관련2·PR1745 관련1), 개선 근거 없음 유지5, 좋아요 기술 보류1, 실제 요리 QA 조율1이다. 이99개는 과거 범위 보류를 현재 코드 대응 후 보존한 것이며 전부 영구 불가/실제 결함이라고 재판정한 것이 아니다. 안전한 범위 조율 뒤 JSON 경계→SDK 계약→실질 근거가 있는 컬렉션 정리 순으로 검토한다. 인증·보안 설정이나 병행 소유권을 포괄 후속 요청만으로 임의 해제하지 않는다.

## 원275/과거191/별도49 대응

- 원275 목록은 `0d4ba86357b7fe9ed13895e0fc8104f8d8857782:tools/oxlint/anti-slop-baseline.json`에서 복구했다. **255 fingerprint그룹의 count합275**다. 그룹 수와 진단 occurrence 수를 혼동하지 않는다.
- 과거191은 PR1659의 `7e466b170ba39795220ef64e67eac3fab4429420`에서 당시 `node scripts/run-anti-slop.mjs`를 재실행해 복구했다. root도 독립 재실행해 exit0/702파일/191/baseline207/신규0을 확인했다. 당시 counts는 연쇄123/배열37/조건부31이다. 원191 출력 파일을 찾았다는 뜻은 아니다.
- 당시와 현재 `.oxlintrc.json`, 검사 script, vendored plugin·scope/rules의 차분0, Oxlint/plugins1.78.0 동일을 확인했다. 과거 고정 baseline207은 실제191 출력 자체가 아니다. 다른 baseline의 **191그룹/count209**도191진단으로 쓰지 않는다.
- count 단위로 **275 ⊇ 191 ⊇ 고정163 ⊇ 현재117**, 미매칭/초과0이다. [191 fingerprint 대응 CSV](evidence/anti-slop-191-fingerprint-map-20261020.csv)는173그룹별 원275/191/163/117 count를 보존하며 합191/163/117이다. 반복 snippet의 checkpoint 간 semantic identity까지 확정하지 않는다.
- 191→117의 부재74개는 고정163 이전의28개와 고정163에서 기록한 해결46개로 대응한다. 원275→191의 부재84개도 확인 가능하지만 **fingerprint 부재만으로 행동 개선·개별 PR 귀속·전체 요구 완료라고 주장하지 않는다.** 원275의 전체 초기 의도나 별도4개 리팩토링 요구의 완전한 항목 대응은 아니다.
- 별도49건 원본은 저장소 문서·Git 이력 및 관련 작업트리의 `.omx/plans`/evidence/preview 로그에서 찾지 못했다.49건을117과 합산하거나 중복/완료 수를 추정하지 않는다. 외부 프로필/세션 파일 탐색은 하지 않았다.

상세 재현 원문은 별도 분석 WT `anti-slop-191-reconstruction-20261020/.omx/evidence/anti-slop-191-reconstruction-20261020.json`(SHA256 `e920cb448d70e03b1c6de74fe1b249e6157add58e338d74cba9965d60acff39c`)에 보존한다. 이 원문은 ignored 로컬 증거이며 영구 전달용 요약/그룹 대응은 위 두 tracked deliverable이다.

## 첫 로컬 배치: 좋아요의 손코딩 SDK 체인 제거

범위는 `app/api/v1/recipes/[id]/like/route.ts`와 `tests/recipe-like-sdk-contract.test.ts`다. 과거 직접 대입 TS2589로 기술 보류했던1건을 실제2표 SDK Row/Insert 계약으로 대체했다. 손코딩 재귀 builder/결과 타입55줄을 삭제하고19줄을 추가했다. 새 adapter·단언·의존성·검사 억제는 없다.

제품·테스트2파일은 로컬 commit `d625ccfa1f0f52b16ff5741867196e63e9f1705c`에 보존했다. push/PR/merge/배포는 하지 않았다.

SQL 근거는 core schema의 recipes.id/like_count NOT NULL·기본값·음수 방지, recipe_likes UUID PK/user_id+recipe_id FK/created_at 기본값/복합 UNIQUE다. 현재 소비하지 않는 FK join을 꾸며 넣지 않는다. native 타입의 Insert/Update never는 실제 DB grant나 deep-readonly 보장이 아니다.

유지한 실행 계약은 인증/UUID404/QA분기, owner+recipe 조회, DELETE id+user_id, insert23505 중복 후 snapshot 조회, 수정 후 count 재조회·clamp·표준 응답이다. API/권한/DB 동작 차이가 없어 공식 API 계약은 바꾸지 않는다.

- 수정 전 기존5 PASS, 실제 SDK wire11을 추가한 **16 PASS**를 먼저 고정했다.
- 수정 후 실제 기본 SDK 직접 대입/정확 선택행 타입 검사1을 추가해 **17 PASS**다. guest/없는 recipe/lookup 오류/INSERT·DELETE 오류/refresh 오류/duplicate refresh 오류와 실패 후 요청 중단을 포함한다.
- 전체 비증분 TypeScript0, 변경 ESLint max-warnings0, `pnpm verify:anti-slop`(규칙 fixture·tool type·baseline 거부 검사 포함) **116/baseline207/신규0**, diff-check0.
- root는 제품 전후 TypeScript emit이 byte동일임을 확인했다(SHA256 `a69653002cd76fe8435257e1066539ef147892a93c21f49e67b7448df272d71d`). 독립 reviewer도 comments 제거 emit4127bytes 동일·SQL·소유권·오류 흐름을 확인하고17 PASS/전체 타입/lint/verify116을 직접 실행해 **APPROVE**했다.

**로컬116은 운영117과 다르다.** 원163 finding의 status를 머지 완료로 바꾸지 않았고 새 운영 QA나 전체 테스트/build를 이번 로컬 검사로 대체하지 않는다. 다음 반영은 부모와 운영 QA 종료·범위를 조율한 뒤 진행한다.
