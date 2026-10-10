import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { calculateRecipeNutrition } from '../lib/nutrition/recipe-nutrition-calculator';
import { loadRecipeNutritionPredecessors, hydrateRecipeNutritionIngredients } from '../scripts/lib/recipe-nutrition-predecessor.mjs';
import original from '../docs/engineering/data/ingredient-identity-followup-plan-20261010.json';
import { renderIdentityFollowupSql, validateIdentityFollowupPlan } from '../scripts/render-ingredient-identity-followup.mjs';
const reviewer='11111111-1111-4111-8111-111111111111';
function changed(change:(p:typeof original)=>void){const p=structuredClone(original);change(p);const{operation_checksum:ignored,...body}=p;void ignored;p.operation_checksum=createHash('sha256').update(JSON.stringify(body)).digest('hex');return p;}
describe('reviewed typed ingredient followup',()=>{
  it('limits writes to four new identities and three separately attributed whole profiles',()=>{
    expect(validateIdentityFollowupPlan(original)).toBe(original);
    expect(original.counts).toMatchObject({new_ingredients:4,new_profiles:3,new_values:24,missing_fiber_values:3,new_links:3,new_aliases:1});
    expect(original.inserts.filter(o=>o.table==='nutrition_sources')[0].row.dataset_name).toBe('Homecook 제품 라벨 기반 서비스 대표 예시 20261010 · 정체성 보완');
  });
  it('rejects plan drift and reviewer injection',()=>{
    const p=structuredClone(original);p.counts.new_ingredients=5;
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_CHECKSUM');
    expect(()=>renderIdentityFollowupSql(original)).toThrow('IDENTITY_REVIEWER_REQUIRED');
    expect(()=>renderIdentityFollowupSql(original,{reviewedBy:"'); DROP TABLE users;--"})).toThrow('IDENTITY_REVIEWER_REQUIRED');
  });
  it('does not substitute a whole-kimchi product for the reviewed juice source',()=>{
    const p=changed(p=>{p.decisions.find(d=>d.name==='배추김치 국물')!.source!.profile_id='672edf36-f23d-40b7-bd2a-9364bddc1b4f';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_SOURCE_SCOPE');
  });
  it('retains the label allulose energy rather than inventing zero energy',()=>{
    const d=original.decisions.find(d=>d.name==='액상 알룰로스')!;
    const p=changed(p=>{p.inserts.find(o=>o.table==='nutrition_values'&&o.row.profile_id===d.profile_id&&o.row.nutrient_code==='energy_kcal')!.row.amount=0;});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_MIXED_PROFILE');
    expect(d.source!.values.find(v=>v.nutrient_code==='energy_kcal')!.amount).toBe(2);
  });
  it('keeps missing label fiber missing for all three sources',()=>{
    expect(original.inserts.filter(o=>o.table==='nutrition_values'&&o.row.amount===null)).toHaveLength(3);
    const p=changed(p=>{const v=p.inserts.find(o=>o.table==='nutrition_values'&&o.row.nutrient_code==='fiber_g')!.row;v.amount=0;v.value_status='observed';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_MISSING_FIBER');
  });
  it('preserves both the unit and denominator of the copied profile',()=>{
    const p=changed(p=>{p.inserts.find(o=>o.table==='nutrition_profiles')!.row.basis_amount=1;});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_BASIS');
  });
  it('rejects as-labeled product metadata on a copied mass-normalized ingredient source',()=>{
    const p=changed(p=>{p.inserts.find(o=>o.table==='nutrition_profiles')!.row.normalization_method='as_labeled';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_NORMALIZATION');
    for(const d of original.decisions.filter(d=>d.source))expect(d.source!.normalization_method).toBe('as_labeled');
  });
  it('uses canonical names for the new service source and records original product identities separately',()=>{
    const p=changed(p=>{p.inserts.find(o=>o.table==='nutrition_source_items')!.row.preparation_state='unknown';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_PROVENANCE');
    for(const d of original.decisions.filter(d=>d.source)) {
      const profile=original.inserts.find(o=>o.table==='nutrition_profiles'&&o.row.id===d.profile_id)!.row;
      const item=original.inserts.find(o=>o.table==='nutrition_source_items'&&o.row.id===profile.source_item_id)!.row;
      expect(item.external_name).toBe(d.name);
      expect(item.provenance_json!.actual_product_identity_claimed).toBe(false);
      expect(item.provenance_json!.original_product_name).toBe(d.source!.original_name);
    }
  });
  it('loads the planned service profiles through the real predecessor and counts actual nutrition contributions',async()=>{
    const source=original.inserts.find(o=>o.table==='nutrition_sources')!.row;
    const rows=original.inserts.filter(o=>o.table==='ingredient_nutrition_profiles').map(({row:link})=>{
      const profile=original.inserts.find(o=>o.table==='nutrition_profiles'&&o.row.id===link.nutrition_profile_id)!.row;
      const item=original.inserts.find(o=>o.table==='nutrition_source_items'&&o.row.id===profile.source_item_id)!.row;
      return {...link,nutrition_profiles:{...profile,nutrition_values:original.inserts.filter(o=>o.table==='nutrition_values'&&o.row.profile_id===profile.id).map(o=>o.row),nutrition_source_items:{...item,nutrition_sources:source}}};
    });
    const client={from(table:string){const query={select:()=>query,in:()=>query,eq:()=>query,order:()=>query,range:async()=>({data:table==='ingredient_nutrition_profiles'?rows:[],error:null})};return query;}};
    const predecessors=await loadRecipeNutritionPredecessors(client,original.decisions.map(d=>d.ingredient_id));
    for(const [name,amount,energy]of [['어린이 슬라이스 치즈',20,65.6],['배추김치 국물',100,20],['액상 알룰로스',10,0.2]] as const){
      const d=original.decisions.find(d=>d.name===name)!;
      const hydrated=hydrateRecipeNutritionIngredients([{id:d.ingredient_id+'-row',ingredient_id:d.ingredient_id,amount,unit:'g',ingredient_type:'QUANT',scalable:true}],predecessors);
      const result=calculateRecipeNutrition({recipe_id:'identity-evidence',recipe_version:1,base_servings:1,ingredients:hydrated});
      expect(hydrated[0].nutrition?.profile.id).toBe(d.profile_id);
      expect(result.reflected_ingredient_count).toBe(1);
      expect(result.values.energy_kcal.amount).toBeCloseTo(energy,6);
      expect(result.missing_reasons).not.toContain('NUTRITION_PROFILE_MISSING');
      expect(result.sources[0].provider).toBe('HOMECOOK_USER_STANDARD');
    }
  });
  it('keeps unknown liquid seafood broth as an unlinked umbrella',()=>{
    const d=original.decisions.find(d=>d.name==='해물육수(액체)')!;
    expect(d.source).toBeNull();expect(d.profile_id).toBeNull();
    const p=changed(p=>{p.inserts.find(o=>o.table==='ingredient_catalog_entries'&&o.row.ingredient_id===d.ingredient_id)!.row.presentation='base';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_UNRESOLVED_BROTH');
  });
  it('allows only the reviewed child-cheese synonym',()=>{
    const p=changed(p=>{p.inserts.find(o=>o.table==='ingredient_synonyms')!.row.synonym='치즈';});
    expect(()=>validateIdentityFollowupPlan(p)).toThrow('IDENTITY_ALIAS_SCOPE');
  });
  it('cannot widen AI job cleanup beyond the four inserted identities or enable AI',()=>{
    expect(()=>validateIdentityFollowupPlan(changed(p=>{p.ai_job_cleanup.entries[0].ingredient_id='00000000-0000-4000-8000-000000000000';}))).toThrow('IDENTITY_AI_JOB_SCOPE');
    expect(()=>validateIdentityFollowupPlan(changed(p=>{p.policy.automatic_ai_enabled=true;}))).toThrow('IDENTITY_POLICY');
  });
  it('renders duplicate guards, exact postimages, immutable originals, and checked new-job skips',()=>{
    const sql=renderIdentityFollowupSql(original,{reviewedBy:reviewer});
    expect(sql).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(sql).toContain('IDENTITY_ALREADY_HAS_TYPED_INGREDIENT');
    expect(sql).toContain('IDENTITY_ALIAS_COLLISION');
    expect(sql).toContain('IDENTITY_SEARCH_KEY');
    expect(sql).toContain('IDENTITY_SOURCE_DRIFT');
    expect(sql).toContain('IDENTITY_PRESERVATION_FAILED');
    expect(sql).toContain('IDENTITY_EXISTING_AI_JOBS_CHANGED');
    expect(sql).toContain('NON_AI_PRIMARY_EXISTS');expect(sql).toContain('CATALOG_SCOPE_EXCLUDED');
    expect(sql).toContain('private.ingredient_ai_nutrition_skip_reason(ingredient_id)');
    expect(sql).toContain('Identity followup already applied; verified postimage, no writes');
    expect(sql).not.toMatch(/UPDATE public\.|DELETE FROM|DISABLE TRIGGER|session_replication_role/);
    expect(sql).not.toContain('__PRIVATE_REVIEWER__');
  });
});
