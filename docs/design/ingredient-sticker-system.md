# Ingredient Sticker System

Last updated: 2026-06-29

This document locks the approved pantry ingredient image direction before scaling it to the full ingredient catalog.

## Approved Direction

- Concept: collectible diary sticker with a small plush mascot feel.
- Current sample format: square `512x512` PNG for app assets.
- Full batch format: prefer compressed WebP or an equivalent optimized raster format when the batch tooling is available. Keeping all 889 assets as uncompressed PNG would make the repository unnecessarily large.
- Background: very light warm gray or off-white, kept simple enough to read inside small pantry cards.
- Shared identity point: thick white sticker border, soft drop shadow, tiny blush/face details, small decorative sparkles or dots.
- Subject rule: the ingredient must remain obvious at small size. The decorative face can be playful, but it must not hide the ingredient shape.
- Text rule: no text inside the image. Ingredient names remain UI text.
- Current sample asset path: `public/assets/ingredients/plush/`.
- Current manifest: `public/assets/ingredients/plush/manifest.json`.

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

| Ingredient | File |
| --- | --- |
| 소금 | `salt.png` |
| 설탕 | `sugar.png` |
| 밥 | `cooked-rice.png` |
| 쌀 | `rice.png` |
| 양파 | `onion.png` |
| 대파 | `green-onion.png` |
| 간장 | `soy-sauce.png` |
| 버터 | `butter.png` |
| 닭가슴살 | `chicken-breast.png` |

## Prompt Template

Use one prompt per ingredient. Do not combine multiple different ingredients into one generated image.

```text
Use case: stylized-concept
Asset type: 512x512 pantry ingredient app sticker
Primary request: Create one collectible diary sticker image for the Korean ingredient "<INGREDIENT_NAME>".
Scene/backdrop: clean square icon composition on a very light warm gray background.
Subject: one simple, instantly recognizable version of "<INGREDIENT_NAME>" as the main object.
Style/medium: cute mini plush diary sticker, soft felt texture, rounded handmade shape, polished app asset.
Composition/framing: centered, generous padding, no cropping, readable at 34px and 56px.
Lighting/mood: soft studio light, gentle shadow only under the sticker.
Color palette: natural ingredient colors with a unified white sticker border and small pastel accent details.
Materials/textures: plush felt, subtle fabric grain, raised puffy sticker edge.
Constraints: no text, no labels, no watermark, no extra unrelated ingredients, no plate unless the ingredient requires a container to be recognized.
Avoid: photorealism, complex background, busy props, realistic grocery packaging, hard shadows, dark background.
```

## Ingredient-Specific Guidance

- Powder or grain ingredients: use a small pouch, bowl, scoop, or sprinkle shape so the material is recognizable.
- Sauces and oils: use a simple bottle, jar, spoon pool, or squeeze shape. Avoid brand-like packaging.
- Meat and seafood: use a clean prepared ingredient shape, not a raw-looking or unpleasant cut. Keep it friendly and food-safe.
- Leafy vegetables: simplify into a clear silhouette with 2-4 main leaves.
- Similar ingredients: keep a differentiating detail, such as bottle cap color, cut shape, grain shape, or garnish-like accent.
- Cooked vs uncooked: treat `밥` and `쌀` as separate assets. `밥` uses the cooked rice bowl sample, `쌀` uses the uncooked rice sack sample.

## Batch Plan

1. Keep the 9 approved samples as the visual anchor.
2. Generate in category batches of 40-60 ingredients so review stays manageable.
3. Start with high-frequency pantry ingredients before rare external ingredients.
4. After every batch, update `manifest.json` and verify every referenced image exists.
5. Only wire broader UI coverage after the manifest is complete enough to avoid a mixed visual surface.

Recommended order:

| Batch | Scope |
| --- | --- |
| 1 | common pantry staples and current bundle ingredients |
| 2 | remaining 양념 |
| 3 | 채소 |
| 4 | 곡류 and 유제품 |
| 5 | 육류 and 해산물 |
| 6 | 과일 and 기타 |

## QA Checklist

- The ingredient is recognizable at `34x34` and `56x56`.
- The subject is centered and not cropped.
- The white sticker border is present.
- The background stays simple and consistent.
- There is no text or brand-like label.
- The file is square `512x512`.
- The manifest key exactly matches `ingredients.standard_name`.
- The image path starts with `/assets/ingredients/plush/`.
