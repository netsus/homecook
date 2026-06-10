# MYPAGE_GAMIFICATION Design Critique

## Verdict

🟡 조건부 통과

## Why

33c draft는 참고 게임 이미지의 구조적 요소인 badge, rank/progress, achievement, toast를 가져오되 집밥 서비스에 맞게 경쟁/보상 압박을 낮춘다. MYPAGE 첫 화면에는 대표 배지와 현재 퀘스트만 작게 노출하고, locked badge grid나 보상 상자형 CTA를 main surface에서 제외해 과밀도를 줄였다.

## Strengths

- 33b compact progress UI를 유지하며 그 아래에 badge/quest를 붙이는 확장 방향이 자연스럽다.
- XP source를 33a canonical event로 제한해 사용자가 “왜 올랐는지” 이해할 수 있다.
- tutorial quest를 별도 온보딩 화면이 아니라 MYPAGE와 행동 후 toast에 녹이는 방식이 서비스 흐름을 덜 방해한다.
- 320px 조건에서 badge/quest text를 짧게 제한한 점이 좋다.
- leaderboard, pressure streak, loot reward를 제외해 집밥 서비스 톤을 해치지 않는다.

## Risks

- Source action 직후 XP toast를 모든 행동에 붙이면 기존 성공 feedback과 겹칠 수 있다. Stage 4에서는 save, shopping complete, cook complete, custom book create 화면별 위치와 중복 방지 evidence가 필요하다.
- Badge guide modal이 설명을 많이 담으면 모바일에서 문서형 sheet가 될 수 있다. 첫 버전은 3개 section 이하로 제한해야 한다.
- Active quest가 2개를 넘으면 MYPAGE가 관리 화면처럼 무거워진다. 기본 노출은 1~2개로 제한하고 full inventory는 후속 slice로 미루는 것이 안전하다.
- Contract-evolution 전에는 API/DB shape가 확정되지 않았다. Stage 2 착수 전 공식 문서 갱신이 blocker다.

## Required Stage 4 Evidence

- 390px mobile screenshot with badge strip, current quest, tutorial quest.
- 320px mobile screenshot proving no overlap/truncation.
- Desktop 1440px screenshot inside MYPAGE profile card.
- Badge guide modal/bottom sheet screenshot.
- XP toast screenshot after a source action success.
- Soft-fail screenshot where gamification fails but MYPAGE core and 33b progress remain usable.

## Conditions

- Keep main MYPAGE surface compact.
- Do not show locked badge grid on first viewport.
- Do not introduce rank, streak pressure, or reward chest visual language.
- Keep copy concrete: “첫 요리 완료”, “장보기 완료” rather than abstract game labels.
- Use server-derived data only; no client-side badge/level calculation.
