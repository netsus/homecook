export const INACTIVE_INGREDIENT_IDS = [
  "b530cbdf-7d78-4dca-b43e-7b43a9114084",
  "bfc4f826-5d6b-426d-9e26-9177eb89b086",
  "6752fedc-101f-484f-97dd-da34f1954980",
  "ae9befb4-ba46-4761-922d-cef4dbad93e1",
  "c3b23d90-0cf1-4820-8be4-531eede986f1",
  "fa597781-a191-45f7-a3e8-3a19931858b2",
  "3bc3fefb-c280-46fe-83fa-937ddb14f06b",
  "167bda6c-abdf-4057-84c1-d013ce38312f",
  "ecf31d7f-dcf9-4e02-87aa-3d41cc54f582",
  "ccddaf85-4700-47f6-97cd-7c1c1b4d6b30",
  "0a128a83-b012-4197-83a2-1895b77fd882",
  "07694d02-8cd7-4047-ac4d-4078739c3c73",
  "dfa26343-0d41-4750-9e8f-b6cea850e188",
  "49488a14-bcce-41c0-8a4f-24a4691b273d",
  "5363ddb9-ee58-4b8a-884d-a84b80fd064c",
  "99a58a07-e130-4299-a058-3cb424edeb89",
  "fd75d45d-0d54-48c8-9b1b-04b750666c99",
  "cdf20482-adc3-48dc-a48f-a7658fed61d2",
  "47528b57-dc5b-4391-878a-1ded89521a60",
  "319d0dce-12d7-45ef-b8db-2ff521d9f89b",
  "31eac531-4b86-4c91-86ae-cc62e1f36984",
  "9361798b-6518-43e6-a19a-ef3328e1ab3f",
  "5a3c50a9-3c3e-4aa6-a59e-1786f4877f13",
  "49587faf-2b79-441a-b6da-6112381ebc6b",
  "9f094241-b1da-4481-b140-8dedcf80563a",
  "cfaabb5e-482d-481b-8016-45bac54d1a01",
] as const;

const INACTIVE_INGREDIENT_ID_SET = new Set<string>(INACTIVE_INGREDIENT_IDS);

export const INACTIVE_INGREDIENT_NAMES = [
  "데친 노지 갯기름나물",
  "데친 노지 어린잎 갯기름나물",
  "데친 하우스 갯기름나물",
  "데친 하우스 어린잎 갯기름나물",
  "삶은 돼지고기 갈비",
  "삶은 돼지고기 뒷다리",
  "삶은 돼지고기 등심",
  "삶은 돼지고기 사태",
  "삶은 돼지고기 안심",
  "삶은 돼지고기 앞다리 수육용",
  "노지 갯기름나물",
  "노지 어린잎 갯기름나물",
  "하우스 갯기름나물",
  "하우스 어린잎 갯기름나물",
  "생 돼지고기 갈비",
  "생 돼지고기 목심",
  "생 돼지고기 사태",
  "돼지고기 살코기",
  "생 돼지고기 안심",
  "돼지고기 앞다리 수육용",
  "팬에 구운 돼지고기 갈비",
  "팬에 구운 돼지고기 뒷다리",
  "팬에 구운 돼지고기 등심",
  "팬에 구운 돼지고기 목심",
  "팬에 구운 돼지고기 사태",
  "팬에 구운 돼지고기 안심",
] as const;

const INACTIVE_INGREDIENT_NAME_SET = new Set<string>(INACTIVE_INGREDIENT_NAMES);

const STATE_PREFIX_BY_SUFFIX = new Map<string, string>([
  ["생것", ""], ["데친것", "데친"], ["말린것", "말린"], ["삶은것", "삶은"],
  ["통조림", "통조림"], ["가루", "가루"], ["찐것", "찐"],
  ["구운것", "구운"], ["냉동", "냉동"], ["구운것(팬)", "팬에 구운"],
  ["말린것, 삶은것", "말리거나 삶은"], ["삶아서 말린것", "삶아 말린"],
  ["볶은것", "볶은"], ["염장", "염장"], ["조미하여 말린것", "조미해 말린"],
  ["구운것(오븐)", "오븐에 구운"], ["통조림, 조미", "조미 통조림"],
  ["삶아서 말린것, 삶은것", "삶아 말리거나 삶은"], ["끓인것", "끓인"],
  ["말린것(자연건조)", "자연 건조한"], ["튀긴것(튀김옷)", "튀김옷 입혀 튀긴"],
  ["동결건조", "동결 건조한"], ["생것, 삶은것", "생 또는 삶은"],
  ["염절임", "염장 절임"], ["조미, 볶은것", "조미해 볶은"],
  ["커피가루", "커피가루"], ["튀긴것", "튀긴"], ["조미훈제", "조미 훈제한"],
  ["통조림, 구운것(팬)", "팬에 구운 통조림"], ["냉동, 삶은것", "삶은 냉동"],
  ["반건조", "반건조"], ["소금에 절여 말린것", "소금에 절여 말린"],
  ["올리브 절임", "올리브 절임"], ["조리후", "조리한"],
  ["조미, 구운것", "조미해 구운"], ["튀긴것(빵가루)", "빵가루 입혀 튀긴"],
  ["한가루, 생것", "한가루"], ["구운것(석쇠)", "석쇠에 구운"],
  ["냉동, 튀긴것", "튀긴 냉동"], ["도넛가루", "도넛가루"],
  ["말린것, 데친것", "말리거나 데친"],
  ["삶아서 말린것, 데친것", "삶아 말리거나 데친"],
  ["소금에 절여 반건조", "소금에 절여 반건조한"], ["염장, 데친것", "데친 염장"],
  ["조미", "조미한"], ["조미, 삶은것", "조미해 삶은"],
  ["조미훈제, 구운것(팬)", "팬에 구운 조미 훈제"],
  ["통조림, 구운것(오븐)", "오븐에 구운 통조림"],
  ["통조림, 데친것", "데친 통조림"], ["통조림, 삶은것", "삶은 통조림"],
  ["통조림, 훈제", "훈제 통조림"], ["훈제", "훈제"],
]);

const COLOR_ADJECTIVE_BY_TOKEN = new Map<string, string>([
  ["빨간색", "빨간"], ["노란색", "노란"], ["주황색", "주황"],
  ["초록색", "초록"], ["검은색", "검은"], ["흰색", "흰"],
  ["적색", "붉은"], ["녹색", "초록"], ["황색", "노란"],
  ["자색", "자주색"], ["연두색", "연두"],
]);

export function isSelectableIngredientId(ingredientId: string) {
  return !INACTIVE_INGREDIENT_ID_SET.has(ingredientId);
}

export function isSelectableIngredientName(standardName: string) {
  return !INACTIVE_INGREDIENT_NAME_SET.has(standardName);
}

export function normalizeIngredientCatalogName(value: string) {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  const suffixMatch = trimmed.match(/\s*\((.*)\)$/u);
  const hasMappedSuffix = suffixMatch
    ? STATE_PREFIX_BY_SUFFIX.has(suffixMatch[1])
    : false;
  const mappedPrefix = suffixMatch
    ? STATE_PREFIX_BY_SUFFIX.get(suffixMatch[1])
    : undefined;
  let statePrefix = mappedPrefix ?? "";
  let baseName = hasMappedSuffix && suffixMatch
    ? trimmed.slice(0, suffixMatch.index).trim()
    : trimmed;

  if (!suffixMatch && baseName.startsWith("데친 ")) {
    statePrefix = "데친";
    baseName = baseName.slice("데친 ".length);
  }

  const colorMatch = baseName.match(
    / · (빨간색|노란색|주황색|초록색|검은색|흰색|적색|녹색|황색|자색|연두색)(?= · |$)/u,
  );
  const colorAdjective = colorMatch
    ? COLOR_ADJECTIVE_BY_TOKEN.get(colorMatch[1]) ?? ""
    : "";
  const colorIndex = colorMatch?.index ?? -1;
  if (colorMatch && colorIndex >= 0) {
    baseName = `${baseName.slice(0, colorIndex)}${baseName.slice(
      colorIndex + colorMatch[0].length,
    )}`;
  }

  const baseParts = baseName.split(" · ");
  const naturalBaseName = baseParts[0] === "갯기름나물" && baseParts.length > 1
    ? [...baseParts.slice(1), baseParts[0]].join(" ")
    : baseParts.join(" ");

  return [statePrefix, colorAdjective, naturalBaseName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}
