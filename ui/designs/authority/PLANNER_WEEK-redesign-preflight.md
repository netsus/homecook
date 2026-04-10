# PLANNER_WEEK Redesign Preflight

> 대상: `PLANNER_WEEK v2` 모바일 리디자인
> 관련 설계: `ui/designs/PLANNER_WEEK-v2.md`
> 비교 기준:
> - 현재 implementation: `components/planner/planner-week-screen.tsx`
> - 현재 baseline report: `ui/designs/authority/PLANNER_WEEK-authority.md`
> - 팀장님 제공 모바일 플래너 레퍼런스 이미지 (2026-04-10)
> 검토일: 2026-04-10
> 검토자: product-design-authority

## Verdict

- verdict: `hold`
- 한 줄 요약: 현재 planner는 안정성 측면의 hole은 줄었지만, 팀장님이 기대하는 모바일 planner 수준의 `한눈에 보기`, `주간 이동 proximity`, `날짜 단위 overview` 기준에는 아직 못 미친다.

## Blockers

| # | 위치 | 문제 | 왜 blocker인가 | 수정 방향 |
|---|------|------|----------------|----------|
| 1 | first viewport density | 첫 화면에 설명/칩/상단 구조 비중이 커서 실제 day overview가 늦게 나온다. | planner의 핵심 가치가 "한눈에 여러 날 보기"인데 첫 화면에서 그 경험이 약해진다. | hero를 압축하고 week bar와 첫 day card를 위로 끌어올린다. |
| 2 | control proximity | 주간 범위 이동 affordance가 planner 본문과 시각적으로 떨어져 있다. | 사용자는 어떤 콘텐츠 집합을 움직이는 인터랙션인지 즉시 연결하기 어렵다. | week range + swipeable weekday strip + current-week reset을 planner 바로 위 block으로 재배치한다. |
| 3 | day grouping | 같은 날짜 식단을 한 card 안에서 읽기보다 날짜 x 끼니 표를 계속 스캔해야 한다. | 모바일에서는 하루 단위 스캔이 더 자연스러운 경우가 많고, 현재 구조는 인지 부하가 크다. | `하루 1카드 + 카드 내부 4슬롯` 구조로 재설계한다. |
| 4 | content hygiene | 범위 정보와 상태 정보가 중복되거나 개발용 문자열이 사용자에게 보이면 신뢰감이 떨어진다. | planner는 빠르게 읽히는 화면이어야 하고, 메타데이터 중복은 실제 식단보다 UI가 더 크게 느껴지게 만든다. | range summary를 1회로 줄이고 `ready` 같은 개발용 상태 노출을 제거한다. |

## Major Issues

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | localized horizontal scroll | page-level overflow는 아니지만 mobile 기본형에 가로 스크롤이 남아 있다. | `PLANNER_WEEK-v2`에서는 기본 mobile overview를 no-horizontal-scroll로 설계한다. |
| 2 | empty repetition | 빈 상태가 날짜별/칸별로 반복돼 세로 스캔 피로가 크다. | empty copy를 더 짧게 줄이고 같은 날짜 안에서는 card 단위 요약을 강화한다. |
| 3 | 4-slot density | 4끼를 모두 한 카드 안에 보여줄 때 copy, 상태, 여백 기준이 아직 약하다. | `아침 / 점심 / 간식 / 저녁` 4슬롯을 전부 보여주되, copy와 badge를 더 압축하는 기준을 잠근다. |

## Decision

- slice06 Stage 1에 바로 들어갈 수 있는가: `보류`
- 먼저 필요한 것:
  - `PLANNER_WEEK-v2.md` 방향 승인
  - 4끼 고정 slot density 기준 잠금
  - swipeable weekday strip 기준 잠금
  - Figma 또는 screenshot 수준의 리디자인 evidence 준비
- 구현 권고:
  - 현재 corrected baseline은 "안전한 임시 상태"로 유지한다.
  - 다음 구현은 이 preflight 기준을 만족하는 redesign branch로 분리한다.
