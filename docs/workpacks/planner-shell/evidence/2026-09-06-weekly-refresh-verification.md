# 주간 식사 기록과 출시 전 UI·가입 보호

## 반영 내용과 파일

- `components/planner/meal-log-screen.tsx`: 선택일 하나 대신 7개 날짜 카드를 세로로 표시한다. 각 날짜에 칼로리·탄수화물·단백질·지방 타일을 두고 숫자만 파란색으로 강조했다. 개별 음식의 막대는 제거하고 양·kcal·탄단지를 텍스트로 표시한다. 빈 끼니의 반복 안내와 큰 여백은 없앴다. 추가·삭제·재조회는 `dialogDate`로 클릭한 날짜를 고정한다. 날짜별 로딩·실패·빈 상태와 개인 데이터 보호를 유지한다.
- `components/planner/planner-week-screen.tsx`: 첫 화면/첫 탭 진입은 선택 날짜(기본 오늘)로 이동한다. 직접 선택한 날짜는 보존한다. 실제 세로 스크롤에 맞춰 날짜 표시와 URL을 동기화하며, 프로그램에 의한 날짜 이동·모달·탭 복원과 경쟁하지 않도록 분리했다. 7일 조회 완료 후 이동해 높이 변화로 위치가 틀어지는 것을 줄였다.
- `components/planner/planner-week-board.tsx`, `types/planner-meal-nutrition.ts`, `lib/server/planner-meal-nutrition-view.ts`, `lib/planner/guest-planner-preview.ts`: 인분 문구 대신 전체 kcal·탄단지 막대와 무게를 표시한다. 정확한 전체 무게 출처가 없는 실제 계획은 ‘무게 계산 준비 중’이다. 공개 예시는 명시된 250/400/320g만 사용한다. 부분·미확인 값을 비율처럼 표시하지 않으며, 사진 모서리는 이전보다 줄였다.
- 미래 무게 기능: 사용자는 수율을 반영한 예상 완성 무게를 기본으로 하고 실측 값으로 수정할 수 있는 방향을 설명했다. 이번에는 수율 알고리즘·새 DB 필드·배치 연결·무게 수정 API를 구현하지 않았다. 기존 배치 중량을 같은 레시피라는 이유만으로 계획에 연결하지 않는다.
- `planner-date-controls.tsx`, `planner-week-navigation.tsx`, `wave1-mobile-bottom-tab.tsx`, `prelaunch-notice.tsx`: 오늘·장보기·남은요리를 버튼 형태로 정리했다. 선택 날짜는 테두리 없는 파랑/흰 글씨, 실제 오늘은 별도 라벨이다. 접시 원은 아래로 조정했고 준비 배너 문구를 같은 기준선에 맞췄다.
- `components/home/home-screen.tsx`: 홈 YouTube 진입은 독립 가져오기 경로를 사용해 돌아가기를 누르면 홈으로 복귀한다.
- `components/auth/{login-screen,social-login-buttons,social-login-buttons-deferred}.tsx`, `app/auth/{flow/start,callback}/route.ts`: 준비 모드에서 소셜 버튼 노출·신규 로그인 시작·콜백 교환을 차단한다. 기존 AUTH_FLOW_UNAVAILABLE/503을 재사용한다. 기존 세션·로컬 password QA·인증된 계정 연결은 보존한다. Supabase 외부 직접 API의 계정 생성 설정까지 변경한 것은 아니다. 운영 사이트에는 배포하지 않았다.
- `components/marketing/marketing-demand-validation-screen.tsx`, `app/globals.css`: 로고가 섞인 넓은 회색 스켈레톤을 작은 로딩 안내로 교체했다.

## 로컬 랜딩 오류 진단

로컬 주소 자체의 문제는 아니다. 초기에는 `ALLOWED_MARKETING_ORIGINS` 누락, 다음에는 공식 캠페인 종료일 설정 누락으로 차단됐다. 두 비밀이 아닌 설정은 `/tmp/sync-prelaunch-preview.py`의 after 미리보기 한정 기본값으로 보완했다.

그 뒤 실제 view 저장은 JWT 인증 오류로 503을 반환했다. 올바른 격리 환경 DB 인증 설정이 필요하다. 비밀 값을 탐색하거나 운영·DB 설정을 바꾸지 않았고, 가짜 저장 성공으로 우회하지 않았다. 임시 진단용 handler 변경은 원복했다. 저장소와 build copy의 실제 marketing API 파일이 동일한 것도 확인했다.

## 검증

- 통합 관련 74개 파일: 72개 통과, 2개 환경 의존 생략. 테스트 876개 통과, 27개 생략. `/tmp/weekly-refresh-all-tests.log`.
- 마지막 빈 날짜 압축 후 관련 30개 테스트 추가 통과. `/tmp/weekly-empty-compact-tests.log`.
- 320·375·1280px 브라우저 검사 21개 통과. 주간 카드·최초 위치·스크롤 날짜 동기화·계획 전체 영양·홈 복귀·소셜 시작 503·기존 날짜 정렬/하단 간격을 확인했다. `/tmp/weekly-refresh-e2e-final.log`.
- WebKit 모바일 모드에서도 7일 표시, 날짜 동기화와 홈 복귀를 확인했다. 배너 두 문구의 top=6px, height=20px 일치를 확인했다. 물리 iPhone 검증으로 표현하지 않는다.
- 전체 타입 검사·ESLint·SOT 정합성·diff 검사·최종 Next build 통과. 마지막 build 로그 `/tmp/weekly-refresh-build-final.log`.
- 보조 통합 리뷰에서 새 P1/P2는 발견되지 않았다. 로컬 시각 검토 96/pass는 정식 Stage 승인이 아니다.

## 범위

로컬 UI에 반영했다. 운영 배포·실제 소셜 공급자 가입 설정·실제 계정 저장 전체 검증·수율 알고리즘 구현은 이번 완료 범위가 아니다. 빌드는 비공개 환경파일 없이 별도 runtime copy에서 수행했다.
