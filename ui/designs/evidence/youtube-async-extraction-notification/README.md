# YouTube async extraction Stage 4 evidence

- exact code head: `8460a43b21e7f4e4f568a38314411828af28985d`
- exact code tree: `15eb53b63d0131d7296ce343e23eb4c54d0205ce`
- evidence relation: screenshot과 deterministic browser evidence는 위 code head/tree에서 생성했고, 이후 evidence-only commit은 제품 tree를 변경하지 않는다.
- isolated app: `http://127.0.0.1:3217`
- captured: `2026-08-13T23:15:15Z`
- remote/cloud Supabase access: `0`
- operational local Supabase/app 3100 mutation or use: `0`

`manifest.json`은 22개 screenshot의 viewport와 상태를 고정한다. `portable-exploratory-qa/`는 같은 code head에서 재잠근 checklist, 작성 완료 report, eval 결과, 실행 README를 저장한다. 390/desktop의 global bell은 toast 닫기와 YT_IMPORT 뒤로가기의 실제 DOM rectangle과 분리되고 desktop center-point hit ownership도 유지한다. `visual-verdict.json`은 구현 task의 screenshot 판정이며 독립 authority 또는 Stage 5 승인을 대신하지 않는다.

신규 증거는 import initial/submitting/`POLICY_CHANGED`, shell consumed/expired/non-retryable/empty/offline/unauthorized를 각각 명시적으로 고정한다. 개별 draft/consumed/failed toast exact body, mixed grouped toast의 중립 의미, HOME primary controls와 mobile/desktop toast 비겹침을 별도 캡처했다. `mobile-320-accepted-200-keyboard.png`는 200% text, non-zero simulated safe-area, keyboard-reduced viewport에서도 두 CTA가 내부 스크롤로 도달 가능하고 앱 제목·알림 trigger가 겹치지 않음을 입증한다. 실제 browser reload와 guest reload 후 재로그인 badge/list/destination 복구도 결정론적 fixture로 검증했다.
