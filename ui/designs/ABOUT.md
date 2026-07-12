# ABOUT_SERVICE_GUIDE — 무먹 가이드

> 기준 문서: 화면정의서 v1.5.18 §1-a / 요구사항 기준선 v1.7.11 §1-1-a / 유저Flow맵 v1.3.18 §①-a
> 관련 계획: `.omx/plans/about-service-guide-implementation-plan-20260712.md`
> 생성일: 2026-07-12
> 상태: Stage 1 design artifact — 구현 후 screenshot authority review 필수

---

## 1. 화면 목적과 범위

`/about`은 정식 서비스명 `무엇을 먹든`(짧은명 `무먹`)을 처음 정의하는 비로그인 공개 단일 서비스 설명서다. 처음 온 사용자는 집밥의 전체 흐름을 이해하고 레시피 또는 플래너로 이동하며, 기존 사용자는 기능별 설명과 FAQ를 찾는다.

- 화면 ID: `ABOUT_SERVICE_GUIDE`
- 공개 route: `/about`
- desktop nav label: `무먹 가이드`
- page H1: `무먹, 이렇게 써요`
- hero headline: `무엇을 먹든, 계획은 한곳에서`
- API loading 없는 정적 콘텐츠 화면
- API/DB/인증 상태 전이 없음
- 커뮤니티, 제안 게시판, 404 제보 공개, 검증되지 않은 수치는 범위 밖이다.

## 2. 디자인 방향

### 2.1 언어

- 흰 배경과 기존 파란색 브랜드 토큰을 사용하는 낮은 밀도의 web language를 따른다.
- 화면 전체를 카드로 채우지 않는다. 섹션 사이 여백, 짧은 문장, 얇은 구분선으로 읽는 흐름을 만든다.
- 장식보다 사용 순서와 실제 이동 경로를 우선한다.
- 새 색상·폰트·dependency를 추가하지 않는다.

### 2.2 토큰

| 역할 | 토큰/기준 |
| --- | --- |
| page background | `--surface`, 흰색 |
| body text | `--foreground` / `--text-2` |
| muted text | `--text-3` |
| primary action | `--brand-primary` 또는 현행 `--brand` blue mapping |
| active/hover | `--brand-primary-hover` |
| soft emphasis | `--brand-primary-soft` |
| border | `--line` / `--border` |
| panel fill | `--surface-fill` |
| control radius | `--radius-control` |
| card/panel radius | `--radius-card` / `--radius-panel` |
| focus | 기존 brand focus-visible ring |

desktop web token isolation을 깨지 않는다. 전역 토큰을 재정의하지 않고 기존 web/App shell이 제공하는 역할 토큰을 소비한다.

### 2.3 브랜드 copy 잠금

| surface | canonical copy |
| --- | --- |
| 정식 서비스 최초 정의 / 법적 / SEO | `무엇을 먹든` |
| 좁은 nav / mobile AppBar / 텍스트 워드마크 | `무먹` |
| guide nav | `무먹 가이드` |
| HOME guide rail | `무먹 둘러보기` |
| hero | `무엇을 먹든, 계획은 한곳에서` |
| how-to heading | `한 끼는 이렇게 이어져요` |
| features heading | `끼니 계획이 편해지는 이유` |
| 기록/활동/성장 label | `끼니 기록 / 끼니 활동 / 끼니 성장` |
| English section label | `WHY IT WORKS` |

새 영문 브랜드는 만들지 않는다. `WHY IT WORKS`는 설명 섹션 label일 뿐 서비스명으로 쓰지 않는다. 사용자 콘텐츠와 일반명사 `집밥`, `homecook:*`/`HOMECOOK_*` 및 cookie/header/event/storage/package/repository/Supabase/OMO/stored key, 기존 prototype/evidence 경로는 변경하지 않는다. 신규 이미지 로고·마스코트는 범위 밖이다.

## 3. 정보 구조

1. desktop `WebTopNav activeId="about"` / mobile sticky app bar
2. Hero
3. anchor navigation
4. `#how-to` 5단계 흐름
5. `#features` 핵심 기능 4개
6. `#guides` 기능별 가이드 6개
7. `#faq` FAQ 8개
8. 문의/신뢰
9. final CTA
10. shared footer

Anchor ID는 `how-to`, `features`, `guides`, `faq` 네 개를 정확히 사용한다. sticky header가 anchor 제목을 가리지 않도록 `scroll-margin-top`을 둔다.

## 4. Desktop 1280px

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 무먹   홈   플래너   팬트리   마이페이지   무먹 가이드              [계정] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  무엇을 먹든, 계획은 한곳에서                                                │
│  무먹, 이렇게 써요                                                           │
│  식단을 계획하면 장보기와 요리 기록까지 자연스럽게 이어져요.                  │
│  [레시피 둘러보기]  [사용법부터 보기]                                        │
│                                                                              │
│  사용 순서  핵심 기능  기능별 가이드  자주 묻는 질문                         │
│                                                                              │
├─ #how-to ────────────────────────────────────────────────────────────────────┤
│  01 찾기 → 02 계획하기 → 03 장보기 → 04 요리하기 → 05 남은요리 활용          │
├─ #features ──────────────────────────────────────────────────────────────────┤
│  여러 끼니 재료 합산     팬트리 자동 제외     사용자 정의 끼니     레시피북   │
├─ #guides ────────────────────────────────────────────────────────────────────┤
│  기능별 가이드 accordion                                                     │
├─ #faq ───────────────────────────────────────────────────────────────────────┤
│  자주 묻는 질문 accordion                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  문의/신뢰                         [레시피 둘러보기] [플래너 시작하기]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- content max-width: 기존 web container 안에서 약 `1080–1120px`.
- hero text max-width: 약 `680px`; 큰 illustration이나 사진을 필수로 두지 않는다.
- section vertical gap: `64–80px`; 섹션 내부 gap은 `24–32px`.
- H1은 한 개만 둔다. 섹션 제목은 H2, 카드 제목은 H3 순서를 지킨다.
- 5단계는 넓은 화면에서 5열 또는 연결된 단일 flow row로 표시한다.
- features는 4열, 텍스트 중심의 낮은 높이 panel로 표시한다.
- guide/FAQ accordion은 최대 읽기 폭을 제한해 한 줄이 지나치게 길어지지 않게 한다.
- global top nav는 `PRIMARY_WEB_NAV_ITEMS`를 사용하며 `/about`에서 `aria-current="page"`가 `무먹 가이드`에만 붙는다.

## 5. Mobile 390px

```text
┌──────────────────────────────────────┐
│ [←] 무먹 가이드                     │  sticky, 44px 이상 action
├──────────────────────────────────────┤
│ 무엇을 먹든, 계획은 한곳에서         │
│ 무먹, 이렇게 써요                    │
│ 짧은 설명                            │
│ [레시피 둘러보기]                    │
│ [사용법부터 보기]                    │
│                                      │
│ 사용 순서 · 핵심 기능                │  localized anchor row/wrap
│ 기능별 가이드 · 자주 묻는 질문       │
│                                      │
│ 한 끼는 이렇게 이어져요              │  #how-to
│ 01 찾기                              │
│ 02 계획하기                          │
│ 03 장보기                            │
│ 04 요리하기                          │
│ 05 남은요리 활용                     │
│                                      │
│ 끼니 계획이 편해지는 이유            │  #features
│ [기능 요약 2열 또는 1열]             │
│                                      │
│ 기능별 가이드                        │  #guides
│ [처음 시작하기                 ⌄]    │
│ [플래너에 식사 추가            ⌄]    │
│ ...                                  │
│                                      │
│ 자주 묻는 질문                       │  #faq
│ [이미있음은 무엇인가요?        ⌄]    │
│ ...                                  │
│                                      │
│ [레시피 둘러보기]                    │
│ [플래너 시작하기]                    │
└──────────────────────────────────────┘
```

- horizontal padding: `16px`; section gap `48–64px`.
- hero CTA는 세로로 쌓고 각 높이 `48px` 이상, 두 버튼의 위계는 primary/secondary로 구분한다.
- mobile bottom tab을 렌더링하지 않는다.
- back action은 history가 없거나 안전하게 복귀할 수 없을 때 `/`를 fallback으로 사용한다.
- 5단계는 세로 순서로 읽히게 하며 숫자와 짧은 설명을 한 덩어리로 묶는다.
- anchor navigation은 390px에서 한 줄 가로 rail 또는 자연스러운 wrap을 허용하지만 page-level overflow를 만들지 않는다.
- 기능 가이드와 FAQ는 모두 실제 `button` accordion을 사용한다.

## 6. Mobile 320px sentinel

- 390px과 같은 정보 순서와 행동을 유지한다. 항목을 숨기거나 문구를 의미 없이 축약하지 않는다.
- page width를 늘리는 고정 폭 요소를 금지한다: `min-width: 0`, text wrap, localized overflow만 허용.
- hero headline/H1은 자연스러운 2–3줄 줄바꿈을 허용하고 글자가 잘리지 않아야 한다.
- CTA, back action, accordion trigger의 터치 영역은 최소 `44×44px`이다.
- features가 2열에서 각 항목을 읽기 어렵게 만들면 1열로 전환한다.
- accordion title과 chevron이 겹치지 않도록 trigger는 `min-width: 0`, title은 wrap, icon은 shrink 금지로 구성한다.
- viewport 기준 `document.documentElement.scrollWidth === clientWidth`를 만족해야 한다.

## 7. 구성요소 규칙

### 7.1 Hero와 CTA

- eyebrow/headline/H1을 중복해서 모두 크게 만들지 않는다. `무엇을 먹든, 계획은 한곳에서`를 핵심 가치 문장으로, `무먹, 이렇게 써요`를 유일한 H1으로 사용한다.
- `레시피 둘러보기`는 `/`로 이동하는 primary CTA다.
- `사용법부터 보기`는 `#how-to` anchor로 이동하는 secondary CTA다.
- 마지막 CTA의 `플래너 시작하기`는 `/planner`로 이동하며 기존 인증 흐름을 그대로 사용한다.

### 7.2 5단계 흐름

| 순서 | 제목 | 설명 초점 |
| --- | --- | --- |
| 1 | 찾기 | 제목·태그·재료로 레시피 탐색 |
| 2 | 계획하기 | 원하는 날짜와 끼니에 식사 추가 |
| 3 | 장보기 | 여러 끼니 재료를 한 목록으로 준비 |
| 4 | 요리하기 | 재료와 전체 조리순서를 요리모드에서 확인 |
| 5 | 남은요리 활용 | 남은 요리를 기록하고 다시 식사로 활용 |

각 단계는 현재 제품이 보장하는 사실만 말한다. 자동 절약률, 사용자 수, 추천 정확도 같은 검증되지 않은 표현은 쓰지 않는다.

### 7.3 기능별 가이드

6개 제목을 고정한다.

1. 처음 시작하기
2. 플래너에 식사 추가
3. 장보기와 팬트리
4. 요리모드
5. 남은요리
6. 저장/좋아요/레시피북

각 항목은 짧은 요약, 2–4개 단계, 필요한 경우 실제 route 링크를 포함한다. 조건부 기능과 아직 배포되지 않은 기능은 핵심 가이드에 넣지 않는다.

### 7.4 FAQ

8개 주제를 고정한다.

1. `이미있음`의 의미
2. 장보기 완료 시 팬트리 반영
3. 완료된 장보기 목록의 read-only 정책
4. 장보기 기록 위치
5. 플래너 요리와 바로 요리의 차이
6. 끼니 이름·순서 설정
7. 비로그인으로 사용할 수 있는 범위
8. 문의와 계정 데이터 원칙

답변은 기존 도메인 정책과 route를 그대로 설명한다. 문의 이메일은 `getLegalInfo()` 결과가 있을 때만 링크로 노출한다.

## 8. Accordion 접근성 계약

각 trigger는 실제 `button[type="button"]`이다.

```text
button
  id="guide-trigger-{id}"
  aria-expanded="true|false"
  aria-controls="guide-panel-{id}"

region/div
  id="guide-panel-{id}"
  aria-labelledby="guide-trigger-{id}"
  hidden when collapsed
```

- Enter/Space 기본 button 동작으로 열고 닫는다.
- 열림 상태는 chevron 방향뿐 아니라 `aria-expanded`으로 전달한다.
- focus-visible ring을 제거하지 않는다.
- 접힌 panel 내부 요소는 tab 순서에 남지 않는다.
- anchor 이동 후 해당 섹션 heading이 sticky app bar 뒤에 가리지 않는다.
- `prefers-reduced-motion`에서는 accordion/anchor motion을 즉시 또는 최소화한다.

## 9. 상태와 예외

| 상태 | 표현 |
| --- | --- |
| loading | page-level loading 없음. 정적 콘텐츠 즉시 표시 |
| empty | 고정 콘텐츠는 empty 없음. 이메일 미설정만 안전한 대체 문구 |
| error | API error에 의존하지 않음 |
| unauthorized | 가이드 진입 자체는 로그인 게이트 없음 |
| read-only | accordion open/close 외 데이터 변경 action 없음 |
| contact unavailable | 가짜 `mailto:` 금지, 운영 문의처 준비 중 안내 |

## 10. 반응형·검증 잠금

| viewport | 필수 evidence |
| --- | --- |
| 1280px | initial, global nav active, 주요 section hierarchy |
| 390px | initial + section scroll + accordion open |
| 320px | initial + full-width CTA + FAQ keyboard focus |

구현 후 `ui/designs/evidence/service-about-guide/`에 after screenshot을 남기고 신규 화면 authority review를 받는다. 확인 항목은 page overflow 0, anchor 도달, CTA route, accordion keyboard/ARIA, 색상 대비, 첫 화면 위계다.
