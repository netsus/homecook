# Expanded Live YouTube Smoke - 2026-05-26

## Scope

- App URL: `http://127.0.0.1:3100`
- Supabase project: `vfubnhtawezmheylfhsv` (Seoul project)
- Mode: extract-only live smoke
- Source discovery: YouTube Data API search
- Registration: not performed
- Cleanup: temporary auth user, public user row, and extraction sessions deleted successfully

This run expands the earlier 5-URL smoke into a balanced 30-URL sample. The goal was not to prove quality is good. The goal was to expose the next failure classes across varied creator description formats.

## Balanced Sample

| Bucket | Count |
| --- | ---: |
| structured | 5 |
| semi_structured | 5 |
| weak | 5 |
| shorts_weak | 5 |
| multi_component | 5 |
| baking_or_global | 5 |

## Result Summary

| Metric | Result |
| --- | ---: |
| Actual YouTube URLs | 30 |
| Extract API transport success | 30/30 |
| Registration-ready drafts | 0/30 |
| Empty extraction | 18/30 |
| Partial but blocked extraction | 12/30 |
| API errors | 0/30 |
| Extracted ingredients | 161 |
| Resolved ingredients | 76 |
| Unresolved ingredients | 85 |
| Extracted steps | 59 |
| Incomplete steps | 4 |

Outcome by bucket:

| Bucket | Empty | Partial blocked | Registration ready |
| --- | ---: | ---: | ---: |
| structured | 2 | 3 | 0 |
| semi_structured | 2 | 3 | 0 |
| weak | 3 | 2 | 0 |
| shorts_weak | 4 | 1 | 0 |
| multi_component | 3 | 2 | 0 |
| baking_or_global | 4 | 1 | 0 |

## Source Coverage Finding

Among the 18 empty extractions:

- 8 had an empty YouTube description.
- 4 had non-empty descriptions but no obvious ingredient/cooking signals.
- 6 had non-empty descriptions with recipe-like signals, so these are parser/source-format gaps rather than pure source absence.

This confirms the earlier concern: corpus F1 alone cannot represent live URL quality. The product needs separate live readiness metrics for source coverage, parser extraction, dictionary resolution, and step completeness.

## URL Results

Ingredient column format: `total/resolved/unresolved`. Step column format: `total/incomplete`.

| # | Bucket | Video ID | Outcome | Ingredients | Steps | First blockers | Title |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | structured | `-f-A4xLpDQE` | empty | 0/0/0 | 0/0 | ingredients, steps | 초보도 요리고수 만들어주는 무조건 외워야하는 한식 공식#간설파마후참깨#한식 |
| 2 | structured | `2UH5gMZoG14` | partial_blocked | 12/8/4 | 4/0 | ingredients[0].ingredient_id, ingredients[1].ingredient_id | 너무 맛있고 건강한 두부요리! 꼭 이렇게 드셔보세요! #레시피 |
| 3 | structured | `vNwAQmppzyM` | empty | 0/0/0 | 0/0 | ingredients, steps | 밥 필요 없어요 돌돌 말면 끝! |
| 4 | structured | `o1UIiJQeviQ` | partial_blocked | 4/2/2 | 1/0 | ingredients[0].ingredient_id, ingredients[1].ingredient_id | 금세 사라져요 #밑반찬만들기 |
| 5 | structured | `G6pH-cVeHEY` | partial_blocked | 9/6/3 | 10/0 | ingredients[1].ingredient_id, ingredients[7].ingredient_id | 명절마다 인기 폭발! 신박하고 간단한 영양만점 주머니 애호박전 #레시피 |
| 6 | semi_structured | `9fmd1LOTa-E` | partial_blocked | 1/0/1 | 1/1 | ingredients[0].ingredient_id, steps[0].instruction | 두부조림 이렇게 하는게 가장 맛있습니다. |
| 7 | semi_structured | `HoqkIzuqFrU` | partial_blocked | 16/4/12 | 1/0 | ingredients[0].ingredient_id, ingredients[1].ingredient_id | 마늘쫑에 '이것' 넣었더니 남편이 삼겹살 사온대요! |
| 8 | semi_structured | `qvqX-KaeU8s` | partial_blocked | 41/19/22 | 33/0 | ingredients[0].ingredient_id, ingredients[1].ingredient_id | 밑반찬 없어도 돼요! 이렇게 하면 일주일이 편한 한그릇 요리 7가지! |
| 9 | semi_structured | `eU6VoHNUTlM` | empty | 0/0/0 | 0/0 | ingredients, steps | 라면만큼 쉬운 레시피 |
| 10 | semi_structured | `_PUFZM6vZQw` | empty | 0/0/0 | 0/0 | ingredients, steps | 이제 불 앞에 서서 고기 삶지 마세요! |
| 11 | weak | `-sxyXlAFEhM` | empty | 0/0/0 | 0/0 | ingredients, steps | 황태채무침 보들보들하고 촉촉하게 고급반찬 |
| 12 | weak | `KAMZSgRN4WQ` | partial_blocked | 8/7/1 | 3/0 | ingredients[3].ingredient_id | 맛있는 콩나물무침 레시피 |
| 13 | weak | `wyPm621Q0TE` | empty | 0/0/0 | 0/0 | ingredients, steps | 반찬가게에서 가장 많이 팔림 |
| 14 | weak | `Wb_rU9Sdm80` | partial_blocked | 13/0/13 | 1/0 | ingredients[0].ingredient_id, ingredients[1].ingredient_id | 김무침 황금레시피 |
| 15 | weak | `NwofrlmaDAc` | empty | 0/0/0 | 0/0 | ingredients, steps | 백반집 시금치 무치는 방법 |
| 16 | shorts_weak | `ehIHFCBZp4E` | partial_blocked | 12/10/2 | 1/1 | ingredients[3].ingredient_id, steps[0].instruction | 어묵볶음 |
| 17 | shorts_weak | `6Re_tEaAjDQ` | empty | 0/0/0 | 0/0 | ingredients, steps | 류수영 무생채 황금레시피 |
| 18 | shorts_weak | `Rjfzpzj3bug` | empty | 0/0/0 | 0/0 | ingredients, steps | 절대 모르면 안되는 알배추 레시피 |
| 19 | shorts_weak | `FSOj5BPSM-Q` | empty | 0/0/0 | 0/0 | ingredients, steps | 항정살 수육 |
| 20 | shorts_weak | `B6wncU2E12g` | empty | 0/0/0 | 0/0 | ingredients, steps | 용암만들기 튜토리얼 |
| 21 | multi_component | `j0v1GCA3fxk` | partial_blocked | 29/7/22 | 1/1 | ingredients[0].ingredient_id, steps[0].instruction | 만능양념장 |
| 22 | multi_component | `Dc8ybaJMnK4` | empty | 0/0/0 | 0/0 | ingredients, steps | 고기 찍어먹는 간장소스 |
| 23 | multi_component | `VdEbuusFyRI` | empty | 0/0/0 | 0/0 | ingredients, steps | 업소용 만능 볶음요리소스 |
| 24 | multi_component | `_VV-51nh_LA` | partial_blocked | 10/9/1 | 2/0 | ingredients[6].ingredient_id | 만능양념장 |
| 25 | multi_component | `ex_5qaexoO8` | empty | 0/0/0 | 0/0 | ingredients, steps | 샤브샤브 찍먹 소스 |
| 26 | baking_or_global | `_kwOeDDOtww` | empty | 0/0/0 | 0/0 | ingredients, steps | 베이커스 퍼센트 |
| 27 | baking_or_global | `0zcXAJyfZNo` | empty | 0/0/0 | 0/0 | ingredients, steps | 기본 버터쿠키 레시피 |
| 28 | baking_or_global | `mOV2mP4DsQs` | partial_blocked | 6/4/2 | 1/1 | ingredients[1].ingredient_id, steps[0].instruction | 초코 케이크 |
| 29 | baking_or_global | `BRDUvwiXEQA` | empty | 0/0/0 | 0/0 | ingredients, steps | 설탕 없는 카스테라 |
| 30 | baking_or_global | `nOFkL1cGGjE` | empty | 0/0/0 | 0/0 | ingredients, steps | 밀가루 없이 치즈빵 |

## Failure Classes

1. Description source absence
   - Many shorts and search-result recipe videos have empty descriptions.
   - Description-only extraction cannot solve these; caption/OCR/manual/LLM fallback must be decided later.

2. Parser misses weak prose descriptions
   - Some non-empty descriptions contain recipe-like prose but no clean `재료`/`만드는 법` blocks.
   - Example pattern: long narrative paragraphs with amount/cooking signals embedded in sentences.

3. Parser noise is still leaking into ingredient names
   - Examples: `2`, `=`, `|`, `1스푼 =`, `두부 1모(`, `초간단 영양만점 ... 레시피`, `키친타월로 핏물을 제거하고`.
   - This must be fixed before adding broad DB seeds, otherwise the seed backlog will mix real ingredients with parser garbage.

4. Dictionary gaps remain after parser noise is filtered
   - Likely true ingredient/synonym candidates include `들기름`, `멸치액젓`, `냉동새우`, `크래미`, `마늘쫑`, `맛간장`, `매실액`, `쪽파`, `느타리버섯`, `닭다리살`, `사골육수`, `코인육수`, `청주`, `홍고추`.
   - These should be reviewed after parser-noise filtering and before external ingest.

5. Step completeness remains fragile
   - Partial results often had ingredients but only one incomplete fallback step.
   - Weak prose, shorts descriptions, and multi-component sauce videos need a better paragraph/timestamp step fallback.

## Recommended Next Work

Before Food Safety / 농식품올바로 ingest:

1. Add a live-smoke regression fixture set from the 6 non-empty empty-extraction cases and the high-noise partial cases.
2. Harden parser noise filters for numeric/glossary/separator/title/prose-action leakage.
3. Add paragraph-based weak-description extraction for non-empty descriptions with amount/cooking signals.
4. Add a reviewed seed migration only for true ingredient gaps observed after parser cleanup.

After that, external ingredient ingest will be cleaner because DB seeds will not be polluted by parser artifacts.

## Goal-Mode Final Rerun

Goal-mode follow-up was run after parser hardening and three additional reviewed seed migrations:

- `20260526203000_27_youtube_live_goal_dictionary_seed.sql`
- `20260526204500_27_youtube_live_goal_egg_synonym.sql`
- `20260526205500_27_youtube_live_goal_multi_recipe_seed.sql`

Final run artifact: `/tmp/homecook-youtube-live-smoke-balanced-30-goal-final-3.json`

| Metric | Original 30 URL run | Final goal-mode run |
| --- | ---: | ---: |
| Actual YouTube URLs | 30 | 30 |
| Extract API transport success | 30/30 | 30/30 |
| Registration-ready drafts | 0/30 | 10/30 |
| Empty extraction | 18/30 | 15/30 |
| Partial but blocked extraction | 12/30 | 5/30 |
| API errors | 0/30 | 0/30 |
| Extracted ingredients | 161 | 164 |
| Resolved ingredients | 76 | 164 |
| Unresolved ingredients | 85 | 0 |
| Extracted steps | 59 | 92 |
| Incomplete steps | 4 | 5 |

Registration-ready videos in the final run:

| # | Bucket | Video ID | Title |
| ---: | --- | --- | --- |
| 2 | structured | `2UH5gMZoG14` | 너무 맛있고 건강한 두부요리! 꼭 이렇게 드셔보세요! #레시피 |
| 4 | structured | `o1UIiJQeviQ` | 금세 사라져요 #밑반찬만들기 |
| 5 | structured | `G6pH-cVeHEY` | 명절마다 인기 폭발! 신박하고 간단한 영양만점 주머니 애호박전 #레시피 |
| 7 | semi_structured | `HoqkIzuqFrU` | 마늘쫑에 '이것' 넣었더니 남편이 삼겹살 사온대요! |
| 8 | semi_structured | `qvqX-KaeU8s` | 밑반찬 없어도 돼요! 이렇게 하면 일주일이 편한 한그릇 요리 7가지! |
| 11 | weak | `-sxyXlAFEhM` | 황태채무침 보들보들하고 촉촉하게 고급반찬 |
| 12 | weak | `KAMZSgRN4WQ` | 맛있는 콩나물무침 레시피 |
| 14 | weak | `Wb_rU9Sdm80` | 김무침 황금레시피 |
| 24 | multi_component | `_VV-51nh_LA` | 만능양념장 |
| 27 | baking_or_global | `0zcXAJyfZNo` | 기본 버터쿠키 레시피 |

Remaining partial blockers are no longer dictionary blockers. All 5 partial cases are blocked by missing concrete cooking instructions:

| # | Video ID | Parsed ingredients | Blocker |
| ---: | --- | ---: | --- |
| 6 | `9fmd1LOTa-E` | 15/15 resolved | `steps[0].instruction` |
| 16 | `ehIHFCBZp4E` | 11/11 resolved | `steps[0].instruction` |
| 21 | `j0v1GCA3fxk` | 10/10 resolved | `steps[0].instruction` |
| 28 | `mOV2mP4DsQs` | 7/7 resolved | `steps[0].instruction` |
| 29 | `BRDUvwiXEQA` | 9/9 resolved | `steps[0].instruction` |

The remaining 15 empty cases were checked against the YouTube descriptions. Most are empty descriptions, promotional descriptions, or descriptions that refer to an external "details" panel rather than containing concrete ingredients and cooking instructions. Description-only extraction should not claim registration-ready for those without caption/OCR/manual fallback.
