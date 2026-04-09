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
| 2 | control proximity | 주간 범위 이동 컨트롤이 planner 본문과 시각적으로 떨어져 있다. | 사용자는 어떤 콘텐츠 집합을 움직이는 버튼인지 즉시 연결하기 어렵다. | week range + prev/next/current controls를 planner 바로 위 sticky block으로 재배치한다. |
| 3 | day grouping | 같은 날짜 식단을 한 card 안에서 읽기보다 날짜 x 끼니 표를 계속 스캔해야 한다. | 모바일에서는 하루 단위 스캔이 더 자연스러운 경우가 많고, 현재 구조는 인지 부하가 크다. | `하루 1카드 + 카드 내부 3슬롯` 구조로 재설계한다. |

## Major Issues

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | localized horizontal scroll | page-level overflow는 아니지만 mobile 기본형에 가로 스크롤이 남아 있다. | `PLANNER_WEEK-v2`에서는 기본 mobile overview를 no-horizontal-scroll로 설계한다. |
| 2 | empty repetition | 빈 상태가 날짜별/칸별로 반복돼 세로 스캔 피로가 크다. | empty copy를 더 짧게 줄이고 같은 날짜 안에서는 card 단위 요약을 강화한다. |
| 3 | 5-column uncertainty | 최대 5컬럼일 때 어떤 정보 우선순위로 보여줄지 기준이 없다. | `primary 3 + secondary row/disclosure` 전략을 기준으로 잠근다. |

## Decision

- slice06 Stage 1에 바로 들어갈 수 있는가: `보류`
- 먼저 필요한 것:
  - `PLANNER_WEEK-v2.md` 방향 승인
  - 5컬럼 mobile 처리안 잠금
  - Figma 또는 screenshot 수준의 리디자인 evidence 준비
- 구현 권고:
  - 현재 corrected baseline은 "안전한 임시 상태"로 유지한다.
  - 다음 구현은 이 preflight 기준을 만족하는 redesign branch로 분리한다.
