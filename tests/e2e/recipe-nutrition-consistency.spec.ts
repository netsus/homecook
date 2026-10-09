import {expect,test} from "@playwright/test";
import {installRecipeDetailRoutes,RECIPE_PATH,setE2EAuthOverride} from "./helpers/mock-routes";
import type {RecipeNutrition} from "../../types/recipe";
const value=(amount:number)=>({amount,known_amount:amount,status:"complete" as const,display_mode:"total" as const});
const nutrition:RecipeNutrition={basis:{amount:2,unit:"serving"},base_servings:2,values:{energy_kcal:value(800),carbohydrate_g:value(100),protein_g:value(40),fat_g:value(20),sodium_mg:value(1200)},scalable_values:{energy_kcal:600,carbohydrate_g:80,protein_g:32,fat_g:16,sodium_mg:900},fixed_values:{energy_kcal:200,carbohydrate_g:20,protein_g:8,fat_g:4,sodium_mg:300},calculation_status:"complete",calculation_quality:"direct",availability_reason:null,reflected_ingredient_count:4,target_ingredient_count:4,warnings:[],sources:[]};
for(const width of [320,375,1280]) test(`recipe nutrition shares planner styling and preserves serving math ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:812});
 await setE2EAuthOverride(page);
 await installRecipeDetailRoutes(page,{recipeDetail:{nutrition}});
 await page.goto(RECIPE_PATH);
 const card=page.getByTestId(`recipe-nutrition-card-${width<1024?"app":"web"}`);
 await expect(card).toBeVisible();await card.evaluate(node=>node.scrollIntoView({block:"center",behavior:"instant"}));
 await expect(card.getByText(/^800\s*kcal$/)).toBeVisible();
 await expect(card).toHaveCSS("border-top-width","0px");
 await expect(card).toHaveCSS("box-shadow","none");
 expect(await card.evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe("rgb(255, 255, 255)");
 const bar=card.getByRole("img",{name:"탄수화물 단백질 지방 비율"});
 await expect(bar).toHaveCSS("height","12px");
 expect(await bar.locator("span").evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor))).toEqual(["rgb(148, 201, 255)","rgb(255, 167, 194)","rgb(255, 212, 119)"]);
 await expect(card.locator("dt")).toHaveText(["탄","단","지"]);
 await page.getByRole("button",{name:"인분 늘리기",exact:true}).click();
 await expect(card.getByText(/^1,100\s*kcal$/)).toBeVisible();
 await expect(card.getByText("3인분",{exact:true})).toBeVisible();
 await card.evaluate(node=>node.scrollIntoView({block:"center",behavior:"instant"}));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 if(width<1024){
  const footer=page.getByRole("region",{name:"레시피 주요 작업"});
  await expect.poll(async()=>{const a=await card.boundingBox();const b=await footer.boundingBox();return Boolean(a&&b&&a.y+a.height<=b.y);}).toBe(true);
 }
 await card.screenshot({path:info.outputPath(`nutrition-card-${width}.png`)});
 await page.screenshot({path:info.outputPath(`nutrition-page-${width}.png`)});
 await card.getByText("영양성분 더 보기",{exact:true}).click();
 await expect(card.getByRole("table",{name:"추가 영양성분"})).toBeVisible();
 await expect(card.getByRole("row",{name:/나트륨/})).toBeVisible();
});
test("partial AI nutrition retains its notice and known values",async({page},info)=>{
 await page.setViewportSize({width:375,height:812});
 await setE2EAuthOverride(page);
 await installRecipeDetailRoutes(page,{recipeDetail:{nutrition:{...nutrition,calculation_status:"partial",warnings:["AI_NUTRITION_ESTIMATE_USED"],values:{...nutrition.values,protein_g:{amount:null,known_amount:40,status:"partial",display_mode:"minimum"}}}}});
 await page.goto(RECIPE_PATH);
 const card=page.getByTestId("recipe-nutrition-card-app");
 await expect(card.getByText(/AI 추정값 포함/)).toBeVisible();
 await expect(card.getByRole("img",{name:"탄수화물 단백질 지방 비율"})).toBeVisible();
 await expect(card.locator("dd").filter({hasText:/^40\s*g$/})).toBeVisible();
 await card.evaluate(node=>node.scrollIntoView({block:"center",behavior:"instant"}));
 await card.screenshot({path:info.outputPath("nutrition-partial-ai.png")});
});
