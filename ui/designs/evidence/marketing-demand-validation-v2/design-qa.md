# MARKETING_DEMAND_VALIDATION_V2 최종 디자인 정렬 QA

> 이 문서는 저장소 소유 `source-0aaa282/` 최종 기준을 Next.js 운영 `/beta`로 옮긴 구현 QA다. 독립 Stage 5·최종 디자인 authority·Stage 6 승인을 대신하지 않는다.

## 비교 대상

- source visual truth: `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/` (provenance `0aaa282552256ac9e77a5c134bb45a52e42ade33`)
- source screenshots: `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/docs/design-baseline/3cf3336/`
- implementation: `components/marketing/marketing-demand-validation-screen.tsx`
- implementation screenshots: `ui/designs/evidence/marketing-demand-validation-v2/`
- viewport: source·implementation CSS `390×844`, screenshot `390×844`, DPR 1
- responsive checks: `320×568`, `393×852`, `1280×900`
- state: A/B/C/D/default Hero, q1~q4, 결과 4종, 체험 전환 상태, 두 planner, 완제품, beta form, done

## Full-view comparison evidence

동일한 `390×844` 원본과 구현을 한 이미지 안에 나란히 배치했다.

- `comparisons/final-0aaa282/hero-source-vs-port.png`
- `comparisons/final-0aaa282/result-source-vs-port.png`
- `comparisons/final-0aaa282/demo1-source-vs-port.png`
- `comparisons/final-0aaa282/demo2-source-vs-port.png`
- `comparisons/final-0aaa282/demo3-source-vs-port.png`
- `comparisons/final-0aaa282/demo4-source-vs-port.png`
- `comparisons/final-0aaa282/demo5-source-vs-port.png`
- `comparisons/final-0aaa282/planner-source-vs-port.png`
- `comparisons/final-0aaa282/product-source-vs-port.png`
- `comparisons/final-0aaa282/complete-source-vs-port.png`
- `comparisons/final-0aaa282/beta-source-vs-port.png`
- `comparisons/final-0aaa282/success-source-vs-port.png`

## 필수 품질 표면

- Fonts and typography: 원본의 Pretendard 계열 fallback, 제목·수치·버튼 굵기, 줄바꿈과 행간을 동일하게 포팅했다. 운영 접근성 때문에 Hero 신뢰 문구만 `#78828c`에서 WCAG AA를 통과하는 `#66717c`로 미세 조정했다.
- Spacing and layout rhythm: `390×844`의 24px 좌우 여백, 34px 하단 safe area, 고정 CTA, 카드 반경·구분선·세로 리듬이 원본과 일치한다. 집밥 유형 결과만 내부 스크롤을 허용하며, 다른 화면은 viewport에 고정한다. 짧은 Hero는 선택적으로 압축하고 planner의 내일 card는 하단에서 잘라 CTA 배경으로만 노출한다.
- Colors and tokens: `#00a1ff` 브랜드 블루, coral·cyan·violet 강조, 중립 본문·구분선·오류 색을 보존했다.
- Image quality and assets: 음식·캐릭터·제품·영양 아이콘은 source raster를 그대로 사용한다. `jeyuk-recipe-clean.png`, 최신 YouTube 썸네일, D Hero, violet circle doodle을 동기화했다. 체험 1에는 원본 영상 페이지가 제공한 `이 남자의 cook` 채널 프로필(`lee-man-cook-channel-avatar.jpg`)을 사용한다. 임의 placeholder나 CSS 대체 이미지는 없다.
- Copy and content: 확정 A/B/C 문구, 호환용 D, 4문항, 결과별 재치 문구, 최신 YouTube 출처·재료, 체험 수치, planner 영양값, beta 문구가 source와 일치한다.
- States and interactions: 체험 1·2·3은 의미 있는 상태 변경 뒤 `다음`을 직접 눌러 진행한다. 520g·1,180g rolling, meal/product insertion, 4개 영양 수치 count-up, 결과·완료 celebration, email validation·Turnstile fail-closed를 유지한다.
- Accessibility: semantic heading/progress/button/label, 44px target, visible focus, reduced motion 완료 상태, canonical share URL과 retry 상태를 유지한다.

## 비교 반복 기록

### Iteration 1 — blocked

- P2: 기존 운영 포트는 이전 Hero 문구·합성 Hero 이미지·자동 진행·구형 재료 목록·축약 planner·가로형 beta 카드였다.
- Fix: source app-owned JSX 구조, 화면별 상태와 최신 자산을 Next.js component로 옮기고 기존 API/session/Turnstile controller를 유지했다.

### Iteration 2 — blocked

- P2: reduced-motion 캡처가 animation delay 첫 프레임을 잡아 결과 캐릭터·설명이 비었다.
- P2: `320×568`에서 source의 no-scroll 고정값을 그대로 쓰면 CTA에 도달할 수 없었다.
- Fix: reduced motion은 즉시 최종 상태로 보이고, 높이 700px 이하에서는 자연스러운 세로 스크롤과 일반 흐름 CTA를 사용한다.

### Iteration 3 — passed

- P2: 12px Hero 신뢰 문구 `#78828c`는 3.91:1로 axe serious contrast finding을 만들었다.
- Fix: source 인상은 유지하면서 `#66717c`로 조정해 WCAG AA 대비를 확보했다.
- Evidence timing: nutrition 520ms count-up과 planner 약 570ms 진행 시점을 source 캡처와 맞춰 비교했다.
- Post-fix visual comparison: `comparisons/final-0aaa282/` 12장.
- P0/P1/P2 remaining: 없음.

### Iteration 4 — mobile no-scroll feedback, passed

- P2: 높이 700px 이하에서 일반 화면과 두 planner가 문서 스크롤로 전환되어 사용자가 요청한 한 화면 경험과 달랐다.
- Fix: 집밥 유형 결과만 `overflow-y: auto`를 유지하고 나머지 화면·문서는 `overflow: hidden`으로 고정했다. 높이 600px 이하는 Hero의 여백·타이포·proof를 압축한다.
- Planner fix: 내일 card를 오늘 card 다음의 일반 흐름에 두고 두 상태 모두 약 7px 간격을 유지한다. 단백질 음료로 오늘 card가 커지면 내일 card도 같은 간격으로 아래로 밀리며, viewport-fixed CTA는 내일 card 위에 겹친다.
- Evidence: `no-scroll-hero-390x700.png`, `no-scroll-planner-homecook-390x700.png`, `no-scroll-planner-complete-390x700.png`.
- Browser contract: result는 실제 `scrollHeight > clientHeight`와 `overflow-y: auto`, 나머지는 document scroll 0, planner preview clipped/CTA overlap을 자동 검증한다.
- P0/P1/P2 remaining: 없음.

### Iteration 5 — 체험 1 완료 제목, passed

- 완료 전·로딩 중 제목은 `유튜브 레시피를 가져올게요.`를 유지한다.
- 가져오기가 끝나면 상단 제목도 `체크 · 레시피를 가져왔어요. · 반짝임`으로 전환되고 하단 CTA가 `다음`으로 바뀐다. 제목·체크·반짝임은 서로 다른 pop/twinkle motion으로 등장하며 reduced motion에서는 즉시 최종 상태다.
- Evidence: `experience-1-done-390x844.png`.

### Iteration 6 — completed-title card and title-weight alignment (후속 피드백으로 대체됨)

- Wrapped the Demo 1 completed title in the same pale-blue border, radius, white surface, and subtle shadow language as the confirmation card below it.
- Standardized primary screen-title weight through one `--mumeok-title-weight: 900` token across quiz, demo, planner, beta invitation, and success headings.
- Kept the completed title on one line at 390px by tightening icon spacing and using responsive title sizing without weakening its hierarchy.
- Evidence: `experience-1-done-390x844.png`, plus the refreshed quiz/demo/planner/beta/success captures in this directory.
- P0/P1/P2 remaining: 없음.

### Iteration 7 — 최종 모바일 피드백 기준, passed

- 체험 1: 전·후 제목을 모두 한 줄로 유지한다. 완료 제목의 테두리와 중복 안내를 제거하고 `레시피`만 파란색, 나머지는 중립색으로 표시한다. 실제 채널 프로필·굵은 영상 제목·채널 메타를 썸네일 아래에 배치한다.
- 체험 2: `오늘은 돼지고기를 조금 덜 넣었어요.`가 조정 이유를 먼저 설명한다. CTA는 `돼지고기 600g → 520g`, 완료 문구는 `돼지고기 양을 520g으로 수정했어요`다. 숫자 변화 중 테두리는 독립 레이어로 숫자 중심에 나타났다 사라지고, 정렬은 다른 재료 무게와 동일하다.
- 체험 3: `1,200g`의 예상값 설명은 저울 확인 후 같은 자리에서 `증발한 수분 무게를 뺀 정확한 무게를 입력했어요`로 교체된다. 별도 완료 카드는 사용하지 않는다.
- 체험 5: `제육볶음 320g`과 `487 kcal`를 `계산 완료!` 아래 같은 기준선에 놓고 제목과 16px 간격을 둔다.
- 공통 CTA: 화면 수준의 `font: inherit`보다 우선하는 공통 규칙으로 모든 파란 버튼을 18–20px/weight 1000으로 통일한다. 숫자·문자 화살표·아이콘 화살표에는 미세한 optical stroke를 적용해 한글과 같은 시각 굵기를 만든다.
- Planner: 칼로리 요약 칸을 1.18fr로 넓히고 나머지 macro 칸은 0.94fr로 조정한다. 음식은 화면 전환 200ms 후 등장하고 영양정보는 기존 순서를 유지한 채 각각 1,250ms/1,400ms에 시작한다.
- Mobile viewport: 앱 콘텐츠와 CTA는 100dvh 안에서 움직이지 않으며 결과 화면만 내부 스크롤한다. 바깥 문서는 실제 스크롤 범위를 만들지 않되 모바일 pull-to-refresh는 허용한다.
- Evidence: 이 디렉터리의 갱신된 `390×844`, `320×568`, `390×700`, `393×852`, `1280×900` 캡처와 `tests/e2e/qa-visual.spec.ts-snapshots/qa-marketing-beta-*-darwin.png`.
- Visual regression: 새 CTA 굵기 차이만 의도된 변경임을 expected/actual/diff로 확인한 뒤 mobile Chrome·mobile iOS baseline을 갱신했다.
- P0/P1/P2 remaining: 없음.

## 의도적으로 다른 부분

- source의 검은 iPhone home indicator는 prototype runtime chrome이므로 운영 웹에 중복 표시하지 않는다. 동일한 34px safe-area 여백만 유지한다.
- source 기준 캡처는 9/4, 이번 운영 캡처는 실제 한국 날짜 9/5를 표시한다. 날짜 차이는 기능 요구에 따른 정상 결과다.
- `320×568` Hero는 주요 내용을 화면 안에 유지하도록 선택적으로 압축한다. 결과 외 화면에서 문서 스크롤을 복원하지 않는다.

## 브라우저 검증

- Codex 인앱 브라우저에서 로컬 mock API를 사용해 Hero → q1~q4 → 결과 → 체험 1~5 → planner_homecook → packaged_food → planner_complete → beta_form → done 전체 흐름을 직접 완료했다.
- 검증 중 실제 DB·이메일 저장·외부 네트워크 전송은 수행하지 않았다.
- 브라우저 console warning/error: 0건.
- deterministic evidence: 390×844 전체 상태, 320×568·390×700·393×852·1280×900 responsive 캡처.
- Visual Verdict: `99 / 100`, `pass`.

final result: passed
