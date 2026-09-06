# 플래너 재배치 — 로컬 검증 2026-09-06

사용자가 첨부한 세 장의 실제 화면과 후속 디자인 위임을 기준으로 기존 출시 전 UI 작업을 보완했다. 운영 배포, PR/merge, 정식 Stage 승인을 수행하지 않았다.

## 변경과 단순화

- `components/web/web-top-nav.tsx`, `lib/navigation/app-nav.ts`, `components/layout/app-header.tsx`, `app/globals.css`: 데스크톱 메뉴를 요리 계획/식사 기록으로 분리, 기존 날짜와 탭 선택 처리 유지. 프로필에서 마이페이지 접근. 플래너의 메뉴는 normal flow, 알림은 프로필 왼쪽에 배치.
- `components/shared/prelaunch-notice.tsx`, `components/planner/planner-shell-segments.tsx`: 밝은 하늘색 안내와 작은 모바일 탭. 잘리던 중복 플래너 제목은 시각 화면에서 제거.
- `components/planner/planner-week-screen.tsx`, `planner-week-navigation.tsx`, `planner-week-board.tsx`: 날짜 줄만 mobile sticky70px, desktop 고정없음. 장보기/남은요리를 주간 이동 옆에 모으고 중복 최근계획 사이드바 삭제. 상태 요약은 한줄, 장보기 이력 상세 링크는 유지. 계획 카드 이름+인분/상태 두줄이며 영양은 상세/보조 tooltip에 보존. 일요일 날짜와 요일을 줄바꿈 없이 묶음.
- `components/planner/meal-log-screen.tsx`, `meal-log-nutrition-chart.tsx`: 날짜만 sticky68px, 총영양 그래프 상시노출, 중복 타일 제거, 데스크톱 끼니 반응형 카드. 수정/삭제는 음식마다 각각 한개, 기존 실제 영양과 먹은양/g수정 계약 보존. 공개 예시에서만 기존 예시사진 재사용.
- 홈 화면·공용 프로필·YouTube 알림 컴포넌트: 모바일 프로필 제거, 종을 정상 흐름 안으로 배치. API/DB/권한 변경 없음.
- 테스트의 삭제된 토글 열기 helper를 없애고 실제 수정/삭제 버튼을 직접 검증하도록 단순화.

## 검증

- 주요 22개 파일 345/345 테스트 통과. 로그 `/tmp/redesign-regression-final.log`. 이 수는 UI 회귀 묶음이며 전체 저장소 모든 테스트 수가 아니다.
- 공용 탐색 영향 추가 검증: chrome 묶음7파일118, 확장5파일166 통과(중복이 있어 주요345와 합산하지 않음).
- 전체 타입검사, ESLint, SOT 문서정합, diff 공백검사 통과.
- 최종 Next production build 통과(exit0). 로그 `/tmp/redesign-build-final.log`.
- 브라우저 320/390/1280: 주이동, 날짜선택, 키보드 주이동, 추가/수정의 게스트 로그인안내, 취소후 스크롤, 총영양 차트의 기본가시성 확인. 페이지 가로넘침0, 320 날짜rail 내부넘침0, 브라우저 pageerror0. 10/26–11/1 주경계도 확인.
- 로그인 모바일의 알림 fallback 겹침과 과거날짜의 잘못된 ‘오늘’ 제목을 보조 코드리뷰에서 발견해 수정. 정식 독립 Stage 승인을 대신하지 않음.
- 로컬 시각 검토93/pass. 캡처와 browser log: `ui/designs/evidence/prelaunch-planner-ui/redesign/`.
- 같은 Wi-Fi 주소 `http://192.168.0.38:3212/planner` 정상200 확인.

## 검증 경계

- 로컬은 명시적인 공개 예시 데이터다. 실제 계정 OAuth/DB 저장 end-to-end, 운영 app.mumeok.kr 반영, 실기기/보조기기 전체 접근성 인증을 주장하지 않는다.
- g환산과 영양계산은 기존 계약을 유지하며 이번 작업은 화면 배치에 집중한다.
- 빌드는 비공개 환경파일을 복사하지 않은 별도 runtime copy와 가짜 loopback Supabase 환경으로 수행한다. 별도 copy 빌드에서는 lint를 생략하고 원본 저장소 전체 lint를 따로 수행한다.
