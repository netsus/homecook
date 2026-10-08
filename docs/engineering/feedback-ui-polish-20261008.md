# 2026-10-08 요리계획·식사기록 화면 정리 (운영 반영)

사용자 피드백9개를 묶어 검증하고 후속 요청에 따라 웹에 반영했다. 통합 PR은 [#1596](https://github.com/netsus/homecook/pull/1596)이며 DB는 변경하지 않았다.

## 변경

1. 식사기록의 다른 주/날짜 조회 중에도 현재 사용자 끼니 이름을 남기고 각 음식 영역만 스켈레톤으로 표시한다. 부모의 확인된 끼니 설정 또는 이미 조회한 식사기록 메타데이터를 사용한다. 이전 날짜의 음식은 새 날짜에 표시하지 않는다. 초기 설정조차 없으면 끼니 이름을 임의로 만들지 않는다.
2. 날짜 페이지 위치를 공통 offset parent 기준의 차이로 계산한다. 한 주 너비가 작은 화면을 넘지 않도록 최소340px 제한을 없앴고, 날짜 선택 때 양쪽으로 덧보정하던 중복 코드를 제거했다. 좌우 넘김·키보드 이동·주 변경 후 중앙 정렬은 유지한다.
3. 최근 음식은 최근 탭에만 둔다. 반복 제목 ‘최근·자주 먹은 음식’을 없애고 세 음식 선택 목록의 긴 제목은 한 줄 말줄임으로 표시한다. 접근성 이름과 title에는 전체 이름을 보존한다.
4. ‘확인된 정보 기준’, ‘일부 정보 없음 N건’, ‘확인된 탄단지 기준’을 화면에서 숨긴다. 부분 상태·null·실제값과 화면 읽기용 정보는 유지하며 누락을0으로 바꾸지 않는다. 기존 영양 계산 기준 정보 버튼은 유지한다.
5. 계획한 요리 상세 제목은 날짜·끼니로 바꾸고 상태는 헤더 아래 본문 상단에 둔다. 예상 영양은 하늘색 카드·큰 열량·파스텔 탄단지 막대·3열 수치로 표시한다. 인분과 고정된 영양자료의 일치 조건은 유지한다.
6. 레시피 선택·수량 모달의 단계 제목은 시각적으로 숨기고 뒤로가기 옆에 날짜·끼니를 배치한다. 접근성 제목·5가지 진입·뒤로가기 입력 보존은 유지한다.
7. 요리 완료 직후 나타나는 성공 팝업과 관련 state/timer를 제거한다. 팬트리 차감·동일 요청 재시도·실패 안내와 종 모양 알림함의 영구 활동 기록은 유지한다.
8. 모바일 레시피북은 이미지 아래 장식/여백과 날짜-개수 간격을 줄인다. 책등을 한 줄로 만들고 사진 영역을 넓힌다. 고정 높이 대신 최소 높이로 긴 이름/이름 변경 입력의 공간을 보존한다.
9. 데스크톱 환경설정의 중복 소개 문장을 본문·로딩·마이페이지 설명에서 제거한다.

## ‘일부 정보 없음 N건’의 의미

`incomplete_count`는 저장된 음식 기록 중 `nutrition.calculation_status != 'complete'`인 건수다. 일부 재료의 영양자료·양·단위 환산이 없거나 나트륨 등 일부 영양정보가 없을 수 있다. 표시된 숫자는 확인된 부분 합계일 수 있다. 추정값이라는 이유만으로 무조건 partial은 아니다. 화면만으로 어느 재료/영양소가 누락됐는지 단정하지 않는다.

## 파일

- 날짜/로딩: `components/planner/{planner-week-navigation,use-week-swipe-pager,planner-week-screen,meal-log-screen}.tsx` (hook는 .ts)
- 음식 선택/표시: `components/planner/{meal-log-add-sheet,meal-log-nutrition-chart,meal-log-day-nutrition-detail}.tsx`
- 계획 상세/선택: `components/planner/{meal-screen,planned-meal-card,meal-add-picker-flow}.tsx`, `components/shared/{app-overlay,modal-header}.tsx`
- 완료 팝업: `components/cooking/snapshot-v2-cook-mode-screen.tsx`
- 책/설정: `app/globals.css`, `components/settings/settings-screen.tsx`, `components/mypage/mypage-screen.tsx`
- 관련 단위 검사와 `tests/e2e/{planner-a-selected-day,planned-meal-detail-redesign,ui-polish-feedback-20261008}.spec.ts`

## 검증

- 관련 단위 검사293개 통과: 식사기록109, 계획상세/모달82, 완료/설정/책58, 날짜/부모44.
- 브라우저19개 통과: 모바일375/데스크톱1280 흐름 및320px 양끝 날짜 정렬. 선택 날짜 전환 중 이름 유지/이전 음식 미노출, 최근 탭 분리, 한 줄 말줄임, 책 커버 크기/가로 넘침, 새 상세/모달을 확인했다.
- 타입 검사 통과. 변경파일 ESLint 오류0, 기존 mypage callback dependency 경고1.
- 마이페이지 전체 검사에서 프로필 로딩 버튼·기본 이미지 기대 불일치2건이 실패했다. 이번 범위인 책 관련18개는 통과했고 무관한 두 검사는 수정하지 않았다. 전체 suite 통과를 주장하지 않는다.
- 화면: `.omx/evidence/ui-polish-20261008/`. 일부 로컬 계획에는 고정 영양자료가 없어 ‘정보 준비 중’으로 표시된다. 유효/부분 영양값과 인분 불일치 보호는 단위 검사로 확인했다.
- 실제 iPhone 키보드/주소창 검증은 별개다. 운영 데이터/백업/SQL 변경 없음.

## 실제 배포

- 통합 앱 소스: `b62d320e017dea4cded0b86a3f71f7994ae04ee5`.
- 웹: `899954434a51` → `974f52a426cf6877fff915fc3a020ec4be9dd625`.
- 빌드: `prelaunch-974f52a426cf-dm55EM`.
- 실행 경로: `/Users/cwj/.homecook/prelaunch-web/releases/974f52a426cf-dm55EM/checkout`.
- 배포 검토 manifest: `5454262f982dda4b053b93b7c13c7844ef747e1f377cd3e55045b7adb5c33f1b`.
- 보호 CSS 변경은 모바일 책 선택자에 한정했다. 기존204개 DB 원장과14개 권한 함수, R2 증거/마케팅 상태를 읽기만 해서 대조했다. 새SQL·DB변경·전체백업/복원 반복 없음.
- production 컴파일·타입·정적페이지90개 생성, 별도 포트와 실행 웹의 build/정적파일 확인을 완료했다. 배포폴더의 기존 react-hooks 플러그인 해석 경고는 남아 있어 내장ESLint까지 통과했다고 주장하지 않는다.
- 비공개 로그: `/Users/cwj/.homecook/prelaunch-web/deploy-1791467124647.log`. 검토 자료: `/Users/cwj/.homecook/operations/ui-polish-20261008/`.
