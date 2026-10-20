import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";
import { snapshotIngredients } from "@/lib/server/cooked-batch-weight-estimate";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import { withRecipeMassProxy } from "@/lib/server/cooked-weight-mass-proxy";
export const currySnapshotId = "c2000000-0000-4000-8000-000000000001";
// Quantities independently transcribed from the authorized live saved-detail UI.
// Synthetic source IDs: this does not assert access to the live frozen v4 proof.
const entries: Array<[string, number | null, string | null]> = [["식용유",null,null],["돼지앞다리살",400,"g"],["소금",2,"꼬집"],["양파",500,"g"],["물",1500,"ml"],["감자",360,"g"],["당근",140,"g"],["후추",null,null],["맛술",3,"스푼"],["케첩",1,"크게스푼"],["국간장",1,"스푼"],["카레가루",100,"g"],["버터",16,"g"]];
export const curryRows = entries.map(([,amount,unit],i) => ({ row_key:`curry-${i}`,ingredient_id:`c5000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,
 amount,unit,ingredient_type:amount===null?"TO_TASTE" as const:"QUANT" as const,scalable:true }));
export const curryLabels: CookingModeIngredient[] = curryRows.map((row,i)=>({...row,standard_name:entries[i][0],display_text:null}));
export const currySteps = [{step_number:1,instruction:"식용유를 약간 두르고 고기와 양파를 볶는다."},{step_number:2,instruction:"물과 채소를 넣고 15분 끓인 뒤 나머지 양념을 넣고 살짝 묽을 때 불을 끈다."}];
export const curryProjectedSteps: CookingModeStep[] = currySteps.map(row=>({...row,cooking_method:{code:"SIMMER",label:"끓이기",color_key:"orange"},ingredients_used:[],heat_level:null,duration_seconds:null,duration_text:null}));
export function curryPrediction(rows: Record<string,unknown>[]=curryRows,labels=curryLabels,steps=currySteps,scale=2) {
 const projected = steps.map((step,i)=>({...curryProjectedSteps[i],...step}));
 const base=predictSnapshotWeight({snapshotId:currySnapshotId,baseServings:2,cookingServings:scale,ingredients:snapshotIngredients(rows)!,snapshotSteps:steps,cookingSteps:projected});
 return withRecipeMassProxy(base,rows,labels,steps,projected);
}
