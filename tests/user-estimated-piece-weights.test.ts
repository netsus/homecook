import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estimatedPieceRows, renderUserEstimatedPieceWeights } from '../scripts/render-user-estimated-piece-weights.mjs';

const reviewer = '11111111-1111-4111-8111-111111111111';
const plan = () => JSON.parse(readFileSync(new URL('../docs/engineering/data/user-estimated-piece-weights-20261010.json', import.meta.url), 'utf8'));

describe('user-approved estimated piece weight supplement', () => {
  it('keeps official nutrition intact and appends one estimate source with three paired measurements', () => {
    const { rows } = estimatedPieceRows(reviewer);
    expect(rows.map(([table]) => table)).toEqual(['nutrition_sources', 'measurement_source_evidence', 'piece_unit_weights', 'measurement_source_evidence', 'piece_unit_weights', 'measurement_source_evidence', 'piece_unit_weights']);
    expect(rows[0][1]).toMatchObject({ provider_code: 'HOMECOOK_USER_STANDARD', source_kind: 'measurement_reference' });
    for (const [, row] of rows) {
      expect(row.reviewed_by).toBe(reviewer);
      expect(row.review_status).toBe('approved');
      expect(row.decision_reason).toContain('사용자');
    }
  });
  it('stores unit-safe one-piece observations matching runtime weight precision', () => {
    const { rows } = estimatedPieceRows(reviewer);
    const evidence = rows.filter(([table]) => table === 'measurement_source_evidence').map(([, row]) => row);
    expect(evidence.map(row => [row.source_observed_unit, row.source_observed_amount, row.observed_weight_g])).toEqual([['장', 1, 0.5], ['장', 1, 1], ['알', 1, 0.067]]);
    for (const e of evidence) {
      const piece = rows.find(([table, row]) => table === 'piece_unit_weights' && row.evidence_id === e.id)?.[1];
      expect(piece?.weight_g).toBe(e.observed_weight_g);
      expect(piece?.preparation_state).toBe('as_published');
    }
    expect(3 * evidence[2].observed_weight_g).toBeCloseTo(0.201);
  });
  it('preserves original range and multi-piece approximation instead of fabricating official measurement', () => {
    const { data } = estimatedPieceRows(reviewer);
    expect(data.items[1].original_user_report).toMatchObject({ amount: 10, weight_range_g: [7, 10], approximate_weight_g: 10 });
    expect(data.items[2].original_user_report).toMatchObject({ amount: 3, approximate_weight_g: 0.2 });
    expect(data.items[2].decision_reason).toContain('0.201g');
    expect(data.policy.garlic_pending_original_review).toBe(true);
  });
  it.each(['invalid', "11111111-1111-4111-8111-11111111111'", '__PRIVATE_REVIEWER_UUID__'])('rejects invalid/private-unresolved reviewer %s', value => {
    expect(() => renderUserEstimatedPieceWeights(value)).toThrow('Reviewer UUID required');
  });
  it.each(['weight', 'unit', 'amount', 'provider', 'original'])('rejects changes outside the approved estimate: %s', mutation => {
    const data = plan();
    if (mutation === 'weight') data.items[2].weight_g = 0.2;
    if (mutation === 'unit') data.items[0].observed_unit = '개';
    if (mutation === 'amount') data.items[2].observed_amount = 3;
    if (mutation === 'provider') data.source.provider_code = 'RDA_10_4';
    if (mutation === 'original') data.items[1].original_user_report.weight_range_g = [10, 10];
    expect(() => estimatedPieceRows(reviewer, data)).toThrow();
  });
  it('renders an offline transaction with identity guards, exact idempotence and preservation', () => {
    const sql = renderUserEstimatedPieceWeights(reviewer);
    expect(sql).toMatch(/^BEGIN ISOLATION LEVEL REPEATABLE READ;/);
    expect(sql).toContain('PIECE_ALREADY_ASSIGNED');
    expect(sql).toContain('NUTRITION_IDENTITY_CHANGED');
    expect(sql.match(/INSERT INTO public\./g)).toHaveLength(7);
    expect(sql.match(/ON CONFLICT\(id\) DO NOTHING/g)).toHaveLength(7);
    expect(sql).toContain('ESTIMATE_PREIMAGE_MISMATCH');
    expect(sql).toContain('ESTIMATE_POSTIMAGE_MISMATCH');
    expect(sql).toContain('PROTECTED_DATA_CHANGED');
    expect(sql).toContain('public.recipe_nutrition_snapshots');
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM|TRUNCATE) public\./);
    expect(sql.trim()).toMatch(/COMMIT;$/);
  });
});
