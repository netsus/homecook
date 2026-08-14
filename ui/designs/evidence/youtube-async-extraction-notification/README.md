# YouTube async extraction Stage 4 evidence

- current implementation code head: `170921f54fb3649cb4dea973d5c5213665b12529`
- current implementation code tree: `069d5b861744be26ca550f465ea5582c735f49bc`
- screenshot capture source: `2113dacdbb464f6422424324a38823e8c3d6933a` / `ed823a064774dee538df8cde47c483af08efa7dc`
- evidence relation: current implementation은 capture source 이후 backend lease timing·worker artifact provenance와 lint-only test mock만 바꾸고 UI 및 screenshot generator byte는 바꾸지 않았다. 따라서 30개 PNG byte를 재사용하고 current head에서 frontend·security browser gate를 다시 통과시켰다.
- isolated app: `http://127.0.0.1:3217`
- captured: `2026-08-14T06:52:00Z`
- remote/cloud Supabase access: `0`
- operational local Supabase/app 3100 mutation or use: `0`

`manifest.json`은 30개 screenshot의 viewport와 상태를 고정한다. `portable-exploratory-qa/`는 같은 code head에서 재잠근 checklist, 작성 완료 report, eval 결과, 실행 README를 저장한다. 320px에서는 전체 global presentation을 통틀어 YouTube 또는 Growth card 하나만 완전히 표시한다. YouTube dismiss 뒤 첫 Growth, 그 Growth dismiss/만료 뒤 다음 Growth로 순차 인계하며 대기 Growth는 렌더·announcement·timer·seen mutation을 시작하지 않아 badge/list 복구를 보존한다. 390px와 desktop에서는 기존 두 채널·Growth stacking, CTA·닫기 control의 click ownership과 YouTube→Growth 읽기 순서를 유지한다. URL import initial/submitting/enabled 캡처는 비활성 CTA의 neutral fill·text·border와 pressed 제거를 비교한다. 고정 한국어 toast와 panel/list 문구는 단어 단위 줄바꿈을 유지하고 긴 예외 token만 안전하게 감싼다. 기존 global bell rectangle, `UNAUTHORIZED` focus handoff, review heading activeElement, consumed exact title/CTA, 탭 순환, archive background 복구, planner 표시명 `저녁`도 browser assertion으로 고정한다. `visual-verdict.json`은 새 code head의 screenshot 회귀 판정이며 Stage 5 승인을 대신하지 않는다.

신규 증거는 import initial/submitting/`POLICY_CHANGED`, shell consumed/expired/non-retryable/empty/offline/unauthorized를 각각 명시적으로 고정한다. 개별 draft/consumed/failed toast exact body, mixed grouped toast의 중립 의미, HOME primary controls와 mobile/desktop toast 비겹침을 별도 캡처했다. `mobile-320-accepted-200-keyboard.png`는 200% text, non-zero simulated safe-area, keyboard-reduced viewport에서도 두 CTA가 내부 스크롤로 도달 가능하고 앱 제목·알림 trigger가 겹치지 않음을 입증한다. `mobile-320-failure-panel.png`는 같은 확대 조건에서 retry CTA 전체 bounding box와 label이 dialog/viewport 안에 있음을 고정한다. 실제 browser reload와 guest reload 후 재로그인 badge/list/destination 복구도 결정론적 fixture로 검증했다.
