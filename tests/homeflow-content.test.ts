import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    HOMEFLOW_CHARACTER_ASSETS,
    HOMEFLOW_DEMO_NUTRITION,
    HOMEFLOW_INGREDIENTS,
    HOMEFLOW_RESULTS,
    INITIAL_HOMEFLOW_DEMO,
} from "@/lib/marketing/homeflow-content";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", {
    paths: [path.dirname(require.resolve("next/package.json"))],
})) as (input: string) => {
    metadata(): Promise<{ format?: string; width?: number; height?: number; hasAlpha?: boolean }>;
    stats(): Promise<{ channels: Array<{ min: number; max: number }> }>;
};

const ingredientImages = [
    "pork", "green-onion", "kimchi", "sugar", "red-pepper-powder",
    "soy-sauce", "cooked-rice", "butter", "egg",
];

describe("homeflow approved example content", () => {
    it("keeps all nine user-provided amounts without inventing egg weight or serving nutrition", () => {
        expect(HOMEFLOW_INGREDIENTS.map(({ name, amount }) => [name, amount])).toEqual([
            ["삼겹살", "120g"], ["대파", "50g"], ["잘 익은 김치", "210g"], ["설탕", "3g"],
            ["고춧가루", "4g"], ["진간장", "7g"], ["즉석밥", "210g"], ["버터", "8g"], ["계란후라이", "1개"],
        ]);
        expect(INITIAL_HOMEFLOW_DEMO.excluded).toEqual(["sugar", "chili", "soy"]);
        expect(INITIAL_HOMEFLOW_DEMO.recorded).toBe(false);
    });

    it("starts with five purchases while the egg remains unchecked and pantry items stay separate", () => {
        expect(INITIAL_HOMEFLOW_DEMO.purchased).toEqual(["pork", "scallion", "kimchi", "rice", "butter"]);
        expect(INITIAL_HOMEFLOW_DEMO.purchased).not.toContain("egg");
        expect(INITIAL_HOMEFLOW_DEMO.purchased.some(id => INITIAL_HOMEFLOW_DEMO.excluded.includes(id))).toBe(false);
        expect(INITIAL_HOMEFLOW_DEMO.shoppingCompleted).toBe(false);
    });

    it("maps each ingredient to its existing plush image", () => {
        expect(HOMEFLOW_INGREDIENTS.map(item => item.imageSrc)).toEqual(
            ingredientImages.map(name => `/assets/ingredients/plush-v2/${name}.webp`),
        );
        for (const ingredient of HOMEFLOW_INGREDIENTS) {
            expect(existsSync(path.join(process.cwd(), "public", ingredient.imageSrc))).toBe(true);
        }
    });

    it("connects the four results to distinct supplied characters and concise two-line descriptions", () => {
        expect(Object.keys(HOMEFLOW_RESULTS)).toEqual(["spontaneous", "mental", "memo", "scheduled"]);
        expect(Object.values(HOMEFLOW_RESULTS).map(result => result.description)).toEqual([
            "냉장고 앞에서 시작되는 메뉴 회의.\n오늘의 메뉴, 방금 정했어요.",
            "일주일 메뉴는 머릿속에 저장 완료.\n마트에만 가면 잠깐 로딩 중이에요.",
            "레시피는 꼼꼼히 모아뒀어요.\n오늘도 저장한 레시피를 찾는 중!",
            "미래의 나에게 메뉴 배정 완료.\n남은 건 계획을 실행하는 것뿐!",
        ]);
        for (const [key, result] of Object.entries(HOMEFLOW_RESULTS)) {
            expect(result.characterSrc).toBe(`/assets/funnel/homeflow/characters/${key}-transparent.webp`);
            expect(result.description.split("\n")).toHaveLength(2);
            expect(result.characterAlt.length).toBeGreaterThan(10);
        }
        expect(HOMEFLOW_CHARACTER_ASSETS).toEqual({
            hero: "/assets/funnel/homeflow/characters/hero-ad-pointing-transparent.webp",
            invitation: "/assets/funnel/homeflow/characters/invitation-transparent.webp",
            success: "/assets/funnel/homeflow/characters/success-transparent.webp",
        });
    });

    it("ships the ad character and six cutouts as genuinely transparent bounded WebP files", async () => {
        const sources = [
            HOMEFLOW_CHARACTER_ASSETS.hero,
            ...Object.values(HOMEFLOW_RESULTS).map(result => result.characterSrc),
            HOMEFLOW_CHARACTER_ASSETS.invitation,
            HOMEFLOW_CHARACTER_ASSETS.success,
        ];
        expect(sources.every(src => typeof src === "string")).toBe(true);
        const manifestPath = path.join(process.cwd(), "docs/marketing/assets/homeflow-transparent-manifest.json");
        expect(existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            assets: Array<{ output: string; bytes: number; width: number; height: number }>;
        };
        expect(manifest.assets.filter(asset => sources.some(src => asset.output === `public${src}`))).toHaveLength(7);
        for (const src of sources) {
            const assetPath = path.join(process.cwd(), "public", src!);
            expect(existsSync(assetPath)).toBe(true);
            const bytes = statSync(assetPath).size;
            expect(bytes).toBeLessThan(150 * 1024);
            const metadata = await sharp(assetPath).metadata();
            expect(metadata.format).toBe("webp");
            expect(metadata.hasAlpha).toBe(true);
            const statistics = await sharp(assetPath).stats();
            expect(statistics.channels[3].min).toBe(0);
            expect(statistics.channels[3].max).toBe(255);
            expect(metadata.width).toBeGreaterThanOrEqual(500);
            expect(metadata.width).toBeLessThanOrEqual(720);
            expect(metadata.height).toBeLessThanOrEqual(960);
            expect(manifest.assets.find(asset => asset.output === `public${src}`)).toMatchObject({
                output: `public${src}`, bytes, width: metadata.width, height: metadata.height,
            });
        }
    });
    it("adds the user-provided 300g nutrition to the existing demo baseline", () => {
        for (const key of ["calories", "carbs", "protein", "fat"] as const) {
            expect(HOMEFLOW_DEMO_NUTRITION.total[key]).toBe(HOMEFLOW_DEMO_NUTRITION.baseline[key] + HOMEFLOW_DEMO_NUTRITION.dinner[key]);
        }
        expect(HOMEFLOW_DEMO_NUTRITION.note).toContain("체험 예시");
        expect(HOMEFLOW_DEMO_NUTRITION.dinner).toEqual({ calories: 608, carbs: 56, protein: 25, fat: 32 });
        expect(HOMEFLOW_DEMO_NUTRITION.detail).toContain("300g");
    });
});
