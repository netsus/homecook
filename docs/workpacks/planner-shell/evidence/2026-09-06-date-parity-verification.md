# 두 플래너 날짜 영역 통일

## 변경

- `components/planner/planner-week-navigation.tsx`: 두 모드가 같은 달력·오늘·날짜 줄을 사용한다. 버튼 48px, 요일·날짜 글꼴, 여백·테두리·선택 표시를 통일했다. 식사 기록의 라디오 선택과 키보드 이동은 유지한다.
- `components/planner/planner-week-screen.tsx`: 공통 날짜 영역을 탭 본문 바깥에 한 번만 렌더한다. 날짜 영역의 문서 위치와 전환 전 화면 위치를 기준으로 스크롤을 복원한다. 짧은 본문에서도 고정 상태를 유지할 공간을 확보했다.
- `components/planner/meal-log-screen.tsx`: 별도 날짜 UI와 키보드 처리 중복을 제거하고 공통 구성을 사용한다. 단독 렌더링에서도 같은 날짜 구성을 재사용한다. API·DB·로그인 보호에는 변경이 없다.
- 다른 달의 계획을 불러오는 중 빠르게 탭을 되돌리면 임시 범위의 첫날로 바뀌는 경우를 보조 검토에서 발견했다. 탭 이동도 실제 선택 날짜를 사용하도록 수정하고 실패 회귀 테스트 후 통과시켰다.

## 검증

- 관련 9개 파일 107개 테스트 통과. `/tmp/date-parity-unit-final.log`.
- `tests/e2e/planner-date-parity.spec.ts`: 320·375·1280px에서 상단 달력·오늘·날짜 7개의 좌표, 크기, 글꼴, 색과 선택 표시를 비교했다. 모바일 고정 상태 왕복과 식사 기록에서 처음 요리 계획으로 진입하는 경우까지 8개 통과. `/tmp/date-parity-e2e-final.log`.
- 전체 타입 검사·ESLint·SOT 정합성·diff 검사·최종 Next build 통과.
- 이미지: `ui/designs/evidence/prelaunch-planner-ui/date-parity/`. 로컬 시각 검토 97/pass이며 정식 Stage 승인은 아니다.

## 범위

로컬 미리보기에 반영했다. 실제 계정 저장 전체 흐름이나 운영 배포는 수행하지 않았다. API·도메인 상태·영양 계산과 기존 주간 조회 동작은 유지했다. 빌드는 별도 runtime copy에서 비공개 환경파일 없이 수행했다.
