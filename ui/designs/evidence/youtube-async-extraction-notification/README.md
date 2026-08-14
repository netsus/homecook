# YouTube async extraction Stage 4 evidence

- exact code head: `00a908789487bf4efcb66cff0b33c97b15513311`
- exact code tree: `b63d1d7a26d10754d6d6378998f2eaedd7451433`
- evidence relation: screenshot과 deterministic browser evidence는 위 code head/tree에서 생성했고, 이후 evidence-only commit은 제품 tree를 변경하지 않는다.
- isolated app: `http://127.0.0.1:3217`
- captured: `2026-08-14T03:35:16Z`
- remote/cloud Supabase access: `0`
- operational local Supabase/app 3100 mutation or use: `0`

`manifest.json`은 24개 screenshot의 viewport와 상태를 고정한다. `portable-exploratory-qa/`는 같은 code head에서 재잠근 checklist, 작성 완료 report, eval 결과, 실행 README를 저장한다. 390/desktop의 global bell은 toast 닫기와 YT_IMPORT 뒤로가기의 실제 DOM rectangle과 분리되고 desktop center-point hit ownership도 유지한다. 열린 panel이 `UNAUTHORIZED`로 전환될 때 panel 내부 focus만 로그인 안내 제목으로 이동하며 외부 focus는 보존한다. notification destination 뒤 review heading activeElement, consumed exact title/CTA, ArrowLeft/Right wraparound와 Home/End roving focus, archive 탭을 유지한 foreground/online fresh unseen 복구를 browser assertion으로 고정한다. planner context의 저장 식별자 `dinner`는 query에 유지하되 사용자 표시명은 `저녁`으로 분리했다. 독립 디자인 검토는 이전 publication head `36ee40184f8b912e78a2bd30439ebbf151d4aef3`에서 PASS/findings 없음이었고 이후 변경은 server/worker security와 그 테스트뿐이다. `visual-verdict.json`은 새 code head의 screenshot 회귀 판정이며 Stage 5 승인을 대신하지 않는다.

신규 증거는 import initial/submitting/`POLICY_CHANGED`, shell consumed/expired/non-retryable/empty/offline/unauthorized를 각각 명시적으로 고정한다. 개별 draft/consumed/failed toast exact body, mixed grouped toast의 중립 의미, HOME primary controls와 mobile/desktop toast 비겹침을 별도 캡처했다. `mobile-320-accepted-200-keyboard.png`는 200% text, non-zero simulated safe-area, keyboard-reduced viewport에서도 두 CTA가 내부 스크롤로 도달 가능하고 앱 제목·알림 trigger가 겹치지 않음을 입증한다. `mobile-320-failure-panel.png`는 같은 확대 조건에서 retry CTA 전체 bounding box와 label이 dialog/viewport 안에 있음을 고정한다. 실제 browser reload와 guest reload 후 재로그인 badge/list/destination 복구도 결정론적 fixture로 검증했다.
