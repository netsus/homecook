# 데스크톱 공통 가로 로고·준비 배너 Design QA

## 비교 대상

- source visual truth
  - `/var/folders/c1/gv7thy6n54d76f_rvnxdwlzm0000gn/T/codex-clipboard-961bfce4-3953-4436-9993-8fb64508cb25.png`
  - `/var/folders/c1/gv7thy6n54d76f_rvnxdwlzm0000gn/T/codex-clipboard-0e369079-f5ec-419e-af1e-45431c6c1082.png`
  - canonical asset: `ui/designs/brand/mumeok/exports/logo/mumeok-logo-horizontal-light.png`
- implementation screenshot
  - Codex in-app Browser의 `http://localhost:3000/` 1280px header capture
  - 같은 capture를 JPEG data hash로 포함한 session-local
    `http://127.0.0.1:3001/comparison.html#<implementation-jpeg>`
- viewport: CSS `1280 x 900`, browser capture density 약 `1.3`; focused header는 CSS `700 x 112`로 잘라 비교
- state: 비로그인 출시 전 준비 모드, HOME 탭 선택

## Full-view comparison evidence

- in-app Browser에서 HOME, PLANNER plan/log, PANTRY gate, MYPAGE gate, ABOUT를 직접 열었다.
- 모든 데스크톱 공통 header가 `/brand/mumeok-logo-horizontal.png`를 사용했다.
- HOME/ABOUT/PANTRY/MYPAGE의 navigation 높이는 72px, 준비 배너 top은 72px다.
- flow header인 PLANNER의 전체 높이는 배너를 포함해 104px이며, 내부 navigation 72px와
  배너 top 72px는 다른 탭과 같다.
- 모든 확인 화면의 가로 overflow는 0이다. PANTRY/MYPAGE 비로그인 gate에도 header를 보강했다.
- 모바일 CSS 390px에서는 기존 심볼+2단 이름과 root 준비 배너 1개를 유지하고 overflow는 0이다.

## Focused region comparison evidence

- 사용자 제공 header crop과 로컬 HOME header crop을 같은 comparison 화면에서 열어 확인했다.
- typography/copy: runtime에서 글자를 재조판하지 않고 공식 가로 로고 이미지 안의
  `무먹 무엇을 먹든` 글자를 그대로 사용한다.
- spacing/layout rhythm: 로고 표시 박스는 약 `174 x 67px`, 첫 탭은 로고 오른쪽에서
  정확히 40px 뒤에 시작한다. navigation은 72px, 배너는 약 33px다.
- colors/tokens: 공식 로고의 파랑·남색·흰색을 재착색하지 않았다. 기존 선택 탭과 준비 배너 색은 유지했다.
- image quality/assets: canonical 1600x480 PNG에서 빈 캔버스만 잘라 1040x400 PNG로 만들었다.
  글자, 색상, 비율, 모서리와 픽셀은 다시 그리지 않았다.
- copy/content: 탭 이름과 준비 안내 문구는 바꾸지 않았다. 로고 link는 이미지의 글자를
  중복 낭독하지 않고 `무먹, 무엇을 먹든` 접근성 이름 하나를 제공한다.

## Comparison history

1. P1 — 최초 CSS hot reload가 이전 64px header 규칙을 유지해 로고가 크게 넘쳤다.
   - fix: 로컬 dev server를 재시작해 현재 CSS bundle을 다시 생성했다.
   - post-fix: logo `174 x 67`, nav `72`, overflow `0` 실측.
2. P1 — PANTRY/MYPAGE 비로그인 gate가 공통 header를 렌더하지 않아 탭 이동 시 로고와 배너가 사라졌다.
   - fix: 데스크톱 unauthorized branch를 WebShell/WebTopNav 안에 배치했다. 모바일 gate는 유지했다.
   - post-fix: 두 route 모두 공식 horizontal logo, visible notice 1, notice top 72, overflow 0 확인.

## Findings

- 남은 P0/P1/P2: 없음.
- P3: 사용자 제공 두 번째 crop은 header 전체 viewport가 아니어서 로고의 절대 화면 크기를
  1:1 수치로 비교할 수 없다. 공식 원본 비율과 현재 navigation 밀도를 기준으로 174px 너비를 사용했다.

## Runtime checks

- primary interactions: HOME/요리 계획/식사 기록/팬트리/마이/가이드 route 이동과 현재 탭 표시
- accessibility: 공통 link name 1개, 장식 이미지 `alt=""`, 모바일/데스크톱 overflow 0
- browser console: 이번 header route 확인에서 사용자 흐름을 막는 화면 오류 없음
- deterministic checks: 관련 Vitest 113개 및 기존 header/홈/플래너 묶음 통과, ESLint/typecheck 통과

## 2026-09-07 모바일 후속 비교

- source visual truth: 같은 공식 가로형 canonical asset과 사용자 요청.
- implementation: in-app Browser `http://localhost:3000/`, `/planner`, `/planner?segment=log`.
- viewport: CSS `390 x 844`, density는 in-app Browser 기본값.
- mobile logo: `138 x 53px`, 공식 가로형 runtime asset, overflow 0.
- HOME guide card: 내부 제목 text 0, `og-share.png`가 `226 x 144px` 카드 전체를 `object-cover`로 채움.
- planner/log point: 현재 하단 탭과 선택 날짜의 computed color/background가 exact
  `rgb(0, 161, 255)`이며 날짜 글자는 `rgb(16, 37, 54)`다.
- desktop planner current tab: 밝은 blue wash, 진한 blue text, inset `#00A1FF` 표시선으로
  바뀌어 이전 navy 면을 제거했다. overflow 0.
- 후속 deterministic verification: 관련 Vitest 214개, ESLint, typecheck, production build 통과.
- 남은 actionable P0/P1/P2: 없음.

## 2026-09-07 데스크톱 auth gate 배경 후속 비교

- source: 사용자 제공 1920x1050 PANTRY unauthorized screenshot.
- implementation: in-app Browser `http://localhost:3000/pantry`, `http://localhost:3000/mypage`.
- viewport: CSS `1280 x 900`.
- PANTRY/MYPAGE 모두 banner bottom 약 105px, full-width gate top 약 104px로 1px border에서 맞닿는다.
- gate width 1280px, horizontal overflow 0. page background는 `#eef8ff → #f7fbfe → white`의
  연속 gradient이고 가운데 ContentState의 중복 background는 transparent다.
- mobile CSS 390px는 desktop gate class를 사용하지 않고 기존 하단 탭과 gate를 유지한다.
- 남은 actionable P0/P1/P2: 없음.

## 2026-09-07 플래너 선택 text·영양 숫자·desktop tab 후속 비교

- mobile MEAL_LOG CSS 390x844: selected date/today text `rgb(255,255,255)`, overflow 0.
- daily calorie/macro와 food calorie/macro 숫자는 모두 `rgb(0,161,255)`로 실측했다.
- desktop MEAL_LOG CSS 1280x900: current tab radius `9999px`, box-shadow `none`, 연한 blue fill.
- current tab의 `aria-current=page`, date radio semantics와 keyboard navigation은 유지한다.
- 관련 Vitest 79개 통과. 남은 actionable P0/P1/P2 없음.

final result: passed
