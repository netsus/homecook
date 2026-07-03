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
    expect(getPantryStickerSrc("강낭콩")).toBe("/assets/plush-v2/kidney-bean.webp");
    expect(getPantryStickerSrc("강황")).toBe("/assets/plush-v2/turmeric.webp");
    expect(getPantryStickerSrc("강황가루")).toBe(
      "/assets/plush-v2/turmeric-powder.webp",
    );
    expect(getPantryStickerSrc("갯기름나물")).toBe(
      "/assets/plush-v2/coastal-hog-fennel-greens.webp",
    );
    expect(getPantryStickerSrc("갯나물")).toBe(
      "/assets/plush-v2/seashore-greens.webp",
    );
    expect(getPantryStickerSrc("경수채")).toBe(
      "/assets/plush-v2/mizuna-greens.webp",
    );
    expect(getPantryStickerSrc("계피")).toBe("/assets/plush-v2/cinnamon.webp");
    expect(getPantryStickerSrc("계피가루")).toBe(
      "/assets/plush-v2/cinnamon-powder.webp",
    );
    expect(getPantryStickerSrc("고려엉겅퀴")).toBe(
      "/assets/plush-v2/gondre-thistle-greens.webp",
    );
    expect(getPantryStickerSrc("고추기름")).toBe(
      "/assets/plush-v2/chili-oil.webp",
    );
    expect(getPantryStickerSrc("국간장")).toBe(
      "/assets/plush-v2/soup-soy-sauce.webp",
    );
    expect(getPantryStickerSrc("굴소스")).toBe(
      "/assets/plush-v2/oyster-sauce.webp",
    );
    expect(getPantryStickerSrc("굴 소스")).toBe(
      "/assets/plush-v2/oyster-sauce.webp",
    );
    expect(getPantryStickerSrc("달걀")).toBe("/assets/plush-v2/egg.webp");
    expect(getPantryStickerSrc("갓김치")).toBe(
      "/assets/plush-v2/gat-kimchi.webp",
    );
    expect(getPantryStickerSrc("김치국물")).toBe(
      "/assets/plush-v2/kimchi-brine.webp",
    );
    expect(getPantryStickerSrc("고추장아찌")).toBe(
      "/assets/plush-v2/pickled-green-chili.webp",
    );
    expect(getPantryStickerSrc("고수")).toBe(
      "/assets/plush-v2/cilantro.webp",
    );
    expect(getPantryStickerSrc("고춧잎")).toBe(
      "/assets/plush-v2/chili-pepper-leaves.webp",
    );
    expect(getPantryStickerSrc("깍두기")).toBe(
      "/assets/plush-v2/kkakdugi.webp",
    );
    expect(getPantryStickerSrc("근대")).toBe(
      "/assets/plush-v2/swiss-chard.webp",
    );
    expect(getPantryStickerSrc("꽃양배추")).toBe(
      "/assets/plush-v2/cauliflower.webp",
    );
    expect(getPantryStickerSrc("나박 김치")).toBe(
      "/assets/plush-v2/nabak-kimchi.webp",
    );
    expect(getPantryStickerSrc("냉이")).toBe(
      "/assets/plush-v2/shepherds-purse.webp",
    );
    expect(getPantryStickerSrc("누리장나무잎")).toBe(
      "/assets/plush-v2/harlequin-glorybower-leaves.webp",
    );
    expect(getPantryStickerSrc("는쟁이냉이")).toBe(
      "/assets/plush-v2/neunjangi-naengi.webp",
    );
    expect(getPantryStickerSrc("단무지")).toBe(
      "/assets/plush-v2/danmuji.webp",
    );
    expect(getPantryStickerSrc("동치미")).toBe(
      "/assets/plush-v2/dongchimi.webp",
    );
    expect(getPantryStickerSrc("돌나물")).toBe(
      "/assets/plush-v2/stonecrop.webp",
    );
    expect(getPantryStickerSrc("신김치")).toBe(
      "/assets/plush-v2/sour-kimchi.webp",
    );
    expect(getPantryStickerSrc("들깻잎장아찌")).toBe(
      "/assets/plush-v2/pickled-perilla-leaves.webp",
    );
    expect(getPantryStickerSrc("마늘 장아찌")).toBe(
      "/assets/plush-v2/pickled-garlic.webp",
    );
    expect(getPantryStickerSrc("마늘종 장아찌")).toBe(
      "/assets/plush-v2/pickled-garlic-scapes.webp",
    );
    expect(getPantryStickerSrc("무 절임")).toBe(
      "/assets/plush-v2/pickled-radish.webp",
    );
    expect(getPantryStickerSrc("무말랭이")).toBe(
      "/assets/plush-v2/dried-radish-strips.webp",
    );
    expect(getPantryStickerSrc("백김치")).toBe(
      "/assets/plush-v2/baek-kimchi.webp",
    );
    expect(getPantryStickerSrc("비트 피클")).toBe(
      "/assets/plush-v2/beet-pickle.webp",
    );
    expect(getPantryStickerSrc("산마늘 장아찌")).toBe(
      "/assets/plush-v2/pickled-wild-garlic.webp",
    );
    expect(getPantryStickerSrc("생강 피클")).toBe(
      "/assets/plush-v2/pickled-ginger.webp",
    );
    expect(getPantryStickerSrc("쌈무")).toBe("/assets/plush-v2/ssammu.webp");
    expect(getPantryStickerSrc("양파 장아찌")).toBe(
      "/assets/plush-v2/pickled-onion.webp",
    );
    expect(getPantryStickerSrc("꿀")).toBe("/assets/plush-v2/honey.webp");
    expect(getPantryStickerSrc("낫토")).toBe("/assets/plush-v2/natto.webp");
    expect(getPantryStickerSrc("닭기름")).toBe(
      "/assets/plush-v2/chicken-fat.webp",
    );
    expect(getPantryStickerSrc("다진마늘")).toBe(
      "/assets/plush-v2/minced-garlic.webp",
    );
    expect(getPantryStickerSrc("다진생강")).toBe(
      "/assets/plush-v2/minced-ginger.webp",
    );
    expect(getPantryStickerSrc("다시다")).toBe(
      "/assets/plush-v2/dashida-seasoning.webp",
    );
    expect(getPantryStickerSrc("당밀")).toBe("/assets/plush-v2/molasses.webp");
    expect(getPantryStickerSrc("데리야끼 소스")).toBe(
      "/assets/plush-v2/teriyaki-sauce.webp",
    );
    expect(getPantryStickerSrc("돈까스소스")).toBe(
      "/assets/plush-v2/tonkatsu-sauce.webp",
    );
    expect(getPantryStickerSrc("돼지기름")).toBe(
      "/assets/plush-v2/pork-fat.webp",
    );
    expect(getPantryStickerSrc("두반장")).toBe(
      "/assets/plush-v2/doubanjiang-v2.webp",
    );
    expect(getPantryStickerSrc("들깨가루")).toBe(
      "/assets/plush-v2/perilla-seed-powder.webp",
    );
    expect(getPantryStickerSrc("땅콩 버터")).toBe(
      "/assets/plush-v2/peanut-butter.webp",
    );
    expect(getPantryStickerSrc("땅콩기름")).toBe(
      "/assets/plush-v2/peanut-oil.webp",
    );
    expect(getPantryStickerSrc("라면 건더기 스프")).toBe(
      "/assets/plush-v2/ramen-dried-flakes.webp",
    );
    expect(getPantryStickerSrc("라면 스프")).toBe(
      "/assets/plush-v2/ramen-seasoning-powder.webp",
    );
    expect(getPantryStickerSrc("라벤더")).toBe(
      "/assets/plush-v2/lavender.webp",
    );
    expect(getPantryStickerSrc("사과")).toBe("/assets/plush-v2/apple.webp");
    expect(getPantryStickerSrc("레몬")).toBe("/assets/plush-v2/lemon.webp");
    expect(getPantryStickerSrc("레몬즙")).toBe(
      "/assets/plush-v2/lemon-juice.webp",
    );
    expect(getPantryStickerSrc("레몬그라스")).toBe(
      "/assets/plush-v2/lemongrass.webp",
    );
    expect(getPantryStickerSrc("로메인")).toBe(
      "/assets/plush-v2/romaine-lettuce.webp",
    );
    expect(getPantryStickerSrc("로즈메리")).toBe(
      "/assets/plush-v2/rosemary.webp",
    );
    expect(getPantryStickerSrc("로열 젤리")).toBe(
      "/assets/plush-v2/royal-jelly.webp",
    );
    expect(getPantryStickerSrc("루꼴라")).toBe(
      "/assets/plush-v2/arugula.webp",
    );
    expect(getPantryStickerSrc("마가린")).toBe(
      "/assets/plush-v2/margarine.webp",
    );
    expect(getPantryStickerSrc("마늘기름")).toBe(
      "/assets/plush-v2/garlic-oil.webp",
    );
    expect(getPantryStickerSrc("마라 육수")).toBe(
      "/assets/plush-v2/mala-broth.webp",
    );
    expect(getPantryStickerSrc("마시멜로")).toBe(
      "/assets/plush-v2/marshmallow.webp",
    );
    expect(getPantryStickerSrc("마요네즈")).toBe(
      "/assets/plush-v2/mayonnaise.webp",
    );
    expect(getPantryStickerSrc("매실청")).toBe(
      "/assets/plush-v2/maesil-cheong.webp",
    );
    expect(getPantryStickerSrc("매실 절임")).toBe(
      "/assets/plush-v2/pickled-maesil.webp",
    );
    expect(getPantryStickerSrc("면실유")).toBe(
      "/assets/plush-v2/cottonseed-oil.webp",
    );
    expect(getPantryStickerSrc("머스타드 소스")).toBe(
      "/assets/plush-v2/mustard-sauce.webp",
    );
    expect(getPantryStickerSrc("멸치액젓")).toBe(
      "/assets/plush-v2/anchovy-fish-sauce.webp",
    );
    expect(getPantryStickerSrc("모링가")).toBe(
      "/assets/plush-v2/moringa-leaves.webp",
    );
    expect(getPantryStickerSrc("물냉이")).toBe(
      "/assets/plush-v2/watercress.webp",
    );
    expect(getPantryStickerSrc("물엿")).toBe(
      "/assets/plush-v2/starch-syrup.webp",
    );
    expect(getPantryStickerSrc("물쑥")).toBe(
      "/assets/plush-v2/water-mugwort.webp",
    );
    expect(getPantryStickerSrc("미나리")).toBe(
      "/assets/plush-v2/minari.webp",
    );
    expect(getPantryStickerSrc("미나리청")).toBe(
      "/assets/plush-v2/minari-cheong.webp",
    );
    expect(getPantryStickerSrc("미소")).toBe("/assets/plush-v2/miso.webp");
    expect(getPantryStickerSrc("미원")).toBe(
      "/assets/plush-v2/msg-seasoning.webp",
    );
    expect(getPantryStickerSrc("민들레")).toBe(
      "/assets/plush-v2/dandelion.webp",
    );
    expect(getPantryStickerSrc("민들레 잎")).toBe(
      "/assets/plush-v2/dandelion-leaves.webp",
    );
    expect(getPantryStickerSrc("민트")).toBe("/assets/plush-v2/mint.webp");
    expect(getPantryStickerSrc("바질")).toBe(
      "/assets/plush-v2/basil.webp",
    );
    expect(getPantryStickerSrc("방가지똥")).toBe(
      "/assets/plush-v2/sow-thistle-greens.webp",
    );
    expect(getPantryStickerSrc("바닐라 페이스트")).toBe(
      "/assets/plush-v2/vanilla-paste.webp",
    );
    expect(getPantryStickerSrc("바닐라빈 페이스트")).toBe(
      "/assets/plush-v2/vanilla-bean-paste.webp",
    );
    expect(getPantryStickerSrc("바닐라익스트랙")).toBe(
      "/assets/plush-v2/vanilla-extract.webp",
    );
    expect(getPantryStickerSrc("바비큐 소스")).toBe(
      "/assets/plush-v2/barbecue-sauce.webp",
    );
    expect(getPantryStickerSrc("발사믹 식초")).toBe(
      "/assets/plush-v2/balsamic-vinegar.webp",
    );
    expect(getPantryStickerSrc("방울다다기양배추")).toBe(
      "/assets/plush-v2/brussels-sprouts.webp",
    );
    expect(getPantryStickerSrc("배초향")).toBe(
      "/assets/plush-v2/korean-mint-leaves.webp",
    );
    expect(getPantryStickerSrc("배추김치")).toBe(
      "/assets/plush-v2/baechu-kimchi.webp",
    );
    expect(getPantryStickerSrc("버터헤드")).toBe(
      "/assets/plush-v2/butterhead-lettuce.webp",
    );
    expect(getPantryStickerSrc("봄동")).toBe(
      "/assets/plush-v2/bomdong-cabbage.webp",
    );
    expect(getPantryStickerSrc("복숭아씨기름")).toBe(
      "/assets/plush-v2/peach-kernel-oil.webp",
    );
    expect(getPantryStickerSrc("부지깽이")).toBe(
      "/assets/plush-v2/bujiggaengi-greens.webp",
    );
    expect(getPantryStickerSrc("비름")).toBe(
      "/assets/plush-v2/amaranth-greens.webp",
    );
    expect(getPantryStickerSrc("비비추")).toBe(
      "/assets/plush-v2/hosta-leaves.webp",
    );
    expect(getPantryStickerSrc("사우전드아일랜드")).toBe(
      "/assets/plush-v2/thousand-island-dressing.webp",
    );
    expect(getPantryStickerSrc("비타민채")).toBe(
      "/assets/plush-v2/vitamin-greens.webp",
    );
    expect(getPantryStickerSrc("사프란")).toBe(
      "/assets/plush-v2/saffron.webp",
    );
    expect(getPantryStickerSrc("뽕잎")).toBe(
      "/assets/plush-v2/mulberry-leaves.webp",
    );
    expect(getPantryStickerSrc("산초")).toBe(
      "/assets/plush-v2/sansho-pepper.webp",
    );
    expect(getPantryStickerSrc("삼나물")).toBe(
      "/assets/plush-v2/samnamul-greens.webp",
    );
    expect(getPantryStickerSrc("삼채")).toBe(
      "/assets/plush-v2/samchae.webp",
    );
    expect(getPantryStickerSrc("섬초롱")).toBe(
      "/assets/plush-v2/island-bellflower-greens.webp",
    );
    expect(getPantryStickerSrc("셀러리")).toBe(
      "/assets/plush-v2/celery.webp",
    );
    expect(getPantryStickerSrc("생강 페이스트")).toBe(
      "/assets/plush-v2/ginger-paste.webp",
    );
    expect(getPantryStickerSrc("생강청")).toBe(
      "/assets/plush-v2/ginger-cheong.webp",
    );
    expect(getPantryStickerSrc("수끼 소스")).toBe(
      "/assets/plush-v2/suki-sauce.webp",
    );
    expect(getPantryStickerSrc("슈가파우더")).toBe(
      "/assets/plush-v2/powdered-sugar.webp",
    );
    expect(getPantryStickerSrc("스리라차 소스")).toBe(
      "/assets/plush-v2/sriracha-sauce.webp",
    );
    expect(getPantryStickerSrc("시럽")).toBe("/assets/plush-v2/syrup.webp");
    expect(getPantryStickerSrc("소리쟁이")).toBe(
      "/assets/plush-v2/curly-dock-greens.webp",
    );
    expect(getPantryStickerSrc("쇠귀나물")).toBe(
      "/assets/plush-v2/arrowhead-greens.webp",
    );
    expect(getPantryStickerSrc("수리취")).toBe(
      "/assets/plush-v2/surichwi-greens.webp",
    );
    expect(getPantryStickerSrc("숙주나물")).toBe(
      "/assets/plush-v2/mung-bean-sprouts.webp",
    );
    expect(getPantryStickerSrc("시금치")).toBe(
      "/assets/plush-v2/spinach.webp",
    );
    expect(getPantryStickerSrc("시래기")).toBe(
      "/assets/plush-v2/dried-radish-greens-siraegi.webp",
    );
    expect(getPantryStickerSrc("신선초")).toBe(
      "/assets/plush-v2/ashitaba-greens.webp",
    );
    expect(getPantryStickerSrc("쌀겨기름")).toBe(
      "/assets/plush-v2/rice-bran-oil.webp",
    );
    expect(getPantryStickerSrc("쌈장")).toBe(
      "/assets/plush-v2/ssamjang.webp",
    );
    expect(getPantryStickerSrc("쌈추")).toBe(
      "/assets/plush-v2/ssamchu.webp",
    );
    expect(getPantryStickerSrc("쑥")).toBe(
      "/assets/plush-v2/mugwort.webp",
    );
    expect(getPantryStickerSrc("쑥갓")).toBe(
      "/assets/plush-v2/crown-daisy-greens.webp",
    );
    expect(getPantryStickerSrc("쑥부쟁이")).toBe(
      "/assets/plush-v2/aster-greens.webp",
    );
    expect(getPantryStickerSrc("아마씨유")).toBe(
      "/assets/plush-v2/flaxseed-oil.webp",
    );
    expect(getPantryStickerSrc("아몬드유")).toBe(
      "/assets/plush-v2/almond-oil.webp",
    );
    expect(getPantryStickerSrc("아보카도유")).toBe(
      "/assets/plush-v2/avocado-oil.webp",
    );
    expect(getPantryStickerSrc("알룰로스")).toBe(
      "/assets/plush-v2/allulose.webp",
    );
    expect(getPantryStickerSrc("애플민트")).toBe(
      "/assets/plush-v2/apple-mint.webp",
    );
    expect(getPantryStickerSrc("액젓")).toBe(
      "/assets/plush-v2/fish-sauce.webp",
    );
    expect(getPantryStickerSrc("양갱")).toBe(
      "/assets/plush-v2/yanggaeng.webp",
    );
    expect(getPantryStickerSrc("양파시즈닝")).toBe(
      "/assets/plush-v2/onion-seasoning.webp",
    );
    expect(getPantryStickerSrc("연겨자")).toBe(
      "/assets/plush-v2/korean-soft-mustard-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("열무김치 국물")).toBe(
      "/assets/plush-v2/young-radish-kimchi-brine.webp",
    );
    expect(getPantryStickerSrc("열무 김치")).toBe(
      "/assets/plush-v2/yeolmu-kimchi.webp",
    );
    expect(getPantryStickerSrc("엿")).toBe("/assets/plush-v2/yeot.webp");
    expect(getPantryStickerSrc("오레가노")).toBe(
      "/assets/plush-v2/oregano.webp",
    );
    expect(getPantryStickerSrc("오리엔탈")).toBe(
      "/assets/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈 소스")).toBe(
      "/assets/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈 드레싱")).toBe(
      "/assets/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오리엔탈드레싱")).toBe(
      "/assets/plush-v2/oriental-dressing.webp",
    );
    expect(getPantryStickerSrc("오이 소박이")).toBe(
      "/assets/plush-v2/cucumber-sobagi.webp",
    );
    expect(getPantryStickerSrc("오이 피클")).toBe(
      "/assets/plush-v2/cucumber-pickle.webp",
    );
    expect(getPantryStickerSrc("오이지")).toBe(
      "/assets/plush-v2/oiji.webp",
    );
    expect(getPantryStickerSrc("옥수수기름")).toBe(
      "/assets/plush-v2/corn-oil.webp",
    );
    expect(getPantryStickerSrc("올리브 오일")).toBe(
      "/assets/plush-v2/olive-oil-bottle.webp",
    );
    expect(getPantryStickerSrc("올리브 절임")).toBe(
      "/assets/plush-v2/pickled-olives.webp",
    );
    expect(getPantryStickerSrc("올리브유")).toBe(
      "/assets/plush-v2/olive-oil.webp",
    );
    expect(getPantryStickerSrc("올스파이스")).toBe(
      "/assets/plush-v2/allspice.webp",
    );
    expect(getPantryStickerSrc("우스터 소스")).toBe(
      "/assets/plush-v2/worcestershire-sauce.webp",
    );
    expect(getPantryStickerSrc("울외장아찌")).toBe(
      "/assets/plush-v2/pickled-oriental-melon.webp",
    );
    expect(getPantryStickerSrc("원당")).toBe(
      "/assets/plush-v2/raw-sugar.webp",
    );
    expect(getPantryStickerSrc("월계수잎")).toBe(
      "/assets/plush-v2/bay-leaves.webp",
    );
    expect(getPantryStickerSrc("유자청")).toBe(
      "/assets/plush-v2/yuja-cheong.webp",
    );
    expect(getPantryStickerSrc("유채 김치")).toBe(
      "/assets/plush-v2/yuchae-kimchi.webp",
    );
    expect(getPantryStickerSrc("유채씨기름")).toBe(
      "/assets/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("잇꽃씨기름")).toBe(
      "/assets/plush-v2/safflower-seed-oil.webp",
    );
    expect(getPantryStickerSrc("카놀라유")).toBe(
      "/assets/plush-v2/rapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("육두구")).toBe(
      "/assets/plush-v2/nutmeg.webp",
    );
    expect(getPantryStickerSrc("젤라틴")).toBe(
      "/assets/plush-v2/gelatin.webp",
    );
    expect(getPantryStickerSrc("정향")).toBe(
      "/assets/plush-v2/cloves.webp",
    );
    expect(getPantryStickerSrc("조청")).toBe(
      "/assets/plush-v2/jocheong.webp",
    );
    expect(getPantryStickerSrc("짜장 소스")).toBe(
      "/assets/plush-v2/jajang-sauce.webp",
    );
    expect(getPantryStickerSrc("짜장라면")).toBe(
      "/assets/plush-v2/jajang-ramen.webp",
    );
    expect(getPantryStickerSrc("청국장")).toBe(
      "/assets/plush-v2/cheonggukjang.webp",
    );
    expect(getPantryStickerSrc("초고추장")).toBe(
      "/assets/plush-v2/cho-gochujang.webp",
    );
    expect(getPantryStickerSrc("초콜릿")).toBe(
      "/assets/plush-v2/chocolate.webp",
    );
    expect(getPantryStickerSrc("춘장")).toBe(
      "/assets/plush-v2/chunjang.webp",
    );
    expect(getPantryStickerSrc("치즈시즈닝")).toBe(
      "/assets/plush-v2/cheese-seasoning.webp",
    );
    expect(getPantryStickerSrc("치킨스톡")).toBe(
      "/assets/plush-v2/chicken-stock.webp",
    );
    expect(getPantryStickerSrc("칠리 소스")).toBe(
      "/assets/plush-v2/chili-sauce.webp",
    );
    expect(getPantryStickerSrc("칠리파우더")).toBe(
      "/assets/plush-v2/chili-powder.webp",
    );
    expect(getPantryStickerSrc("코코아 파우더")).toBe(
      "/assets/plush-v2/cocoa-powder.webp",
    );
    expect(getPantryStickerSrc("코코넛유")).toBe(
      "/assets/plush-v2/coconut-oil.webp",
    );
    expect(getPantryStickerSrc("콩기름")).toBe(
      "/assets/plush-v2/soybean-oil.webp",
    );
    expect(getPantryStickerSrc("타라곤")).toBe(
      "/assets/plush-v2/tarragon.webp",
    );
    expect(getPantryStickerSrc("타임")).toBe(
      "/assets/plush-v2/thyme.webp",
    );
    expect(getPantryStickerSrc("파슬리")).toBe(
      "/assets/plush-v2/parsley.webp",
    );
    expect(getPantryStickerSrc("파슬리 가루")).toBe(
      "/assets/plush-v2/parsley-powder.webp",
    );
    expect(getPantryStickerSrc("팜유")).toBe(
      "/assets/plush-v2/palm-oil.webp",
    );
    expect(getPantryStickerSrc("페퍼민트")).toBe(
      "/assets/plush-v2/peppermint.webp",
    );
    expect(getPantryStickerSrc("포도씨유")).toBe(
      "/assets/plush-v2/grapeseed-oil.webp",
    );
    expect(getPantryStickerSrc("포도당")).toBe(
      "/assets/plush-v2/glucose.webp",
    );
    expect(getPantryStickerSrc("카레가루")).toBe(
      "/assets/plush-v2/curry-powder.webp",
    );
    expect(getPantryStickerSrc("캐러멜")).toBe(
      "/assets/plush-v2/caramel.webp",
    );
    expect(getPantryStickerSrc("커스터드")).toBe(
      "/assets/plush-v2/custard.webp",
    );
    expect(getPantryStickerSrc("케첩")).toBe(
      "/assets/plush-v2/ketchup.webp",
    );
    expect(getPantryStickerSrc("탕수육 소스")).toBe(
      "/assets/plush-v2/sweet-and-sour-pork-sauce.webp",
    );
    expect(getPantryStickerSrc("템페")).toBe(
      "/assets/plush-v2/tempeh.webp",
    );
    expect(getPantryStickerSrc("토마토 케첩")).toBe(
      "/assets/plush-v2/ketchup.webp",
    );
    expect(getPantryStickerSrc("팟타이 소스")).toBe(
      "/assets/plush-v2/pad-thai-sauce.webp",
    );
    expect(getPantryStickerSrc("하이라이스가루")).toBe(
      "/assets/plush-v2/hayashi-rice-powder.webp",
    );
    expect(getPantryStickerSrc("핫 소스")).toBe(
      "/assets/plush-v2/hot-sauce.webp",
    );
    expect(getPantryStickerSrc("해물육수")).toBe(
      "/assets/plush-v2/seafood-stock-coin.webp",
    );
    expect(getPantryStickerSrc("해물육수(코인)")).toBe(
      "/assets/plush-v2/seafood-stock-coin.webp",
    );
    expect(getPantryStickerSrc("해선장")).toBe(
      "/assets/plush-v2/hoisin-sauce.webp",
    );
    expect(getPantryStickerSrc("해바라기유")).toBe(
      "/assets/plush-v2/sunflower-oil.webp",
    );
    expect(getPantryStickerSrc("허브솔트")).toBe(
      "/assets/plush-v2/herb-salt.webp",
    );
    expect(getPantryStickerSrc("호두유")).toBe(
      "/assets/plush-v2/walnut-oil.webp",
    );
    expect(getPantryStickerSrc("참치액")).toBe(
      "/assets/plush-v2/tuna-liquid-seasoning.webp",
    );
    expect(getPantryStickerSrc("총각 김치")).toBe(
      "/assets/plush-v2/chonggak-kimchi.webp",
    );
    expect(getPantryStickerSrc("치킨무")).toBe(
      "/assets/plush-v2/chicken-mu.webp",
    );
    expect(getPantryStickerSrc("파 김치")).toBe(
      "/assets/plush-v2/green-onion-kimchi.webp",
    );
    expect(getPantryStickerSrc("토마토 소스")).toBe(
      "/assets/plush-v2/tomato-sauce.webp",
    );
    expect(getPantryStickerSrc("크림")).toBe(
      "/assets/plush-v2/fresh-cream-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("크림 소스")).toBe(
      "/assets/plush-v2/cream-sauce.webp",
    );
    expect(getPantryStickerSrc("크림소스")).toBe(
      "/assets/plush-v2/cream-sauce.webp",
    );
    expect(getPantryStickerSrc("어간장")).toBe(
      "/assets/plush-v2/fish-soy-sauce.webp",
    );
    expect(getPantryStickerSrc("가래떡")).toBe(
      "/assets/plush-v2/garaetteok-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("가리비")).toBe(
      "/assets/plush-v2/scallop-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("가시오갈피")).toBe(
      "/assets/plush-v2/eleuthero-diary-sticker-no-limbs.webp",
    );
    expect(getPantryStickerSrc("갓")).toBe(
      "/assets/plush-v2/gat-mustard-greens-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("거위고기")).toBe(
      "/assets/plush-v2/goose-meat-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("거위알")).toBe(
      "/assets/plush-v2/goose-egg-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("겨자")).toBe(
      "/assets/plush-v2/mustard-paste-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("겨자 페이스트")).toBe(
      "/assets/plush-v2/mustard-paste-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("고다 치즈")).toBe(
      "/assets/plush-v2/gouda-cheese-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("고등어")).toBe(
      "/assets/plush-v2/mackerel-diary-sticker-anchovy-face.webp",
    );
    expect(getPantryStickerSrc("고추냉이")).toBe(
      "/assets/plush-v2/wasabi-root-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("골든세이지")).toBe(
      "/assets/plush-v2/golden-sage-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("김")).toBe(
      "/assets/plush-v2/gim-bundle-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("맛술")).toBe(
      "/assets/plush-v2/cooking-wine-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("멸치")).toBe(
      "/assets/plush-v2/dried-anchovy-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("모시조개")).toBe(
      "/assets/plush-v2/clam-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("미역")).toBe(
      "/assets/plush-v2/wakame-seaweed-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("빵가루")).toBe(
      "/assets/plush-v2/bread-crumbs-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("생크림")).toBe(
      "/assets/plush-v2/fresh-cream-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("식초")).toBe(
      "/assets/plush-v2/vinegar-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("오징어")).toBe(
      "/assets/plush-v2/squid-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("옥수수전분")).toBe(
      "/assets/plush-v2/corn-starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("올리고당")).toBe(
      "/assets/plush-v2/oligosaccharide-syrup-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("전분")).toBe(
      "/assets/plush-v2/starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("전분가루")).toBe(
      "/assets/plush-v2/starch-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("조개")).toBe(
      "/assets/plush-v2/clam-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("참깨")).toBe(
      "/assets/plush-v2/sesame-seeds-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("들기름")).toBe(
      "/assets/plush-v2/perilla-oil-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("두유 그릭 요거트")).toBe(
      "/assets/plush-v2/soy-milk-greek-yogurt-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("플레인요거트")).toBe(
      "/assets/plush-v2/greek-yogurt-diary-sticker.webp",
    );
    expect(getPantryStickerSrc("소금")).toBe("/assets/plush-v2/salt.webp");
    expect(getPantryStickerSrc("렌틸콩")).toBe("/assets/plush-v2/lentils.webp");
  });

  it("uses the corrected local sticker selections for pilot pantry ingredients", () => {
    expect(getPantryStickerSrc("청양고추")).toBe(
      "/assets/plush-v2/cheongyang-pepper.webp",
    );
    expect(getPantryStickerSrc("오이")).toBe(
      "/assets/plush-v2/cucumber.webp",
    );
    expect(getPantryStickerSrc("가지")).toBe(
      "/assets/plush-v2/eggplant.webp",
    );
  });

  it("returns the generated leafy greens sticker batch from the public plush-v2 folder", () => {
    expect(getPantryStickerSrc("씀바귀")).toBe("/assets/plush-v2/ssumbagwi.webp");
    expect(getPantryStickerSrc("아욱")).toBe("/assets/plush-v2/mallow-greens.webp");
    expect(getPantryStickerSrc("아티초크")).toBe("/assets/plush-v2/artichoke.webp");
    expect(getPantryStickerSrc("알배추")).toBe("/assets/plush-v2/albaechu.webp");
    expect(getPantryStickerSrc("알팔파")).toBe("/assets/plush-v2/alfalfa-sprouts.webp");
    expect(getPantryStickerSrc("양상추")).toBe("/assets/plush-v2/lettuce-v2.webp");
    expect(getPantryStickerSrc("어수리")).toBe("/assets/plush-v2/eosuri-greens.webp");
    expect(getPantryStickerSrc("얼갈이배추")).toBe(
      "/assets/plush-v2/eolgari-cabbage.webp",
    );
    expect(getPantryStickerSrc("엉겅퀴")).toBe("/assets/plush-v2/thistle-greens.webp");
    expect(getPantryStickerSrc("열대비름")).toBe(
      "/assets/plush-v2/tropical-amaranth.webp",
    );
    expect(getPantryStickerSrc("열무")).toBe(
      "/assets/plush-v2/young-radish-greens.webp",
    );
    expect(getPantryStickerSrc("영아자")).toBe("/assets/plush-v2/yeongaja-greens.webp");
    expect(getPantryStickerSrc("우거지")).toBe(
      "/assets/plush-v2/ugeoji-cabbage-leaves.webp",
    );
    expect(getPantryStickerSrc("유채")).toBe("/assets/plush-v2/yu-chae-greens.webp");
    expect(getPantryStickerSrc("적양배추")).toBe("/assets/plush-v2/red-cabbage.webp");
    expect(getPantryStickerSrc("전호")).toBe("/assets/plush-v2/jeonho-greens.webp");
    expect(getPantryStickerSrc("제비쑥")).toBe("/assets/plush-v2/jebi-mugwort.webp");
    expect(getPantryStickerSrc("줄나물")).toBe("/assets/plush-v2/julnamul-greens.webp");
    expect(getPantryStickerSrc("질경이")).toBe("/assets/plush-v2/plantain-greens.webp");
    expect(getPantryStickerSrc("쪽파")).toBe("/assets/plush-v2/jjokpa.webp");
    expect(getPantryStickerSrc("차이브")).toBe("/assets/plush-v2/chives-v2.webp");
    expect(getPantryStickerSrc("참나물")).toBe("/assets/plush-v2/chamnamul.webp");
    expect(getPantryStickerSrc("참반디")).toBe(
      "/assets/plush-v2/chambandi-greens.webp",
    );
    expect(getPantryStickerSrc("참죽나물")).toBe("/assets/plush-v2/chamjuk-namul.webp");
    expect(getPantryStickerSrc("청경채")).toBe("/assets/plush-v2/bok-choy.webp");
    expect(getPantryStickerSrc("취나물")).toBe("/assets/plush-v2/chwinamul.webp");
    expect(getPantryStickerSrc("치커리")).toBe("/assets/plush-v2/chicory.webp");
    expect(getPantryStickerSrc("케일")).toBe("/assets/plush-v2/kale.webp");
    expect(getPantryStickerSrc("콩잎")).toBe("/assets/plush-v2/soybean-leaves.webp");
    expect(getPantryStickerSrc("토스카노")).toBe("/assets/plush-v2/tuscan-kale.webp");
    expect(getPantryStickerSrc("파드득나물")).toBe(
      "/assets/plush-v2/padeudeuk-namul.webp",
    );
  });

  it("returns the generated vegetable and mushroom sticker batches from the public plush-v2 folder", () => {
    expect(getPantryStickerSrc("검은비늘버섯")).toBe(
      "/assets/plush-v2/black-scaled-mushroom.webp",
    );
    expect(getPantryStickerSrc("목이버섯")).toBe("/assets/plush-v2/wood-ear-mushroom.webp");
    expect(getPantryStickerSrc("송이버섯")).toBe(
      "/assets/plush-v2/matsutake-mushroom.webp",
    );
    expect(getPantryStickerSrc("양파즙")).toBe("/assets/plush-v2/onion-juice.webp");
    expect(getPantryStickerSrc("토마토 주스")).toBe("/assets/plush-v2/tomato-juice.webp");
    expect(getPantryStickerSrc("고추")).toBe("/assets/plush-v2/chili-pepper.webp");
    expect(getPantryStickerSrc("홍고추")).toBe("/assets/plush-v2/red-chili-pepper.webp");
    expect(getPantryStickerSrc("고비")).toBe("/assets/plush-v2/gobi-fern.webp");
    expect(getPantryStickerSrc("알배기")).toBe("/assets/plush-v2/albaegi-cabbage.webp");
    expect(getPantryStickerSrc("코울슬로")).toBe("/assets/plush-v2/coleslaw.webp");
    expect(getPantryStickerSrc("포타벨라")).toBe(
      "/assets/plush-v2/portabella-mushroom.webp",
    );
    expect(getPantryStickerSrc("냉동야채")).toBe(
      "/assets/plush-v2/frozen-vegetables.webp",
    );
  });

  it("returns the generated fruit, grain, and soy sticker batches from the public plush-v2 folder", () => {
    const expectedStickers: Array<[string, string]> = [
      ["구기자", "/assets/plush-v2/goji-berry.webp"],
      ["국화꽃", "/assets/plush-v2/chrysanthemum-flower.webp"],
      ["꾸지뽕", "/assets/plush-v2/cudrania.webp"],
      ["날개콩", "/assets/plush-v2/winged-bean.webp"],
      ["늙은호박", "/assets/plush-v2/mature-pumpkin.webp"],
      ["단호박", "/assets/plush-v2/kabocha-squash.webp"],
      ["동아", "/assets/plush-v2/winter-melon.webp"],
      ["모시풀", "/assets/plush-v2/ramie-leaf.webp"],
      ["박", "/assets/plush-v2/bottle-gourd.webp"],
      ["박고지", "/assets/plush-v2/dried-gourd-strips.webp"],
      ["브로콜리", "/assets/plush-v2/broccoli.webp"],
      ["사탕수수", "/assets/plush-v2/sugarcane.webp"],
      ["선인장", "/assets/plush-v2/cactus.webp"],
      ["아보카도", "/assets/plush-v2/avocado.webp"],
      ["아스파라거스", "/assets/plush-v2/asparagus.webp"],
      ["아주까리", "/assets/plush-v2/castor-bean.webp"],
      ["알로에", "/assets/plush-v2/aloe.webp"],
      ["여주", "/assets/plush-v2/bitter-melon.webp"],
      ["염교", "/assets/plush-v2/rakkyo.webp"],
      ["오크라", "/assets/plush-v2/okra.webp"],
      ["원추리", "/assets/plush-v2/daylily.webp"],
      ["잇꽃", "/assets/plush-v2/safflower.webp"],
      ["자운영", "/assets/plush-v2/chinese-milk-vetch.webp"],
      ["쥬키니", "/assets/plush-v2/zucchini.webp"],
      ["편강", "/assets/plush-v2/candied-ginger.webp"],
      ["호박", "/assets/plush-v2/pumpkin.webp"],
      ["옥수수콘", "/assets/plush-v2/corn-kernels.webp"],
      ["귀리", "/assets/plush-v2/oats.webp"],
      ["귀리밥", "/assets/plush-v2/oat-rice.webp"],
      ["기장", "/assets/plush-v2/proso-millet.webp"],
      ["누룽지", "/assets/plush-v2/scorched-rice.webp"],
      ["멥쌀", "/assets/plush-v2/short-grain-rice.webp"],
      ["보리", "/assets/plush-v2/barley.webp"],
      ["수수", "/assets/plush-v2/sorghum.webp"],
      ["쌀밥", "/assets/plush-v2/cooked-rice.webp"],
      ["옥수수", "/assets/plush-v2/corn.webp"],
      ["율무", "/assets/plush-v2/adlay.webp"],
      ["잡곡", "/assets/plush-v2/mixed-grains.webp"],
      ["조", "/assets/plush-v2/foxtail-millet.webp"],
      ["즉석밥", "/assets/plush-v2/instant-rice.webp"],
      ["퀴노아", "/assets/plush-v2/quinoa.webp"],
      ["녹두묵", "/assets/plush-v2/mung-bean-jelly.webp"],
      ["대두", "/assets/plush-v2/soybeans.webp"],
      ["도토리묵", "/assets/plush-v2/acorn-jelly.webp"],
      ["동부", "/assets/plush-v2/cowpeas.webp"],
      ["두유", "/assets/plush-v2/soy-milk.webp"],
      ["렌틸콩", "/assets/plush-v2/lentils.webp"],
      ["리마콩", "/assets/plush-v2/lima-beans.webp"],
      ["메밀묵", "/assets/plush-v2/buckwheat-jelly.webp"],
      ["병아리콩", "/assets/plush-v2/chickpeas.webp"],
      ["비지", "/assets/plush-v2/okara.webp"],
      ["순두부", "/assets/plush-v2/silken-tofu.webp"],
      ["연두부", "/assets/plush-v2/soft-tofu.webp"],
      ["옥수수묵", "/assets/plush-v2/corn-jelly.webp"],
      ["올방개묵", "/assets/plush-v2/olbanggae-jelly.webp"],
      ["완두", "/assets/plush-v2/peas.webp"],
      ["유부", "/assets/plush-v2/fried-tofu.webp"],
      ["잠두", "/assets/plush-v2/broad-beans.webp"],
      ["쥐눈이콩", "/assets/plush-v2/jwinuni-beans.webp"],
      ["콩가루", "/assets/plush-v2/soy-flour.webp"],
      ["콩고기", "/assets/plush-v2/soy-meat.webp"],
      ["콩고물", "/assets/plush-v2/roasted-soybean-powder.webp"],
      ["콩국물", "/assets/plush-v2/soy-broth.webp"],
      ["팥", "/assets/plush-v2/red-beans.webp"],
      ["팥 앙금", "/assets/plush-v2/red-bean-paste.webp"],
      ["흑태", "/assets/plush-v2/black-soybeans.webp"],
      ["고구마말랭이", "/assets/plush-v2/dried-sweet-potato.webp"],
      ["곤약", "/assets/plush-v2/konjac.webp"],
      ["녹두", "/assets/plush-v2/mung-beans.webp"],
      ["다식", "/assets/plush-v2/dasik.webp"],
      ["도토리", "/assets/plush-v2/acorns.webp"],
      ["돼지감자", "/assets/plush-v2/jerusalem-artichoke.webp"],
      ["마", "/assets/plush-v2/yam.webp"],
      ["미음", "/assets/plush-v2/rice-gruel.webp"],
      ["시리얼", "/assets/plush-v2/cereal.webp"],
      ["실곤약", "/assets/plush-v2/konjac-noodles.webp"],
      ["아마란스", "/assets/plush-v2/amaranth.webp"],
      ["아피오스감자", "/assets/plush-v2/apios-potato.webp"],
      ["야콘", "/assets/plush-v2/yacon.webp"],
      ["엿기름", "/assets/plush-v2/malted-barley.webp"],
      ["유과", "/assets/plush-v2/yugwa.webp"],
      ["작두", "/assets/plush-v2/sword-bean.webp"],
      ["천마", "/assets/plush-v2/gastrodia.webp"],
      ["칡", "/assets/plush-v2/kudzu-root.webp"],
      ["콘샐러드", "/assets/plush-v2/corn-salad.webp"],
      ["토란", "/assets/plush-v2/taro.webp"],
      ["팽화", "/assets/plush-v2/puffed-grain.webp"],
      ["피", "/assets/plush-v2/barnyard-millet.webp"],
      ["해시브라운", "/assets/plush-v2/hash-brown.webp"],
      ["히카마", "/assets/plush-v2/jicama.webp"],
      ["녹두당면", "/assets/plush-v2/mung-bean-glass-noodles.webp"],
      ["라면", "/assets/plush-v2/ramen-noodles.webp"],
      ["마카로니", "/assets/plush-v2/macaroni.webp"],
      ["메밀 국수", "/assets/plush-v2/buckwheat-noodles.webp"],
      ["멥쌀 국수", "/assets/plush-v2/short-grain-rice-noodles.webp"],
      ["수제비면", "/assets/plush-v2/sujebi-noodles.webp"],
      ["에그누들", "/assets/plush-v2/egg-noodles.webp"],
      ["우동면", "/assets/plush-v2/udon-noodles.webp"],
      ["중식면", "/assets/plush-v2/chinese-noodles.webp"],
      ["쫄면", "/assets/plush-v2/jjolmyeon-noodles.webp"],
      ["찹쌀 국수", "/assets/plush-v2/glutinous-rice-noodles.webp"],
      ["칼국수면", "/assets/plush-v2/kalguksu-noodles.webp"],
      ["파스타면", "/assets/plush-v2/pasta-noodles.webp"],
      ["떡국떡", "/assets/plush-v2/tteokguk-rice-cakes.webp"],
      ["모싯잎송편", "/assets/plush-v2/ramie-leaf-songpyeon.webp"],
      ["밀떡", "/assets/plush-v2/wheat-tteok.webp"],
      ["백설기", "/assets/plush-v2/baekseolgi.webp"],
      ["송편", "/assets/plush-v2/songpyeon.webp"],
      ["인절미", "/assets/plush-v2/injeolmi.webp"],
      ["절편", "/assets/plush-v2/jeolpyeon.webp"],
      ["증편", "/assets/plush-v2/jeungpyeon.webp"],
      ["찹쌀떡", "/assets/plush-v2/chapssal-tteok.webp"],
      ["난", "/assets/plush-v2/naan.webp"],
      ["또띠아", "/assets/plush-v2/tortilla.webp"],
      ["머핀", "/assets/plush-v2/muffin.webp"],
      ["모닝빵", "/assets/plush-v2/morning-rolls.webp"],
      ["바게트", "/assets/plush-v2/baguette.webp"],
      ["베이글", "/assets/plush-v2/bagel.webp"],
      ["비스킷", "/assets/plush-v2/biscuit.webp"],
      ["식빵", "/assets/plush-v2/sliced-bread.webp"],
      ["웨하스", "/assets/plush-v2/wafers.webp"],
      ["초코칩", "/assets/plush-v2/chocolate-chips.webp"],
      ["카스텔라", "/assets/plush-v2/castella.webp"],
      ["쿠키", "/assets/plush-v2/cookies.webp"],
      ["크래커", "/assets/plush-v2/crackers.webp"],
      ["팬케이크가루", "/assets/plush-v2/pancake-mix.webp"],
      ["호밀빵", "/assets/plush-v2/rye-bread.webp"],
      ["통밀 식빵", "/assets/plush-v2/whole-wheat-sliced-bread.webp"],
      ["냉동만두", "/assets/plush-v2/frozen-dumplings.webp"],
      ["베이킹파우더", "/assets/plush-v2/baking-powder.webp"],
      ["인스턴트 드라이 이스트", "/assets/plush-v2/instant-dry-yeast.webp"],
      ["강력분", "/assets/plush-v2/bread-flour.webp"],
      ["메밀", "/assets/plush-v2/buckwheat-groats.webp"],
      ["미숫가루", "/assets/plush-v2/misutgaru.webp"],
      ["리코타 치즈", "/assets/plush-v2/ricotta-cheese-tub-diary-sticker.webp"],
      ["모짜렐라 치즈", "/assets/plush-v2/mozzarella-cheese-diary-sticker.webp"],
      ["무염버터", "/assets/plush-v2/unsalted-butter-diary-sticker.webp"],
      ["분유", "/assets/plush-v2/powdered-milk-diary-sticker.webp"],
      ["브리 치즈", "/assets/plush-v2/brie-cheese-diary-sticker.webp"],
      ["블루 치즈", "/assets/plush-v2/blue-cheese-diary-sticker.webp"],
      ["산양유", "/assets/plush-v2/goat-milk-diary-sticker.webp"],
      ["셔벗", "/assets/plush-v2/sherbet-diary-sticker.webp"],
      ["아이스밀크", "/assets/plush-v2/ice-milk-diary-sticker.webp"],
      ["아이스크림", "/assets/plush-v2/ice-cream-diary-sticker.webp"],
      ["연유", "/assets/plush-v2/condensed-milk-diary-sticker.webp"],
      ["요구르트", "/assets/plush-v2/yogurt-diary-sticker.webp"],
      ["체다 치즈", "/assets/plush-v2/cheddar-cheese-diary-sticker.webp"],
      ["카망베르 치즈", "/assets/plush-v2/camembert-cheese-diary-sticker.webp"],
      ["카테지 치즈", "/assets/plush-v2/cottage-cheese-diary-sticker.webp"],
      ["크림치즈", "/assets/plush-v2/cream-cheese-diary-sticker.webp"],
      ["파르메산 치즈", "/assets/plush-v2/parmesan-cheese-diary-sticker.webp"],
      ["화이트크림", "/assets/plush-v2/white-cream-diary-sticker.webp"],
      ["들깨", "/assets/plush-v2/perilla-seeds-diary-sticker.webp"],
      ["땅콩", "/assets/plush-v2/peanut-diary-sticker.webp"],
      ["마름", "/assets/plush-v2/water-caltrop-diary-sticker.webp"],
      ["마카다미아", "/assets/plush-v2/macadamia-diary-sticker.webp"],
      ["머루씨", "/assets/plush-v2/wild-grape-seeds-diary-sticker.webp"],
      ["목화씨", "/assets/plush-v2/cotton-seeds-diary-sticker.webp"],
      ["밤", "/assets/plush-v2/chestnut-diary-sticker.webp"],
      ["브라질너트", "/assets/plush-v2/brazil-nut-diary-sticker.webp"],
      ["삼씨", "/assets/plush-v2/hemp-seeds-diary-sticker.webp"],
      ["아마씨", "/assets/plush-v2/flax-seeds-diary-sticker.webp"],
      ["아몬드", "/assets/plush-v2/almond-diary-sticker.webp"],
      ["연씨", "/assets/plush-v2/lotus-seeds-diary-sticker.webp"],
      ["은행", "/assets/plush-v2/ginkgo-nut-diary-sticker.webp"],
      ["잣", "/assets/plush-v2/pine-nuts-diary-sticker.webp"],
      ["잣두부", "/assets/plush-v2/pine-nut-tofu-diary-sticker.webp"],
      ["치아씨", "/assets/plush-v2/chia-seeds-diary-sticker.webp"],
      ["캐슈너트", "/assets/plush-v2/cashew-nut-diary-sticker.webp"],
      ["피스타치오", "/assets/plush-v2/pistachio-diary-sticker.webp"],
      ["피칸", "/assets/plush-v2/pecan-diary-sticker.webp"],
      ["해바라기씨", "/assets/plush-v2/sunflower-seeds-diary-sticker.webp"],
      ["헤이즐넛", "/assets/plush-v2/hazelnut-diary-sticker.webp"],
      ["호두", "/assets/plush-v2/walnut-diary-sticker.webp"],
      ["호박씨", "/assets/plush-v2/pumpkin-seeds-diary-sticker.webp"],
      ["가염버터", "/assets/plush-v2/salted-butter-diary-sticker.webp"],
      ["그릭 요거트", "/assets/plush-v2/greek-yogurt-diary-sticker.webp"],
      ["물", "/assets/plush-v2/water-diary-sticker.webp"],
      ["얼음", "/assets/plush-v2/ice-diary-sticker.webp"],
      ["탄산수", "/assets/plush-v2/sparkling-water-diary-sticker.webp"],
    ];

    for (const [name, src] of expectedStickers) {
      expect(getPantryStickerSrc(name)).toBe(src);
    }
  });

  it("keeps plush-v2 sticker sources as 512px WebP assets for crisp pantry rendering", () => {
    const items = stickerManifest.items as Record<string, PantryStickerManifestItem>;

    expect(Object.keys(items)).toHaveLength(591);

    for (const item of Object.values(items)) {
      expect(item.src).toMatch(/^\/assets\/plush-v2\/.+\.webp$/);
      expect(readVp8Size(item.src)).toEqual({ width: 512, height: 512 });
    }
  });
});
