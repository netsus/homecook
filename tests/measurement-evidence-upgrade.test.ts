import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DEFAULT_PLAN,renderMeasurementEvidenceUpgrade,validateMeasurementEvidenceUpgrade} from '../scripts/render-measurement-evidence-upgrade.mjs';
const original=JSON.parse(readFileSync(DEFAULT_PLAN,'utf8'));
const reviewer={reviewedBy:'00000000-0000-4000-8000-000000000001'};
type Plan=typeof original;
type Operation={table:string;row:Record<string,unknown>};
const changed=(alter:(p:Plan)=>void)=>{const p=structuredClone(original);alter(p);delete p.operation_checksum;p.operation_checksum=createHash('sha256').update(JSON.stringify(p)).digest('hex');return p;};
describe('same-value measurement evidence upgrade',()=>{
 it('limits writes to two sources, four evidence rows and four successor links',()=>{
  expect(validateMeasurementEvidenceUpgrade(original)).toBe(original);
  expect(original.inserts.map((op:Operation)=>op.table).sort()).toEqual(['nutrition_sources','nutrition_sources','measurement_source_evidence','measurement_source_evidence','measurement_source_evidence','measurement_source_evidence','piece_unit_weights','piece_unit_weights','piece_unit_weights','ingredient_conversion_assignments'].sort());
  expect(original.decisions.map((d:{applied_weight_g:number})=>d.applied_weight_g)).toEqual([10,160,300,14]);
 });
 it('preserves fractional recipe observations separately from normalized per-unit evidence',()=>{
  const onion=original.decisions[1],tofu=original.decisions[2];
  expect(onion.raw_source_observation).toMatchObject({amount_literal:'1/8',weight_g:20,pdf_page_1based:64});
  expect(tofu.raw_source_observation).toMatchObject({amount_literal:'1/3',weight_g:100,pdf_page_1based:88});
  for(const d of original.decisions.slice(0,3)){
   const evidence=original.inserts.find((op:Operation)=>op.row.id===d.new_evidence_id).row;
   expect(evidence.source_observed_amount).toBe(1);
   expect(evidence.source_observed_unit).toBe(d.unit);
   expect(evidence.decision_reason).toContain('정규화');
   expect(evidence.decision_reason).toContain('실제측정값이 아님');
  }
 });
 it('rejects changing values even when both successor and decision are edited and checksummed',()=>{
  for(const target of original.decisions){
   const p=changed(plan=>{const d=plan.decisions.find((d:{ingredient_id:string})=>d.ingredient_id===target.ingredient_id);d.applied_weight_g+=1;plan.inserts.find((op:Operation)=>op.row.id===d.new_evidence_id).row.observed_weight_g+=1;});
   expect(()=>validateMeasurementEvidenceUpgrade(p)).toThrow('VALUES');
  }
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.inserts.find((op:Operation)=>op.table==='ingredient_conversion_assignments').row.conversion_profile_id=reviewer.reviewedBy;}))).toThrow('VALUES');
 });
 it('rejects unsupported units, raw-fact rewrites, source substitution or incorrect normalization',()=>{
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.decisions[1].raw_source_observation.weight_g=160;}))).toThrow('RAW_OBSERVATION');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.inserts.find((op:Operation)=>op.table==='measurement_source_evidence').row.source_observed_unit='장';}))).toThrow('EVIDENCE');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.inserts.find((op:Operation)=>op.table==='measurement_source_evidence').row.source_observed_amount=0.125;}))).toThrow('EVIDENCE');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.inserts.find((op:Operation)=>op.table==='nutrition_sources').row.provider_code='LAB_MEASURED';}))).toThrow('SOURCE');
 });
 it('requires a sealed plan, exact preimages and private reviewer identity',()=>{
  const unsealed=structuredClone(original);unsealed.reason='changed';
  expect(()=>validateMeasurementEvidenceUpgrade(unsealed)).toThrow('CHECKSUM');
  expect(()=>renderMeasurementEvidenceUpgrade(original)).toThrow('REVIEWER_REQUIRED');
  expect(()=>renderMeasurementEvidenceUpgrade(original,{reviewedBy:"'bad'"})).toThrow('REVIEWER_REQUIRED');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.preconditions[0].md5=null;}))).toThrow('PREIMAGE');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.preconditions[0].id=reviewer.reviewedBy;}))).toThrow('PREIMAGE');
 });
 it('rejects scope expansion, original payload edits and broken replacement chains',()=>{
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.inserts[0].table='ingredients';}))).toThrow('INSERT');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.updates[0].after.weight_g=99;}))).toThrow('UPDATE_SCOPE');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.updates[0].after.superseded_by_id=reviewer.reviewedBy;}))).toThrow('UPDATE_SCOPE');
  expect(()=>validateMeasurementEvidenceUpgrade(changed(p=>{p.decisions[0].ingredient_id=reviewer.reviewedBy;}))).toThrow('SCOPE');
 });
 it('orders pending successors before superseding their predecessors and approving replacements',()=>{
  const sql=renderMeasurementEvidenceUpgrade(original,reviewer);
  expect(sql.indexOf('INSERT INTO public.nutrition_sources')).toBeLessThan(sql.indexOf('INSERT INTO public.measurement_source_evidence'));
  expect(sql.indexOf('INSERT INTO public.measurement_source_evidence')).toBeLessThan(sql.indexOf('INSERT INTO public.piece_unit_weights'));
  expect(sql.lastIndexOf('INSERT INTO public.ingredient_conversion_assignments')).toBeLessThan(sql.indexOf('UPDATE public.piece_unit_weights'));
  expect(sql).toContain('"review_status":"pending"');
  const mutations=sql.split('\n').filter(line=>line.startsWith('UPDATE public.'));
  expect(mutations).toHaveLength(8);
  expect(mutations.slice(0,4).every(line=>line.includes('"review_status":"superseded"'))).toBe(true);
  expect(mutations.slice(4).every(line=>line.includes('"review_status":"approved"'))).toBe(true);
  expect(sql).not.toMatch(/UPDATE public\.(nutrition_sources|measurement_source_evidence)|DELETE FROM|DISABLE TRIGGER|session_replication_role/);
 });
 it('uses atomic execution, replay postimages and immutable/history/settings guards',()=>{
  const sql=renderMeasurementEvidenceUpgrade(original,reviewer);
  expect(sql.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED;')).toBe(true);
  expect(sql.endsWith('COMMIT;\n')).toBe(true);
  expect(sql).toContain('Measurement upgrade already applied; verified postimage, no writes');
  for(const guard of ['PREIMAGE_DRIFT','POSTIMAGE','OLD_PAYLOAD_CHANGED','ACTIVE_LINK_DRIFT','ID_CONFLICT','PRESERVATION_FAILED','PRIVATE_DATA_CHANGED']) expect(sql).toContain('MEASUREMENT_UPGRADE_'+guard);
  for(const table of ['recipe_nutrition_snapshots','recipe_content_snapshots','meals','meal_log_entries','ingredient_ai_nutrition_settings','ingredient_ai_nutrition_jobs']) expect(sql).toContain(table);
  expect(sql).not.toContain('__PRIVATE_REVIEWER__');
  expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE) public\.(recipes|recipe_ingredients|nutrition_values|ingredient_synonyms)/);
 });
});
