# Anchor Screens

## 목적

앵커 화면은 서비스의 인상을 결정하고,
후속 슬라이스가 계속 기대게 되는 기준 화면이다.

이 문서는 어떤 화면을 anchor screen으로 보는지와
어떤 변경이 extra review를 요구하는지 정한다.

## Anchor Screens

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`

## 왜 엄격하게 보나

- 사용 빈도가 높다
- 서비스 톤과 패턴을 대표한다
- 후속 화면이 이 구조를 복제하거나 참조한다
- 여기서 생긴 UX drift가 전체 서비스로 퍼지기 쉽다

## Anchor Extension 정의

아래 중 하나면 anchor extension이다.

- anchor screen의 핵심 CTA를 추가/변경
- anchor screen의 스크롤 구조를 변경
- 정보 구조나 섹션 위계를 변경
- modal, sheet, full-page 전환 구조를 변경
- anchor screen에서 다른 slice의 핵심 진입 플로우를 새로 얹음

## 기본 규칙

- anchor extension은 low-risk UI change로 분류하지 않는다.
- Stage 1에서 design artifact와 authority review 계획을 남긴다.
- Stage 4에서 screenshot/Figma evidence 기반 authority review를 거친다.
- unresolved blocker가 있으면 Stage 5 `confirmed` 금지다.

## 현재 제품에서 특히 조심할 화면

### `PLANNER_WEEK`

- 가로 정보량이 많아 구조 실수가 mobile UX를 크게 해칠 수 있다.
- 전체 화면 가로 스크롤, 애매한 scroll containment, 약한 CTA hierarchy를 특히 경계한다.

### `RECIPE_DETAIL`

- 저장, 좋아요, 플래너 추가, 조리 진입 같은 핵심 행동이 모이는 화면이다.
- CTA 우선순위와 secondary action 정리가 무너지기 쉽다.

### `HOME`

- 첫 인상과 탐색 패턴을 결정한다.
- 필터, 카드, 검색, 하단 탭 조합이 브랜드와 정보 구조를 함께 결정한다.

## Slice06 판정

`06-recipe-to-planner`는 `RECIPE_DETAIL`과 `PLANNER_WEEK`를 동시에 확장한다.

따라서:

- 단순 연결 슬라이스가 아니다
- anchor extension이다
- authority review 없이 바로 Stage 4 구현으로 들어가면 안 된다
