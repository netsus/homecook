# MYPAGE Growth Profile Critique

## Verdict

Stage 1 design direction: Green with implementation guardrails.

## Strengths

- Keeps growth information in the account/profile context, matching the 34a contract.
- Uses generated concept only as a direction board and commits to SVG/CSS for runtime.
- Separates representative badges in the first viewport from full inventory/locked hints in secondary surfaces.
- Keeps server authority explicit for grade, level, XP, badge unlock, and quest completion.

## Required Guardrails

- Mobile 320px evidence is mandatory. The profile header must not push tabs out of reach.
- Badge shape family must pass a silhouette check. Color-only variants are not enough.
- Locked hints must stay inside guide/secondary surface, not become a first-viewport locked grid.
- No reward claim, loot chest, competitive rank, or pressure streak language.
- Soft-fail states must preserve MYPAGE core and at least one available growth source when only one API fails.

## Implementation Notes

- Prefer a small shared `GrowthBadgeIcon` SVG/CSS component.
- Prefer a focused `MypageGrowthProfile` component that receives progress and gamification state instead of recomputing from raw API in children.
- Keep existing `MypageGamificationCard` responsibilities for guide/quest/tutorial secondary content or split it only if the resulting diff stays smaller and clearer.
- Do not introduce new dependencies.
