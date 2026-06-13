# Critique: MYPAGE Achievement Album

## Verdict

Approved as a product direction for slice35, with constraints. The concept is stronger than slice34 because it turns growth into a collectible album instead of a loose badge/quest list. The main risk is visual tone: spoon grades and stamp collection can easily drift into a game rank screen. 35c must keep the first viewport profile-led and home-cooking-led.

## Strong Points

- `Clay → Titanium` is easier to understand than the previous Korean grade names because the image set already expresses material progression.
- Moving long-term goals from quests to achievements avoids turning MYPAGE into an endless to-do list.
- Treating tutorial as an achievement category is clean: onboarding and collection can share one data model.
- Button entry for grade/achievement/tutorial/notification keeps MYPAGE first viewport lighter than always-on grids.

## Required Constraints

- Achievements must not grant additional XP. They should grant stamp/badge state and notification only.
- Standard quest expansion should stop. Otherwise the product will have two competing goal systems.
- The profile header must not become a dashboard full of separate cards.
- Spoon grade assets should be optimized before runtime use. The source PNGs are design assets, not necessarily production-size assets.
- Locked achievements need hints, but not pressure language.
- No leaderboard, public rank, claim reward, loot box, daily pressure streak, or penalty state.

## UI Risks

- If all four action buttons are styled like equal feature cards, the profile header can become too busy on mobile.
- If the grade character is too large in the header, it will feel like a game avatar screen and push core MYPAGE actions down.
- Achievement stamp grids can become visually noisy. Default to category progress summary first, then grid inside the modal.
- Exact concept-board reproduction is not appropriate for production because the board shows multiple states at once. 35c should implement one user path at a time.

## Data Risks

- Pantry count is easy to abuse if delete/re-add counts repeatedly. Use distinct ingredient-ever or a server dedupe key.
- Leftover cleanup must exclude automatic transitions.
- Shopping complete must stay list-based; meal bundle preparation must be separate.
- Existing user backfill must not create historical notification bursts.

## Acceptance Notes For 35c

- At 320px, profile header should show identity, grade/level, XP, and action entry without clipped text.
- At desktop width, the header should not stretch because achievement/archive content is long.
- The achievement album modal must show earned, active, and locked states.
- The tutorial modal must be usable by a new user with 0 XP.
- Error in archive must not break profile header.
