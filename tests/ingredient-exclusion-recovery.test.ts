import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_PLAN, renderRecoverySql, validateRecoveryPlan } from '../scripts/render-ingredient-exclusion-recovery.mjs';
const original = JSON.parse(readFileSync(DEFAULT_PLAN, 'utf8'));
const reviewer = { reviewedBy: '00000000-0000-4000-8000-000000000001' };
const copy = () => structuredClone(original);
const checksum = (p: Record<string, unknown>) => {
  delete p.operation_checksum;
  p.operation_checksum = createHash('sha256').update(JSON.stringify(p)).digest('hex');
  return p;
};
describe('reviewed ingredient exclusion recovery', () => {
  it('preserves different raw/cooked identities and only renames four verified plants', () => {
    expect(validateRecoveryPlan(original)).toBe(original);
    expect(original.updates.filter((x: { table: string }) => x.table === 'ingredients').map((x: { after: { standard_name: string } }) => x.after.standard_name).sort()).toEqual(['구기자 잎', '나메코 버섯', '생 구기자 열매', '전호나물'].sort());
    expect(original.updates.filter((x: { table: string }) => x.table === 'ingredient_catalog_entries')).toHaveLength(5);
  });
  it('adds exact official rib and leaf values while preserving three unpublished nutrients as missing', () => {
    const items = original.inserts.filter((x: { table: string }) => x.table === 'nutrition_source_items').map((x: { row: Record<string, unknown> }) => x.row);
    expect(items.map((x: { external_item_key: string }) => x.external_item_key).sort()).toEqual(['1714', '818']);
    const values = original.inserts.filter((x: { table: string }) => x.table === 'nutrition_values').map((x: { row: Record<string, unknown> }) => x.row);
    expect(values.filter((x: { amount: number | null }) => x.amount === null).map((x: { nutrient_code: string; value_status: string }) => [x.nutrient_code, x.value_status]).sort()).toEqual([['fiber_g', 'missing'], ['saturated_fat_g', 'missing'], ['sugars_g', 'missing']]);
  });
  it('removes misleading single aliases and keeps hamcho ambiguous between growing conditions', () => {
    expect(original.deletes.map((x: { row: { synonym: string } }) => x.row.synonym).sort()).toEqual(['앞다리', '등갈비', '돼지고기, 삼겹살(등갈비), 생것', '돼지고기, 목심, 삶은것', '함초', '함초'].sort());
    expect(original.preserved_hamcho_aliases).toHaveLength(2);
    expect(original.inserts.filter((x: { table: string; row: { synonym?: string } }) => x.table === 'ingredient_synonyms').some((x: { row: { synonym: string } }) => ['구기자', '참당귀', '앞다리', '수육용', '팽이버섯'].includes(x.row.synonym))).toBe(false);
  });
  it('fails on altered payload before emitting SQL', () => {
    const p = copy(); p.inserts[0].row.synonym = 'wrong';
    expect(() => renderRecoverySql(p, reviewer)).toThrow('RECOVERY_PLAN_CHECKSUM');
  });
  it('rejects attempts to alter old immutable nutrition even with a recomputed checksum', () => {
    const p = copy(); p.updates[0].table = 'nutrition_values';
    expect(() => renderRecoverySql(checksum(p), reviewer)).toThrow('RECOVERY_IMMUTABLE_DATA');
  });
  it('rejects identity changes and missing-to-zero substitutions', () => {
    const p = copy(); p.updates.find((x: { table: string }) => x.table === 'ingredients').after.id = 'wrong';
    expect(() => renderRecoverySql(checksum(p), reviewer)).toThrow('RECOVERY_IDENTITY_CHANGED');
    const q = copy(); q.inserts.find((x: { table: string; row: { amount?: number | null } }) => x.table === 'nutrition_values' && x.row.amount === null).row.amount = 0;
    expect(() => renderRecoverySql(checksum(q), reviewer)).toThrow('RECOVERY_NUTRIENT_SCOPE');
  });
  it('requires a private reviewer and orders source aliases before approved links', () => {
    expect(original.reviewed_by).toBe('__PRIVATE_REVIEWER__');
    expect(() => renderRecoverySql(original)).toThrow('RECOVERY_REVIEWER_REQUIRED');
    const sql = renderRecoverySql(original, reviewer);
    expect(sql.lastIndexOf('INSERT INTO public.ingredient_synonyms')).toBeLessThan(sql.indexOf('INSERT INTO public.ingredient_nutrition_profiles'));
    expect(sql).toContain('RECOVERY_OLD_RELATION_CHANGED');
  });
  it('uses guarded atomic SQL and verifies postimages on repeated runs', () => {
    const sql = renderRecoverySql(original, reviewer);
    expect(sql).toContain('BEGIN ISOLATION LEVEL READ COMMITTED;');
    expect(sql).toContain('RECOVERY_SOURCE_DRIFT');
    expect(sql).toContain('RECOVERY_PRESERVATION_FAILED');
    expect(sql).toContain('Recovery already applied; verified postimage, no writes');
    expect(sql).toContain('set_account_generation_internal_writer_marker(v_cutover,true)');
    expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role|UPDATE public\.nutrition_|DELETE FROM public\.(ingredients|nutrition_)/);
  });
  it('restricts automatic queue cleanup to the two new officially linked ingredients', () => {
    const expected = ['89b15f30-81cd-587a-abd7-301bf93661b5', 'd75a9492-4964-5a2f-a576-287511f07e4a'];
    expect(original.ai_job_cleanup.ingredient_ids).toEqual(expected);
    for (const field of ['ingredient_ids', 'reason', 'from_status', 'to_status', 'expected_attempt_count', 'preserve_existing_jobs']) {
      const plan=copy(); plan.ai_job_cleanup[field]=field==='ingredient_ids' ? [reviewer.reviewedBy] : 'changed';
      expect(() => renderRecoverySql(checksum(plan),reviewer)).toThrow('RECOVERY_AI_JOB_SCOPE');
    }
    const absent=copy(); delete absent.ai_job_cleanup;
    expect(() => renderRecoverySql(checksum(absent),reviewer)).toThrow('RECOVERY_AI_JOB_SCOPE');
  });
  it('checks official primary nutrition before skipping untouched new jobs and preserves all previous jobs', () => {
    const sql=renderRecoverySql(original,reviewer);
    const update="UPDATE private.ingredient_ai_nutrition_jobs SET status='skipped', last_error_code='NON_AI_PRIMARY_EXISTS'";
    expect(sql).toContain(update);
    expect(sql.indexOf(update)).toBeGreaterThan(sql.lastIndexOf('INSERT INTO public.ingredient_nutrition_profiles'));
    expect(sql).toContain("private.ingredient_ai_nutrition_skip_reason(ingredient_id) IS DISTINCT FROM 'NON_AI_PRIMARY_EXISTS'");
    expect(sql).toContain("AND status='queued' AND attempt_count=0");
    expect(sql).toContain('RECOVERY_AI_JOB_PREEXISTS');
    expect(sql).toContain('RECOVERY_EXISTING_AI_JOBS_CHANGED');
    expect(sql).toContain('RECOVERY_AI_SETTINGS_DRIFT');
    expect(sql).toContain('lease_token IS NOT NULL');
    expect(sql).not.toContain('DELETE FROM private.ingredient_ai_nutrition_jobs');
    expect(sql).not.toContain('UPDATE private.ingredient_ai_nutrition_settings');
    expect(sql).not.toContain('DISABLE TRIGGER');
  });

});
