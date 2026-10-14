import { FOOD_PRODUCT_BASIS_UNITS, FOOD_PRODUCT_CORE_NUTRIENTS, FOOD_PRODUCT_OPTIONAL_NUTRIENTS, type FoodProductData } from "@/types/food-product";
import type { FoodCatalogProductData } from "@/lib/api/food-catalog-search";
interface Query { eq(column:string,value:string):Query; maybeSingle():PromiseLike<{data:unknown;error:unknown}> }
export interface PantryCatalogSourceClient {
  from(table:string):{select(columns:string):Query};
  rpc?(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>;
}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>0;
const nullableText=(value:unknown):value is string|null=>value===null||typeof value==="string";
async function readOne(client:PantryCatalogSourceClient,table:string,columns:string,filters:Array<[string,string]>) {
  let query=client.from(table).select(columns);for(const [column,value] of filters)query=query.eq(column,value);
  const result=await query.maybeSingle();if(result.error)throw new Error("PANTRY_CATALOG_SOURCE_READ_FAILED");return result.data;
}
function relations(value:unknown):FoodProductData["basis_relations"]|null {
  if(!Array.isArray(value)||value.length>20)return null;const result:FoodProductData["basis_relations"]=[];
  for(const item of value){
    if(!record(item)||!record(item.from)||!record(item.to))return null;const from=item.from,to=item.to;
    const fromUnit=FOOD_PRODUCT_BASIS_UNITS.find(unit=>unit===from.unit),toUnit=FOOD_PRODUCT_BASIS_UNITS.find(unit=>unit===to.unit);
    if(!fromUnit||!toUnit||!positive(from.amount)||!positive(to.amount))return null;
    result.push({from:{amount:from.amount,unit:fromUnit},to:{amount:to.amount,unit:toUnit}});
  }return result;
}
function currentProduct(value:unknown):value is FoodCatalogProductData {
  if(!record(value)||value.type!=="food_product"||!uuid(value.id)||typeof value.name!=="string"||!nullableText(value.brand)
    ||!["public","private"].some(v=>v===value.visibility)||!["public_dataset","manual"].some(v=>v===value.source_type)
    ||typeof value.editable!=="boolean"||!uuid(value.nutrition_version_id)||!relations(value.basis_relations)||!record(value.nutrition))return false;
  const nutrition=value.nutrition,basis=nutrition.basis;
  return record(basis)&&positive(basis.amount)&&FOOD_PRODUCT_BASIS_UNITS.some(unit=>unit===basis.unit)
    &&record(nutrition.values)&&Object.values(nutrition.values).every(v=>record(v)&&(v.amount===null||typeof v.amount==="number"&&Number.isFinite(v.amount))
      &&(v.known_amount===null||typeof v.known_amount==="number"&&Number.isFinite(v.known_amount))&&["complete","partial","unavailable"].some(status=>status===v.status)&&[null,"total","minimum"].some(mode=>mode===v.display_mode))
    &&["complete","partial","unavailable"].some(status=>status===nutrition.calculation_status)&&[null,"direct","estimated","mixed"].some(quality=>quality===nutrition.calculation_quality)
    &&Array.isArray(nutrition.warnings)&&nutrition.warnings.every(v=>typeof v==="string")&&Array.isArray(nutrition.sources)
    &&nutrition.sources.every(source=>record(source)&&typeof source.provider==="string"&&["dataset","source_version","data_basis_date","license","source_url"].every(key=>nullableText(source[key])));
}
/** Actual owner-held pair only. Public labels use the existing exact-version RPC; manual history never borrows latest values. */
export async function hydratePantryCatalogSource(client:PantryCatalogSourceClient,actor:string,pantryItem:string,base:unknown):Promise<FoodCatalogProductData|null> {
  if(!record(base)||base.type!=="food_product"||!uuid(base.id)||typeof base.name!=="string"||!nullableText(base.brand)
    ||(base.source_type!=="public_dataset"&&base.source_type!=="manual")||typeof base.editable!=="boolean"
    ||!["public","private"].some(value=>value===base.visibility)
    ||(base.recipe_ingredient_id!==undefined&&base.recipe_ingredient_id!==null&&!uuid(base.recipe_ingredient_id)))return null;
  const item=await readOne(client,"pantry_items","food_product_id,food_product_nutrition_version_id",[["id",pantryItem],["user_id",actor]]);
  if(!record(item)||item.food_product_id!==base.id||!uuid(item.food_product_nutrition_version_id))return null;
  const version=await readOne(client,"food_product_nutrition_versions","id,product_id,version,created_at,label_basis_text",[["id",item.food_product_nutrition_version_id],["product_id",base.id]]);
  if(!record(version)||version.id!==item.food_product_nutrition_version_id||version.product_id!==base.id
    ||typeof version.version!=="number"||!Number.isSafeInteger(version.version)||version.version<1
    ||typeof version.created_at!=="string"||!Number.isFinite(Date.parse(version.created_at)))return null;
  if(base.source_type==="manual") {
    return uuid(base.recipe_ingredient_id)&&currentProduct(base)&&base.nutrition_version_id===version.id
      ? {...base,nutrition_version_number:version.version,nutrition_version_created_at:version.created_at} : null;
  }
  if(!client.rpc)return null;
  const response=await client.rpc("read_recipe_product_nutrition_predecessors",{p_owner_uuid:actor,p_ingredients:[{
    id:pantryItem,ingredient_id:null,food_product_id:base.id,food_product_nutrition_version_id:version.id,
  }]});
  if(response.error)throw new Error("PANTRY_CATALOG_SOURCE_READ_FAILED");
  if(!Array.isArray(response.data)||response.data.length!==1||!record(response.data[0])||response.data[0].id!==pantryItem)return null;
  const predecessor=response.data[0].product_predecessor;
  if(!record(predecessor)||!record(predecessor.nutrition))return null;
  const nutrition=predecessor.nutrition,profile=nutrition.profile,source=nutrition.source;
  if(!record(profile)||profile.review_status!=="approved"||!positive(profile.basis_amount)||!record(profile.values)
    ||!record(source)||source.review_status!=="approved"||source.freshness_status!=="current"||source.is_active!==true||typeof source.provider!=="string")return null;
  const basisUnit=FOOD_PRODUCT_BASIS_UNITS.find(unit=>unit===profile.basis_unit),basisRelations=relations(predecessor.basis_relations);
  if(!basisUnit||!basisRelations)return null;
  const values:FoodProductData["nutrition"]["values"]={};
  for(const code of FOOD_PRODUCT_CORE_NUTRIENTS)values[code]={amount:null,known_amount:null,status:"unavailable",display_mode:null};
  for(const code of [...FOOD_PRODUCT_CORE_NUTRIENTS,...FOOD_PRODUCT_OPTIONAL_NUTRIENTS]){
    const value=profile.values[code];if(!record(value)||value.value_status!=="observed"||typeof value.amount!=="number"||!Number.isFinite(value.amount)||value.amount<0)continue;
    values[code]={amount:value.amount,known_amount:null,status:"complete",display_mode:"total"};
  }
  const reflected=FOOD_PRODUCT_CORE_NUTRIENTS.filter(code=>values[code].status==="complete").length;
  return {type:"food_product",id:base.id,name:base.name,brand:base.brand,visibility:base.visibility==="public"?"public":"private",source_type:"public_dataset",editable:base.editable,
    recipe_ingredient_id:typeof base.recipe_ingredient_id==="string"?base.recipe_ingredient_id:null,nutrition_version_id:item.food_product_nutrition_version_id,nutrition_version_number:version.version,nutrition_version_created_at:version.created_at,basis_relations:basisRelations,
    nutrition:{basis:{amount:profile.basis_amount,unit:basisUnit},label_basis_text:typeof version.label_basis_text==="string"?version.label_basis_text:null,values,calculation_status:reflected===5?"complete":reflected?"partial":"unavailable",calculation_quality:reflected?"direct":null,warnings:[],sources:[{
      provider:source.provider,dataset:typeof source.dataset==="string"?source.dataset:null,source_version:typeof source.source_version==="string"?source.source_version:null,
      data_basis_date:typeof source.data_basis_date==="string"?source.data_basis_date:null,license:typeof source.license==="string"?source.license:null,source_url:typeof source.source_url==="string"?source.source_url:null,
    }]}};
}
