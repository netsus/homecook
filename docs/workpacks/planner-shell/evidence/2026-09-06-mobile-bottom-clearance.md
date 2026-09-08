# 모바일 하단 여백 정리

- `components/planner/planner-week-screen.tsx`: 마지막 날짜를 상단에 맞추던 가변 spacer, 관련 높이 측정과 추가 최소 높이를 삭제했다. 하단 탭 64px + 아래 간격 8px + safe-area만 외부 padding으로 남겼다. 비어 있는 과거 완제품 영역의 margin도 숨긴다.
- `components/planner/meal-log-screen.tsx`: 모바일 본문 하단 padding을 12px로 줄여 중복 여백을 제거했다. 데스크톱 본문 padding은 유지한다.
- 최하단에서 카드와 하단 탭 사이의 간격은 계획 약355px→약12px, 기록64px→12px다. 마지막 카드는 실제 스크롤 범위까지만 이동하며, 위에 맞추기 위한 빈 공간을 만들지 않는다.

검증: `tests/e2e/planner-bottom-space.spec.ts`의 375×812, 375×650, 320×568 양 화면 6개 실패→수정 후 통과. 날짜 탭 왕복 8개도 통과했다. 관련 단위 테스트 101개, 전체 타입 검사·lint·diff 검사·Next build 통과. API·권한·기록 데이터는 바꾸지 않았다.

전후 이미지: `ui/designs/evidence/prelaunch-planner-ui/bottom-clearance/`. 로컬 반영이며 운영 배포는 수행하지 않았다.
