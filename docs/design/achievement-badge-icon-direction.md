# Achievement Badge Icon Direction

## Goal

업적앨범 배지는 같은 외곽 stamp 안에서 내부 이미지만 업적 내용에 맞게 바꾼다. 사용자는 숫자가 커질수록 "같은 일을 더 오래 쌓았다"는 느낌을 받아야 하므로, 각 track은 왼쪽에서 오른쪽으로 명확히 더 풍성하고 희소하게 보인다.

## Source

- Runtime surface: `components/mypage/mypage-growth-detail-dialog.tsx`
- Achievement definitions: `lib/server/user-gamification.ts`
- Individual PNG icons:
  - `public/assets/growth/achievement-icons-v3-4/{achievement_key}.png`
  - `public/assets/growth/achievement-icons-v3-4/manifest.json`
- Concept boards:
  - `docs/design/assets/achievement-badge-concepts/achievement-icons-extraction-v3-4.png`

## Visual Rule

- Outer badge: 동일한 원형 enamel stamp, 얇은 rim, 약한 하이라이트.
- Inner image: 업적 의미를 담당한다.
- Progression:
  - Starter: 단일 오브젝트, 얇은 선, 낮은 채도.
  - Growing: 오브젝트 2~3개, 작은 check/accent.
  - Expert: 정리된 묶음, 선반/보드/책 같은 구조물.
  - Master: 프리미엄 rim, 작은 sparkle, 아주 작은 crown-like glint.
- Locked: 회색 처리하되 내부 silhouette는 보여준다.
- Active: blue rim 또는 작은 progress underline.
- Earned: full color.
- Avoid: 전투 rank, 가챠, 보상상자, 과한 왕관, 캐릭터 얼굴, 유아용 그림체.

## Current UI Shell Rule

사용자 피드백 기준으로 production 적용 우선순위는 badge shell 교체가 아니라 inner icon 교체다.

- 유지: 현재 원형 badge shell, 연한 category background, white ring, soft shadow, progress row layout.
- 교체: 원형 내부의 작은 심볼만 교체한다.
- 색감: 기존보다 진하고 선명해야 한다. low-contrast pastel-only 심볼은 피한다.
- 크기: 내부 심볼은 현재 원형 안에서 40~48px 수준으로 읽혀야 한다.
- 구현: PNG icon asset으로 구현할 때도 circle/background token은 기존 컴포넌트를 재사용한다. `achievement-icons-v3-4`는 내부 오브젝트 중심 투명 PNG이다.

## Track Mapping

| Track | Thresholds | Inner image progression |
| --- | --- | --- |
| Tutorial | 7 steps | recipe bookmark -> planner calendar -> shopping checklist -> checked market bag -> lidded pot -> personal recipebook -> completed table medallion |
| Recipe Saved | 5 / 20 / 50 / 100 / 300 / 1000 | single bookmarked recipe card -> overlapping recipe cards -> recipe box -> bundled recipe-card stack -> clean recipe shelf -> personal recipe library |
| Recipe Registered | 3 / 10 / 30 / 100 / 300 / 600 / 1000 | spiral notebook with pen -> clipboard draft -> plain recipe book -> bookmarked recipe book -> multiple recipe books -> stamped manuscript -> master recipe tome |
| Planner | 3 / 10 / 30 / 100 / 300 / 1000 / 3000 | single marked planner -> meal-card planner -> weekly grid -> monthly meal grid -> planning board -> seasonal calendar -> command calendar |
| Shopping | 3 / 10 / 30 / 100 / 300 / 700 / 1300 | checked grocery board -> empty basket -> cart -> market bag with receipt -> tote with ingredients -> food-filled cart -> ingredient crate |
| Cooking | 3 / 10 / 30 / 100 / 300 / 1000 / 3000 | cutting board and knife -> steaming pot -> pan with food -> complete tray -> serving dome -> filled drink plus plated meal -> chef hat with tools |
| Pantry | 10 / 30 / 60 / 120 / 250 / 600 | two jars -> three jars/bottles -> sacks and pantry packages -> compact jar rack -> full two-tier shelf -> collection cabinet |
| Leftovers | 3 / 10 / 30 / 100 / 300 / 1000 | two stacked containers -> three stacked containers -> fridge shelf -> open container plus plated food -> leftover meal tray -> tidy fridge collection |

## V3.4 Corrections

- Runtime alignment:
  - Long-running tracks no longer include `1` threshold assets. First-use achievements are represented only in the tutorial row.
  - PNG export count is 53 assets, matching `USER_ACHIEVEMENT_DEFINITIONS`.
- Extraction:
  - The concept board is an extraction board: no text, no numbers, no circular badge shell, and no row labels.
  - Exported icons are 256x256 transparent PNG files.
- User-requested icon cleanup:
  - Recipe Saved: 5 uses the previous first-save style, 20 is overlapping cards, the old drawer image is removed, and the shelf/library images are intact.
  - Recipe Registered: 30 has no bookmark, 100 adds the bookmark, and 300 uses multiple books rather than a box.
  - Planner: the old 300 binder image is removed; 3 starts with a simple marked planner and 3~100 move one step forward.
  - Shopping: 3 uses a checked grocery board, 10 uses an empty basket, later states shift according to the latest user mapping, and basket/tote handles are simplified.
  - Cooking: 3 uses the former cutting-board starter, the old 30 bowl image is removed, and 3000 uses a chef hat with tools.
  - Pantry: 60 and 120 are swapped; 250 is a complete two-tier shelf without clipping.

## Recommended Direction

`achievement-icons-extraction-v3-4.png` is the active visual target for production icon extraction. It intentionally omits text, numbers, and circular badge shells so each icon can be cropped cleanly and placed inside the existing app badge shell.

## Implementation Note

현재 `GrowthBadgeIcon`은 `shape_key`와 `tier`만 받아 공통 SVG를 반복한다. 실제 적용 시에는 `achievement_key` 기반으로 `public/assets/growth/achievement-icons-v3-4/{achievement_key}.png`를 불러오면 된다. 서버 계약을 바꾸지 않으려면 프론트에서 `achievement_key`를 public asset path로 변환하는 방식이 가장 작다.

Server definitions currently start long-running tracks after the tutorial first step. For example, there is no `cooking_completed_1`; the first cooking icon is `tutorial_cooking_complete.png`.
