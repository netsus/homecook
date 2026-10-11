import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DEFAULT_PLAN,renderHouseholdSpoonWeights,validateHouseholdSpoonWeights} from '../scripts/render-household-spoon-weights.mjs';
const original=JSON.parse(readFileSync(DEFAULT_PLAN,'utf8'));
const reviewer={reviewedBy:'00000000-0000-4000-8000-000000000001'};
type Plan=typeof original;
const changed=(alter:(p:Plan)=>void)=>{const p=structuredClone(original);alter(p);delete p.operation_checksum;p.operation_checksum=createHash('sha256').update(JSON.stringify(p)).digest('hex');return p;};
describe('approved level household spoon weights',()=>{
 it('adds only one measurement source and seven evidence/link pairs',()=>{
  expect(validateHouseholdSpoonWeights(original)).toBe(original);
  expect(original.inserts.map((op:{table:string})=>op.table)).toEqual(['nutrition_sources',...Array(7).fill('measurement_source_evidence'),...Array(7).fill('piece_unit_weights')]);
  expect(original.updates).toEqual([]);
  expect(original.decisions.map((d:{ingredient_name:string;weight_g:number})=>[d.ingredient_name,d.weight_g])).toEqual([['굴소스',15],['멸치액젓',14],['양조간장',14],['올리고당',12],['다시다',8],['양조식초',12],['맛술',10]]);
 });
 it('uses the exact approved rounded grams, not fractional volume scaling',()=>{
  for(const d of original.decisions){
   expect(Number.isInteger(d.weight_g)).toBe(true);
   expect(d.weight_g).toBe(Math.round(d.base_g_per_15ml*11.5/15));
  }
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.decisions[0].weight_g=20*11.5/15;}))).toThrow('DECISION');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[8].row.weight_g=20*11.5/15;}))).toThrow('LINK');
 });
 it('distinguishes assumed volume from actual measured evidence',()=>{
  expect(original.inserts[0].row).toMatchObject({provider_code:'HOMECOOK_USER_STANDARD',source_kind:'measurement_reference',dataset_name:'사용자 승인 AI 추정 밥숟가락 중량20261011'});
  for(const d of original.decisions)expect(d.raw_source_observation).toMatchObject({assumed_volume_ml:11.5,actually_measured:false,video_confirms_tool_only:true,fill:'level_not_heaped',rounding:'nearest_1g_user_approved'});
  for(const op of original.inserts.slice(1,8))expect(op.row).toMatchObject({size_code:'household_spoon',source_observed_unit:'밥숟가락',source_observed_amount:1,observed_volume_ml:null,normalized_g_per_15ml:null});
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.decisions[0].raw_source_observation.actually_measured=true;}))).toThrow('DECISION');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[1].row.observed_volume_ml=11.5;}))).toThrow('EVIDENCE');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[0].row.provider_code='AI_NUTRITION';}))).toThrow('SOURCE');
 });
 it.each(['스푼','숟가락','큰술','T','밥숟갈','수북한 밥숟가락'])('rejects unconfirmed or incompatible unit %s',unit=>{
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[1].row.source_observed_unit=unit;}))).toThrow('EVIDENCE');
 });
 it('rejects heaped or unreviewed ingredient expansion and existing record replacement',()=>{
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.decisions[0].ingredient_id='0305831c-dc7a-4341-9492-9afed5e4450b';}))).toThrow('DECISION');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts.push(p.inserts[8]);}))).toThrow('SCOPE');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.updates.push({table:'piece_unit_weights'});}))).toThrow('SCOPE');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[8].row.id=p.decisions[0].base_assignment_id;}))).toThrow('LINK');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.inserts[8].row.extra_column='unexpected';}))).toThrow('LINK');
 });
 it('requires sealed original context and private reviewer injection',()=>{
  const unsealed=structuredClone(original);unsealed.reason='changed';
  expect(()=>validateHouseholdSpoonWeights(unsealed)).toThrow('CHECKSUM');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.preconditions[0].md5='0'.repeat(32);}))).toThrow('PREIMAGE');
  expect(()=>validateHouseholdSpoonWeights(changed(p=>{p.manifest.mapping[0].weight_g=16;}))).toThrow('MANIFEST');
  expect(()=>renderHouseholdSpoonWeights(original)).toThrow('REVIEWER_REQUIRED');
  expect(()=>renderHouseholdSpoonWeights(original,{reviewedBy:"'bad'"})).toThrow('REVIEWER_REQUIRED');
 });
 it('orders new source, evidence and pending links before their approval',()=>{
  const sql=renderHouseholdSpoonWeights(original,reviewer);
  expect(sql.indexOf('INSERT INTO public.nutrition_sources')).toBeLessThan(sql.indexOf('INSERT INTO public.measurement_source_evidence'));
  expect(sql.indexOf('INSERT INTO public.measurement_source_evidence')).toBeLessThan(sql.indexOf('INSERT INTO public.piece_unit_weights'));
  expect(sql.lastIndexOf('INSERT INTO public.piece_unit_weights')).toBeLessThan(sql.indexOf('UPDATE public.piece_unit_weights'));
  expect(sql).toContain('"review_status":"pending"');
  expect(sql.split('\n').filter(line=>line.startsWith('UPDATE public.'))).toHaveLength(7);
  expect(sql).not.toMatch(/DELETE FROM|DISABLE TRIGGER|session_replication_role|superseded'/);
 });
 it('preserves old weights, 15ml assignments, nutrition, recipe history and AI settings',()=>{
  const sql=renderHouseholdSpoonWeights(original,reviewer);
  expect(sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED;')).toBe(true);
  expect(sql.endsWith('COMMIT;\n')).toBe(true);
  expect(sql).toContain("private.ingredient_piece_unit_family('밥숟가락') IS DISTINCT FROM 'household_spoon'");
  for(const guard of ['PREIMAGE_DRIFT','POSTIMAGE','ACTIVE_LINK_DRIFT','VOLUME_LINK_DRIFT','ID_CONFLICT','PRESERVATION_FAILED','PRIVATE_DATA_CHANGED'])expect(sql).toContain('HOUSEHOLD_SPOON_'+guard);
  for(const table of ['ingredient_conversion_assignments','measurement_conversion_profiles','recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','ingredient_ai_nutrition_settings','ingredient_ai_nutrition_jobs','homecook_deploy.migrations'])expect(sql).toContain(table);
  expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE) public\.(recipes|recipe_ingredients|nutrition_values|ingredient_synonyms|ingredient_conversion_assignments|measurement_conversion_profiles)/);
  expect(sql).not.toContain('__PRIVATE_REVIEWER__');
 });
 it('validates exact postimages before returning a write-free replay',()=>{
  const sql=renderHouseholdSpoonWeights(original,reviewer);
  const replay=sql.slice(sql.indexOf('IF EXISTS(SELECT 1 FROM public.operational_events'),sql.indexOf('RETURN;\nEND IF;'));
  expect(replay).toContain('verified postimage, no writes');
  expect(replay.match(/HOUSEHOLD_SPOON_POSTIMAGE/g)).toHaveLength(15);
  expect(replay).not.toMatch(/INSERT INTO|UPDATE public\./);
  expect(renderHouseholdSpoonWeights(original,reviewer)).toBe(sql);
 });
});
