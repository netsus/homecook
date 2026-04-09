# Product Design Authority SOP

> 대상: Claude
> 관련 에이전트: `.claude/agents/product-design-authority.md`

---

## 목적

`product-design-authority`는 "문서상 맞는 화면"을 넘어서
"실제 모바일 앱처럼 자연스럽고 익숙한 UX인가"를 판정하는 디자인 권한자다.

기존 `design-generator`와 `design-critic`이 텍스트 기반 설계 문서의 정합성을 다뤘다면,
이 SOP는 **스크린샷/Figma evidence 기반**으로 모바일 UX, 정보 구조, 스크롤 경계,
시각 위계, 익숙한 앱 패턴 적합성을 점검한다.

핵심 원칙:

- 텍스트 와이어프레임만으로 authority pass를 줄 수 없다.
- 신규 화면, high-risk UI change, anchor screen 확장은 screenshot 또는 Figma frame evidence가 필요하다.
- unresolved authority blocker가 남아 있으면 `Design Status: confirmed`를 줄 수 없다.

---

## 언제 실행하나

| 조건 | 실행 여부 |
|------|----------|
| 신규 화면 | 필수 |
| high-risk UI change | 필수 |
| anchor screen (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`) 확장 | 필수 |
| 기존 confirmed 화면의 low-risk copy/token tweak | 선택 |
| BE-only 슬라이스 | 불필요 |

추가로 아래 중 하나면 실행을 강하게 권장한다.

- 팀장님이 모바일 친화성, 색감, 익숙한 앱 패턴에 불만을 표시한 경우
- design-critic은 통과했지만 실제 구현이 어색했던 경험이 누적된 경우
- Stage 5에서 반복적으로 hierarchy / spacing / scroll / CTA 문제가 발견된 경우

---

## 필수 입력물

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. 관련 공식 문서 (`요구사항`, `화면정의서`, `유저flow맵`)
3. `docs/design/design-tokens.md`
4. `docs/design/mobile-ux-rules.md`
5. `docs/design/anchor-screens.md`
6. 관련 `docs/workpacks/<slice>/README.md`
7. 관련 `ui/designs/<SCREEN_ID>.md`
8. 아래 중 최소 1개
   - Figma frame URL
   - 구현 스크린샷 경로
   - 비교 가능한 화면 캡처 묶음

---

## Evidence 규칙

authority 리뷰는 아래 evidence가 있어야 한다.

- 모바일 기본 폭 1장 이상
- 작은 모바일 sentinel 폭 1장 이상
  - 권장 기준: `320px` 또는 그에 준하는 좁은 폭
- 스크롤 구조가 있는 화면은 아래가 드러나야 한다.
  - 최초 진입 상태
  - 스크롤 중 상태
  - CTA 또는 핵심 조작 영역

권장 artifact 예시:

- `ui/designs/evidence/<slice>/<SCREEN_ID>-mobile.png`
- `ui/designs/evidence/<slice>/<SCREEN_ID>-mobile-narrow.png`
- Figma frame URL 1개 + narrow variant 1개

---

## Blocker 판정 기준

아래는 기본적으로 `blocker`다.

- 모바일에서 화면 전체가 좌우로 흔들리거나 전체 페이지 가로 스크롤이 생김
- 스크롤 컨테이너 경계가 모호해서 사용자가 어디를 움직여야 하는지 헷갈림
- primary CTA가 시각적으로 약하거나 위치상 뒤로 밀려 핵심 작업이 바로 보이지 않음
- 정보 구조가 일반적인 모바일 앱 기대와 크게 달라 학습 비용이 높음
- anchor screen에서 기존 패턴과 충돌하는 새로운 상호작용을 도입함
- 작은 모바일 sentinel에서 레이아웃 붕괴, 잘림, CTA 가림, 터치 타겟 축소가 발생함
- critique나 authority report에 남은 blocker가 해결 또는 명시 수용되지 않았는데 `confirmed`를 주려 함

예시:

- `PLANNER_WEEK`에서 planner 자체가 horizontally scrollable content여야 하는데,
  화면 전체 wrapper가 좌우로 밀리는 구조는 blocker다.

---

## 산출물

- authority report:
  - 경로: `ui/designs/authority/<SCREEN_ID>-authority.md`
- 필요 시 follow-up TODO:
  - workpack README `Design Authority` 섹션 갱신
  - Stage 4 / 5 blocker 목록
  - anchor screen 보정 우선순위

authority report에는 아래를 반드시 포함한다.

- verdict: `pass / conditional-pass / hold`
- scorecard
  - mobile UX
  - interaction clarity
  - visual hierarchy
  - color/material fit
  - familiar app pattern fit
- blocker / major / minor
- before-coding 또는 before-merge 권고
- 다음 행동
  - 바로 진행 가능
  - Figma/wireframe 보강 후 재검토
  - 구현 수정 후 스크린샷 재검토

---

## Slice Workflow 연결

### Stage 1

- 신규 화면, high-risk UI change, anchor screen 확장에서는
  `ui/designs/<SCREEN_ID>.md`만으로 충분하지 않다.
- Stage 1 문서에는 반드시 아래 중 하나를 넣는다.
  - Figma frame URL
  - 스크린샷 artifact 경로
  - authority review를 받을 예정이라는 명시

### Stage 4

- 신규 화면, high-risk UI change, anchor screen 확장은
  `Ready for Review` 전에 authority review를 거친다.
- unresolved blocker가 있으면 Stage 4 closeout을 닫지 않는다.

### Stage 5

- Claude는 `Design Status: confirmed`를 주기 전에
  authority report를 읽고 blocker 0개를 확인한다.
- authority report가 없거나 evidence가 약하면 `confirmed`를 보류한다.

---

## Anchor Screen 원칙

아래 화면은 제품 인상의 축이므로 더 엄격하게 본다.

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`

이 화면들 자체를 수정하거나,
이 화면의 핵심 행동 흐름을 확장하는 슬라이스는 low-risk로 분류하지 않는다.

특히 `06-recipe-to-planner`는 `RECIPE_DETAIL`과 `PLANNER_WEEK`를 동시에 건드리는
anchor screen extension으로 본다.

---

## 운영 권고

현 시점의 즉시 권고는 아래와 같다.

1. slice06 제품 구현은 잠시 멈춘다.
2. `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`에 authority baseline을 만든다.
3. blocker를 한 번 정리한 뒤 slice06 Stage 1/4를 시작한다.

즉, 지금 필요한 것은 "슬라이스를 더 빨리 추가하는 것"보다
"앵커 화면의 모바일 UX 기준을 먼저 잠그는 것"이다.
