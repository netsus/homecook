# 데스크톱 준비 배너 가림 수정

홈과 가이드는 고정 메뉴가 top=0, height=64px로 배너(top=0, height=34px)를 덮었다. 플래너의 일반 흐름 메뉴에는 이 문제가 없었다.

`components/shared/prelaunch-notice.tsx`에 전용 클래스를 추가하고 `app/globals.css`의 데스크톱 규칙에서 고정 메뉴가 있을 때만 배너를 기존 메뉴 여백 위치로 옮겼다. 배너의 원래 흐름 공간을 유지하므로 본문은 배너 아래에 배치된다. 새로운 고정 영역이나 높이 측정 코드는 추가하지 않았다.

`tests/e2e/prelaunch-banner.spec.ts`는 실제 메뉴가 나타난 뒤 화면 맨 위에서 배너 중앙에 다른 요소가 겹치는지 확인한다. 수정 전 홈/가이드 2개 실패, 수정 후 홈/가이드/두 플래너의 데스크톱·모바일 8개 통과. 관련 단위 테스트 53개, 전체 타입 검사·lint·diff 검사도 통과했다.

스크린샷: `ui/designs/evidence/prelaunch-planner-ui/desktop-notice/home-desktop.png`. 로컬 미리보기에 반영했으며 운영 배포는 수행하지 않았다. 배너는 페이지를 스크롤하면 함께 이동한다.
