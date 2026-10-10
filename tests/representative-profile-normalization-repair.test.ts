import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {loadRecipeNutritionPredecessors,hydrateRecipeNutritionIngredients} from '../scripts/lib/recipe-nutrition-predecessor.mjs';
import {calculateRecipeNutrition} from '../lib/nutrition/recipe-nutrition-calculator';
import {DEFAULT_PLAN,renderNormalizationRepairSql,validateNormalizationRepairPlan} from '../scripts/render-representative-profile-normalization-repair.mjs';
const original=JSON.parse(readFileSync(DEFAULT_PLAN,'utf8'));
const reviewer={reviewedBy:'00000000-0000-4000-8000-000000000001'};
const changed=(alter:(plan:typeof original)=>void)=>{
 const plan=structuredClone(original);alter(plan);delete plan.operation_checksum;
 plan.operation_checksum=createHash('sha256').update(JSON.stringify(plan)).digest('hex');return plan;
};
describe('representative ingredient profile normalization repair',()=>{
 it('appends six whole profiles with supported basis metadata and preserves the ml basis',()=>{
  expect(validateNormalizationRepairPlan(original)).toBe(original);
  const profiles=original.inserts.filter((op:{table:string})=>op.table==='nutrition_profiles');
  expect(profiles).toHaveLength(6);
  expect(profiles.filter((op:{row:{normalization_method:string}})=>op.row.normalization_method==='mass_100g')).toHaveLength(5);
  const vanilla=original.decisions.find((d:{standard_name:string})=>d.standard_name==='바닐라 페이스트');
  expect(vanilla).toMatchObject({basis_unit:'ml',basis_amount:100,normalization_method:'volume_100ml'});
  expect(original.inserts.filter((op:{table:string})=>op.table==='nutrition_values')).toHaveLength(48);
  expect(original.updates.filter((op:{table:string})=>op.table==='ingredient_nutrition_profiles')).toHaveLength(6);
  expect(original.updates.filter((op:{table:string})=>op.table==='nutrition_profiles')).toHaveLength(6);
 });
 it('rejects unsupported normalization or a change of source, unit, or version',()=>{
  for(const field of ['normalization_method','source_item_id','basis_unit','basis_amount','version']){
   const plan=changed(p=>{const row=p.inserts.find((op:{table:string})=>op.table==='nutrition_profiles').row;row[field]=field==='normalization_method'?'as_labeled':field==='version'?1:field==='basis_amount'?1:'wrong';});
   expect(()=>renderNormalizationRepairSql(plan,reviewer)).toThrow('NORMALIZATION_REPAIR_PROFILE');
  }
 });
 it('rejects converting the vanilla volume basis even when both proposed metadata fields agree',()=>{
  const p=changed(plan=>{const d=plan.decisions.find((d:{standard_name:string})=>d.standard_name==='바닐라 페이스트');d.basis_unit='g';d.normalization_method='mass_100g';const profile=plan.inserts.find((op:{table:string;row:{id:string}})=>op.table==='nutrition_profiles'&&op.row.id===d.profile_id).row;profile.basis_unit='g';profile.normalization_method='mass_100g';});
  expect(()=>renderNormalizationRepairSql(p,reviewer)).toThrow('PROFILE');
 });
 it('rejects changing immutable profile payload or inserting a different source',()=>{
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.updates[0].table='nutrition_values';}),reviewer)).toThrow('IMMUTABLE_SOURCE');
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.inserts[0].table='nutrition_sources';}),reviewer)).toThrow('IMMUTABLE_SOURCE');
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.updates.find((op:{table:string})=>op.table==='nutrition_profiles').after.normalization_method='mass_100g';}),reviewer)).toThrow('UPDATE_SCOPE');
 });
 it('rejects nutrient alteration, missing-to-zero conversion, and incomplete copies',()=>{
  const altered=changed(p=>{p.inserts.find((op:{table:string})=>op.table==='nutrition_values').row.amount+=1;});
  expect(()=>renderNormalizationRepairSql(altered,reviewer)).toThrow('NORMALIZATION_REPAIR_VALUES');
  const incomplete=changed(p=>{p.inserts.splice(p.inserts.findIndex((op:{table:string})=>op.table==='nutrition_values'),1);});
  expect(()=>renderNormalizationRepairSql(incomplete,reviewer)).toThrow('SCOPE');
  const badStatus=changed(p=>{p.inserts.find((op:{table:string})=>op.table==='nutrition_values').row.value_status='missing';});
  expect(()=>renderNormalizationRepairSql(badStatus,reviewer)).toThrow('NORMALIZATION_REPAIR_VALUES');
 });
 it('rejects widening ingredient scope or breaking the exact replacement chain',()=>{
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.decisions[0].ingredient_id=reviewer.reviewedBy;}),reviewer)).toThrow('SCOPE');
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.updates[0].after.superseded_by_id=reviewer.reviewedBy;}),reviewer)).toThrow('LINK');
  expect(()=>renderNormalizationRepairSql(changed(p=>{p.expected_links[0].before=[];}),reviewer)).toThrow('LINK');
 });
 it('requires exact source preimages and a private reviewer',()=>{
  expect(()=>renderNormalizationRepairSql(original)).toThrow('REVIEWER_REQUIRED');
  for(const table of ['nutrition_values','nutrition_sources']) expect(()=>renderNormalizationRepairSql(changed(p=>{p.preconditions=p.preconditions.filter((op:{table:string})=>op.table!==table);}),reviewer)).toThrow('SOURCE_GUARD');
  const changedWithoutChecksum=structuredClone(original);changedWithoutChecksum.reason='changed';
  expect(()=>renderNormalizationRepairSql(changedWithoutChecksum,reviewer)).toThrow('CHECKSUM');
 });
 it('uses pending replacement, supersedes only old links, then approves and removes only inserted aliases',()=>{
  const sql=renderNormalizationRepairSql(original,reviewer);
  const first=original.decisions[0];
  expect(sql.indexOf('INSERT INTO public.ingredient_nutrition_profiles')).toBeLessThan(sql.indexOf('UPDATE public.ingredient_nutrition_profiles'));
  expect(sql).toContain('"review_status":"pending"');
  expect(sql).toContain('"superseded_by_id":"'+first.link_id+'"');
  expect(sql).toContain('DELETE FROM public.ingredient_synonyms WHERE id=ANY(v_created_alias_ids);');
  expect(sql).toContain('NORMALIZATION_REPAIR_WHOLE_PROFILE_CHANGED');
  expect(sql).toContain('NORMALIZATION_REPAIR_PRIVATE_DATA_CHANGED');
  expect(sql).toContain('NORMALIZATION_REPAIR_AI_ENABLED');
  expect(sql).toContain('Normalization repair already applied; verified postimage, no writes');
  expect(sql).not.toMatch(/UPDATE public\.nutrition_profiles[^\n]*SET[^\n;]*normalization_method|UPDATE public\.nutrition_values|DISABLE TRIGGER|session_replication_role/);
  expect(sql).toContain('NORMALIZATION_REPAIR_SHARED_PROFILE');
  expect(sql.lastIndexOf('UPDATE public.nutrition_profiles')).toBeLessThan(sql.indexOf('INSERT INTO public.nutrition_values'));
  expect(sql.lastIndexOf('UPDATE public.nutrition_profiles')).toBeLessThan(sql.lastIndexOf('UPDATE public.ingredient_nutrition_profiles'));
 });
 it('passes all six corrected whole profiles through the real predecessor and calculator while rejecting as_labeled',async()=>{
  const links=original.decisions.map((d:{ingredient_id:string;link_id:string;profile_id:string;source_item_id:string;source_id:string})=>{
   const link=original.inserts.find((op:{table:string;row:{id:string}})=>op.table==='ingredient_nutrition_profiles'&&op.row.id===d.link_id).row;
   const profile=original.inserts.find((op:{table:string;row:{id:string}})=>op.table==='nutrition_profiles'&&op.row.id===d.profile_id).row;
   return {...link,nutrition_profiles:{...profile,nutrition_values:original.inserts.filter((op:{table:string;row:{profile_id:string}})=>op.table==='nutrition_values'&&op.row.profile_id===d.profile_id).map((op:{row:unknown})=>op.row),
    nutrition_source_items:{id:d.source_item_id,source_id:d.source_id,review_status:'approved',nutrition_sources:{id:d.source_id,provider_code:'MFDS',dataset_name:'Approved label fixture',source_version:'1',data_basis_date:'2026-10-10',license_name:'source license',source_url:'https://example.test/source',review_status:'approved',freshness_status:'current',is_active:true}}}};
  });
  const client=(bad=false)=>({from:(table:string)=>{
   const query={select:()=>query,in:()=>query,eq:()=>query,order:()=>query,range:async()=>({data:table==='ingredient_nutrition_profiles'?links.map((link:typeof links[number])=>bad?{...link,nutrition_profiles:{...link.nutrition_profiles,normalization_method:'as_labeled'}}:link):[],error:null})};return query;
  }});
  const ids=original.decisions.map((d:{ingredient_id:string})=>d.ingredient_id);
  const old=await loadRecipeNutritionPredecessors(client(true),ids);
  expect([...old.values()].every((value:{nutrition_candidates:unknown[]})=>value.nutrition_candidates.length===0)).toBe(true);
  const current=await loadRecipeNutritionPredecessors(client(),ids);
  for(const d of original.decisions){
   const ingredients=hydrateRecipeNutritionIngredients([{id:d.ingredient_id,ingredient_id:d.ingredient_id,amount:100,unit:d.basis_unit,ingredient_type:'required',scalable:true}],current);
   expect(ingredients[0].nutrition?.profile.id).toBe(d.profile_id);
   const calculated=calculateRecipeNutrition({recipe_id:'normalization-repair',recipe_version:1,base_servings:1,calculation_version:'recipe-nutrition-v3',rounding_policy_version:'display-v1',ingredients});
   expect(calculated.values.energy_kcal.amount).toBeCloseTo(d.captured_values.find((value:{nutrient_code:string})=>value.nutrient_code==='energy_kcal').amount);
  }
 });

});
