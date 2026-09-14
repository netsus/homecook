# 식단기록 첫 화면 표현 후보

> 2026-09-12 최종 선택: 아래 소개 Hero 후보는 superseded 비교 이력이다. 현재 선택안은 별도 시작 버튼 없이 기존 Q1을 바로 표시하는 표현 전용 entry다. Hero 패치와 캡처는 보존한다.

사용자는 이전 R2 병렬 메뉴 UI를 거부하고 기존 `/beta` 시각 스타일과 직렬 순서를 선택했다. 이 기록은 첫 화면 표현 후보에만 해당한다. 이전 R2 디자인 승인과 confirmed를 이 후보에 승계하지 않는다.

## 적용할 문구

- 제목: `베타 오픈 전 수요조사`
- 진행 순서: `4문항 테스트 → 무먹 체험 → 베타 알림 신청`
- 작은 시간 안내: `전체 약 30초`
- 주 버튼: `4문항 테스트하기`

기존 Hero A의 로고·색상·음식 시각·본문·버튼 스타일을 재사용한다. 진행 순서는 의미 있는 ordered list로 표시한다. 공용 CSS는 수정하지 않고 후보 전용 CSS가 필요하면 해당 표현에만 적용한다.

## 최소 분리 계획과 보존 경계

1. 현재 legacy Hero a/b/c의 SSR markup을 먼저 회귀 근거로 고정한다.
2. Hero의 표현과 그 표현용 helper를 순수 컴포넌트로 옮긴다. 기존 screen은 같은 기본 props/markup을 사용하고 controller/useEffect/질문/후속 화면은 그대로 둔다.
3. 새 명시적 presentation에서만 네 문구를 사용한다. 새 제목·순서·시간·콜백·API0을 실패 테스트 후 구현한다.
4. 기본 Hero markup과 390/320 스크린샷이 같은지 비교한다. 후보는 같은 폭과 desktop에서 overflow·44px·CTA 가림·console을 확인한다.

기존 `/beta` route/API/cookie/attribution/session storage와 downstream 직렬 순서를 변경하지 않는다. 전체 MarketingDemandValidationScreen을 새 R2에 mount하지 않는다. 집밥흐름/R2 controller/API/DB/공유 스타일도 수정하지 않는다.

## 비저장 미리보기

별도 소유 temp Next 페이지에 순수 Hero만 mount한다. 기존/후보 비교와 onStart 콜백의 로컬 시작 표시만 제공하며, 원 설문이나 backend action을 가짜로 연결하지 않는다. 빈3174포트를 확인해 사용하고 기존3100/3117/3118/3124/3126은 접근·재사용·종료하지 않는다. 운영 데이터 요청·광고·provider·DB·Discord·commit/push/merge/배포는 이번 범위가 아니다.

공식 r2.1은 아직 병렬 계약이므로 실제 새 직렬 R2 연결은 미구현이다. 이를 바꾸는 public behavior가 필요하면 별도 공식 계약/연결 작업으로 인계한다.

## 이전 Hero 후보 상태 — 2026-09-12 이력

기본 Hero a/b/c HTML3개를 변경 전 snapshot으로 고정하고, 표현 분리 후 동일성을 확인했다. 새 표현6개 테스트는 기존 문구에서 RED, 구현 후 기존 landing 회귀42개를 포함해 총51개가 통과했다. 공용 CSS·route·API·session/controller·질문과 downstream 내용은 바꾸지 않았다. 순서 표시의 작은 배치는 새 표현의 inline style에만 둔다.

실제 기존 before와 후보 비교에서320px 영양표 제목/숫자의 내부 겹침을 확인했다. 후보의 제목·순서·시간·CTA는 표시되고 버튼은48px/가림 없음이지만, 시각 verdict는78/revise로 남긴다. 기본9조건 DOM은 동일하고 PNG는8개 동일·c320의6픽셀 차이가 있어 원인을 단정하지 않는다. 기존320 겹침은 fixture wrapper/실제 시스템 font와 동일한 조건에서 확인했다.

사용자가 광고 유입의 Q1 직행 효과를 검토 중이므로 조정자의 지시에 따라 현재 후보를 보존하고 추가 디자인·연결 변경을 중지했다. 이 후보는 승인되지 않았으며 기존 R2 디자인 승인도 승계하지 않는다. 직렬 R2 연결과 Q1 직행은 모두 미구현이다.

현재 인수: branch `feature/recording-intro-presentation`, 기준 HEAD `5127794368d1d094c54ede291619f7b0938efdf0`. 로컬 패치만 있으며 commit/push하지 않았다. 수정파일 lint와 전체 typecheck가 통과했다. 원래 controller 함수 본문, `/beta` route/API/session과 공용 CSS·R2 파일은 기준과 byte 동일하다.

비저장 후보는 [로컬 도구 미리보기](http://127.0.0.1:3174/preview)다. 세션64889/PID56238을 유지한다. 안내와 시작 콜백 횟수는 Hero 밖 도구 영역에 표시하며, 버튼은 실제 설문이나 API로 연결되지 않는다. 검증·캡처 원문은 로컬 `.omx/artifacts/recording-intro-presentation/README.md`를 따른다. 원본/기본/후보21조건과 도구화면3조건에서 API·저장소·외부 요청·console 오류0, CTA48/54px·가림 없음을 확인했다. 시각78/revise와320 겹침은 해결되지 않은 상태다.

## 현재 Q1 직행 표현 계획

작은 `무먹 / 베타 오픈 전 수요조사`, `4문항 · 로그인 없이`, `1/4`와 기존 Q1을 즉시 표시한다. 정확한 질문은 `평소 칼로리나 탄단지를 얼마나 자주 기록하나요?`, 선택지는 `daily=거의 매일`, `3_5=주 3~5일`, `1_2=주 1~2일`, `none=거의 안 함 / 안 함`이다. 큰 소개 사진과 테스트 시작 CTA는 없다.

기존 Quiz 표현·질문 상수·진행 header를 순수 모듈로 옮기고 default DOM/문구를 먼저 고정한다. 새 recording-entry presentation만 작은 안내와 첫 답변 중복 방지 경계를 가진다. 답변 표시는 caller-controlled, `onSelect("q1", value)`는 해당 entry에서 첫 사용자 선택에 한 번만 전달하며 렌더/재렌더로 전달하지 않는다. 시작 집계 event나 API를 뜻하지 않는다.

새 Q1과 기본 Hero/기존 v2 Q1 보존, 렌더 시 콜백·API0, 첫 선택/중복 선택을 RED→GREEN으로 검증한다. 같은 소유3174의 기본 미리보기를 Q1으로 바꾸고390/320/desktop에서4선택지·44px·한 화면 fit·console·무저장 경계를 확인한다. 이전Hero는 비교 URL/캡처로 남긴다. 실제 R2 직렬 저장/다음 질문 연결, public route/controller/API/DB 변경은 계속 범위 밖이다.

## Q1 표현 인수 — 현재 선택안

기존 Q1 markup을 추출 전 snapshot으로 고정하고 순수 Quiz 모듈로 이동한 뒤 동일성을 확인했다. 새 entry8개 검사에서6 FAIL/기존 경계2 PASS를 확인한 뒤 구현했으며, 기존 landing42·Hero/Quiz 보존4·구안6을 합친 좁은 회귀60개가 모두 통과했다. 중간59 PASS/1 FAIL은 줄바꿈의 accessible name 공백 문제였으며 해당 중간 로그는 최종 green 로그에 덮여 별도 원문이 남아 있지 않다. 이를 재현하려고 소스를 되돌리지 않았다. 새 entry에만 읽기용 질문 이름을 명확히 했고 default markup은 보존했다.

수정 파일 lint와 전체 typecheck는 각각 exit0이다. 기존 controller 함수, 공용 CSS, `/beta` route/API/session 및 R2/homeflow 파일은 변경하지 않았다. commit/push/merge/배포 없이 같은 로컬 branch에 보존한다.

`http://127.0.0.1:3174/preview`와 `/`의 기본은 Q1이다. 이전 소개 Hero는 `/hero` 비교 이력으로 남는다. 후보320/390/desktop에서 정확한 Q1·4선택지·작은 베타 안내·1/4를 확인했으며, 뒤로가기나 빈 자리는 없다. 선택지는68px이며 화면 내에 보인다. 렌더 시 콜백0, 12개 선택 조건에서 최초 선택 콜백1회·선택 표시·API/저장소/외부 요청/console0을 확인했다. 도구 영역에 미구현 경계를 표시하고 Q2/완료 화면을 가장하지 않는다.

조정자는 후보320/390과 실제 결과를 직접 확인해 로컬 첫 화면 시각95/pass를 제공했다. 이는 기존 R2 승인 승계나 배포/전체 직렬 연결 승인이 아니다. 실제 R2 저장·시작 집계·다음 질문/체험/신청 연결은 미구현이다. 현재 근거와 캡처는 `.omx/artifacts/recording-intro-presentation/q1-entry/`에 보존한다. 세션64889/PID56238의 비저장 미리보기를 유지하며 추가 테스트·수리는 진행하지 않는다.

참조: [v2 workpack](../README.md), [acceptance](../acceptance.md), [기존 질문 계약](../../../marketing/quiz-content-spec.md), [현재 공식 기준](../../../sync/CURRENT_SOURCE_OF_TRUTH.md).
