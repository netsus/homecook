# 출시 전 로컬 UI 후속 수정

- 요청: 2026-09-06, 검증 종료는 2026-09-07 자정 이후.
- 작업 브랜치: `fix/restore-planner-interactions`.
- 비교 배포 브랜치: `fix/prelaunch-planner-release-20260906`.
- master merge 및 추가 운영 배포는 수행하지 않는다.
- 로컬 확인: `http://localhost:3000`, `/beta`, `/planner`, `/planner?segment=log`.

## 원인과 수정

1. 랜딩 저울·음식 이미지 4개는 원본 합계 7,021,810B였으며 화면 진입 뒤
   Next 이미지 변환/요청이 시작됐다. WebP 파생본 156,728B로 줄이고 체험 시작 때
   미리 불러온다. 체험 3·4의 저울 숫자는 이미지 로드 후 표시한다. 원본은 보존한다.
   공개 플래너 예시도 같은 작은 음식 이미지를 재사용한다.
2. 공개 홈 레시피 요청은 실제 SDK의 쉼표 구분 정렬과 괄호로 감싼 cursor를
   익명 공개 조회 검사기가 거부해 `ACCOUNT_SESSION_STALE`로 실패했다.
   실제 직렬화 형식만 정상 인식하며 public/deleted/field/method 제한은 유지한다.
3. 공통 브랜드 제어색을 더 진하게 조정하고 현재 탭을 진한 면/흰 글씨 또는
   아이콘/표시선으로 구별한다. 오늘·추가·수정 버튼의 대비와 테두리를 보완한다.
4. 데스크톱 계획 날짜의 선택/스크롤 강조를 없애고 오늘만 유지한다.
   모바일은 선택 날짜의 진한 면과 오늘의 테두리를 구별한다.
5. 영양소 색을 황토/보라/코랄로 바꾸고 상태색 파랑/초록과 분리한다.
6. 식사기록 영양 요약은 최대 576px, 끼니 묶음은 최대 1024px로 제한한다.
   빈 끼니도 테두리를 표시하고 음식명 바로 아래 먹은 양/kcal를 배치한다.
   `aria-describedby`로 화면 읽기 기능에서도 수치를 읽도록 연결한다.

## 변경 파일

- `app/globals.css`, `components/layout/app-header.tsx`: 공통 색·탭.
- `components/marketing/marketing-demand-validation-screen.tsx`,
  `public/assets/funnel/food/*.webp`: 이미지 최적화.
- `components/planner/planner-week-board.tsx`, `planner-week-navigation.tsx`,
  `planner-date-controls.tsx`, `planner-week-screen.tsx`: 계획 날짜·버튼·영양소.
- `components/planner/meal-log-screen.tsx`, `meal-log-nutrition-chart.tsx`:
  기록 배치·영양 정보·접근성.
- `lib/planner/guest-planner-preview.ts`: 작은 예시 이미지 재사용.
- `lib/server/hybrid-auth/public-read-policy-runtime.mjs`: 공개 조회 URL 검사 수정.
- 관련 회귀 테스트 4개 파일 및 사용자 승인 계획 문서.

## 검증 근거

- 새 회귀 테스트의 실패를 먼저 확인한 뒤 수정. 집중 테스트 15개 파일 277개 통과.
- 전체 `pnpm lint`, `pnpm typecheck`, 수정 후 추가 ESLint, `git diff --check` 통과.
- `pnpm build` 통과: 코드 컴파일, 타입 검사, 정적 페이지 생성 및 최적화 완료.
- 실제 기존 로컬 Supabase를 읽는 레시피 목록: HTTP 200, 20개 반환.
  브라우저에서 음식 사진/이름, 추천 태그·테마 표시와 다음 페이지 요청 200 확인.
- 데스크톱 1280px에서 9/3을 선택해도 날짜 배경은 일반 회색이며 모든 행 하단
  테두리가 `rgb(221,221,221)`로 유지됨. 오늘만 별도 배경.
- 모바일 375px 및 320px에서 `scrollWidth === clientWidth`, 양/kcal/빈 끼니 테두리 확인.
  320px 계획에서 선택일은 진한 파랑, 오늘은 투명 배경/테두리로 구별됨.
- 랜딩 체험 3·4와 식사 예시: 이미지 실요청 HTTP 200, 완전 로드 확인.
  랜딩 흐름의 마케팅 API는 테스트 fixture이며 실제 수요검증 제출 성공을 뜻하지 않는다.
- 보조 코드 리뷰의 접근성/모바일 선택 표시 P2 두 건 수정 후 재검토에서 잔여 P1/P2 없음.

## 로컬 실행 및 한계

기존 `.env.local`은 존재하지 않는 `../homecook/.env.local`을 가리켰다.
끊어진 링크는 저장소 밖 `/Users/shj/.cache/homecook-env-backups/20260906-ui/`에
보관했고 기존 loopback 개발 stack의 설정을 권한 0600, Git 제외 `.env.local`로 구성했다.
비밀값은 로그/문서에 남기지 않는다. `pnpm dev --hostname 0.0.0.0 --port 3000`으로
실행하며 소스 수정은 자동 반영된다.

로컬 레시피는 실제 개발 DB이고 비로그인 플래너/식사기록은 명시된 공개 예시다.
실제 계정 로그인·개인 쓰기·운영 성능·운영 오류 해소는 이번 증거의 범위가 아니다.
운영 사이트에는 후속 배포 전까지 이번 수정이 반영되지 않는다.

## 2026-09-07 모바일 후속 확인

- HOME/AppHeader는 desktop과 같은 공식 가로 logo를 사용한다. 390px 실측 `138 x 53px`, overflow 0.
- HOME guide card 내부 title을 제거하고 `og-share.png`를 카드 `226 x 144px` 전체에 확대했다.
- planner/log의 현재 하단 tab, selected date, today action은 exact `#00A1FF` accent를 사용한다.
  작은 날짜 text는 `#102536`으로 대비를 유지한다.
- desktop planner current tab의 navy fill은 blue wash + `#00A1FF` underline으로 교체했다.

## 2026-09-07 데스크톱 로그인 안내 배경 확인

- PANTRY/MYPAGE unauthorized page는 banner 아래부터 전체 viewport 너비의 연속 gradient를 사용한다.
- 1280px 실측: banner bottom 105px, gate top 104px, gate width 1280px, overflow 0.
- 중앙 ContentState의 별도 gradient는 제거하고 안내 내용·action 위치는 유지했다.
- 모바일 390px은 desktop gate shell이 없고 기존 bottom tab, auth gate, overflow 0을 유지한다.

## 2026-09-07 플래너 선택 text·영양 숫자·desktop tab 확인

- mobile selected date와 today button text는 white로 변경했다.
- MEAL_LOG daily/food calorie·macro 숫자는 exact `#00A1FF`다.
- desktop current tab은 underline/shadow 없이 9999px pill background를 사용한다.
- 390x844와 1280x900에서 overflow 0과 current/date semantics를 확인했다.
