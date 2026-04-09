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
- authority는 critique와 hold 권한을 가지지만, 사용자 승인 없이 익숙한 interaction model을 다른 모델로 교체하는 근거가 되어서는 안 된다.
- overflow 문제를 잡는 것과 interaction model을 바꾸는 것은 별개로 본다.

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

특히 아래 유형은 authority가 적극적으로 잡아야 한다.

- 첫 화면에 실제 핵심 콘텐츠보다 설명/통계/여백이 더 많이 보이는 경우
- 범위 이동, 필터, 주간 전환 같은 컨트롤이 대상 콘텐츠와 멀리 떨어진 경우
- 같은 날짜의 식단처럼 한 덩어리로 봐야 할 정보가 여러 카드나 여러 축으로 흩어진 경우
- 4~5컬럼을 지원한다는 이유로 한 슬롯이 지나치게 좁아진 경우

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
- page-level overflow 문제를 고친다는 이유로 기존 table/list/sheet mental model을 card stack, full-page flow 등 다른 모델로 거칠게 바꿈
- 스크롤 컨테이너 경계가 모호해서 사용자가 어디를 움직여야 하는지 헷갈림
- primary CTA가 시각적으로 약하거나 위치상 뒤로 밀려 핵심 작업이 바로 보이지 않음
- 정보 구조가 일반적인 모바일 앱 기대와 크게 달라 학습 비용이 높음
- anchor screen에서 기존 패턴과 충돌하는 새로운 상호작용을 도입함
- 작은 모바일 sentinel에서 레이아웃 붕괴, 잘림, CTA 가림, 터치 타겟 축소가 발생함
- critique나 authority report에 남은 blocker가 해결 또는 명시 수용되지 않았는데 `confirmed`를 주려 함

예시:

- `PLANNER_WEEK`에서 planner 자체가 horizontally scrollable content여야 하는데,
  화면 전체 wrapper가 좌우로 밀리는 구조는 blocker다.
- `PLANNER_WEEK`에서 같은 날짜의 아침/점심/저녁이 서로 떨어져 보여
  사용자가 하루 식단을 한 번에 읽지 못하면 major 이상으로 본다.
- `PLANNER_WEEK`에서 주간 이동 컨트롤이 planner 본문과 멀리 떨어져 있으면
  control proximity 문제로 본다.

### Planner-Specific Heuristics

`PLANNER_WEEK`는 아래 질문을 별도로 본다.

- 모바일 첫 화면에서 며칠치 식단이 바로 보이는가
- 주간 범위와 주간 이동 컨트롤이 planner 본문에 붙어 있는가
- 같은 날짜의 끼니가 한 card 또는 한 block 안에서 함께 읽히는가
- 설명/칩/여백이 실제 식단 카드보다 더 큰 비중을 차지하지 않는가
- 4~5컬럼에서도 한 슬롯의 정보 밀도가 무너지지 않는가

권장 guardrail:

- mobile default viewport에서 `2일 이상`의 day summary가 보여야 한다.
- 4~5컬럼이 되더라도 모바일에서 `5 equal-width slots in one row`는 기본안으로 두지 않는다.
- 한 슬롯 안에 `끼니명 + 식사명 또는 empty state + 상태/보조 정보`가 안정적으로 읽히지 않으면 그 레이아웃은 실패다.

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
- interaction model 자체를 바꾸는 제안이면 authority 단독으로 `pass`를 주지 않고,
  사용자 승인 또는 별도 design artifact 보강 전까지 `hold`를 기본값으로 둔다.

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
