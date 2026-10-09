import { createHash } from 'node:crypto';
import planJson from '../docs/engineering/data/nutrition-completion-batch-20261010.json';
import { describe, expect, it } from 'vitest';
import { renderCompletionSql, validateCompletionPlan } from '../scripts/render-nutrition-completion-batch.mjs';
const original = planJson;
const reviewer = '11111111-1111-4111-8111-111111111111';
function mutated(change: (p: typeof original) => void) {
  const p = structuredClone(original);
  change(p);
  const { operation_checksum: ignored, ...body } = p; void ignored;
  p.operation_checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return p;
}
describe('reviewed nutrition completion batch', () => {
  it('validates the 11 reviewed ingredient decisions', () => {
    expect(validateCompletionPlan(original)).toBe(original);
    expect(original.counts).toMatchObject({targets:11,new_profiles:8,new_values:64,superseded_links:2});
  });
  it('rejects unreviewed plan drift', () => {
    const p=structuredClone(original);p.policy.history_immutable=false;
    expect(()=>validateCompletionPlan(p)).toThrow('COMPLETION_CHECKSUM');
  });
  it('requires a private reviewer and never ships a real reviewer in the plan', () => {
    expect(()=>renderCompletionSql(original)).toThrow('COMPLETION_REVIEWER_REQUIRED');
    expect(()=>renderCompletionSql(original,{reviewedBy:"');DROP TABLE users;--"})).toThrow('COMPLETION_REVIEWER_REQUIRED');
    for(const op of original.inserts) if(op.row.reviewed_by) expect(op.row.reviewed_by).toBe('__PRIVATE_REVIEWER__');
  });
  it('preserves the six unreported label fiber cells as missing', () => {
    const missing=original.inserts.filter((op)=>op.table==='nutrition_values'&&op.row.amount===null);
    expect(missing).toHaveLength(6);
    for(const op of missing) expect(op.row).toMatchObject({nutrient_code:'fiber_g',value_status:'missing'});
    expect(()=>validateCompletionPlan(mutated(p=>{const op=p.inserts.find((o)=>o.table==='nutrition_values'&&o.row.amount===null)!;op.row.amount=0;op.row.value_status='observed';}))).toThrow('COMPLETION_VALUES_SCOPE');
  });
  it('does not directly bind a product profile to a generic ingredient', () => {
    const p=mutated(p=>{const d=p.decisions.find((d)=>d.name==='다크 커버춰')!;d.profile_id=d.source_evidence.source_profile_id!;});
    expect(()=>validateCompletionPlan(p)).toThrow('COMPLETION_PRODUCT_DIRECT_LINK');
  });
  it('copies each product profile whole without blending another source or label version', () => {
    const p=mutated(p=>{const d=p.decisions.find((d)=>d.name==='다크 커버춰')!;const v=p.inserts.find((o)=>o.table==='nutrition_values'&&o.row.profile_id===d.profile_id&&o.row.nutrient_code==='energy_kcal')!;v.row.amount=550;});
    expect(()=>validateCompletionPlan(p)).toThrow('COMPLETION_MIXED_PROFILE');
  });
  it('retains the vanilla 100ml basis rather than assuming ml equals g', () => {
    const d=original.decisions.find((d)=>d.name==='바닐라 페이스트')!;
    expect(original.inserts.find((o)=>o.table==='nutrition_profiles'&&o.row.id===d.profile_id)!.row.basis_unit).toBe('ml');
    expect(()=>validateCompletionPlan(mutated(p=>{p.inserts.find((o)=>o.table==='nutrition_profiles'&&o.row.id===d.profile_id)!.row.basis_unit='g';}))).toThrow('COMPLETION_BASIS');
  });
  it('rejects changed denominator amounts even when the unit is preserved', () => {
    const d=original.decisions.find((d)=>d.name==='바닐라 페이스트')!;
    expect(()=>validateCompletionPlan(mutated(p=>{p.inserts.find((o)=>o.table==='nutrition_profiles'&&o.row.id===d.profile_id)!.row.basis_amount=1;}))).toThrow('COMPLETION_BASIS');
  });
  it('uses the real UTC review instant for new rows', () => {
    for(const op of original.inserts) {
      if(op.row.created_at) expect(op.row.created_at).toBe('2026-10-09T22:40:00+00:00');
      if(op.row.reviewed_at) expect(op.row.reviewed_at).toBe('2026-10-09T22:40:00+00:00');
    }
  });
  it('supersedes only two ingredient links while leaving original source values intact', () => {
    const links=original.updates.filter((op)=>op.table==='ingredient_nutrition_profiles');
    expect(links).toHaveLength(2);
    for(const op of links) expect(op.after).toMatchObject({is_active:false,is_primary:false,review_status:'superseded'});
    expect(()=>validateCompletionPlan(mutated(p=>{p.updates[0].table='nutrition_values';}))).toThrow('COMPLETION_IMMUTABLE_SOURCE');
  });
  it('uses full official USDA profiles, not individual replacement cells', () => {
    for(const name of ['통밀 식빵','그릭 요거트']) {
      const d=original.decisions.find((d)=>d.name===name)!;
      const values=original.inserts.filter((op)=>op.table==='nutrition_values'&&op.row.profile_id===d.profile_id);
      expect(values).toHaveLength(8);
      for(const v of values) expect(v.row.amount).toBe(d.source_evidence.raw_row!.values[v.row.nutrient_code as keyof NonNullable<typeof d.source_evidence.raw_row>["values"]].amount);
    }
  });
  it('keeps unresolved food identities explicit without zero filling them', () => {
    for(const name of ['알룰로스','화이트크림','김치국물','해물육수코인','신김치']) expect(original.holds.some((d)=>d.name===name)).toBe(true);
    expect(original.policy.automatic_ai_enabled).toBe(false);
  });
  it('renders narrow preimage checks, preservation assertions and verified idempotence', () => {
    const sql=renderCompletionSql(original,{reviewedBy:reviewer});
    expect(sql).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links',0))");
    expect(sql).toContain('public.ingredient_conversion_assignments IN SHARE ROW EXCLUSIVE MODE');
    expect(sql).toContain('COMPLETION_SOURCE_DRIFT');
    expect(sql).toContain('COMPLETION_LINK_DRIFT');
    expect(sql).toContain('COMPLETION_PRESERVATION_FAILED');
    expect(sql).toContain('Completion already applied; verified postimage, no writes');
    expect(sql).toContain('public.recipe_nutrition_snapshots');
    expect(sql).toContain('public.recipe_content_snapshots');
    expect(sql).not.toContain('__PRIVATE_REVIEWER__');
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) public\.(?:nutrition_values|nutrition_profiles|nutrition_source_items|recipes|recipe_ingredients|recipe_nutrition_snapshots)/);
    expect(sql.indexOf('is_active=(SELECT is_active')).toBeLessThan(sql.indexOf('INSERT INTO public.ingredient_nutrition_profiles'));
  });
  it('rejects identifier injection and writes beyond allowed columns', () => {
    expect(()=>validateCompletionPlan(mutated(p=>{Object.assign(p.updates[0].key,{"id) OR true;--":"x"});}))).toThrow('COMPLETION_KEY');
    expect(()=>validateCompletionPlan(mutated(p=>{Object.assign(p.updates.find((o)=>o.table==='ingredient_catalog_entries')!.after,{presentation:'excluded'});}))).toThrow('COMPLETION_UPDATE_SCOPE');
  });
});
