# MYPAGE Growth Profile Polish Critique

## Verdict

Stage 1 design direction is approved for implementation with high-risk authority evidence required before merge.

## Current Problems

1. The current desktop `/mypage` profile card can stretch to the height of the recent growth archive, leaving a large blank area and pushing profile/growth content toward the bottom.
2. Profile, growth, and quest information read as adjacent mini cards instead of one profile header.
3. Badge visuals are too close to small flat pictograms in some contexts.
4. The original `집밥 러너` concept image used a shoe in a bowl, which is unsanitary and visually wrong for a food product.

## Required Design Corrections

- Make the profile header own identity, grade, level, XP, representative badges, and active quest summary.
- Move archive history out of the profile header layout.
- Make badge shapes look like emblems with frame, silhouette, and inner symbol.
- Replace runner grade treatment with a clean bowl/motion/timer motif and ban footwear across concept and runtime visuals.
- Keep runner distinct from sprout grade by excluding sprout as the main runner motif.
- Replace artisan grade treatment with an artisan seal/tool/steam motif, not a plain pot.

## Blockers Before Merge

- Any shoe, foot, sock, footwear-like object, or dirty object in the runner grade or badge family.
- Runner grade using sprout as the main motif.
- Artisan grade represented by only a plain pot.
- Archive list height stretching the profile header.
- Desktop first viewport dominated by blank profile card space.
- Badge shapes that are only color variants of the same icon.
- Growth UI introducing rank, leaderboard, reward claim, loot, or pressure streak semantics.

## Evidence Required

- Mobile default and narrow screenshots.
- Desktop 1440 and wide screenshot.
- Badge guide screenshot showing polished badge emblems.
- Runner grade screenshot proving no footwear.
- Soft-fail screenshots for progress, gamification, and archive failure.

## Implementation Notes

- Keep server authority for `grade.label`, level, XP, badges, and quests.
- Prefer CSS/SVG components and existing tokens.
- Do not add dependencies.
- Do not change backend contracts.
