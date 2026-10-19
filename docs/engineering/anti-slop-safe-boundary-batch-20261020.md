# Anti Slop105 — 실제 SDK·내부 capability 경계 묶음

출발 source는 `d5f9a6dae2fcac111ee4b6ad50822177f73d2494`, 제품 후보는 `9baadd453a56b4924894b329b0196f796f7c3e4e`다. 아직 **로컬3커밋/머지0/운영0**이며 실제 운영은9542/build `prelaunch-9542c435537f-ZlS15L`·DB238/Anti114다. 소규모 수정마다 배포하지 않고 아래 관련 변경을 한 앱 묶음으로 검증한다.

## 세 논리 단위와 실제 제거

| 커밋 | 원본 진단 해결 | 변경·동작 보존 근거 |
| --- | --- | --- |
| `9b3e5f0a2f60ab796ff4b9899966582cd059c7c2` | 프로필·일반 설정2 | 중복 수기 query 프로토콜을 로컬 native SDK users 소비 계약으로 교체. SQL의 nullable email/profile·provider enum·timestamps와 일치하며 JSON은 unknown으로 남긴다. 기존 JSON boolean 소비와 객체/배열 펼침을 유지하고 owner eq·bootstrap 동일 객체/순서·응답은 그대로다. DELETE 본문은 이 커밋에서 변경하지 않았다. |
| `d93c970547bd66812ddd2cd6cdef19339d4dd44a` | lifecycle6 | 실제 factory의 기존 rpc+operational_events 전용 from을 해당 두 함수 입력에만 정확히 요구한다. RPC-only replay는 그대로이며 서비스/입력 단언6건 제거. factory·허용 테이블·권한·runtime guard 변경0, 실행 JS byte동일. |
| `9baadd453a56b4924894b329b0196f796f7c3e4e` | snapshot RPC1 | 기존 RPC-only reader를 직접 전달한다. 예전 조율 보류는 현재 명시적 잔여 검토/이전 QA 점유 해제 아래 타입 소비만 재검토했다. weight/planner/P5 로직은 그대로이며 실행 JS byte동일. |

프로필의 실제 JSON 소비 좁히기는 외부 응답 필드1개의 기존 boolean 의미를 보존하기 위한 것이며 새 API validator가 아니다. 정상 JSON scalar/null/array/object의 호환을 고정했다. 새 공용 추상화·의존성·factory·SDK 권한·RPC 이름/인수·SQL·환경·정책/PIN·worker 변경은 없다.

## 검증과 숨기지 않는 실패

- 프로필/설정: 제품 수정 전 기존4suite52 PASS → JSON7 추가 후59 PASS → 각 SDK 전환 뒤59 PASS → native fake-fetch3 포함62 PASS. 실제 SDK 선택 열·GET/PATCH·owner 필터·body·unknown JSON을 확인했다. 독립 동일62·전체 비증분 타입/lint·소스 APPROVE다.
- RPC: 제품 수정 전 계정/요리2suite60 PASS, 실제 이벤트 capability fixture와 actual recordOperationalEvent 기반 예상 밖 delete/activate 실패2건을 먼저 고정해3suite92 PASS. 수정 후92 PASS, 최종6suite143 PASS. fixture8곳은 실제 factory의 기존 from 계약을 명시하고 optional/단언/권한 확대를 쓰지 않았다. 독립4suite109·lint·소스/실행 JS 동등성 APPROVE다.
- 최종 제품3커밋 통합은 **11suite205 PASS/0 SKIP**다. 중복 실행 수를 더하지 않는다. 전체 비증분 타입·변경 lint max-warnings0·verify fixture/tool type/신규 거부·diff-check가 통과했다.
- 정적 권한 확대 검사는 별도로 **10 PASS/기존3 FAIL**이다. 미수정9542에서도 같은3 FAIL을 재현했고 행/열을 제외한 실제 위반 목록, 경계70, 공개 scope가 동일했다. 기존 기대63 vs실제70·기존 internal-operation 위반·기존 공개 scope 불일치를 수정/완화하지 않았다. 관련 작은 검사 통과를 전체 권한 해결로 확대하지 않는다.
- 전체 tsc와 verifier를 동시에 실행한 초안은 verifier 임시 probe 삭제와 경합해 TS6053이1회 발생했다. verifier 종료 후 전체 tsc를 순차 재실행해0으로 확인했다. 검사기·tsconfig·baseline·기대값은 바꾸지 않았다.

## 유형별 해결·유지·미해결

| 유형 | 이번 해결 | 현행 진단 | 유지·보류의 구분 |
| --- | ---: | ---: | --- |
| 연쇄 단언 | 9 | 43 | 기존 보호 범위36(플래너/끼니/UI19·YouTube17), 계약 설계/검증4, 명시 보류3 |
| 배열 이중 순회 | 0 | 37 | 범위31 중 기존 고정4필드 유지 후보3 포함·참고 디자인5·개선 근거 없음1. 유지 후보는 추가 합산하지 않는다. |
| 조건부 own-key | 0 | 25 | 범위18·참고 디자인3·키 부재/값 의미 보존 유지4 |
| 누산 복사 | 0 | 0 | 새 우회 없음 |

합계 **114→105/baseline207/신규0**, 원163 ID **58해결/105잔여**다. 원본 ID/file/rule/snippet/hash/occurrence/위치는 불변이다. [52단언 전수 분류 JSON](evidence/anti-slop-assertion-review-20261020.json)은 지정9 ID와 잔여43을 모두 대응시킨다. 별도 미발견49건을 원163의 해결58과 섞거나 전체275 완료로 계산하지 않는다.

잔여4의 실제 이유는 다음과 같다. 삭제 RPC는 jsonb를 검증 없이 UserDeletePolicyResult로 가정하므로 단순 직접 대입도 같은 문제를 숨긴다. legacy auth callback2는 환경에 따라 full SDK/RPC-only를 반환하는 factory와 소비 입력 사이의 종속 capability가 타입에 없으므로 좁히는 설계가 필요하다(Cloud credential/remote 접근으로 검증하지 않는다). Turnstile1은 전역 provider의 flexible render 타입과 Round2의 compact/response-field 계약이 달라 실제 provider 계약·기존 R2 보호 범위의 검증이 먼저다. 지표용 단일 단언·타입 확장·새 adapter로 닫지 않았다.

보호 범위36은 기술적 불가능/취약점/변경 가치 없음의 판정이 아니다. 원래 저장/UI/플래너·YouTube/P5 비충돌 범위의 명시적 해제와 관련 실제 데이터/상태 QA가 필요한 별도 결정이다. 명시 보류3(save444 관련2·PR1745 관련1)·기존 권한3·과거 넓은10실패·별도49 원본 미발견은 그대로다. 변경 실익이 없는 배열/own-key는 기존 유지 근거를 보존하며 숫자0을 목표로 하지 않는다.

## 반영·실제 데이터·QA 경계

제품 source9ba의 공식 plan은 exit0·제품5파일·SQL0·환경 키0·기존 DB 읽기 전용으로 통과했다. 이 계획은 실제 배포 성공이나 데이터 전후 일치가 아니다.

단위별 독립 검토 뒤 최종 문서·원본 대응을 검토하고 draft PR로 시작한다. 관련 최종 코드만 일반 머지한 뒤 공식 앱-only DB238 경로를 한 번 사용한다. 배포 전후 기존 승인 target·backup readiness·원 ledger/readerFloor/plan·자격/정책을 검증하고, 기존 고정 observer의9개 data/catalog/control 지문을 읽기 전용 전후 관측으로 대조한다. 이는 이번 창의 보존 확인이지 원 PIN/과거 관측을 새 baseline으로 교체하거나 조회수3개 차이를 숨기는 행위가 아니다. 새 전체DB 백업·전체 복원 반복은 요구하지 않는다. 일치하지 않으면 원인을 확인하며 DB 쓰기·되돌리기·projection 제외·PIN 수정으로 통과시키지 않는다.

현재 위 전후 운영 관측·배포는 미실행이다. 최신9542 인증 진도·활동 흐름도 미검증으로 남겨 새 프로필/일반 설정·기존 snapshot 읽기 QA와 함께 인계한다. 기존 Chrome을 지원하는 부모가 실제 QA를 수행하며 이 작업은 세션/토큰 추출·새 로그인·신규 식사 생성·실제 삭제/격리 처리·운영 데이터 쓰기·공개 recipe detail GET을 하지 않는다. 이전 e5face 장보기 복원/read-only/수량·관측 콘솔오류0 QA와 새 앱 QA를 혼동하지 않는다. 실제 legacy 완료는 본인 기존 표본이 없어 계속 미실행이다.
