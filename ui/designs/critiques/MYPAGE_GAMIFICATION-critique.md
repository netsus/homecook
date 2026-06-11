# MYPAGE_GAMIFICATION Design Critique

## Verdict

🟡 조건부 통과

## Why

33c draft는 참고 게임 이미지의 구조적 요소인 badge, rank/progress, achievement, toast를 가져오되 집밥 서비스에 맞게 경쟁/보상 압박을 낮춘다. 34c update는 priority toast stack과 최근 성장 기록 archive를 추가하되, MYPAGE 첫 화면에는 대표 배지와 현재 퀘스트를 작게 유지하고 archive도 compact read-only list로 제한한다.

## Strengths

- 33b compact progress UI를 유지하며 그 아래에 badge/quest를 붙이는 확장 방향이 자연스럽다.
- XP source를 33a canonical event로 제한해 사용자가 “왜 올랐는지” 이해할 수 있다.
- tutorial quest를 별도 온보딩 화면이 아니라 MYPAGE와 행동 후 toast에 녹이는 방식이 서비스 흐름을 덜 방해한다.
- 320px 조건에서 badge/quest text를 짧게 제한한 점이 좋다.
- leaderboard, pressure streak, loot reward를 제외해 집밥 서비스 톤을 해치지 않는다.
- 34c의 mobile 2 / desktop 3 toast cap은 화면정의서 기준과 맞고, collapsed summary로 유실을 피한다.
- archive surface가 profile header 통합을 건드리지 않아 34d 범위를 침범하지 않는다.

## Risks

- Source action 직후 toast stack을 모든 행동에 붙이면 기존 성공 feedback과 겹칠 수 있다. Stage 4 evidence에서는 mobile bottom tab, source action success UI, desktop lower-right 위치가 서로 가리지 않는지 봐야 한다.
- Badge guide modal이 설명을 많이 담으면 모바일에서 문서형 sheet가 될 수 있다. 첫 버전은 3개 section 이하로 제한해야 한다.
- Active quest가 2개를 넘으면 MYPAGE가 관리 화면처럼 무거워진다. 기본 노출은 1~2개로 제한하고 full inventory는 후속 slice로 미루는 것이 안전하다.
- Archive surface가 길어지면 MYPAGE home의 반복 작업 진입을 밀어낼 수 있다. 기본 page size와 “더 보기” affordance가 compact해야 한다.
- `group_key`를 위해 클라이언트가 priority를 재정렬하면 공식 계약을 깨뜨린다. visual grouping은 chip/metadata로만 처리하고 서버 순서를 유지해야 한다.

## Required Stage 4 Evidence

- 390px mobile screenshot with gamification card and archive surface.
- 320px mobile screenshot proving toast stack does not overlap bottom tab/core CTA.
- Desktop 1440px screenshot with archive surface in the MYPAGE column.
- Mobile toast stack screenshot with 2 visible toasts and collapsed summary.
- Desktop toast stack screenshot with 3 visible toasts.
- Level-up toast screenshot showing stronger tone than XP toast.
- Archive empty and pagination screenshots.
- SHOPPING_FLOW screenshot with `여러 끼니를 한번에 장보기할 수 있어요`.

## Conditions

- Keep main MYPAGE surface compact.
- Do not show locked badge grid on first viewport.
- Do not introduce rank, streak pressure, or reward chest visual language.
- Keep copy concrete: “첫 요리 완료”, “장보기 완료” rather than abstract game labels.
- Use server-derived data only; no client-side badge/level calculation.
- Keep `priority_unseen` server order; do not reorder in the client.
- Keep MYPAGE profile header integration for 34d.
