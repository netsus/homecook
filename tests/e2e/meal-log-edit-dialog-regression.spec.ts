import { expect, test, type Locator, type Page } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const date = "2026-10-08";
const column = "20000000-0000-4000-8000-000000000001";
const batch = "40000000-0000-4000-8000-000000000001";
const nutrition = { calculation_status: "complete", calories_kcal: 200, carbohydrate_g: 20, protein_g: 20, fat_g: 5, sodium_mg: 200 };
const initial = { id:"10000000-0000-4000-8000-000000000001",revision:1,consumed_at:null,consumed_local_date:date,timezone_name_snapshot:"Asia/Seoul",meal_plan_column_id:column,slot_name_snapshot:"아침",source:{type:"cooked_batch",id:batch},quantity:{amount:200,unit:"g"},display_name:"제육볶음",display_brand:null,nutrition,created_at:`${date}T00:00:00Z`,updated_at:`${date}T00:00:00Z` };
const ok = (data:unknown) => ({success:true,data,error:null});

async function dragInputOutside(page:Page,input:Locator) {
 const box=(await input.boundingBox())!;
 await page.mouse.move(box.x+box.width-15,box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(5,5,{steps:12});
 await page.mouse.up();
 await expect(input).toBeVisible();
 await expect(page.getByText("변경사항을 버릴까요?",{exact:true})).toHaveCount(0);
}
async function expectClickable(button:Locator) {
 expect(await button.evaluate(node=>{
  const box=node.getBoundingClientRect();
  const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
  return !node.closest('[inert],[aria-hidden="true"]') && Boolean(hit && node.contains(hit));
 })).toBe(true);
}

for(const width of [375,1280])test(`meal edits keep confirmation and repeated input interactive ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:812});
 await setE2EAuthOverride(page);
 await installAccountLibraryVisualRoutes(page);
 await installEmptyYoutubeNotificationRoutes(page);
 const ariaWarnings:string[]=[];
 page.on("console",message=>{if(message.text().includes("Blocked aria-hidden"))ariaWarnings.push(message.text());});
 let current={...initial}; let added:typeof initial|null=null;
 const patches:Array<{expected_revision:number;quantity:{amount:number;unit:string}}>=[];
 let creates=0;
 await page.route("**/api/v1/users/me/action-notifications?*",route=>route.fulfill({json:ok({items:[],next_cursor:null,has_next:false,unread_count:0})}));
 await page.route("**/api/v1/meal-log?*",route=>{
  const requested=new URL(route.request().url()).searchParams.get("date")!;
  const entries=requested===date?[current,...(added?[added]:[])]:[];
  return route.fulfill({json:ok({date:requested,active_columns:[{id:column,name:"아침",sort_order:0}],active_sections:[{meal_plan_column_id:column,slot_name_snapshot:"아침",sort_order:0,entries,subtotal:nutrition,incomplete_count:0}],deleted_column_sections:[],entries,day_total:{...nutrition,incomplete_count:0}})});
 });
 await page.route(`**/api/v1/meal-log/entries/${initial.id}`,route=>{
  const body=route.request().postDataJSON();patches.push(body);
  if(body.expected_revision!==current.revision)return route.fulfill({status:409,json:{success:false,data:null,error:{code:"CONFLICT",message:"다른 변경이 먼저 반영됐어요.",fields:[]}}});
  if(body.quantity.amount>400)return route.fulfill({status:409,json:{success:false,data:null,error:{code:"CONFLICT",message:"이 음식에서 기록할 수 있는 양을 초과했어요. 입력한 양을 줄여 주세요.",fields:[{field:"quantity.amount",reason:"exceeds_available_amount"}]}}});
  current={...current,revision:current.revision+1,quantity:body.quantity};
  return route.fulfill({json:ok({entry:current})});
 });
 await page.route("**/api/v1/meal-log/entries",route=>{
  creates+=1;const body=route.request().postDataJSON();
  added={...initial,id:"10000000-0000-4000-8000-000000000002",quantity:body.quantity};
  return route.fulfill({status:201,json:ok({entry:added})});
 });
 await page.route("**/api/v1/meal-log/recent?*",route=>route.fulfill({json:ok({items:[],has_next:false,next_cursor:null})}));
 await page.route("**/api/v1/cooked-batches*",route=>route.fulfill({json:ok({items:[{id:batch,recipe_id:"30000000-0000-4000-8000-000000000001",recipe_title:"제육볶음",recipe_thumbnail_url:null,cooked_at:`${date}T00:00:00Z`,cooking_servings:2,status:"leftover",finished_weight_g:400,remaining_weight_g:400-current.quantity.amount,weight_status:"known",weight_source:"estimated",batch_status:"available",depleted_reason:null,revision:1,nutrition_calculation_status:"complete",current_unweighed_closure_event_id:null}],next_cursor:null,has_next:false})}));
 await page.route("**/api/v1/meal-log/nutrition-preview?*",route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:ok({source:{type:q.get("source_type"),id:q.get("source_id")},quantity:{amount:Number(q.get("amount")),unit:q.get("unit")},nutrition})});});
 await page.goto(`/planner?segment=log&date=${date}`);
 await page.getByRole("button",{name:"아침의 제육볶음 식사 기록 상세",exact:true}).click();
 const detail=page.getByRole("dialog",{name:"식사 기록 상세"});
 await detail.getByRole("button",{name:"식사 기록 수정"}).click();
 const edit=page.getByRole("dialog",{name:"10월 8일 아침",exact:true});
 const amount=edit.getByRole("textbox",{name:"먹은 양",exact:true});
 await amount.fill("500");await amount.press("Enter");
 await expect(edit.getByRole("alert")).toContainText("기록할 수 있는 양을 초과");
 await expect(edit).not.toContainText("다른 변경의 최신 기록");
 await page.screenshot({path:info.outputPath("quantity-limit.png")});
 await amount.fill("350"); await dragInputOutside(page,amount);
 await amount.press("Enter");
 const confirmed=page.getByRole("dialog",{name:"식사 기록을 수정했어요.",exact:true});
 await expect(confirmed).toBeVisible();
 await expectClickable(confirmed.getByRole("button",{name:"확인",exact:true}));
 await page.screenshot({path:info.outputPath("confirmation.png")});
 await confirmed.getByRole("button",{name:"확인",exact:true}).click();
 await expect(confirmed).toHaveCount(0);
 await expect(detail).toContainText("350g");
 await detail.getByRole("button",{name:"식사 기록 수정"}).click();
 await amount.fill("300");await amount.press("Enter");
 await expect(confirmed).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(confirmed).toHaveCount(0);
 await expect(detail).toContainText("300g");
 expect(patches.map(p=>p.expected_revision)).toEqual([1,1,2]);
 await detail.getByRole("button",{name:"식사 기록으로 돌아가기"}).click();
 await page.getByRole("button",{name:"아침에 먹은 음식 추가",exact:true}).click();
 const add=page.getByRole("dialog",{name:"먹은 음식 추가",exact:true});
 await add.getByRole("tab",{name:"요리한 음식",exact:true}).click();
 await add.getByRole("button",{name:/제육볶음/}).click();
 const addAmount=add.getByRole("textbox",{name:"먹은 양",exact:true});
 await addAmount.fill("50");await dragInputOutside(page,addAmount);
 await addAmount.press("Enter");
 const addedConfirmation=page.getByRole("dialog",{name:"식사기록에 추가했어요.",exact:true});
 await expect(addedConfirmation).toBeVisible();
 await expectClickable(addedConfirmation.getByRole("button",{name:"확인",exact:true}));
 await addedConfirmation.getByRole("button",{name:"확인",exact:true}).click();
 expect(creates).toBe(1);
 await page.getByRole("button",{name:"아침에 먹은 음식 추가",exact:true}).click();
 await expect(add).toBeVisible();await page.mouse.click(5,5);
 await expect(add).toHaveCount(0);
 expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
 expect(ariaWarnings).toEqual([]);
});
