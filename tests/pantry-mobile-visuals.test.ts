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
    expect(getPantryStickerSrc("갯기름나물")).toBe(
      "/assets/ingredients/plush-v2/coastal-hog-fennel-greens.webp",
    );
    expect(getPantryStickerSrc("갯나물")).toBe(
      "/assets/ingredients/plush-v2/seashore-greens.webp",
    );
    expect(getPantryStickerSrc("경수채")).toBe(
      "/assets/ingredients/plush-v2/mizuna-greens.webp",
    );
    expect(getPantryStickerSrc("계피")).toBe("/assets/ingredients/plush-v2/cinnamon.webp");
    expect(getPantryStickerSrc("계피가루")).toBe(
      "/assets/ingredients/plush-v2/cinnamon-powder.webp",
    );
    expect(getPantryStickerSrc("고려엉겅퀴")).toBe(
      "/assets/ingredients/plush-v2/gondre-thistle-greens.webp",
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
    expect(getPantryStickerSrc("갓김치")).toBe(
      "/assets/ingredients/plush-v2/gat-kimchi.webp",
    );
    expect(getPantryStickerSrc("김치국물")).toBe(
      "/assets/ingredients/plush-v2/kimchi-brine.webp",
    );
    expect(getPantryStickerSrc("고추장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-green-chili.webp",
    );
    expect(getPantryStickerSrc("고수")).toBe(
      "/assets/ingredients/plush-v2/cilantro.webp",
    );
    expect(getPantryStickerSrc("고춧잎")).toBe(
      "/assets/ingredients/plush-v2/chili-pepper-leaves.webp",
    );
    expect(getPantryStickerSrc("깍두기")).toBe(
      "/assets/ingredients/plush-v2/kkakdugi.webp",
    );
    expect(getPantryStickerSrc("근대")).toBe(
      "/assets/ingredients/plush-v2/swiss-chard.webp",
    );
    expect(getPantryStickerSrc("꽃양배추")).toBe(
      "/assets/ingredients/plush-v2/cauliflower.webp",
    );
    expect(getPantryStickerSrc("나박 김치")).toBe(
      "/assets/ingredients/plush-v2/nabak-kimchi.webp",
    );
    expect(getPantryStickerSrc("냉이")).toBe(
      "/assets/ingredients/plush-v2/shepherds-purse.webp",
    );
    expect(getPantryStickerSrc("누리장나무잎")).toBe(
      "/assets/ingredients/plush-v2/harlequin-glorybower-leaves.webp",
    );
    expect(getPantryStickerSrc("는쟁이냉이")).toBe(
      "/assets/ingredients/plush-v2/neunjangi-naengi.webp",
    );
    expect(getPantryStickerSrc("단무지")).toBe(
      "/assets/ingredients/plush-v2/danmuji.webp",
    );
    expect(getPantryStickerSrc("동치미")).toBe(
      "/assets/ingredients/plush-v2/dongchimi.webp",
    );
    expect(getPantryStickerSrc("돌나물")).toBe(
      "/assets/ingredients/plush-v2/stonecrop.webp",
    );
    expect(getPantryStickerSrc("신김치")).toBe(
      "/assets/ingredients/plush-v2/sour-kimchi.webp",
    );
    expect(getPantryStickerSrc("들깻잎장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-perilla-leaves.webp",
    );
    expect(getPantryStickerSrc("마늘 장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-garlic.webp",
    );
    expect(getPantryStickerSrc("마늘종 장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-garlic-scapes.webp",
    );
    expect(getPantryStickerSrc("무 절임")).toBe(
      "/assets/ingredients/plush-v2/pickled-radish.webp",
    );
    expect(getPantryStickerSrc("무말랭이")).toBe(
      "/assets/ingredients/plush-v2/dried-radish-strips.webp",
    );
    expect(getPantryStickerSrc("백김치")).toBe(
      "/assets/ingredients/plush-v2/baek-kimchi.webp",
    );
    expect(getPantryStickerSrc("비트 피클")).toBe(
      "/assets/ingredients/plush-v2/beet-pickle.webp",
    );
    expect(getPantryStickerSrc("산마늘 장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-wild-garlic.webp",
    );
    expect(getPantryStickerSrc("생강 피클")).toBe(
      "/assets/ingredients/plush-v2/pickled-ginger.webp",
    );
    expect(getPantryStickerSrc("쌈무")).toBe("/assets/ingredients/plush-v2/ssammu.webp");
    expect(getPantryStickerSrc("양파 장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-onion.webp",
    );
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
    expect(getPantryStickerSrc("다시다")).toBe(
      "/assets/ingredients/plush-v2/dashida-seasoning.webp",
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
    expect(getPantryStickerSrc("로메인")).toBe(
      "/assets/ingredients/plush-v2/romaine-lettuce.webp",
    );
    expect(getPantryStickerSrc("로즈메리")).toBe(
      "/assets/ingredients/plush-v2/rosemary.webp",
    );
    expect(getPantryStickerSrc("로열 젤리")).toBe(
      "/assets/ingredients/plush-v2/royal-jelly.webp",
    );
    expect(getPantryStickerSrc("루꼴라")).toBe(
      "/assets/ingredients/plush-v2/arugula.webp",
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
    expect(getPantryStickerSrc("매실 절임")).toBe(
      "/assets/ingredients/plush-v2/pickled-maesil.webp",
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
    expect(getPantryStickerSrc("모링가")).toBe(
      "/assets/ingredients/plush-v2/moringa-leaves.webp",
    );
    expect(getPantryStickerSrc("물냉이")).toBe(
      "/assets/ingredients/plush-v2/watercress.webp",
    );
    expect(getPantryStickerSrc("물엿")).toBe(
      "/assets/ingredients/plush-v2/starch-syrup.webp",
    );
    expect(getPantryStickerSrc("물쑥")).toBe(
      "/assets/ingredients/plush-v2/water-mugwort.webp",
    );
    expect(getPantryStickerSrc("미나리")).toBe(
      "/assets/ingredients/plush-v2/minari.webp",
    );
    expect(getPantryStickerSrc("미나리청")).toBe(
      "/assets/ingredients/plush-v2/minari-cheong.webp",
    );
    expect(getPantryStickerSrc("미소")).toBe("/assets/ingredients/plush-v2/miso.webp");
    expect(getPantryStickerSrc("미원")).toBe(
      "/assets/ingredients/plush-v2/msg-seasoning.webp",
    );
    expect(getPantryStickerSrc("민들레")).toBe(
      "/assets/ingredients/plush-v2/dandelion.webp",
    );
    expect(getPantryStickerSrc("민들레 잎")).toBe(
      "/assets/ingredients/plush-v2/dandelion-leaves.webp",
    );
    expect(getPantryStickerSrc("민트")).toBe("/assets/ingredients/plush-v2/mint.webp");
    expect(getPantryStickerSrc("바질")).toBe(
      "/assets/ingredients/plush-v2/basil.webp",
    );
    expect(getPantryStickerSrc("방가지똥")).toBe(
      "/assets/ingredients/plush-v2/sow-thistle-greens.webp",
    );
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
    expect(getPantryStickerSrc("방울다다기양배추")).toBe(
      "/assets/ingredients/plush-v2/brussels-sprouts.webp",
    );
    expect(getPantryStickerSrc("배초향")).toBe(
      "/assets/ingredients/plush-v2/korean-mint-leaves.webp",
    );
    expect(getPantryStickerSrc("배추김치")).toBe(
      "/assets/ingredients/plush-v2/baechu-kimchi.webp",
    );
    expect(getPantryStickerSrc("버터헤드")).toBe(
      "/assets/ingredients/plush-v2/butterhead-lettuce.webp",
    );
    expect(getPantryStickerSrc("봄동")).toBe(
      "/assets/ingredients/plush-v2/bomdong-cabbage.webp",
    );
    expect(getPantryStickerSrc("복숭아씨기름")).toBe(
      "/assets/ingredients/plush-v2/peach-kernel-oil.webp",
    );
    expect(getPantryStickerSrc("부지깽이")).toBe(
      "/assets/ingredients/plush-v2/bujiggaengi-greens.webp",
    );
    expect(getPantryStickerSrc("비름")).toBe(
      "/assets/ingredients/plush-v2/amaranth-greens.webp",
    );
    expect(getPantryStickerSrc("비비추")).toBe(
      "/assets/ingredients/plush-v2/hosta-leaves.webp",
    );
    expect(getPantryStickerSrc("사우전드아일랜드")).toBe(
      "/assets/ingredients/plush-v2/thousand-island-dressing.webp",
    );
    expect(getPantryStickerSrc("비타민채")).toBe(
      "/assets/ingredients/plush-v2/vitamin-greens.webp",
    );
    expect(getPantryStickerSrc("사프란")).toBe(
      "/assets/ingredients/plush-v2/saffron.webp",
    );
    expect(getPantryStickerSrc("뽕잎")).toBe(
      "/assets/ingredients/plush-v2/mulberry-leaves.webp",
    );
    expect(getPantryStickerSrc("산초")).toBe(
      "/assets/ingredients/plush-v2/sansho-pepper.webp",
    );
    expect(getPantryStickerSrc("삼나물")).toBe(
      "/assets/ingredients/plush-v2/samnamul-greens.webp",
    );
    expect(getPantryStickerSrc("삼채")).toBe(
      "/assets/ingredients/plush-v2/samchae.webp",
    );
    expect(getPantryStickerSrc("섬초롱")).toBe(
      "/assets/ingredients/plush-v2/island-bellflower-greens.webp",
    );
    expect(getPantryStickerSrc("셀러리")).toBe(
      "/assets/ingredients/plush-v2/celery.webp",
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
    expect(getPantryStickerSrc("소리쟁이")).toBe(
      "/assets/ingredients/plush-v2/curly-dock-greens.webp",
    );
    expect(getPantryStickerSrc("쇠귀나물")).toBe(
      "/assets/ingredients/plush-v2/arrowhead-greens.webp",
    );
    expect(getPantryStickerSrc("수리취")).toBe(
      "/assets/ingredients/plush-v2/surichwi-greens.webp",
    );
    expect(getPantryStickerSrc("숙주나물")).toBe(
      "/assets/ingredients/plush-v2/mung-bean-sprouts.webp",
    );
    expect(getPantryStickerSrc("시금치")).toBe(
      "/assets/ingredients/plush-v2/spinach.webp",
    );
    expect(getPantryStickerSrc("시래기")).toBe(
      "/assets/ingredients/plush-v2/dried-radish-greens-siraegi.webp",
    );
    expect(getPantryStickerSrc("신선초")).toBe(
      "/assets/ingredients/plush-v2/ashitaba-greens.webp",
    );
    expect(getPantryStickerSrc("쌀겨기름")).toBe(
      "/assets/ingredients/plush-v2/rice-bran-oil.webp",
    );
    expect(getPantryStickerSrc("쌈장")).toBe(
      "/assets/ingredients/plush-v2/ssamjang.webp",
    );
    expect(getPantryStickerSrc("쌈추")).toBe(
      "/assets/ingredients/plush-v2/ssamchu.webp",
    );
    expect(getPantryStickerSrc("쑥")).toBe(
      "/assets/ingredients/plush-v2/mugwort.webp",
    );
    expect(getPantryStickerSrc("쑥갓")).toBe(
      "/assets/ingredients/plush-v2/crown-daisy-greens.webp",
    );
    expect(getPantryStickerSrc("쑥부쟁이")).toBe(
      "/assets/ingredients/plush-v2/aster-greens.webp",
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
    expect(getPantryStickerSrc("열무 김치")).toBe(
      "/assets/ingredients/plush-v2/yeolmu-kimchi.webp",
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
    expect(getPantryStickerSrc("오이 소박이")).toBe(
      "/assets/ingredients/plush-v2/cucumber-sobagi.webp",
    );
    expect(getPantryStickerSrc("오이 피클")).toBe(
      "/assets/ingredients/plush-v2/cucumber-pickle.webp",
    );
    expect(getPantryStickerSrc("오이지")).toBe(
      "/assets/ingredients/plush-v2/oiji.webp",
    );
    expect(getPantryStickerSrc("옥수수기름")).toBe(
      "/assets/ingredients/plush-v2/corn-oil.webp",
    );
    expect(getPantryStickerSrc("올리브 오일")).toBe(
      "/assets/ingredients/plush-v2/olive-oil-bottle.webp",
    );
    expect(getPantryStickerSrc("올리브 절임")).toBe(
      "/assets/ingredients/plush-v2/pickled-olives.webp",
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
    expect(getPantryStickerSrc("울외장아찌")).toBe(
      "/assets/ingredients/plush-v2/pickled-oriental-melon.webp",
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
    expect(getPantryStickerSrc("유채 김치")).toBe(
      "/assets/ingredients/plush-v2/yuchae-kimchi.webp",
    );
    expect(getPantryStickerSrc("유채씨기름")).toBe(
      "/assets/ingredients/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("잇꽃씨기름")).toBe(
      "/assets/ingredients/plush-v2/safflower-seed-oil.webp",
    );
    expect(getPantryStickerSrc("카놀라유")).toBe(
      "/assets/ingredients/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("육두구")).toBe(
      "/assets/ingredients/plush-v2/nutmeg.webp",
    );
    expect(getPantryStickerSrc("젤라틴")).toBe(
      "/assets/ingredients/plush-v2/gelatin.webp",
    );
    expect(getPantryStickerSrc("정향")).toBe(
      "/assets/ingredients/plush-v2/cloves.webp",
    );
    expect(getPantryStickerSrc("조청")).toBe(
      "/assets/ingredients/plush-v2/jocheong.webp",
    );
    expect(getPantryStickerSrc("짜장 소스")).toBe(
      "/assets/ingredients/plush-v2/jajang-sauce.webp",
    );
    expect(getPantryStickerSrc("짜장라면")).toBe(
      "/assets/ingredients/plush-v2/jajang-ramen.webp",
    );
    expect(getPantryStickerSrc("청국장")).toBe(
      "/assets/ingredients/plush-v2/cheonggukjang.webp",
    );
    expect(getPantryStickerSrc("초고추장")).toBe(
      "/assets/ingredients/plush-v2/cho-gochujang.webp",
    );
    expect(getPantryStickerSrc("초콜릿")).toBe(
      "/assets/ingredients/plush-v2/chocolate.webp",
    );
    expect(getPantryStickerSrc("춘장")).toBe(
      "/assets/ingredients/plush-v2/chunjang.webp",
    );
    expect(getPantryStickerSrc("치즈시즈닝")).toBe(
      "/assets/ingredients/plush-v2/cheese-seasoning.webp",
    );
    expect(getPantryStickerSrc("치킨스톡")).toBe(
      "/assets/ingredients/plush-v2/chicken-stock.webp",
    );
    expect(getPantryStickerSrc("칠리 소스")).toBe(
      "/assets/ingredients/plush-v2/chili-sauce.webp",
    );
    expect(getPantryStickerSrc("칠리파우더")).toBe(
      "/assets/ingredients/plush-v2/chili-powder.webp",
    );
    expect(getPantryStickerSrc("코코아 파우더")).toBe(
      "/assets/ingredients/plush-v2/cocoa-powder.webp",
    );
    expect(getPantryStickerSrc("코코넛유")).toBe(
      "/assets/ingredients/plush-v2/coconut-oil.webp",
    );
    expect(getPantryStickerSrc("콩기름")).toBe(
      "/assets/ingredients/plush-v2/soybean-oil.webp",
    );
    expect(getPantryStickerSrc("타라곤")).toBe(
      "/assets/ingredients/plush-v2/tarragon.webp",
    );
    expect(getPantryStickerSrc("타임")).toBe(
      "/assets/ingredients/plush-v2/thyme.webp",
    );
    expect(getPantryStickerSrc("파슬리")).toBe(
      "/assets/ingredients/plush-v2/parsley.webp",
    );
    expect(getPantryStickerSrc("파슬리 가루")).toBe(
      "/assets/ingredients/plush-v2/parsley-powder.webp",
    );
    expect(getPantryStickerSrc("팜유")).toBe(
      "/assets/ingredients/plush-v2/palm-oil.webp",
    );
    expect(getPantryStickerSrc("페퍼민트")).toBe(
      "/assets/ingredients/plush-v2/peppermint.webp",
    );
    expect(getPantryStickerSrc("포도씨유")).toBe(
      "/assets/ingredients/plush-v2/grapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("포도당")).toBe(
      "/assets/ingredients/plush-v2/glucose.webp",
    );
    expect(getPantryStickerSrc("카레가루")).toBe(
      "/assets/ingredients/plush-v2/curry-powder.webp",
    );
    expect(getPantryStickerSrc("캐러멜")).toBe(
      "/assets/ingredients/plush-v2/caramel.webp",
    );
    expect(getPantryStickerSrc("커스터드")).toBe(
      "/assets/ingredients/plush-v2/custard.webp",
    );
    expect(getPantryStickerSrc("케첩")).toBe(
      "/assets/ingredients/plush-v2/ketchup.webp",
    );
    expect(getPantryStickerSrc("탕수육 소스")).toBe(
      "/assets/ingredients/plush-v2/sweet-and-sour-pork-sauce.webp",
    );
    expect(getPantryStickerSrc("템페")).toBe(
      "/assets/ingredients/plush-v2/tempeh.webp",
    );
    expect(getPantryStickerSrc("토마토 케첩")).toBe(
      "/assets/ingredients/plush-v2/ketchup.webp",
    );
    expect(getPantryStickerSrc("팟타이 소스")).toBe(
      "/assets/ingredients/plush-v2/pad-thai-sauce.webp",
    );
    expect(getPantryStickerSrc("하이라이스가루")).toBe(
      "/assets/ingredients/plush-v2/hayashi-rice-powder.webp",
    );
    expect(getPantryStickerSrc("핫 소스")).toBe(
      "/assets/ingredients/plush-v2/hot-sauce.webp",
    );
    expect(getPantryStickerSrc("해물육수")).toBe(
      "/assets/ingredients/plush-v2/seafood-stock-coin.webp",
    );
    expect(getPantryStickerSrc("해물육수(코인)")).toBe(
      "/assets/ingredients/plush-v2/seafood-stock-coin.webp",
    );
    expect(getPantryStickerSrc("해선장")).toBe(
      "/assets/ingredients/plush-v2/hoisin-sauce.webp",
    );
    expect(getPantryStickerSrc("해바라기유")).toBe(
      "/assets/ingredients/plush-v2/sunflower-oil.webp",
    );
    expect(getPantryStickerSrc("허브솔트")).toBe(
      "/assets/ingredients/plush-v2/herb-salt.webp",
    );
    expect(getPantryStickerSrc("호두유")).toBe(
      "/assets/ingredients/plush-v2/walnut-oil.webp",
    );
    expect(getPantryStickerSrc("참치액")).toBe(
      "/assets/ingredients/plush-v2/tuna-liquid-seasoning.webp",
    );
    expect(getPantryStickerSrc("총각 김치")).toBe(
      "/assets/ingredients/plush-v2/chonggak-kimchi.webp",
    );
    expect(getPantryStickerSrc("치킨무")).toBe(
      "/assets/ingredients/plush-v2/chicken-mu.webp",
    );
    expect(getPantryStickerSrc("파 김치")).toBe(
      "/assets/ingredients/plush-v2/green-onion-kimchi.webp",
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

    expect(Object.keys(items)).toHaveLength(293);

    for (const item of Object.values(items)) {
      expect(item.src).toMatch(/^\/assets\/ingredients\/plush-v2\/.+\.webp$/);
      expect(readVp8Size(item.src)).toEqual({ width: 512, height: 512 });
    }
  });
});
