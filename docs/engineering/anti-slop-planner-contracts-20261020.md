# Anti Slop93 — 플래너 동작 보존 묶음

기준 master `99e44c009e63bd7a43f57f2e45ab886d41db6fa2`, 제품 source `b867b1e3e`다.5논리커밋은 [PR1835](https://github.com/netsus/homecook/pull/1835) merge `5ea486e534729eb576477bf81526847caa2dfee6`로 반영한 뒤 공식 DB238 앱 전용 경로를 한 번 실행했다. 머지1/운영1, 실제 build `prelaunch-5ea486e53472-wPutWL`·Anti93다. 사용자 인계가 플래너·끼니·UI19건의 당시 충돌 방지 보호를 깨끗한 독립 worktree에서 해제했다. YouTube2파일/17건·그 기존 dirty는 그대로 보존했다. 새 제품 정책·권한·DB·인증 설정 변경 승인이 아니다.

## 작은 배치와 실익

| 커밋 | 해결 | 실익과 동작 보존 |
| --- | ---: | --- |
| `3d72e1d9b` | 완제품 플래너3 | 수기 상태 query 재귀 프로토콜을 실제 SDK 선택표/RPC unknown 계약으로 대체. 실제 owner nullable·moderation enum·version NOT NULL과 일치한다. 동일 bootstrap 객체·소유/공개/삭제/버전/수량/RPC 응답의 기존 단일 단언은 유지한다. |
| `0aad87dac` | 끼니 컬럼1 | 사용하지 않는 meals query 계약과 수기 builder 삭제. 소비1표의 닫힌 Row·Insert·Update·원자적 owned-delete RPC만 명시. 최소1/최대5·중복·정렬/복구·소유자·사용중 삭제 보호는 그대로다. |
| `e97a4f797` | 미래전파 RPC3 | 기존 scoped RPC 객체를 바로 전달한다. factory/scope/RPC 이름·인수/오류 변경0, 두 제품 파일 실행 JS byte동일이다. |
| `1b4248998` | 플래너 조회1 | 수기 builder를 native5표/nullable 비유일 snapshot FK/unknown RPC 계약으로 정리. 날짜/owner/정렬/고정 제목 오류·이미지·완제품 중복 제거를 유지한다. |
| `b867b1e3e` | 복원 UI4 | 이미 있는 완전한 validator를 같은 조건의 type predicate로 표현한다. 검증 조건 text가 동일하고 유효한 원객체·잘못된 값 삭제·예외/복귀/포커스를 보존한다. 새 guard/DOM/style 없음. 독립 LOW를 반영해 type import4개를 상단으로 이동했다. |

별도 공통 추상화·adapter·의존성·검사 범위/기대값/baseline 변경은 없다. 제거 숫자를 위해 RPC JSON을 구체 타입으로 가장하지 않는다. local schema는 소비 계약이지 실제 SDK의 권한을 제한/확대하는 factory가 아니다.

## 테스트 선행과 최종 검증

- 완제품: 제품 전5suite59 PASS → SDK3 추가 전후2suite25/최종6suite62 PASS. 정확 native URL/선택열/owner ID·RPC body·오류 보존을 고정했고 독립 동일62·SQL/lint/emit review APPROVE다.
- 컬럼: 기존2suite30 PASS → SDK2 추가 후/제품 후3suite32 PASS. 실제 insert/update/filter/order/delete RPC 요청을 확인했다. 독립 RPC 묶음 포함5suite43·lint·SQL·dead type 검토 APPROVE다.
- 미래전파: 관련3suite29 PASS. 넓은4suite는41 PASS/기존1 FAIL이며 미수정7d15에서도 `meals-route: adds positive revision only...`가 동일500 vs기대200으로 재현됐다. 이번 두 파일의 실행 JS가 byte동일해 해당 회귀로 귀속하지 않는다. 기대값/검사를 바꾸지 않았다.
- 조회: 기존3suite40 PASS → SDK1 추가 전후4suite41 PASS. 독립 동일41·SQL nullable FK/cardinality·lint review APPROVE다.
- UI: 기존3suite52 PASS → 잘못된 저장값7형태 추가 후/제품 후59 PASS. 독립 동일59·validator 조건 기계 비교·기존 객체/삭제/포커스 의미 검토 APPROVE다. 전체 화면/수동 모바일·데스크톱 검사는 새로 실행하지 않았고 DOM/스타일 변경도 없다.
- 최종 중복 없는 **18suite209 PASS/0 SKIP**, 전체 비증분 타입 exit0·변경 lint max-warnings0·diff-check 통과. verify fixture/tool type/새 진단 거부·Anti93/baseline207/신규0 통과다.
- 초안의 열린 Row interface는 SDK GenericSchema record 계약과 안 맞아 never/TS2589로 실패했다. 같은 필드의 닫힌 Row type alias가 실제 SDK 계약을 충족해 재검증0이다. Node22.13에서는 TS plugin 설정 로드가 실패했고 설치된 기본22.19의 같은 검사로 통과했다. 설정·검사기를 고치지 않았다. verifier 임시 probe와 전체 tsc는 순차 실행했다.

## 고정 ID별 해결·유지·후속

[현재19건 및 유지8건 전수 JSON](evidence/anti-slop-planner-contracts-review-20261020.json)에 원본 ID를 모두 대응했다. 원163 ID의8고정필드는 바꾸지 않는다. 이번12 해결로 원163 **70해결/93잔여**, 진단 **105→93(단언31·배열37·조건부25)**다. 별도 원본49 미발견을 해결에 더하지 않는다. 과거52 감사/117 JSON/191 CSV/baseline은 고정 기록이다.

해제된 나머지7건은 검토 대기이지 보호 유지/불가능 판정이 아니다. 식사 query5건은 실제 복합 선택/legacy·revision·수량 상태 계약을 더 확인하고, 영양1건은 concrete JSON snapshot 소비와 SQL unknown 경계를, 계획 snapshot1건은 ingredients/steps JSON의 현재 malformed 호환을 먼저 확인한다. 새 검증기를 지표용으로 만들지 않는다. 기존 추가 계약4건(삭제JSON1·환경종속 callback2·Turnstile provider1)은 아직 설계·호환 근거 조사 대상이며 자동 승인/불가능 판정이 아니다.

배열37/조건부25는 이번 제품 수정0이다. JSON의 유지8 ID는 고정4필드 오류문자열3(서로 다른 순서/구분자·성능 문제 미입증), 검색 ID chain1(중복 제거 책임·카디널리티/지연 문제 미입증), own-key4(키 부재 vs own undefined/null 및 두 키 동시 출력 의미)로 구분해 근거를 보존했다. 이8개는 진단 해결이 아니며3개는 기존 범위 보류에 포함된다. 나머지 배열/조건부에 유지 근거를 일괄 덧씌우지 않는다. YouTube nested 탐색은 실제 개선 여지가 있으나 보호 dirty/worker 범위와 별도로 다뤄야 한다.

기존 권한3·보류444/PR1745 명시3·넓은 static 기존3실패·역사 실패·49 미발견은 그대로다. SQL/실제 데이터/환경/자격/PIN/정책/worker 변경0이다.

## 운영 QA 인계와 다음 묶음 경계

부모가 정확7d15의 인증 **읽기 QA**를 완료했다: 프로필/일반 설정 현재값·진도/활동/업적·기존 레시피/남은요리/식사기록 정상 표시, 과거 전체무게200g 실측 근거 보존. 관측 console/화면 API 오류0, 요청별HTTP는 수집하지 않았다. 설정/프로필 변경·신규 생성0, legacy 실제완료 미실행이다. 환경설정 새로고침은 기본 탭으로 돌아오지만 재진입 시 현재값 정상인 탐색 특성으로만 남긴다. 이 QA를 현재 로컬 source의 인증 QA로 바꾸어 부르지 않는다.

제품·exact metadata 독립 APPROVE 뒤 draft PR1835를 일반 머지했고 최종 merge tree는 검토 head와 동일했다. 사용자에게 미배포를 명확히 보고한 뒤 이번5ea 후보의 명시적 배포 지시를 받아 실제7d15/실행 중 deploy0을 먼저 확인했다. 공식 plan은 web7·SQL0·환경키0·DB readOnly, 단일 deploy exit0·선택웹1473 PASS/133 명시적 이름필터 SKIP·compile99초/정적94/기존경고3다. 실제 ref5ea/buildwPutWL·loaded=true·DB238 ready·원 planSHA/readerFloor48c4·closedR2·recoveryPending=false, 새 manifest200·비로그인 users/me 및 planner GET wrapped401을 확인했다.

배포 창21:41:48Z→21:49:08Z의 동일 고정 읽기 전용 observer9개 지문은 모두 일치했다. [전후 증거](evidence/anti-slop-planner-data-preservation-20261020.json)는 원 승인/PIN/과거 baseline을 교체하지 않는 창 단위 비교다. 이전 QA 등을 사이에 둔 과거 관측의 normal/preserved 지문과 같다는 주장이나 새 전체DB 백업/복원 증명이 아니다. SQL/환경/자격/인증 설정/정책/PIN/worker 변경0이다. 실제 삭제/격리/신규 식사 QA·세션/토큰 추출·새 로그인·공개 상세GET/조회수 변경·DB 쓰기는 하지 않았다. 최신5ea 인증 QA와 legacy 실제완료는 미실행이고 부모의 과거7d15 읽기QA로 대체하지 않는다.19건 JSON은 sourceb867의 고정 머지 전 감사 snapshot이며 현재 운영 상태와 별개다.
