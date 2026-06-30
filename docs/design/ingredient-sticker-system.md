# Ingredient Sticker System

Last updated: 2026-06-30

This document locks the approved pantry ingredient image direction before scaling it to the full ingredient catalog.

## Approved Direction

- Concept: collectible diary sticker with a small plush mascot feel.
- Current sample format: square `512x512` WebP, q95.
- Full batch format: compressed WebP q95. Keeping all 889 assets as uncompressed PNG would make the repository unnecessarily large.
- Background: very light warm gray or off-white, kept simple enough to read inside small pantry cards.
- Shared identity point: thick white sticker border, crisp outer outline, soft plush/felt ingredient body, and crisp flat graphic face details.
- Subject rule: the ingredient must remain obvious at small size. The decorative face can be playful, but it must not hide the ingredient shape.
- Framing rule: the ingredient should fill about 90% of the square canvas.
- Face rule: eyes, mouth, and blush must read as crisp flat graphics, not fuzzy felt texture.
- Decoration rule: no surrounding stars, pieces, crystals, colored dots, sparkles, or unrelated decorative props.
- Raw meat limb rule: use arms only or no limbs. Do not force arms/legs when they look unnatural.
- Text rule: no text inside the image. Ingredient names remain UI text.
- Current sample asset path: `public/assets/ingredients/plush-v2/`.
- Current manifest: `public/assets/ingredients/plush-v2/manifest.json`.

## Inventory Snapshot

Run:

```bash
node scripts/ingredient-sticker-inventory.mjs --summary --write-md docs/design/ingredient-sticker-inventory.md
```

Current seed-derived inventory:

| Category | Count |
| --- | ---: |
| 채소 | 244 |
| 양념 | 165 |
| 곡류 | 134 |
| 과일 | 120 |
| 육류 | 89 |
| 해산물 | 84 |
| 유제품 | 29 |
| 기타 | 24 |
| Total | 889 |

## Approved Samples

Initial visual anchor:

| Ingredient | File |
| --- | --- |
| 소금 | `salt.webp` |
| 설탕 | `sugar.webp` |
| 밥 | `cooked-rice.webp` |
| 쌀 | `rice.webp` |
| 양파 | `onion.webp` |
| 대파 | `green-onion.webp` |
| 간장 | `soy-sauce.webp` |
| 버터 | `butter.webp` |
| 닭가슴살 | `chicken-breast.webp` |

Batch 1 extension:

| Ingredient | File |
| --- | --- |
| 계란 | `egg.webp` |
| 마늘 | `garlic.webp` |
| 감자 | `potato.webp` |
| 당근 | `carrot.webp` |
| 애호박 | `zucchini.webp` |
| 두부 | `tofu.webp` |
| 돼지고기 | `pork.webp` |
| 소고기 | `beef.webp` |
| 닭고기 | `chicken.webp` |
| 고춧가루 | `red-pepper-powder.webp` |
| 후추 | `black-pepper.webp` |
| 참기름 | `sesame-oil.webp` |

Pilot 001 extension:

- Contact sheet: `public/assets/ingredients/plush-v2/preview-pilot-001.png`
- Status in manifest: `approved-pilot-001`
- Added ingredients: 고추장, 된장, 식용유, 올리브유, 우유, 치즈, 밀가루, 소면, 당면, 김치, 새우, 연어, 오이, 청양고추, 방울토마토, 고구마, 가지, 표고버섯, 느타리버섯, 팽이버섯, 양배추, 무, 깻잎, 상추, 배추, 부추, 콩나물, 토마토, 딸기, 바나나.

## Prompt Template

Use one prompt per ingredient. Do not combine multiple different ingredients into one generated image.

```text
Use case: stylized-concept
Asset type: 512x512 pantry ingredient app sticker
Primary request: Create one collectible diary sticker image for the Korean ingredient "<INGREDIENT_NAME>".
Scene/backdrop: clean square icon composition on a very light warm gray background.
Subject: one simple, instantly recognizable version of "<INGREDIENT_NAME>" as the main object, optionally with small plush hands/feet only when they improve the collectible sticker feel without hiding the ingredient shape.
Style/medium: cute mini plush diary sticker, soft felt texture, rounded handmade shape, polished app asset.
Composition/framing: centered, fills about 90% of the square canvas, no cropping, readable at 34px and 56px.
Lighting/mood: soft studio light, gentle shadow only under the sticker.
Color palette: natural ingredient colors with a unified white sticker border and small pastel accent details.
Materials/textures: plush felt body, subtle fabric grain, raised puffy sticker edge, crisp outer outline.
Face details: eyes, mouth, and blush are crisp flat graphic shapes on top of the plush body.
Constraints: no text, no labels, no watermark, no extra unrelated ingredients, no plate unless the ingredient requires a container to be recognized.
Avoid: photorealism, complex background, busy props, realistic grocery packaging, hard shadows, dark background, surrounding stars, pieces, crystals, colored dots, sparkles, white blotch cleanup artifacts.
```

## Ingredient-Specific Guidance

- Powder or grain ingredients: use a small pouch, bowl, scoop, or sprinkle shape so the material is recognizable.
- Sauces and oils: use a simple bottle, jar, spoon pool, or squeeze shape. Avoid brand-like packaging.
- Meat and seafood: use a clean prepared ingredient shape, not a raw-looking or unpleasant cut. Keep it friendly and food-safe.
- Leafy vegetables: simplify into a clear silhouette with 2-4 main leaves.
- Similar ingredients: keep a differentiating detail, such as bottle cap color, cut shape, grain shape, or garnish-like accent.
- Cooked vs uncooked: treat `밥` and `쌀` as separate assets. `밥` uses the cooked rice bowl sample, `쌀` uses the uncooked rice sack sample.

## Batch Plan

1. Keep the 21 approved plush-v2 images as frozen visual anchors.
2. Generate a seed-derived missing list with `node scripts/ingredient-sticker-generation-plan.mjs`.
3. Generate only the first pilot batch before starting large-scale batches.
4. Review a contact sheet and regenerate failures before promoting images into `public/assets/ingredients/plush-v2/`.
5. Use rollout batches of about 100 assets after the pilot is approved.
6. After every batch, update `manifest.json` and verify every referenced image exists.
7. Only wire broader UI coverage after the manifest is complete enough to avoid a mixed visual surface.

Recommended order:

| Batch | Scope |
| --- | --- |
| pilot-001 | 30 common missing ingredients across categories |
| rollout-001+ | remaining missing ingredients in about 100-asset batches |

## QA Checklist

- The ingredient is recognizable at `34x34` and `56x56`.
- The subject is centered, not cropped, and fills about 90% of the canvas.
- The white sticker border is present.
- The outer silhouette is crisp.
- Eyes, mouth, and blush are crisp flat graphics.
- The background stays simple and consistent.
- There are no surrounding stars, pieces, crystals, colored dots, sparkles, or unrelated decorations.
- There is no text or brand-like label.
- The file is square `512x512` WebP q95.
- The manifest key exactly matches `ingredients.standard_name`.
- The image path starts with `/assets/ingredients/plush-v2/`.
