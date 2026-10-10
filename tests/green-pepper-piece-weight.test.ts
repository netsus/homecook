import { describe, expect, it } from 'vitest';
import { greenPepperRows, renderGreenPepperPieceWeight } from '../scripts/render-green-pepper-piece-weight.mjs';
const reviewer='11111111-1111-4111-8111-111111111111';
describe('official-recipe-based green pepper service weight',()=>{
  it('uses the quoted 15 g per piece only for the generic raw-green-pepper representative',()=>{
    const {data,rows}=greenPepperRows(reviewer);
    expect(data.source.quoted_excerpt).toBe('풋고추 15g(1 개)');
    expect(data.source.published_date).toBe('2022-09-13');
    expect(rows[0]).toEqual(['nutrition_sources', expect.objectContaining({
      provider_code: 'HOMECOOK_USER_STANDARD', dataset_name: expect.stringContaining('공식 레시피 기반 서비스 대표 중량'),
    })]);
    expect(rows[2]).toEqual(['piece_unit_weights', expect.objectContaining({
      ingredient_id: 'a12cd429-b500-42d2-ac17-e53123f7356a', weight_g: 15,
    })]);
    expect(rows[1]).toEqual(['measurement_source_evidence', expect.objectContaining({
      source_observed_amount: 1, source_observed_unit: '개',
    })]);
    expect(data.source.decision_reason).toContain('국가 평균이나 실측 중간 크기 중량이라고 주장하지 않는다');
  });
  it('rejects missing reviewer and guards exact existing nutrition and replay identity',()=>{
    expect(()=>renderGreenPepperPieceWeight('')).toThrow('Reviewer UUID required');
    const sql=renderGreenPepperPieceWeight(reviewer);
    expect(sql).toContain('PEPPER_NUTRITION_CHANGED');
    expect(sql).toContain('PIECE_ALREADY_ASSIGNED');
    expect(sql).toContain('PEPPER_PREIMAGE_MISMATCH');
    expect(sql).toContain('PEPPER_POSTIMAGE_MISMATCH');
    expect(sql).toContain('PEPPER_PROTECTED_DATA_CHANGED');
    expect(sql.match(/INSERT INTO public\./g)).toHaveLength(3);
    expect(sql).not.toMatch(/UPDATE public\.|DELETE FROM public\./);
  });
});
