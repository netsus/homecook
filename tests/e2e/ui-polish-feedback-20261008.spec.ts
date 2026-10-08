import { expect, test } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const success = (data: unknown) => ({success:true,data,error:null});
const columns = ["아침", "점심", "저녁"].map((name,index)=>({id:`20000000-0000-4000-8000-00000000000${index+1}`,name,sort_order:index}));
const nutrition={calculation_status:"partial",calories_kcal:613,carbohydrate_g:45,protein_g:35,fat_g:32,sodium_mg:1300.8};
const foodName="여러 가지 재료와 긴 제목을 가진 음식 이름이 한 줄로만 표시되는지 확인하는 제육볶음";

for(const width of [375,1280]) {
 test(`keeps meal headings during date loading and simplifies recent foods ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:812});
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await installEmptyYoutubeNotificationRoutes(page);
  await page.route("**/api/v1/cooked-batches*",route=>route.fulfill({json:success({items:[],has_next:false,next_cursor:null})}));
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const entry={id:"10000000-0000-4000-8000-000000000001",revision:1,consumed_at:null,consumed_local_date:"2026-10-08",timezone_name_snapshot:"Asia/Seoul",meal_plan_column_id:columns[0].id,slot_name_snapshot:"아침",source:{type:"ingredient",id:"30000000-0000-4000-8000-000000000001"},quantity:{amount:200,unit:"g"},display_name:foodName,display_brand:null,nutrition,created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:00:00Z"};
  await page.route("**/api/v1/meal-log?*",async route=>{
   const date=new URL(route.request().url()).searchParams.get("date")!;
   if(date>="2026-10-12")await gate;
   const entries=date==="2026-10-08"?[entry]:[];
   await route.fulfill({json:success({date,active_columns:columns,active_sections:columns.map((column,index)=>({meal_plan_column_id:column.id,slot_name_snapshot:column.name,sort_order:index,entries:index===0?entries:[],subtotal:nutrition,incomplete_count:index===0?entries.length:0})),deleted_column_sections:[],entries,day_total:{...nutrition,incomplete_count:entries.length}})});
  });
  await page.route("**/api/v1/meal-log/recent?*",route=>route.fulfill({json:success({items:[{source:entry.source,display_name:foodName,display_brand:null,last_quantity:entry.quantity,frequency:1}],next_cursor:null,has_next:false})}));
  await page.goto("/planner?segment=log&date=2026-10-08");
  await expect(page.getByRole("button",{name:`아침의 ${foodName} 식사 기록 상세`})).toBeVisible();
  await expect(page.getByText("확인된 탄단지 기준",{exact:true})).toHaveCSS("width","1px");
  await page.getByRole("button",{name:"아침에 먹은 음식 추가",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"먹은 음식 추가"});
  const recentName=sheet.getByText(foodName,{exact:true});
  await expect(recentName).toHaveCSS("white-space","nowrap");
  await expect(recentName).toHaveCSS("text-overflow","ellipsis");
  await expect(sheet.getByRole("heading",{name:"최근·자주 먹은 음식"})).toHaveCount(0);
  await page.screenshot({path:info.outputPath(`recent-${width}.png`)});
  await sheet.getByRole("tab",{name:"제품·재료",exact:true}).click();
  await expect(sheet.getByText(foodName,{exact:true})).toHaveCount(0);
  await sheet.getByRole("tab",{name:"요리한 음식",exact:true}).click();
  await expect(sheet.getByText(foodName,{exact:true})).toHaveCount(0);
  await sheet.getByRole("button",{name:"닫기",exact:true}).click();
  await page.getByTestId("meal-log-week-date-rail").press("PageDown");
  const loading=page.getByRole("status",{name:/10월 15일.*기록 불러오는 중/});
  for(const name of ["아침","점심","저녁"])await expect(loading.getByRole("heading",{name,exact:true})).toBeVisible();
  await expect(page.getByText(foodName,{exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath(`loading-meals-${width}.png`)});
  release();
  await expect(loading).toHaveCount(0);
 });

 test(`compact recipe book covers remain readable ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:812});
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await page.goto("/mypage?tab=recipebooks");
  await expect(page.getByTestId("custom-book-book-custom")).toBeVisible();
  if(width===375){
   const card=page.getByTestId("custom-book-book-custom");
   expect((await card.boundingBox())!.height).toBeLessThan(260);
   await expect(page.getByTestId("mobile-book-cover-book-custom")).toBeVisible();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:info.outputPath(`books-${width}.png`)});
 });
}
