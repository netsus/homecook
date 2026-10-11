import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DEFAULT_PLAN,renderAbaloneEstimatedWeight,validateAbaloneEstimatedWeight} from '../scripts/render-abalone-estimated-weight.mjs';
const original=JSON.parse(readFileSync(DEFAULT_PLAN,'utf8'));
const reviewer={reviewedBy:'00000000-0000-4000-8000-000000000001'};
type Plan=typeof original;
const changed=(alter:(p:Plan)=>void)=>{const p=structuredClone(original);alter(p);delete p.operation_checksum;p.operation_checksum=createHash('sha256').update(JSON.stringify(p)).digest('hex');return p;};
describe('user-approved abalone edible piece estimate',()=>{
 it('appends exactly one source, one evidence and one 50g successor',()=>{
  expect(validateAbaloneEstimatedWeight(original)).toBe(original);
  expect(original.inserts.map((op:{table:string})=>op.table)).toEqual(['nutrition_sources','measurement_source_evidence','piece_unit_weights']);
  expect(original.decisions[0]).toMatchObject({ingredient_name:'전복',previous_weight_g:100,applied_weight_g:50,unit:'개'});
  expect(original.inserts[2].row).toMatchObject({weight_g:50,version:2,size_code:'medium',preparation_state:'as_published'});
 });
 it('labels the estimate, edible portion and medium code without inventing measured data',()=>{
  expect(original.inserts[0].row).toMatchObject({provider_code:'HOMECOOK_USER_STANDARD',source_kind:'measurement_reference',dataset_name:'사용자 승인 AI 추정 중량 20261011 · 전복'});
  expect(original.inserts[1].row).toMatchObject({source_observed_unit:'개',source_observed_amount:1,observed_weight_g:50,observed_volume_ml:null});
  expect(original.decisions[0].raw_source_observation).toMatchObject({actually_measured:false,official_reference:false,excluded_parts:['껍데기','입'],organ_handling:'recipe_specific',size_meaning:'service_default_not_physical_standard'});
 });
 it('rejects revised values despite recomputed checksums',()=>{
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.decisions[0].applied_weight_g=100;p.inserts[1].row.observed_weight_g=100;p.inserts[2].row.weight_g=100;}))).toThrow('VALUES');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.inserts[2].row.weight_g=100;}))).toThrow('LINK');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.decisions[0].old_link_payload.weight_g=50;}))).toThrow('OLD_PAYLOAD');
 });
 it('rejects incompatible evidence, manufacturer relabeling and misleading measurement claims',()=>{
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.inserts[1].row.source_observed_unit='1개';}))).toThrow('EVIDENCE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.inserts[1].row.observed_volume_ml=50;}))).toThrow('EVIDENCE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.inserts[0].row.provider_code='MFDS';}))).toThrow('SOURCE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.decisions[0].raw_source_observation.actually_measured=true;}))).toThrow('RAW_OBSERVATION');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.decisions[0].limitation='Measured 50g';}))).toThrow('PROVENANCE');
 });
 it('requires original preimages, sealed approval and a private reviewer',()=>{
  const unsealed=structuredClone(original);unsealed.reason='changed';
  expect(()=>validateAbaloneEstimatedWeight(unsealed)).toThrow('CHECKSUM');
  expect(()=>renderAbaloneEstimatedWeight(original)).toThrow('REVIEWER_REQUIRED');
  expect(()=>renderAbaloneEstimatedWeight(original,{reviewedBy:"'bad'"})).toThrow('REVIEWER_REQUIRED');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.preconditions[0].md5='0'.repeat(32);}))).toThrow('PREIMAGE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.preconditions[0].id=reviewer.reviewedBy;}))).toThrow('PREIMAGE');
 });
 it('rejects expanded write scope and original payload edits',()=>{
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.inserts[0].table='ingredients';}))).toThrow('INSERT');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.updates[0].after.weight_g=50;}))).toThrow('UPDATE_SCOPE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.updates[0].after.superseded_by_id=reviewer.reviewedBy;}))).toThrow('UPDATE_SCOPE');
  expect(()=>validateAbaloneEstimatedWeight(changed(p=>{p.decisions[0].ingredient_id=reviewer.reviewedBy;}))).toThrow('SCOPE');
 });
 it('creates a pending successor, retires the old link then approves the successor',()=>{
  const sql=renderAbaloneEstimatedWeight(original,reviewer);
  expect(sql.indexOf('INSERT INTO public.nutrition_sources')).toBeLessThan(sql.indexOf('INSERT INTO public.measurement_source_evidence'));
  expect(sql.indexOf('INSERT INTO public.measurement_source_evidence')).toBeLessThan(sql.indexOf('INSERT INTO public.piece_unit_weights'));
  expect(sql.indexOf('INSERT INTO public.piece_unit_weights')).toBeLessThan(sql.indexOf('UPDATE public.piece_unit_weights'));
  expect(sql).toContain('"review_status":"pending"');
  const mutations=sql.split('\n').filter(line=>line.startsWith('UPDATE public.'));
  expect(mutations).toHaveLength(2);
  expect(mutations[0]).toContain('"review_status":"superseded"');
  expect(mutations[1]).toContain('"review_status":"approved"');
  expect(sql).not.toMatch(/UPDATE public\.(nutrition_sources|measurement_source_evidence)|DELETE FROM|DISABLE TRIGGER|session_replication_role/);
 });
 it('preserves nutrients, recipe amounts, history and AI settings while making replay write-free',()=>{
  const sql=renderAbaloneEstimatedWeight(original,reviewer);
  expect(sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED;')).toBe(true);
  expect(sql.endsWith('COMMIT;\n')).toBe(true);
  expect(sql).toContain('Abalone estimate already applied; verified postimage, no writes');
  for(const guard of ['PREIMAGE_DRIFT','POSTIMAGE','OLD_PAYLOAD_CHANGED','ACTIVE_LINK_DRIFT','ID_CONFLICT','PRESERVATION_FAILED','PRIVATE_DATA_CHANGED']) expect(sql).toContain('ABALONE_ESTIMATE_'+guard);
  for(const table of ['recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','ingredient_ai_nutrition_settings','ingredient_ai_nutrition_jobs']) expect(sql).toContain(table);
  expect(sql).not.toContain('__PRIVATE_REVIEWER__');
  expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE) public\.(recipes|recipe_ingredients|nutrition_values|ingredient_synonyms)/);
 });
});
