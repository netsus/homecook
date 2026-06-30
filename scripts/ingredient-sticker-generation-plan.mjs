#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function getNumberArg(flag, fallback) {
  const value = getArgValue(flag);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

const writeJsonPath = getArgValue("--write-json");
const writeMarkdownPath = getArgValue("--write-md");
const manifestPath = getArgValue("--manifest") ?? "public/assets/ingredients/plush-v2/manifest.json";
const generatedAt = getArgValue("--generated-at") ?? new Date().toISOString();
const pilotSize = getNumberArg("--pilot-size", 30);
const rolloutBatchSize = getNumberArg("--rollout-batch-size", 100);

const STYLE_CONTRACT = {
  format: {
    width: 512,
    height: 512,
    type: "image/webp",
    quality: 95,
  },
  composition: {
    subjectFill: "about 90% of the square canvas",
    stickerBorder: "clear white diary sticker border",
    background: "clean soft light gray or off-white",
    text: "none",
    decorativeExtras: "none",
  },
  rendering: {
    material: "soft felt/plush ingredient body",
    outline: "crisp, visible outer silhouette",
    face: "crisp flat graphic eyes and mouth",
    blush: "crisp flat graphic blush, not felt texture",
  },
  limbPolicy: {
    default: "arms and legs allowed when they fit the ingredient",
    rawMeat: "arms only or no limbs",
    liquidPowderSauce: "small arms optional; legs usually omitted",
  },
  avoid: [
    "text",
    "labels",
    "brand packaging",
    "surrounding stars",
    "surrounding pieces",
    "crystals",
    "colored dots",
    "sparkles",
    "busy props",
    "white blotch cleanup artifacts",
  ],
};

const CATEGORY_ORDER = ["양념", "채소", "곡류", "유제품", "육류", "해산물", "과일", "기타"];

const PILOT_PRIORITY_NAMES = [
  "고추장",
  "된장",
  "식용유",
  "올리브유",
  "우유",
  "치즈",
  "밀가루",
  "소면",
  "당면",
  "김치",
  "새우",
  "연어",
  "오이",
  "청양고추",
  "방울토마토",
  "고구마",
  "가지",
  "표고버섯",
  "느타리버섯",
  "팽이버섯",
  "양배추",
  "무",
  "깻잎",
  "상추",
  "배추",
  "부추",
  "콩나물",
  "토마토",
  "딸기",
  "바나나",
  "사과",
  "레몬",
  "식초",
  "맛술",
  "참깨",
  "들기름",
  "올리고당",
  "전분",
  "옥수수전분",
  "빵가루",
  "생크림",
  "김",
  "미역",
  "멸치",
  "오징어",
  "고등어",
  "조개",
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function resolveOutputPath(outputPath) {
  return path.isAbsolute(outputPath) ? outputPath : path.join(repoRoot, outputPath);
}

function readInventory() {
  const result = spawnSync(process.execPath, ["scripts/ingredient-sticker-inventory.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to read ingredient inventory.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  return JSON.parse(result.stdout);
}

function countBy(items, getKey) {
  return Object.fromEntries(
    [...items.reduce((counts, item) => {
      const key = getKey(item) ?? "미분류";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right, "ko")),
  );
}

function includesAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}

function getGenerationBucket(ingredient) {
  const name = ingredient.standardName;
  const category = ingredient.category ?? "미분류";

  if (name.includes("김치")) return "kimchi";

  if (includesAny(name, ["바나나", "망고", "파인애플", "키위", "아보카도"])) {
    return "fruit";
  }

  if (category === "육류") {
    if (includesAny(name, ["계란", "달걀", "알"])) return "egg";
    if (includesAny(name, ["햄", "소시지", "베이컨", "육포", "순대", "돈까스"])) return "processed-meat";
    return "raw-meat";
  }

  if (category === "해산물") {
    if (includesAny(name, ["김", "미역", "다시마", "파래", "톳", "매생이"])) return "seaweed";
    if (includesAny(name, ["조개", "굴", "홍합", "전복", "가리비", "소라", "골뱅이", "꼬막", "바지락"])) return "shellfish";
    if (includesAny(name, ["새우", "가재", "랍스터"]) || name === "게" || name.includes("꽃게")) return "crustacean";
    return "fish-or-seafood";
  }

  if (category === "양념") {
    if (includesAny(name, ["기름", "오일", "식용유", "들기름", "참기름"]) || name.endsWith("유")) return "oil";
    if (includesAny(name, ["가루", "분", "전분", "파우더"])) return "powder";
    if (includesAny(name, ["장", "소스", "페이스트", "잼", "청", "시럽", "꿀", "액", "즙", "식초", "맛술"])) {
      return "sauce-or-liquid";
    }
    return "spice-or-seasoning";
  }

  if (category === "채소") {
    if (name.includes("토마토")) return "vegetable";
    if (name.includes("버섯") || includesAny(name, ["송이", "느타리", "팽이", "표고"])) return "mushroom";
    if (includesAny(name, ["고추", "파프리카", "피망"])) return "pepper-vegetable";
    if (includesAny(name, ["잎", "상추", "깻잎", "배추", "시금치", "나물", "갓", "미나리", "부추", "쑥", "취", "케일"])) {
      return "leafy-vegetable";
    }
    if (includesAny(name, ["무", "감자", "고구마", "연근", "우엉", "도라지", "더덕"]) || name === "마" || name.endsWith("참마")) {
      return "root-vegetable";
    }
    if (includesAny(name, ["파", "마늘", "양파", "쪽파"])) return "allium";
    return "vegetable";
  }

  if (category === "과일") {
    if (includesAny(name, ["말랭이", "건포도", "곶감"])) return "dried-fruit";
    if (includesAny(name, ["귤", "오렌지", "레몬", "라임", "자몽", "유자", "한라봉"])) return "citrus-fruit";
    if (includesAny(name, ["딸기", "블루베리", "라즈베리", "복분자", "오디"])) return "berry-fruit";
    return "fruit";
  }

  if (category === "곡류") {
    if (includesAny(name, ["면", "국수", "당면", "파스타", "스파게티"])) return "noodle";
    if (includesAny(name, ["가루", "분", "전분", "밀가루"])) return "grain-powder";
    if (includesAny(name, ["콩", "팥", "완두", "렌틸"])) return "bean";
    if (includesAny(name, ["떡", "빵"])) return "rice-cake-or-bread";
    return "grain";
  }

  if (category === "유제품") {
    if (name.includes("치즈")) return "cheese";
    if (includesAny(name, ["우유", "크림", "요거트", "요구르트"])) return "dairy-liquid";
    return "dairy";
  }

  return "misc";
}

function getLimbPolicy(bucket) {
  if (bucket === "raw-meat") return "arms-only-or-none";
  if (["oil", "powder", "sauce-or-liquid", "grain-powder", "dairy-liquid"].includes(bucket)) {
    return "optional-small-arms-no-legs";
  }
  if (["fish-or-seafood", "shellfish", "crustacean", "seaweed"].includes(bucket)) {
    return "optional-arms-no-forced-legs";
  }
  return "arms-and-legs-allowed";
}

function getReuseGroup(ingredient, bucket) {
  const name = ingredient.standardName;

  if (bucket === "raw-meat") {
    if (name.includes("닭")) return "meat:chicken";
    if (name.includes("돼지")) return "meat:pork";
    if (includesAny(name, ["소고기", "쇠고기", "한우"])) return "meat:beef";
    if (name.includes("오리")) return "meat:duck";
    return "meat:other-raw";
  }

  if (bucket === "egg") return "egg";
  if (bucket === "mushroom") return "vegetable:mushroom";
  if (bucket === "leafy-vegetable") return "vegetable:leafy";
  if (bucket === "powder" || bucket === "grain-powder") return "powder";
  if (bucket === "oil") return "oil";
  if (bucket === "sauce-or-liquid") return "sauce-or-liquid";
  if (bucket === "noodle") return "grain:noodle";
  if (bucket === "seaweed") return "seafood:seaweed";
  if (bucket === "shellfish") return "seafood:shellfish";
  if (bucket === "crustacean") return "seafood:crustacean";
  if (bucket === "cheese") return "dairy:cheese";
  if (bucket === "kimchi") return "kimchi";

  return `unique:${name}`;
}

function getCategoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category ?? "");
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function getProposedAssetPath(catalogIndex) {
  return `/assets/ingredients/plush-v2/asset-${String(catalogIndex).padStart(4, "0")}.webp`;
}

function summarizeBatch(id, kind, ingredients) {
  return {
    id,
    kind,
    status: "planned",
    count: ingredients.length,
    categoryCounts: countBy(ingredients, (ingredient) => ingredient.category),
    bucketCounts: countBy(ingredients, (ingredient) => ingredient.generationBucket),
    ingredients: ingredients.map((ingredient) => ({
      standardName: ingredient.standardName,
      category: ingredient.category,
      generationBucket: ingredient.generationBucket,
      limbPolicy: ingredient.limbPolicy,
      assetStrategy: ingredient.assetStrategy,
      proposedSrc: ingredient.proposedSrc,
    })),
  };
}

function buildPilotBatch(missingIngredients) {
  const byName = new Map(missingIngredients.map((ingredient) => [ingredient.standardName, ingredient]));
  const selected = [];
  const selectedNames = new Set();

  for (const name of PILOT_PRIORITY_NAMES) {
    const ingredient = byName.get(name);
    if (!ingredient || selectedNames.has(name)) continue;
    selected.push(ingredient);
    selectedNames.add(name);
    if (selected.length >= pilotSize) return selected;
  }

  let categoryIndex = 0;
  while (selected.length < pilotSize && selected.length < missingIngredients.length) {
    const category = CATEGORY_ORDER[categoryIndex % CATEGORY_ORDER.length];
    const next = missingIngredients.find(
      (ingredient) => ingredient.category === category && !selectedNames.has(ingredient.standardName),
    );

    if (next) {
      selected.push(next);
      selectedNames.add(next.standardName);
    } else if (categoryIndex > CATEGORY_ORDER.length + missingIngredients.length) {
      break;
    }

    categoryIndex += 1;
  }

  return selected;
}

function buildRolloutBatches(missingIngredients, pilotBatch) {
  const pilotNames = new Set(pilotBatch.map((ingredient) => ingredient.standardName));
  const remaining = missingIngredients
    .filter((ingredient) => !pilotNames.has(ingredient.standardName))
    .sort((left, right) => {
      const categoryDiff = getCategoryRank(left.category) - getCategoryRank(right.category);
      if (categoryDiff !== 0) return categoryDiff;
      return left.standardName.localeCompare(right.standardName, "ko");
    });

  const batches = [];
  for (let index = 0; index < remaining.length; index += rolloutBatchSize) {
    batches.push(
      summarizeBatch(
        `rollout-${String(batches.length + 1).padStart(3, "0")}`,
        "rollout",
        remaining.slice(index, index + rolloutBatchSize),
      ),
    );
  }

  return batches;
}

function buildPlan() {
  const inventory = readInventory();
  const manifest = readJson(manifestPath);
  const approvedNames = new Set(Object.keys(manifest.items ?? {}));

  const approvedExisting = Object.entries(manifest.items ?? {})
    .map(([standardName, item]) => ({
      standardName,
      src: item.src,
      currentStatus: item.status,
      planStatus: "approved-existing",
    }))
    .sort((left, right) => left.standardName.localeCompare(right.standardName, "ko"));

  const enrichedMissing = inventory.ingredients
    .map((ingredient, index) => {
      const catalogIndex = index + 1;
      const generationBucket = getGenerationBucket(ingredient);
      const reuseGroup = getReuseGroup(ingredient, generationBucket);

      return {
        ...ingredient,
        catalogIndex,
        generationBucket,
        reuseGroup,
        limbPolicy: getLimbPolicy(generationBucket),
        proposedSrc: getProposedAssetPath(catalogIndex),
      };
    })
    .filter((ingredient) => !approvedNames.has(ingredient.standardName));

  const reuseGroupCounts = enrichedMissing.reduce((counts, ingredient) => {
    counts.set(ingredient.reuseGroup, (counts.get(ingredient.reuseGroup) ?? 0) + 1);
    return counts;
  }, new Map());

  const missingIngredients = enrichedMissing.map((ingredient) => ({
    ...ingredient,
    assetStrategy: reuseGroupCounts.get(ingredient.reuseGroup) > 1 ? "alias-review-or-unique" : "unique",
  }));

  const pilotBatch = buildPilotBatch(missingIngredients);
  const rolloutBatches = buildRolloutBatches(missingIngredients, pilotBatch);
  const aliasReviewGroups = [...reuseGroupCounts.entries()]
    .filter(([group, count]) => count > 1 && !group.startsWith("unique:"))
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .map(([reuseGroup, count]) => ({
      reuseGroup,
      count,
      sampleIngredients: missingIngredients
        .filter((ingredient) => ingredient.reuseGroup === reuseGroup)
        .slice(0, 8)
        .map((ingredient) => ingredient.standardName),
    }));

  return {
    generatedAt,
    source: {
      inventory: inventory.source,
      manifestPath,
    },
    styleContract: STYLE_CONTRACT,
    summary: {
      totalIngredientCount: inventory.total,
      approvedExistingCount: approvedExisting.length,
      missingIngredientCount: missingIngredients.length,
      duplicateStandardNameCount: inventory.duplicateStandardNameCount,
      pilotBatchSize: pilotBatch.length,
      rolloutBatchSize,
      rolloutBatchCount: rolloutBatches.length,
      aliasReviewGroupCount: aliasReviewGroups.length,
    },
    approvedExisting,
    missingCategoryCounts: countBy(missingIngredients, (ingredient) => ingredient.category),
    missingBucketCounts: countBy(missingIngredients, (ingredient) => ingredient.generationBucket),
    aliasReviewGroups,
    firstPilotBatch: summarizeBatch("pilot-001", "pilot", pilotBatch),
    rolloutBatches,
    missingIngredients,
  };
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map((column) => column.align === "right" ? "---:" : "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${columns.map((column) => String(column.value(row) ?? "")).join(" | ")} |`)
    .join("\n");

  return [header, divider, body].filter(Boolean).join("\n");
}

function toMarkdown(plan) {
  const categoryRows = Object.entries(plan.missingCategoryCounts).map(([category, count]) => ({ category, count }));
  const pilotRows = plan.firstPilotBatch.ingredients;
  const rolloutRows = plan.rolloutBatches.map((batch) => ({
    id: batch.id,
    count: batch.count,
    topCategories: Object.entries(batch.categoryCounts)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 3)
      .map(([category, count]) => `${category} ${count}`)
      .join(", "),
  }));
  const aliasRows = plan.aliasReviewGroups.slice(0, 12);

  return `# Ingredient Plush V2 Generation Plan

Generated by \`node scripts/ingredient-sticker-generation-plan.mjs --write-json docs/design/ingredient-sticker-generation-plan.json --write-md docs/design/ingredient-sticker-generation-plan.md\`.

## Scope

- Total seed-derived ingredients: ${plan.summary.totalIngredientCount}
- Frozen approved plush-v2 images: ${plan.summary.approvedExistingCount}
- Missing plush-v2 candidates: ${plan.summary.missingIngredientCount}
- Duplicate standard names skipped by inventory: ${plan.summary.duplicateStandardNameCount}
- Next pilot batch size: ${plan.summary.pilotBatchSize}
- Rollout batch size after pilot: ${plan.summary.rolloutBatchSize}
- Planned rollout batch count after pilot: ${plan.summary.rolloutBatchCount}

## Frozen Existing Assets

The existing ${plan.summary.approvedExistingCount} plush-v2 images are approved and must not be regenerated during the expansion.

${markdownTable(plan.approvedExisting, [
  { label: "Ingredient", value: (row) => row.standardName },
  { label: "Source", value: (row) => row.src },
  { label: "Plan status", value: (row) => row.planStatus },
])}

## Locked Style Contract

- Format: 512px square WebP, q95.
- Framing: ingredient subject fills about 90% of the canvas.
- Border: clear white diary sticker border.
- Texture: soft felt/plush body texture.
- Outline: crisp, visible outer silhouette.
- Face: eyes and mouth are crisp flat graphics.
- Blush: blush is also a crisp flat graphic, not felt texture.
- Decorations: no surrounding stars, pieces, crystals, color dots, sparkles, or unrelated props.
- Text: no text, labels, watermarks, or brand packaging.
- Raw meat limbs: arms only or no limbs; do not force arms/legs when they look unnatural.

## Missing Category Counts

${markdownTable(categoryRows, [
  { label: "Category", value: (row) => row.category },
  { label: "Missing count", align: "right", value: (row) => row.count },
])}

## Next Pilot Batch

The next pilot intentionally mixes categories so style failures are caught before hundreds of images are generated.

${markdownTable(pilotRows, [
  { label: "Ingredient", value: (row) => row.standardName },
  { label: "Category", value: (row) => row.category },
  { label: "Bucket", value: (row) => row.generationBucket },
  { label: "Limb policy", value: (row) => row.limbPolicy },
  { label: "Asset strategy", value: (row) => row.assetStrategy },
  { label: "Proposed src", value: (row) => row.proposedSrc },
])}

## Alias Review Groups

These groups should be reviewed before generating unique images. If items are visually indistinguishable at pantry size, multiple manifest entries can point to one approved asset.

${markdownTable(aliasRows, [
  { label: "Reuse group", value: (row) => row.reuseGroup },
  { label: "Count", align: "right", value: (row) => row.count },
  { label: "Samples", value: (row) => row.sampleIngredients.join(", ") },
])}

## Rollout Batches

${markdownTable(rolloutRows, [
  { label: "Batch", value: (row) => row.id },
  { label: "Count", align: "right", value: (row) => row.count },
  { label: "Largest categories", value: (row) => row.topCategories },
])}

## Execution Gates

1. Generate only \`pilot-001\` first.
2. Produce a contact sheet before promoting any pilot image into \`public/assets/ingredients/plush-v2/\`.
3. Reject and regenerate images with decorations, fuzzy face/blush, weak outline, tiny subject framing, text, brand packaging, or white blotch artifacts.
4. Promote approved WebP files and manifest entries only after visual review.
5. Repeat rollout batches in chunks of about 100 assets, keeping existing 21 files untouched.
`;
}

const plan = buildPlan();

if (writeJsonPath) {
  const outputPath = resolveOutputPath(writeJsonPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
}

if (writeMarkdownPath) {
  const outputPath = resolveOutputPath(writeMarkdownPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, toMarkdown(plan));
}

if (!writeJsonPath && !writeMarkdownPath) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}
