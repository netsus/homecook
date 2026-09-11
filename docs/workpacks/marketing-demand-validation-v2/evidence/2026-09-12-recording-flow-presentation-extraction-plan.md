# 후속 화면 표현 분리 계획

기준은 f2a2 `feature/recording-intro-presentation`의 `84e412b4c41fd905d80589bf00c9a38fd3c0f3bf`다. 계약 대기 중 독립적으로 가능한 표현 분리만 수행한다. 새 R2 adapter·route·동의 옵션·저장 연결은 추가하지 않는다.

1. 기존 controller로 결과→체험5단계→planner→packaged→완료planner→신청→완료를 실행해 단계별 HTML과 기존 API action 순서를 snapshot/회귀로 먼저 고정한다. 외부 API·보안 공급자는 테스트 경계에서만 대체한다.
2. Result/Experience/Planner/Packaged/BetaForm/Done과 필요한 표시 데이터·날짜·count-up/reduced-motion·asset preload helper를 `recording-flow-views.tsx`로 옮긴다. 새 동작을 만들지 않고 기존 함수를 export한다.
3. legacy screen은 같은 이름의 import를 사용한다. controller 함수 본문, 기본 props, 전이 시점, URL/API/session, 공용 CSS와 스타일 문자열은 그대로 보존한다.
4. 표현을 정의하는 모듈의 runtime import graph에 legacy API와 session이 포함되지 않는다는 경계 검사를 RED→GREEN으로 확인한다. 변경 전 full-flow snapshot과 기존 관련 회귀, 대상 lint/typecheck를 실행한다.

신규 R2 의미/동의/회복 props는 후속 승인된 계약을 받은 뒤 별도 작업이다. 실제 API 저장 검증이나 배포 완료를 주장하지 않는다. release 통합 worktree·서버·다른 세션 파일은 수정하지 않는다. 로컬 보존 커밋만 인계하며 push/merge/운영은 수행하지 않는다.

## 완료 근거

- 분리 전 기존 전체 흐름의11개 HTML snapshot과8개 API action 순서를 고정했다. API/보안 토큰은 테스트용 대체이며 실제 저장 검증이 아니다.
- import 경계는 분리 전 legacy API와 client-session 두 경로를 발견해 RED였고, 분리 후 같은 검사에서 GREEN이다.
- 새 보존/경계2개, 기존 landing42개, Hero/Q1 snapshot4개, Q1 entry8개 합계56개 PASS. 기존 full-flow snapshot을 분리 후 갱신하지 않았다.
- 대상 lint·전체 typecheck·diff whitespace 검사 PASS. 원 controller 함수 전체와 여섯 화면 함수/표시 helper 내용은 export 선언을 제외하고 동일함을 비교했다.
- 공용 CSS, `/beta` route, API/session, 기존 Hero/Quiz 파일은 기준84e412와 byte 동일하다. 새 동의 props·R2 adapter·API·schema·동작을 추가하지 않았다.
- 결과는 재사용을 위한 표현 분리이며 실제 R2 저장 연결이나 새 디자인/배포 승인이 아니다.

로컬 실행 원문: `.omx/artifacts/recording-flow-extraction/`의 `baseline-and-boundary-red.log`, `green.log`, `lint.log`, `typecheck.log`. 초기 보존 테스트 작성 중 빠진 수동 '다음' 클릭은 제품 변경 전에 테스트에서 바로잡았고 해당 초안 실패는 `before-red.log`에 따로 보존했다.
