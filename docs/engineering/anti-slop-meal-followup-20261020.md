# Anti Slop86 — 식사 읽기·외부 JSON 소비 후속

기준/운영 source는 PR1835 merge `5ea486e534729eb576477bf81526847caa2dfee6`이며 실제 build `prelaunch-5ea486e53472-wPutWL`·DB238/Anti93다. 배포는 한 번 완료했고 [정확한 운영·지문9 전후 증거](evidence/anti-slop-planner-data-preservation-20261020.json) 및 [선행12건 보고](anti-slop-planner-contracts-20261020.md)를 따른다. 아래 제품 source `207b3a4bc154a1c43421b37af9caeda5cc713b42`의3논리커밋/7건은 아직 로컬이며 **머지0/운영0**, 두 번째 배포는 실행하지 않았다.

## 작은 변경과 근거

| 커밋 | 원 ID 해결 | 실익·동작 보존 |
| --- | ---: | --- |
| `aa811c96f` | 식사 query5 | 실제 native SDK 선택5표/nullable snapshot FK 및 한 표 owner-state 계약으로 수기 query 프로토콜을 대체. 더 이상 실행되지 않는 직접 insert/update/delete 타입도 삭제했다. 같은 routeClient를 bootstrap·progress·growth에 전달하며 인증/capability/상태/멱등성·미래전파 scoped RPC는 그대로다. |
| `217582273` | provider1 | 공유 Window provider의 실제 size3·response-field boolean 소비 계약을 고쳐 중복 Omit/render 재정의와 단언을 삭제. 두 제품 파일 실행 JS byte동일, flexible/compact 실값·sitekey/action/콜백/URL/CSP/토큰/정책 변경0이다. |
| `207b3a4bc` | 삭제 JSON1 | 수기 RPC 결과의 boolean·미사용 필드 가정을 없애 native SDK의 JSON unknown을 유지하고 실제 소비하는 deleted truthiness만 기존처럼 읽는다. 새 엄격 boolean·권한 guard가 아니며 owner/세션/capability/원자적 RPC/이벤트 순서·service-role 경로는 그대로다. |

provider 근거는 [Cloudflare 공식 설정 계약](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)의 size와 response-field다. 타입을 실제 API에 맞췄으며 옵션 값을 바꾸거나 외부 Cloudflare 네트워크 시험을 실행하지 않았다.

삭제 JSON은 정상 JSON 영역에서만 동등성을 주장한다. null/scalar/array/빈 객체·false/0/빈 문자열은 기존500, true/1/비어 있지 않은 문자열/객체/배열의 deleted 값은 기존 truthy200 그대로다. 이것이 새 보안 강화/엄격 boolean 검증이라는 주장은 하지 않는다. 함수·특수 prototype 등 비JSON 값까지 동등하다는 주장도 없다. 기존 성공/실패 이벤트와 malformed 호환을 새 정책으로 바꾸려면 별도 실제 설계 판단이다.

## 테스트 선행·기존 실패

- 식사 item2: 기존3suite29 PASS → SDK read/denial2 추가 전후31 PASS. collection3 전 SDK slot/order/RPC1을 추가했고 native 전체6suite58 PASS다. 독립 동일58·전체 비증분 타입/lint·실제 SQL/동일 객체/owner·state·멱등성 review APPROVE다.
- 과거 `meals-route`의 positive revision only1실패는 현행 parser에 없는 brand/amount/unit/legacy_read_only 형식의 오래된 product fixture 때문이었다. 제품 변경 전 현행 RPC fixture에 satisfies 타입을 붙이고 **원 malformed fixture를 wrapped500 사례로 그대로 추가**해 기존3suite37 PASS, SDK 포함40 PASS를 확인했다. 정상200/revision/quantity·비정상500을 모두 검증하며 제품을 완화하지 않았다. 과거 실패 이력 자체는 지우지 않는다.
- provider: 기존4suite16 + widget6 PASS → 수정 후5suite22 PASS, 독립3suite20·lint/diff·두 파일 실행 JS 동일·공식 계약 review APPROVE다.
- 삭제: 제품 변경 전에14 JSON 형태를 추가해 실제2suite82 PASS, 수정 후 native SDK1 포함 정확3suite83 PASS. 초안 명령의 존재하지 않는 세 번째 테스트 경로는 Vitest가 선택하지 않았으며3suite라고 집계하지 않는다. 독립 동일83·lint/diff와 JSON 소비/권한 보존 검토 APPROVE다.
- 최종 중복 없는 **14suite163 PASS/0 SKIP**, 전체 비증분 타입 exit0·변경 lint max-warnings0·verify fixture/tool type/신규 거부 및 **Anti86/baseline207/신규0**·diff-check 통과다. 타입과 verifier 임시 probe는 순차 실행했다. 검사기·baseline·기대 권한 정책·새 의존성 변경0이다.
- 정적 권한 검사는 현재와 미수정5ea에서 각각10 PASS/기존3 FAIL이다. internal-operation15·응답 경계70(옛 기대63)·공개 recipes scope 불일치를 그대로 재현했다. 검사/허용 목록을 바꾸지 않았으며 관련163 통과를 전체 권한 해결로 확대하지 않는다.

## 고정 ID와 남은 실제 경계

[원11 ID 전수 JSON](evidence/anti-slop-meal-followup-review-20261020.json)은 플래너 후속7와 추가 계약4를 **해결7/설계후속4**로 대응한다. 원1638필드는 불변이며 원163 **77해결/86잔여**, 현행 진단은93→86(단언24·배열37·조건부25)이다. 선행 고정52/19/117/191 snapshot·baseline은 변경하지 않는다. 유지8 ID의 기존 의미·실익 근거는 선행19 감사 JSON을 보존하며 추가 해결로 세지 않는다. 별도 미발견49/전체275 완료와 섞지 않는다.

남은4는 다음과 같다. 기술적 불가능·운영 취약점 판정이나 사용자 영구 제외가 아니다.

- 영양1: SQL JSON unknown과 공유 mapper의 concrete calculation·writer/read validation 계약을 함께 정리해야 한다. 이미 있는 invalid snapshot→unavailable/error 처리와 모든 caller를 고정한 소비 계약이 우선이며 지표용 중복 parser를 추가하지 않는다.
- 계획 snapshot1: 현재 projector는 ingredients/steps의 배열 여부 뒤 내부 행을 소비한다. 잘못된 요소에 엄격 검증을 새로 넣으면409/500 호환이 달라질 수 있으므로 실제 소비 경계·legacy 수량/제품 pin을 먼저 고정해야 한다.
- legacy callback2: factory는 authority별 full SDK/RPC-only union, callee는 환경을 다시 읽어 분기한다. mode와 capability의 종속 관계가 타입에 없으므로 이 둘을 보존하는 설계가 필요하다. 없는 SDK 메서드·새 단언/지표용 guard·Cloud 설정으로 통과시키거나 compatibility branch를 삭제하지 않는다. 이2개는 **과거 완료한 원29 계약과 다른 신규 후속**이다.

YouTube dirty2파일/17건·명시 보류444/PR1745의3·기존 권한3·static 기존3실패·원본49 미발견은 그대로다. SQL/운영 데이터/자격/인증설정/정책/PIN/worker 변경0, 실제 삭제·격리·신규 식사 생성/legacy 완료0이다.

## 반영 경계

후속 source는 제품·정확 원본 대응 metadata를 독립 검토한 뒤 draft PR로 시작하고 승인된 일반 머지 범위를 사용한다. 이 문서의 새 source를 운영93에 반영했다고 부르지 않는다. 최신5ea 인증 QA·후속 source 인증 QA와 실제 legacy 완료는 미실행이며 부모의 이전7d15 읽기QA를 대체 증거로 쓰지 않는다.5ea 창의 지문 일치는 원 승인/PIN/과거 baseline 교체나 새 전체DB 백업/복원 증명이 아니다. 작은 커밋마다 배포하지 않으며 다음 배포도 정확 후보·읽기 전용 계획·QA 점유를 구분한다.

정확한 clean 후속 문서 head `58331afdf089a2945b733f356311bbc01ab746cf`에 기존 DB238/일반 앱 경로의 공식 plan을 실행했으나 **exit1: R2 보호 코드·SQL·동의·라우팅 변경은 기존 readiness를 승계할 수 없음**으로 거부됐다. 실제 원인은 이번 source의 `components/marketing/marketing-turnstile.tsx`·`components/marketing/round2/round2-turnstile.tsx`가 기존 `protectedSources`의 marketing 보호 경로에 해당하기 때문이다. SQL/동의/라우팅을 실제 변경했다는 뜻이나 테스트 실패 판정이 아니다. 실행 JS 동일한 타입 변경도 이 경로 가드를 자동 해제하지 않는다. 기존 가드·readiness·PIN/증거를 수정하거나 다른 reviewed flag/실행 경로로 우회하지 않았다. 후속7건은 별도 draft/로컬 커밋에 보존하고 실제 머지·두 번째 배포를 보류한다. 이미 완료한5ea/DB238/지문9 보존은 이 후속 거부와 별개다. 보호 provider를 포함할 다음 반영의 범위/승인 경계를 먼저 결정해야 한다.
