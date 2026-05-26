# Live YouTube Smoke - 2026-05-26

## Scope

- Tooling: Playwright Chromium, headless
- App URL: `http://127.0.0.1:3100`
- Env: `.env.local` YouTube API key + remote Supabase
- Mode: extract-only live smoke
- Not performed: recipe registration, ingredient registration, PR merge

Local Supabase demo was attempted first, but Docker image extraction failed with `no space left on device` inside Docker Desktop storage. The smoke then used the `.env.local` remote Supabase with a temporary test account. Cleanup succeeded: 5 `youtube_extraction_sessions` rows deleted, 1 public user row deleted, auth user deleted. `cooking_methods.code = auto_salt` count stayed `1 -> 1`, so this run did not create a new cooking method row.

## Result Summary

- URL discovery: YouTube Data API search, Korean recipe query
- URL count: 5 actual YouTube URLs
- Validate API: 5/5 success
- Extract API transport: 5/5 HTTP 200 success
- Registration-ready drafts: 0/5
- Useful partial extraction: 2/5
- Empty extraction: 3/5

The current implementation is technically stable against live API calls, but live extraction quality is still far from the product goal. The main gap is not server failure. The main gap is that many real videos either do not expose structured recipe text in the description, or the parser mistakes glossary/noise lines for ingredients and cannot extract usable steps.

## Tested URLs

| # | URL | Video | Result |
| --- | --- | --- | --- |
| 1 | `https://www.youtube.com/watch?v=zyrPXDfu8NE` | 콩이 이모, 양파볶음 short-style video | 0 ingredients, 0 steps, blocking: `ingredients`, `steps` |
| 2 | `https://www.youtube.com/watch?v=fppre9NkfJA` | 1분요리 뚝딱이형, 잡채 | 0 ingredients, 0 steps, blocking: `ingredients`, `steps` |
| 3 | `https://www.youtube.com/watch?v=3cdfYsC1b9U` | 후딱 레시피, 김밥 | 0 ingredients, 0 steps, blocking: `ingredients`, `steps` |
| 4 | `https://www.youtube.com/watch?v=Ryk_6X-ZvO0` | 딸을 위한 레시피, 잡채 | 25 ingredients, 8 resolved, 17 unresolved, 1 incomplete empty step |
| 5 | `https://www.youtube.com/watch?v=N0StPJWeKUg` | 오늘식탁, 샐러드 드레싱 | 4 ingredients, 1 resolved, 3 unresolved, 2 steps |

## Post-Fix Rerun

Parser hardening was applied after the initial run, then the same five URLs were re-tested through the live extract API.

| # | URL | Before | After | Remaining blocker |
| --- | --- | --- | --- | --- |
| 1 | `https://www.youtube.com/watch?v=zyrPXDfu8NE` | 0 ingredients, 0 steps | 0 ingredients, 0 steps | Description has promo/store text but no recipe body |
| 2 | `https://www.youtube.com/watch?v=fppre9NkfJA` | 0 ingredients, 0 steps | 0 ingredients, 0 steps | Description has general text/hashtags but no recipe body |
| 3 | `https://www.youtube.com/watch?v=3cdfYsC1b9U` | 0 ingredients, 0 steps | 12 ingredients, 6 steps | Some live terms required dictionary seed |
| 4 | `https://www.youtube.com/watch?v=Ryk_6X-ZvO0` | 25 ingredients with unit glossary noise, 1 incomplete step | 21 ingredients, glossary noise removed, 1 incomplete step | Description has ingredients but no real cooking-step block |
| 5 | `https://www.youtube.com/watch?v=N0StPJWeKUg` | 4 noisy ingredients, 2 steps | 7 clean ingredients, 2 steps | Some live terms required dictionary seed |

Confirmed parser fixes:

- Korean angle-bracket headings such as `《재료》` are recognized.
- Unit glossary lines such as `큰술:Tablespoon(15ml)` and `1컵(Cup)=...` are ignored.
- Mixed amount notation such as `파프리카 1/2개씩` and vulgar fractions is parsed.
- Parenthetical ingredient variants such as `돼지고기(잡채용)` normalize to the base ingredient.
- Fruit names ending with particle-like syllables, especially `사과`, are no longer truncated.
- Adverb prefixes such as `넉넉하게 레몬즙` are removed from ingredient names.

Confirmed dictionary seed follow-up:

- Added a slice 27 seed migration for true live-smoke ingredient gaps only.
- Newly covered examples: `맛살`, `부추`, `김`, `단무지`, `당면`, `파프리카`, `표고버섯`, `시금치`, `사과`.
- Newly covered aliases: `김밥 햄 -> 햄`, `맛소금 -> 소금`, `진/양조간장 -> 간장`, `양조 식초 -> 식초`, `간마늘 -> 다진마늘`.

Remote DB application evidence:

- Supabase CLI was relinked from the old distant project `geenkqiawwsvjrctvqhx` to the Seoul project `vfubnhtawezmheylfhsv`.
- `supabase/config.toml` DB major version was updated from `15` to `17` to match the Seoul project.
- Seoul project migration history now includes `20260525170000` and `20260526182000`.
- Verified on the Seoul project: live-smoke seed ingredients exist, and aliases resolve as expected (`간마늘 -> 다진마늘`, `김밥 햄 -> 햄`, `맛소금 -> 소금`, `양조 식초 -> 식초`, `진/양조간장 -> 간장`).

Expanded smoke evidence:

- See `live-smoke-expanded-2026-05-26.md` for the balanced 30-URL run.

## Why Corpus F1 Looked High

The corpus parser score is an offline extraction metric on saved description text fixtures. It answers: "If recipe text exists in the description, can the parser extract the expected ingredient/step text?"

The live smoke exposed a different product question: "Does a random real YouTube URL contain enough recipe text in the description to become registration-ready?" Two of the five tested URLs did not expose a recipe body in the description at all. A description-only parser cannot extract ingredients or steps from text that is not present, even when corpus F1 is high.

So the earlier F1 score was not mathematically wrong, but it was too narrow for the user-facing goal. It did not measure:

- source coverage: whether the YouTube description contains actual recipe text,
- registration readiness: whether extracted ingredients resolve against DB seed data,
- live creator format drift: headings, unit glossary lines, shorts-style descriptions, and missing step blocks.

This is why "parser F1 >= 0.90" and "actual URL import mostly fails" could both be true. Going forward, live readiness should be tracked separately from corpus F1 with at least these metrics: empty extraction rate, partial extraction rate, registration-ready rate, dictionary unresolved count, and missing-step count.

## Issues Found

1. **Empty successful extraction is too common**
   - 3/5 videos returned `success: true` but had no ingredients and no steps.
   - The UI can show this as an extraction result, but to a user it feels like the import failed.
   - Follow-up: add explicit low-quality extraction state/copy and measure empty live extraction rate separately from API success.

2. **Unit/glossary lines are parsed as ingredients**
   - Example extracted names: `Tablespoon(`, `teaspoon(`, `1컵(Cup)=`.
   - Fixed: parser now guards unit conversion/glossary lines before ingredient parsing.

3. **Quantity/name splitting still fails on Korean mixed notation**
   - Examples: `파프리카 ½개씩`, `넉넉하게 레몬즙`, standalone noise like `사`.
   - Fixed: fraction parsing, adverb prefix cleanup, and particle cleanup were hardened.

4. **Dictionary coverage remains weak for common live-video terms**
   - The 잡채 video produced 17 unresolved ingredients.
   - Examples needing review include live-text variants such as `돼지고기(잡채용)`, `파프리카 ½개씩`, and unit/noise-derived names.
   - Fixed for confirmed true ingredients: slice 27 seed migration adds live-smoke ingredients and aliases. Noise-derived names were intentionally excluded.

5. **Step extraction is the biggest blocker on semi-structured descriptions**
   - The best ingredient extraction case still produced an incomplete empty step with `steps[0].instruction`.
   - Follow-up: add step extraction fallbacks for numbered paragraphs, timestamp sections, and `만드는법` blocks that do not use the exact current heading patterns.

6. **Validate classification is mostly preview-only**
   - All five validate responses were `classification_status: uncertain`.
   - Follow-up: keep oEmbed preview cheap, but make the UI clearer that recipe 판단 happens after extraction, not at preview.

## Next Slice Candidates

1. Live smoke fixture/backlog slice: preserve these five URLs as a non-CI live smoke set and track empty/partial/ready rates.
2. Step fallback slice: extract steps from timestamp/numbered/paragraph blocks when explicit step headings are absent.
3. Source coverage fallback slice: caption/OCR/LLM/manual fallback decision for videos whose descriptions omit recipe text.
4. Live readiness metric slice: separate corpus F1 from empty/partial/registration-ready live URL rates.
