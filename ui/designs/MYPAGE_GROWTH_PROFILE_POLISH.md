# MYPAGE Growth Profile Polish Design

## Intent

34e turns the growth profile from adjacent mini surfaces into one integrated profile header. The profile header should feel like an account identity block with growth context, not a separate game dashboard inserted beside the profile.

## Concept Source

- Revised Codex image generation concept v2: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-v2-collectible-grades.png`
- Previous no-footwear concept v1: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-no-footwear.png`
- Runtime production remains SVG/CSS only.
- The generated image is direction evidence for hierarchy, badge language, and the safe `집밥 러너` concept. It is not a pixel-perfect implementation target.

## Non-Negotiable Visual Hygiene

`homecook_runner` / `집밥 러너` must not show:

- shoes, sneakers, socks, feet, soles, or footwear-like objects
- dirty floor objects
- any abnormal object inside or touching bowls, plates, food, or tableware

Approved runner motifs:

- clean rice bowl on saucer + motion lines
- timer or small forward arrow
- forward arrow/path mark
- light steam or speed line treatment

Runner must not use a sprout motif because it overlaps with `새싹 집밥러`.

## Grade Emblem Differentiation

| grade key | Runtime visual direction |
| --- | --- |
| `sprout_homecook` | sprout emerging from soil, beginner growth |
| `homecook_runner` | clean rice bowl with motion lines + timer/forward cue, no sprout and no footwear |
| `kitchen_explorer` | compass + spoon/map pin, no dining table |
| `table_maker` | complete meal table or tray with multiple dishes |
| `homecook_artisan` | artisan seal + wooden cooking tool + refined steam/flame, not plain pot only |
| `table_curator` | curated plate arrangement with leaf garnish |
| `homecook_master` | warm home/table master emblem with laurel |

## Future Grade Naming Ideas

Runtime must keep server `grade.label` until a contract-evolution slice approves new labels. These are exploration candidates for the future quest/achievement/badge expansion.

### 후보 A: 현재 계약을 살리되 더 수집형으로 다듬기

| level band | candidate |
| --- | --- |
| Lv.1-3 | 새싹 집밥러 |
| Lv.4-7 | 집밥 페이서 |
| Lv.8-12 | 주방 탐험가 |
| Lv.13-20 | 한상 메이커 |
| Lv.21-34 | 손맛 장인 |
| Lv.35-49 | 식탁 큐레이터 |
| Lv.50+ | 집밥 명장 |

### 후보 B: 집밥 여정 테마

| level band | candidate |
| --- | --- |
| Lv.1-3 | 첫 끼 새싹 |
| Lv.4-7 | 끼니 루틴러 |
| Lv.8-12 | 장보기 항해자 |
| Lv.13-20 | 한상 설계자 |
| Lv.21-34 | 손맛 연구가 |
| Lv.35-49 | 식탁 연출가 |
| Lv.50+ | 집밥 마스터 |

### 후보 C: 배지 수집 게임감 강화

| level band | candidate |
| --- | --- |
| Lv.1-3 | 주방 입문자 |
| Lv.4-7 | 루틴 빌더 |
| Lv.8-12 | 레시피 스카우트 |
| Lv.13-20 | 한상 빌더 |
| Lv.21-34 | 손맛 크래프터 |
| Lv.35-49 | 식탁 디렉터 |
| Lv.50+ | 홈쿡 레전드 |

Recommended direction for a future contract slice: keep names Korean and home-cooking specific, avoid exercise/competition terms that create awkward food imagery, and choose labels that can map to achievements across recipe, planner, shopping, cooking, pantry, leftovers, and recipebook categories.

## Integrated Profile Header

### Structure

Use one profile header with these zones:

1. identity zone: avatar, nickname, provider/login badge, settings/edit affordance
2. grade zone: grade emblem, `grade.label`, `Lv.N`
3. progress zone: XP text, progress bar, next-level helper
4. representative badge zone: max 4 badges, label visible below or next to icon depending on width
5. quest summary zone: 1-2 active quests or tutorial CTA inside the same header, visually secondary

Recent growth archive is not part of the header. It sits below or beside as a separate secondary surface with its own height.

### Desktop

- Header uses content-driven height.
- Archive column cannot stretch the header.
- Use a two-column page layout only outside the header:
  - main column: profile header, stats/tabs/content
  - side column: recent growth archive or auxiliary history
- The header should start near the top of the content region. No large blank card.

### Mobile

- Header remains a single account block.
- 320px width must preserve readable identity, grade, progress, badge row, and one quest summary without horizontal overflow.
- Badge labels may shorten, but icons must not shrink below a recognizable emblem.

## Badge Emblem Language

The existing shape keys remain:

| shape_key | Required silhouette | Polish direction |
| --- | --- | --- |
| `plate` | round plate rim | ceramic plate + small leaf/spark mark |
| `shield` | rounded shield | soft kitchen badge, not armor |
| `ribbon` | medal/ribbon seal | warm paper/ribbon depth |
| `bookmark` | folded bookmark | recipebook bookmark with inset symbol |
| `pot` | cooking pot | pot body plus lid/handle, no tiny-only icon |
| `leaf` | leaf | leaf body with vein and soft badge base |
| `bowl` | rice bowl | bowl body with rim, steam or sprout |

Rules:

- Each badge has outer frame, inner symbol, and tonal depth.
- Shape must be recognizable at 40px and 56px.
- Color alone cannot be the only differentiator.
- Avoid combat, rank armor, loot boxes, neon, and esports visuals.

## Quest Integration

Quest information should be present, but quieter than identity and grade.

- Show active quest title, short helper, progress bar/count, and action if appropriate.
- Avoid a separate card pasted to the right of the profile on desktop.
- On mobile, show at most one tutorial/quest callout in the header first viewport.

## States

- Loading: skeleton for grade/progress/badges inside header.
- Empty/new user: `새싹 집밥러 · Lv.1`, 0 XP state, starter/tutor quest.
- Progress soft-fail: hide or shrink XP zone, keep identity and gamification if available.
- Gamification soft-fail: keep progress zone, show quiet missing badge/grade state.
- Archive soft-fail: show archive-local error only.
- Unauthorized: existing MYPAGE auth gate.

## Stage 4 Evidence Checklist

- `mobile-390.png`
- `mobile-320.png`
- `desktop-1440.png`
- `desktop-1920.png`
- `badge-guide-polished.png`
- `runner-grade-no-footwear.png`
- `soft-fail-progress.png`
- `soft-fail-gamification.png`
- `soft-fail-archive.png`
