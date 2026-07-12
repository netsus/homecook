# ABOUT_SERVICE_GUIDE Design Authority

- 검수일: 2026-07-12
- 대상: `/about`
- verdict: `pass`
- visual score: `95 / 100`
- 다음 행동: 바로 진행 가능. 아래 minor는 병합 차단 사유가 아니다.

> evidence:
> - desktop default: `ui/designs/evidence/service-about-guide/ABOUT-after-1280.png`
> - mobile default: `ui/designs/evidence/service-about-guide/ABOUT-after-390.png`
> - mobile narrow: `ui/designs/evidence/service-about-guide/ABOUT-after-320.png`
> - accordion open/focus: `ui/designs/evidence/service-about-guide/ABOUT-faq-focus-320.png`
> - desktop nav before: `ui/designs/evidence/service-about-guide/WEB-NAV-before-1280.png`
> - desktop nav after/active: `ui/designs/evidence/service-about-guide/WEB-NAV-after-1280.png`

## 판정 요약

신규 화면은 승인된 낮은 밀도의 web language, 기존 파란색 브랜드 계열, 짧은 문장과 구분선 중심의 읽기 흐름을 지킨다. desktop에서는 Hero → anchor navigation → 5단계 흐름이 한눈에 구분되고, mobile에서는 같은 정보 순서를 세로 흐름으로 보존한다. 320px에서도 H1·본문·CTA·anchor가 잘리거나 화면 폭을 밀어내지 않는다.

## Scorecard

| 항목 | 점수 | 근거 |
| --- | ---: | --- |
| mobile UX | 19/20 | 390px과 320px에서 정보 순서가 같고 CTA가 full-width로 안정적으로 쌓인다. |
| interaction clarity | 19/20 | primary/secondary CTA와 anchor navigation의 무게가 구분되고 FAQ 열림 상태가 명확하다. |
| visual hierarchy | 19/20 | eyebrow, 단일 H1, 설명, CTA, section heading 순서가 자연스럽다. |
| color/material fit | 19/20 | 흰 배경, 얇은 선, 브랜드 파란색을 사용하며 장식이 내용을 누르지 않는다. |
| familiar pattern fit | 19/20 | mobile sticky app bar, back action, stacked CTA, accordion이 익숙한 패턴을 따른다. |

## Desktop

- `집밥 가이드`만 활성 상태로 보이며 5개 primary nav의 간격과 계층이 안정적이다.
- Hero 읽기 폭이 과도하게 넓지 않고 첫 viewport 안에서 핵심 가치, 두 CTA, anchor navigation, 다음 섹션 진입까지 보인다.
- 5단계 흐름은 한 줄 연결 구조로 표현되어 순서 이해가 빠르다.
- desktop page-level horizontal overflow나 고정 폭 잘림은 관찰되지 않는다.

## Mobile

- 390px에서 48px 이상 높이의 CTA 두 개가 세로로 배치되어 엄지 조작과 위계가 분명하다.
- 320px에서 H1은 자연스럽게 두 줄로 줄바꿈되고 본문과 버튼의 좌우 여백이 유지된다.
- anchor navigation은 자연스럽게 wrap되며 page 폭을 늘리지 않는다.
- 긴 페이지의 다음 섹션이 첫 viewport 하단에 보여 아래로 이어지는 읽기 흐름을 알 수 있다.

## Accessibility

- mobile back action과 CTA, accordion trigger는 시각상 최소 터치 영역을 충족한다.
- FAQ focus evidence에서 focus-visible outline이 배경·테두리와 분명히 구분된다.
- 열린 항목은 `-` 표시와 본문 노출을 함께 사용해 색이나 아이콘 하나에만 상태를 의존하지 않는다.
- heading과 accordion title이 320px에서도 chevron과 겹치지 않는다.

## Findings

### Blocker

- 없음.

### Major

- 없음.

### Minor

- desktop 설계 와이어프레임에는 우측 계정 action이 있으나 현재 `/about` after evidence에는 보이지 않는다. primary nav와 가이드 사용 흐름에는 영향이 없으므로 이 검수의 차단 사유는 아니지만, 공개 화면의 공통 web chrome 정책에 맞춰 후속 polish 때 노출 정책을 한 번 확인한다.
- 캡처 도구의 검은 원형 포인터가 일부 mobile/desktop evidence 하단에 남아 있다. 제품 UI 결함은 아니며 외부 공유용 이미지로 사용할 때만 깨끗한 캡처로 교체한다.

## Before-merge 권고

- 디자인 blocker 0으로 바로 진행 가능하다.
- 기능 검증에서는 FAQ의 Enter/Space 동작과 `aria-expanded`/`aria-controls`, mobile back fallback을 별도 자동화 결과로 계속 잠근다. screenshot은 의미 구조 검증을 대신하지 않는다.
