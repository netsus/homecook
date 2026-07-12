# ABOUT_SERVICE_GUIDE 설계 리뷰

> 검토 대상: `ui/designs/ABOUT.md`
> 기준 문서: 화면정의서 v1.5.18 §1-a / 요구사항 기준선 v1.7.11 §1-1-a / 유저Flow맵 v1.3.18 §①-a
> 검토일: 2026-07-12
> 검토 단계: Stage 1 pre-implementation

## 종합 평가

**등급: 조건부 통과**

공식 정보 구조, 공개 접근, CTA, anchor, 실제 button accordion, 320/390/1280 반응형 기준을 구현 가능한 수준으로 잠갔다. 신규 화면이므로 구현 screenshot이 없는 현재 단계에서는 final authority pass를 줄 수 없으며, Stage 4 evidence review가 조건이다.

## Blocker

없음.

## 공식 계약 정합성

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 공개 `/about` | 통과 | 비로그인, API loading 없는 정적 콘텐츠 명시 |
| H1/hero copy | 통과 | `집밥, 이렇게 써요` H1 1개, 공식 hero 문구 고정 |
| anchor | 통과 | `#how-to`, `#features`, `#guides`, `#faq` 고정 |
| 5단계 | 통과 | 찾기→계획하기→장보기→요리하기→남은요리 활용 순서 |
| 가이드/FAQ 수 | 통과 | 6개 가이드와 8개 FAQ topic 고정 |
| CTA route | 통과 | `/`, `#how-to`, `/planner`와 기존 인증 흐름 유지 |
| 문의 정보 | 통과 | `getLegalInfo()` 단일 소스, 가짜 `mailto:` 금지 |
| 제외 범위 | 통과 | 커뮤니티/제안/404 공개/검증되지 않은 수치 제외 |

## UX·접근성 검토

- desktop은 web 공통 내비게이션과 저밀도 긴 문서 패턴을 사용해 제품 화면과 구분된다.
- mobile은 secondary screen으로 처리하고 bottom tab을 추가하지 않아 앱 4탭 mental model을 보존한다.
- 320px에서 고정 폭 금지, CTA/accordion/back action 44px, page overflow 0을 명시했다.
- accordion을 실제 button, `aria-expanded`, `aria-controls`, 연결 panel, keyboard/focus-visible로 잠갔다.
- anchor가 sticky app bar 아래에 가려지지 않도록 scroll margin 계약이 있다.
- 기능별 guide와 FAQ가 모두 accordion이므로 초기 문서 길이를 제어할 수 있다.

## Stage 4 authority risk

| 우선순위 | 위험 | 확인 방법 |
| --- | --- | --- |
| major | hero/H1/CTA가 모두 강해 위계가 경쟁할 수 있음 | 1280/390 initial screenshot에서 primary action 1개가 즉시 읽히는지 확인 |
| major | 긴 anchor/accordion 제목이 320px에서 chevron과 충돌할 수 있음 | 320px open/focus capture와 overflow 측정 |
| major | 많은 section을 카드로 감싸 저밀도 방향이 사라질 수 있음 | 1280 scroll capture에서 흰 배경·여백·얇은 divider 비중 확인 |
| major | anchor 이동 후 heading이 sticky app bar 뒤에 숨을 수 있음 | `#how-to`, `#faq` direct URL 및 click 확인 |
| minor | contact unavailable 문구가 비활성 CTA처럼 오해될 수 있음 | 이메일 있음/없음 두 상태 unit/visual 확인 |
| minor | accordion animation이 reduced-motion을 무시할 수 있음 | OS 설정 또는 CSS audit |

## Evidence gate

구현 후 아래 evidence가 있어야 authority review를 시작할 수 있다.

- `ABOUT-after-1280.png`
- `ABOUT-after-390.png`
- `ABOUT-after-320.png`
- `ABOUT-faq-focus-320.png`

검증 항목은 page overflow 0, desktop active nav, mobile back fallback, anchor 도달, CTA route, accordion Enter/Space와 ARIA 갱신, focus visibility다.

## 판정

- Stage 4 구현 진입: 가능
- Stage 1 blocker: 0
- final authority: 구현 screenshot 전까지 보류
- 재검토 시점: 1280/390/320 after evidence 생성 직후

