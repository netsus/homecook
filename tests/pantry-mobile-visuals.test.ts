import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getPantryEmoji, getPantryStickerSrc } from "@/components/pantry/pantry-mobile-visuals";
import stickerManifest from "@/public/assets/ingredients/plush-v2/manifest.json";

type PantryStickerManifestItem = {
  src: string;
};

function readVp8Size(src: string) {
  const file = readFileSync(join(process.cwd(), "public", src.replace(/^\/+/, "")));
  const chunkOffset = file.indexOf("VP8 ");

  expect(file.toString("ascii", 0, 4)).toBe("RIFF");
  expect(file.toString("ascii", 8, 12)).toBe("WEBP");
  expect(chunkOffset).toBeGreaterThan(0);

  const frameStart = chunkOffset + 8;

  return {
    height: file.readUInt16LE(frameStart + 8) & 0x3fff,
    width: file.readUInt16LE(frameStart + 6) & 0x3fff,
  };
}

describe("pantry mobile visuals", () => {
  it("uses the shared category emoji for canonical fruit", () => {
    expect(getPantryEmoji("제철과일", "과일")).toBe("🍓");
  });

  it("keeps Wave1-only display group fallbacks separate from canonical categories", () => {
    expect(getPantryEmoji("렌틸콩", "단백질")).toBe("🥚");
    expect(getPantryEmoji("잡곡밥", "주식")).toBe("🍚");
  });

  it("returns approved sticker assets only for manifest-backed ingredients", () => {
    expect(getPantryStickerSrc("강낭콩")).toBe("/assets/ingredients/plush-v2/kidney-bean.webp");
    expect(getPantryStickerSrc("강황")).toBe("/assets/ingredients/plush-v2/turmeric.webp");
    expect(getPantryStickerSrc("강황가루")).toBe(
      "/assets/ingredients/plush-v2/turmeric-powder.webp",
    );
    expect(getPantryStickerSrc("계피")).toBe("/assets/ingredients/plush-v2/cinnamon.webp");
    expect(getPantryStickerSrc("계피가루")).toBe(
      "/assets/ingredients/plush-v2/cinnamon-powder.webp",
    );
    expect(getPantryStickerSrc("고추기름")).toBe(
      "/assets/ingredients/plush-v2/chili-oil.webp",
    );
    expect(getPantryStickerSrc("국간장")).toBe(
      "/assets/ingredients/plush-v2/soup-soy-sauce.webp",
    );
    expect(getPantryStickerSrc("굴소스")).toBe(
      "/assets/ingredients/plush-v2/oyster-sauce.webp",
    );
    expect(getPantryStickerSrc("굴 소스")).toBe(
      "/assets/ingredients/plush-v2/oyster-sauce.webp",
    );
    expect(getPantryStickerSrc("달걀")).toBe("/assets/ingredients/plush-v2/egg.webp");
    expect(getPantryStickerSrc("꿀")).toBe("/assets/ingredients/plush-v2/honey.webp");
    expect(getPantryStickerSrc("낫토")).toBe("/assets/ingredients/plush-v2/natto.webp");
    expect(getPantryStickerSrc("닭기름")).toBe(
      "/assets/ingredients/plush-v2/chicken-fat.webp",
    );
    expect(getPantryStickerSrc("다진마늘")).toBe(
      "/assets/ingredients/plush-v2/minced-garlic.webp",
    );
    expect(getPantryStickerSrc("다진생강")).toBe(
      "/assets/ingredients/plush-v2/minced-ginger.webp",
    );
    expect(getPantryStickerSrc("당밀")).toBe("/assets/ingredients/plush-v2/molasses.webp");
    expect(getPantryStickerSrc("데리야끼 소스")).toBe(
      "/assets/ingredients/plush-v2/teriyaki-sauce.webp",
    );
    expect(getPantryStickerSrc("돈까스소스")).toBe(
      "/assets/ingredients/plush-v2/tonkatsu-sauce.webp",
    );
    expect(getPantryStickerSrc("돼지기름")).toBe(
      "/assets/ingredients/plush-v2/pork-fat.webp",
    );
    expect(getPantryStickerSrc("두반장")).toBe(
      "/assets/ingredients/plush-v2/doubanjiang-v2.webp",
    );
    expect(getPantryStickerSrc("들깨가루")).toBe(
      "/assets/ingredients/plush-v2/perilla-seed-powder.webp",
    );
    expect(getPantryStickerSrc("땅콩 버터")).toBe(
      "/assets/ingredients/plush-v2/peanut-butter.webp",
    );
    expect(getPantryStickerSrc("땅콩기름")).toBe(
      "/assets/ingredients/plush-v2/peanut-oil.webp",
    );
    expect(getPantryStickerSrc("라면 건더기 스프")).toBe(
      "/assets/ingredients/plush-v2/ramen-dried-flakes.webp",
    );
    expect(getPantryStickerSrc("라면 스프")).toBe(
      "/assets/ingredients/plush-v2/ramen-seasoning-powder.webp",
    );
    expect(getPantryStickerSrc("라벤더")).toBe(
      "/assets/ingredients/plush-v2/lavender.webp",
    );
    expect(getPantryStickerSrc("사과")).toBe("/assets/ingredients/plush-v2/apple.webp");
    expect(getPantryStickerSrc("레몬")).toBe("/assets/ingredients/plush-v2/lemon.webp");
    expect(getPantryStickerSrc("레몬즙")).toBe(
      "/assets/ingredients/plush-v2/lemon-juice.webp",
    );
    expect(getPantryStickerSrc("레몬그라스")).toBe(
      "/assets/ingredients/plush-v2/lemongrass.webp",
    );
    expect(getPantryStickerSrc("로즈메리")).toBe(
      "/assets/ingredients/plush-v2/rosemary.webp",
    );
    expect(getPantryStickerSrc("로열 젤리")).toBe(
      "/assets/ingredients/plush-v2/royal-jelly.webp",
    );
    expect(getPantryStickerSrc("마가린")).toBe(
      "/assets/ingredients/plush-v2/margarine.webp",
    );
    expect(getPantryStickerSrc("마늘기름")).toBe(
      "/assets/ingredients/plush-v2/garlic-oil.webp",
    );
    expect(getPantryStickerSrc("마라 육수")).toBe(
      "/assets/ingredients/plush-v2/mala-broth.webp",
    );
    expect(getPantryStickerSrc("마시멜로")).toBe(
      "/assets/ingredients/plush-v2/marshmallow.webp",
    );
    expect(getPantryStickerSrc("마요네즈")).toBe(
      "/assets/ingredients/plush-v2/mayonnaise.webp",
    );
    expect(getPantryStickerSrc("매실청")).toBe(
      "/assets/ingredients/plush-v2/maesil-cheong.webp",
    );
    expect(getPantryStickerSrc("면실유")).toBe(
      "/assets/ingredients/plush-v2/cottonseed-oil.webp",
    );
    expect(getPantryStickerSrc("머스타드 소스")).toBe(
      "/assets/ingredients/plush-v2/mustard-sauce.webp",
    );
    expect(getPantryStickerSrc("멸치액젓")).toBe(
      "/assets/ingredients/plush-v2/anchovy-fish-sauce.webp",
    );
    expect(getPantryStickerSrc("물엿")).toBe(
      "/assets/ingredients/plush-v2/starch-syrup.webp",
    );
    expect(getPantryStickerSrc("미소")).toBe("/assets/ingredients/plush-v2/miso.webp");
    expect(getPantryStickerSrc("미원")).toBe(
      "/assets/ingredients/plush-v2/msg-seasoning.webp",
    );
    expect(getPantryStickerSrc("민트")).toBe("/assets/ingredients/plush-v2/mint.webp");
    expect(getPantryStickerSrc("바닐라 페이스트")).toBe(
      "/assets/ingredients/plush-v2/vanilla-paste.webp",
    );
    expect(getPantryStickerSrc("바닐라빈 페이스트")).toBe(
      "/assets/ingredients/plush-v2/vanilla-bean-paste.webp",
    );
    expect(getPantryStickerSrc("바닐라익스트랙")).toBe(
      "/assets/ingredients/plush-v2/vanilla-extract.webp",
    );
    expect(getPantryStickerSrc("바비큐 소스")).toBe(
      "/assets/ingredients/plush-v2/barbecue-sauce.webp",
    );
    expect(getPantryStickerSrc("발사믹 식초")).toBe(
      "/assets/ingredients/plush-v2/balsamic-vinegar.webp",
    );
    expect(getPantryStickerSrc("복숭아씨기름")).toBe(
      "/assets/ingredients/plush-v2/peach-kernel-oil.webp",
    );
    expect(getPantryStickerSrc("사우전드아일랜드")).toBe(
      "/assets/ingredients/plush-v2/thousand-island-dressing.webp",
    );
    expect(getPantryStickerSrc("사프란")).toBe(
      "/assets/ingredients/plush-v2/saffron.webp",
    );
    expect(getPantryStickerSrc("산초")).toBe(
      "/assets/ingredients/plush-v2/sansho-pepper.webp",
    );
    expect(getPantryStickerSrc("생강 페이스트")).toBe(
      "/assets/ingredients/plush-v2/ginger-paste.webp",
    );
    expect(getPantryStickerSrc("생강청")).toBe(
      "/assets/ingredients/plush-v2/ginger-cheong.webp",
    );
    expect(getPantryStickerSrc("수끼 소스")).toBe(
      "/assets/ingredients/plush-v2/suki-sauce.webp",
    );
    expect(getPantryStickerSrc("슈가파우더")).toBe(
      "/assets/ingredients/plush-v2/powdered-sugar.webp",
    );
    expect(getPantryStickerSrc("스리라차 소스")).toBe(
      "/assets/ingredients/plush-v2/sriracha-sauce.webp",
    );
    expect(getPantryStickerSrc("시럽")).toBe("/assets/ingredients/plush-v2/syrup.webp");
    expect(getPantryStickerSrc("쌀겨기름")).toBe(
      "/assets/ingredients/plush-v2/rice-bran-oil.webp",
    );
    expect(getPantryStickerSrc("쌈장")).toBe(
      "/assets/ingredients/plush-v2/ssamjang.webp",
    );
    expect(getPantryStickerSrc("아마씨유")).toBe(
      "/assets/ingredients/plush-v2/flaxseed-oil.webp",
    );
    expect(getPantryStickerSrc("아몬드유")).toBe(
      "/assets/ingredients/plush-v2/almond-oil.webp",
    );
    expect(getPantryStickerSrc("아보카도유")).toBe(
      "/assets/ingredients/plush-v2/avocado-oil.webp",
    );
    expect(getPantryStickerSrc("알룰로스")).toBe(
      "/assets/ingredients/plush-v2/allulose.webp",
    );
    expect(getPantryStickerSrc("애플민트")).toBe(
      "/assets/ingredients/plush-v2/apple-mint.webp",
    );
    expect(getPantryStickerSrc("액젓")).toBe(
      "/assets/ingredients/plush-v2/fish-sauce.webp",
    );
    expect(getPantryStickerSrc("양갱")).toBe(
      "/assets/ingredients/plush-v2/yanggaeng.webp",
    );
    expect(getPantryStickerSrc("양파시즈닝")).toBe(
      "/assets/ingredients/plush-v2/onion-seasoning.webp",
    );
    expect(getPantryStickerSrc("연겨자")).toBe(
      "/assets/ingredients/plush-v2/korean-soft-mustard-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("열무김치 국물")).toBe(
      "/assets/ingredients/plush-v2/young-radish-kimchi-brine.webp",
    );
    expect(getPantryStickerSrc("엿")).toBe("/assets/ingredients/plush-v2/yeot.webp");
    expect(getPantryStickerSrc("오레가노")).toBe(
      "/assets/ingredients/plush-v2/oregano.webp",
    );
    expect(getPantryStickerSrc("오리엔탈")).toBe(
      "/assets/ingredients/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈 소스")).toBe(
      "/assets/ingredients/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈 드레싱")).toBe(
      "/assets/ingredients/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈드레싱")).toBe(
      "/assets/ingredients/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("옥수수기름")).toBe(
      "/assets/ingredients/plush-v2/corn-oil.webp",
    );
    expect(getPantryStickerSrc("올리브 오일")).toBe(
      "/assets/ingredients/plush-v2/olive-oil-bottle.webp",
    );
    expect(getPantryStickerSrc("올리브유")).toBe(
      "/assets/ingredients/plush-v2/olive-oil.webp",
    );
    expect(getPantryStickerSrc("올스파이스")).toBe(
      "/assets/ingredients/plush-v2/allspice.webp",
    );
    expect(getPantryStickerSrc("우스터 소스")).toBe(
      "/assets/ingredients/plush-v2/worcestershire-sauce.webp",
    );
    expect(getPantryStickerSrc("원당")).toBe(
      "/assets/ingredients/plush-v2/raw-sugar.webp",
    );
    expect(getPantryStickerSrc("월계수잎")).toBe(
      "/assets/ingredients/plush-v2/bay-leaves.webp",
    );
    expect(getPantryStickerSrc("유자청")).toBe(
      "/assets/ingredients/plush-v2/yuja-cheong.webp",
    );
    expect(getPantryStickerSrc("유채씨기름")).toBe(
      "/assets/ingredients/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("카놀라유")).toBe(
      "/assets/ingredients/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("육두구")).toBe(
      "/assets/ingredients/plush-v2/nutmeg.webp",
    );
    expect(getPantryStickerSrc("토마토 소스")).toBe(
      "/assets/ingredients/plush-v2/tomato-sauce.webp",
    );
    expect(getPantryStickerSrc("크림")).toBe(
      "/assets/ingredients/plush-v2/fresh-cream-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("크림 소스")).toBe(
      "/assets/ingredients/plush-v2/cream-sauce.webp",
    );
    expect(getPantryStickerSrc("크림소스")).toBe(
      "/assets/ingredients/plush-v2/cream-sauce.webp",
    );
    expect(getPantryStickerSrc("어간장")).toBe(
      "/assets/ingredients/plush-v2/fish-soy-sauce.webp",
    );
    expect(getPantryStickerSrc("가래떡")).toBe(
      "/assets/ingredients/plush-v2/garaetteok-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("가리비")).toBe(
      "/assets/ingredients/plush-v2/scallop-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("가시오갈피")).toBe(
      "/assets/ingredients/plush-v2/eleuthero-diary-sticker-no-limbs.webp",
    );
    expect(getPantryStickerSrc("갓")).toBe(
      "/assets/ingredients/plush-v2/gat-mustard-greens-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("거위고기")).toBe(
      "/assets/ingredients/plush-v2/goose-meat-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("거위알")).toBe(
      "/assets/ingredients/plush-v2/goose-egg-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("겨자")).toBe(
      "/assets/ingredients/plush-v2/mustard-paste-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("겨자 페이스트")).toBe(
      "/assets/ingredients/plush-v2/mustard-paste-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("고다 치즈")).toBe(
      "/assets/ingredients/plush-v2/gouda-cheese-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("고등어")).toBe(
      "/assets/ingredients/plush-v2/mackerel-diary-sticker-anchovy-face.webp",
    );
    expect(getPantryStickerSrc("고추냉이")).toBe(
      "/assets/ingredients/plush-v2/wasabi-root-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("골든세이지")).toBe(
      "/assets/ingredients/plush-v2/golden-sage-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("김")).toBe(
      "/assets/ingredients/plush-v2/gim-bundle-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("맛술")).toBe(
      "/assets/ingredients/plush-v2/cooking-wine-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("멸치")).toBe(
      "/assets/ingredients/plush-v2/dried-anchovy-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("모시조개")).toBe(
      "/assets/ingredients/plush-v2/clam-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("미역")).toBe(
      "/assets/ingredients/plush-v2/wakame-seaweed-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("빵가루")).toBe(
      "/assets/ingredients/plush-v2/bread-crumbs-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("생크림")).toBe(
      "/assets/ingredients/plush-v2/fresh-cream-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("식초")).toBe(
      "/assets/ingredients/plush-v2/vinegar-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("오징어")).toBe(
      "/assets/ingredients/plush-v2/squid-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("옥수수전분")).toBe(
      "/assets/ingredients/plush-v2/corn-starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("올리고당")).toBe(
      "/assets/ingredients/plush-v2/oligosaccharide-syrup-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("전분")).toBe(
      "/assets/ingredients/plush-v2/starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("전분가루")).toBe(
      "/assets/ingredients/plush-v2/starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("조개")).toBe(
      "/assets/ingredients/plush-v2/clam-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("참깨")).toBe(
      "/assets/ingredients/plush-v2/sesame-seeds-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("들기름")).toBe(
      "/assets/ingredients/plush-v2/perilla-oil-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("두유 그릭 요거트")).toBe(
      "/assets/ingredients/plush-v2/soy-milk-greek-yogurt-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("플레인요거트")).toBe(
      "/assets/ingredients/plush-v2/greek-yogurt-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("소금")).toBe("/assets/ingredients/plush-v2/salt.webp");
    expect(getPantryStickerSrc("렌틸콩")).toBeNull();
  });

  it("uses the corrected local sticker selections for pilot pantry ingredients", () => {
    expect(getPantryStickerSrc("청양고추")).toBe(
      "/assets/ingredients/plush-v2/cheongyang-pepper.webp",
    );
    expect(getPantryStickerSrc("오이")).toBe(
      "/assets/ingredients/plush-v2/cucumber.webp",
    );
    expect(getPantryStickerSrc("가지")).toBe(
      "/assets/ingredients/plush-v2/eggplant.webp",
    );
  });

  it("keeps plush-v2 sticker sources as 512px WebP assets for crisp pantry rendering", () => {
    const items = stickerManifest.items as Record<string, PantryStickerManifestItem>;

    expect(Object.keys(items)).toHaveLength(172);

    for (const item of Object.values(items)) {
      expect(item.src).toMatch(/^\/assets\/ingredients\/plush-v2\/.+\.webp$/);
      expect(readVp8Size(item.src)).toEqual({ width: 512, height: 512 });
    }
  });
});
