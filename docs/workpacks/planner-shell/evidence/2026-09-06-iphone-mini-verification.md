# iPhone 13 mini 후속 UI 수정 — 2026-09-06

## 반영

- 모바일 하단5개: 홈 / 요리 계획 / 식사 기록 / 팬트리 / 마이. 상단 segment 제거. 날짜를 보존하는 기존 segment handler를 재사용하며 브라우저 새탭·보조키 클릭은 실제 href로 동작한다.
- 화살표·주기간 행 대신 native 날짜 선택 + 오늘. iOS 입력의 자동 확대 방지를 위해 날짜 input 글씨는16px. 375px/320px 장보기·남은요리 동행 배치.
- 가까운 주는 양쪽 날짜 줄의 가로 swipe, 먼 과거는 native 달력. 공용 `use-week-swipe-pager`로 동일한 recenter/비동기 lock 처리를 재사용한다. 식사 기록의 날짜 radio 키보드 탐색은 유지하고 PageUp/PageDown은 주 이동. plan은 날짜줄 Arrow키로 주이동. 주 이동으로 날짜 버튼이 교체돼도 rail에 초점을 보존한다.
- 계획 카드: 상태는 색점과 스크린리더 설명, 계획 인분과 1인분당 kcal. pinned 계획전체 영양÷유효 계획인분. partial은 최소, unavailable/stale/0인분은 숫자를 만들지 않음.
- 식사 기록 음식: 양만 250g처럼 표시, 음식종류 반복 문구 제거. kcal/탄단지/나트륨을 항상 표시, 수정·삭제는 음식마다1개.

## 파일

- `components/planner/planner-date-controls.tsx`, `use-week-swipe-pager.ts`, `planner-week-navigation.tsx`
- `components/planner/planner-week-screen.tsx`, `planner-week-board.tsx`, `meal-log-screen.tsx`
- `components/layout/wave1-mobile-bottom-tab.tsx`, `bottom-tabs.tsx`, `lib/navigation/app-nav.ts`
- 관련 회귀 테스트 및 공식문서/기존 workpack 후속 승인 보완. 이전 로컬 검증 요약의 체크박스를 일반 기록으로 정리하여 정식 Stage 체크리스트와 혼동하지 않도록 수정.

## 브라우저·보조 리뷰

- Chromium/WebKit 각각320/375/1280px의 plan/log12조합. 가로넘침없음, 모바일5탭과 단일현재탭, 장보기·남은요리 같은행, 각영양기본표시, 달력8/1점프/오늘복귀, 로그인게이트 열기/닫기 확인. pageerror0.
- Chromium 모바일 모드의 실제 touch start/move/end 입력으로 두 화면 다음주 이동 통과.
- 사진/JSON evidence: `ui/designs/evidence/prelaunch-planner-ui/iphone-mini/`. 시각 검토94/pass는 로컬 검토이며 정식 독립 Stage authority가 아니다.
- 보조 코드리뷰가 발견한 날짜버튼에서 주이동 후 초점소실은 실패2개→수정→13개 통과로 고정했다.

## 경계

실제 iPhone13mini의 OS 날짜팝업 및 실기기 조작은 사용자 확인 대상이다. WebKit emulation을 실제 기기검증으로 표현하지 않는다. 개인 API/DB/권한/섭취계산 계약을 바꾸지 않았다. 공개 예시 preview이며 실제계정 OAuth/저장 end-to-end 및 운영 배포는 수행하지 않았다. 의존성 변경 없이 기존 Playwright에 WebKit 브라우저 바이너리만 설치했다.

## 자동 검증 결과

- 최종 관련52파일: 50통과/2생략, 테스트533통과/27환경의존생략. `/tmp/mini-regression-final.log`.
- 추가 키보드 회귀: 주경계에서 남아 있던 지연 focus가 다음 입력을 가로채는 경우를 제거. 같은주 radio는 이미 렌더되어 있으므로 즉시 해당 날짜에 초점을 옮긴다.
- 전체 타입검사·ESLint·SOT 정합·git diff 공백검사 통과. 새로운 npm 의존성 변경 없음.
- 같은Wi-Fi `http://192.168.0.38:3212/planner?segment=log` HTTP200 확인.

- 최종 Next production build 통과(exit0), `/tmp/mini-build-final.log`. 비공개 환경파일 없는 별도 runtime copy에서 loopback용 가짜 Supabase 값으로 수행했고 lint는 원본 저장소에서 별도로 전체 실행했다.
