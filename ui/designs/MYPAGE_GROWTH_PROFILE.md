# MYPAGE Growth Profile Design

## Intent

34d는 성장 정보를 별도 game card로 키우지 않고, MYPAGE 프로필의 일부로 통합한다. 사용자는 "나는 지금 어떤 집밥 단계인가"를 조용히 이해하고, 대표 배지를 통해 최근 성취를 확인한다.

## Concept Source

- Codex image generation concept: `ui/designs/evidence/34d-mypage-growth-profile-assets/badge-grade-concept.png`
- 참고 이미지는 게임식 UI였지만, 34d concept은 다음만 차용한다:
  - 등급을 한눈에 알아볼 수 있는 emblem language
  - badge shape family가 서로 다른 silhouette를 가진다는 원칙
  - profile header 안에서 level, XP, representative badges를 함께 보여주는 구조
- 런타임 앱은 생성 이미지를 사용하지 않는다. SVG/CSS 컴포넌트만 사용한다.

## Profile Header Layout

### Mobile

- 프로필 avatar, nickname, provider, settings button을 유지한다.
- 그 아래 같은 account block 안에 compact growth row를 둔다:
  - `등급명 · Lv.N`
  - slim XP bar
  - `다음 레벨까지 N XP`
  - 대표 배지 최대 3개
- 전체 height는 320px viewport에서 레시피북/장보기 tab entry가 보이도록 제한한다.
- 대표 배지 row는 horizontal scroll이 아니라 max 3개 fixed row다.

### Desktop

- account/profile card 안에서 nickname/provider 옆 또는 아래에 grade chip + level + XP progress를 둔다.
- 대표 배지는 최대 4개.
- web stats와 혼동되지 않게 "식사 수" 같은 activity stats와 XP event count를 한 줄에 섞지 않는다.

## Badge Shape Family

| shape_key | Visual idea | Use tone |
| --- | --- | --- |
| `plate` | shallow circle plate with rim | recipebook/custom book |
| `shield` | simple rounded shield | rhythm/milestone |
| `ribbon` | vertical ribbon seal | collector/progress |
| `bookmark` | folded bookmark | recipe save |
| `pot` | cooking pot silhouette | cooking completion |
| `leaf` | leaf sprout | shopping/pantry freshness |
| `bowl` | rice bowl | routine/home meal |

Rules:

- Use CSS variables and SVG primitives.
- Shapes must differ by silhouette, not only by color.
- Avoid gold loot chest, weapon, armor, rank ladder, neon, skull, reward box, and confetti overload.
- Use `aria-label`/visible text from badge label; icon alone is decorative unless the badge label is hidden.

## Grade Treatment

Grade label comes from the server.

- `sprout_homecook`: fresh sprout mark
- `homecook_runner`: bowl with small motion line
- `kitchen_explorer`: small compass/utensil
- `table_maker`: shared table mark
- `homecook_artisan`: crafted pot mark
- `table_curator`: arranged table mark
- `homecook_master`: home table emblem

The CSS tone may vary by `grade_key`, but text label must use server `grade.label`.

## Locked Hint Pattern

- Earned badge: label + shape + short description.
- Locked badge: muted shape + `locked_hint`.
- Hint copy must be a next action:
  - "첫 요리를 완료하면 열려요"
  - "장보기 완료를 한 번 기록해 보세요"
  - "커스텀 레시피북을 만들면 열려요"
- Do not use:
  - "지금 안 하면 놓쳐요"
  - "랭킹을 올리세요"
  - "보상 상자를 받으세요"

## States

- Loading: profile growth row skeleton only.
- Empty/new user: `새싹 집밥러 · Lv.1`, 0% progress, no badge row or one muted starter placeholder.
- Progress soft-fail: hide XP bar or show "성장 정보를 잠시 불러오지 못했어요" inside profile row only.
- Gamification soft-fail: keep progress bar, hide grade/badge row or show fallback grade-free progress.
- Unauthorized: MYPAGE auth gate.

## Stage 4 Evidence Checklist

- `mobile-390.png`: profile growth row + representative badges + tab entry visible.
- `mobile-320.png`: no overlap/truncation.
- `desktop-1440.png`: account header, not game dashboard.
- `badge-shapes.png`: seven shape families visible.
- `locked-badge-hints.png`: bottom sheet/modal hints visible.
- `soft-fail-progress.png`
- `soft-fail-gamification.png`
