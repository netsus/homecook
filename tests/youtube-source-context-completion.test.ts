import { describe, expect, it } from 'vitest';
import { prepareStepGroundingEvidence, verifiedSteps, augmentTextFirstOcrCandidates, assessTextCoverage } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/text-first-source-routing.mjs';
import { buildSinglePassEvidenceLedger } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs';
import { validateSourceAnchoredResult } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs';

describe('bounded original source context completion', () => {
  const ledger = [
    { id: 'S1', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 0, timestampSec: 10, text: '[00:10] 소스를 잘' },
    { id: 'S2', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 1, timestampSec: 12, text: '[00:12] 섞어서 두 시간 재운다' },
    { id: 'S3', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 2, timestampSec: 14, text: '[00:14] 약불에서 끓인다' },
    { id: 'S4', kind: 'text', source_method: 'caption', source_block_index: 2, line_index: 3, timestampSec: 15, text: '[다른 요리]' },
  ];
  const raw = { recipes: [{ steps: ['소스를 잘 섞어서 2시간 재운다.'], stepEvidence: [{ stepIndex: 0,
    evidence: [{ id: 'S2', quote: '소스를 잘 섞어서 두 시간 재운다' }] }] }] };
  it('repairs a split or rewritten caption citation from original IDs and still requires judgment', () => {
    const original = structuredClone(raw);
    const { proposal, repairs } = prepareStepGroundingEvidence(raw, ledger);
    expect(raw).toEqual(original);
    expect(proposal.recipes[0].stepEvidence[0].evidence).toEqual([
      { id: 'S1', quote: '소스를 잘' }, { id: 'S2', quote: '섞어서 두 시간 재운다' }, { id: 'S3', quote: '약불에서 끓인다' },
    ]);
    expect(repairs).toHaveLength(1);
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true })).toEqual([]);
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true, groundedStepIndexes: [0] })).toHaveLength(1);
  });
  it('does not accept a changed numeric claim or an unseen source ID', () => {
    const proposal = prepareStepGroundingEvidence(raw, ledger).proposal;
    proposal.recipes[0].steps[0] = '소스를 잘 섞어서 20시간 재운다.';
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true, groundedStepIndexes: [0] })).toEqual([]);
    const missing = structuredClone(raw); missing.recipes[0].stepEvidence[0].evidence[0].id = 'missing';
    expect(verifiedSteps(prepareStepGroundingEvidence(missing,ledger).proposal,ledger,{groundedStepIndexes:[0]})).toEqual([]);
  });
  it('preserves already selected OCR images and includes omitted short transition frames within its cap', () => {
    const frames = [0,1,1.5,2,3].map((timestampSec) => ({ path: '/tmp/f'+timestampSec, timestampSec }));
    const result = augmentTextFirstOcrCandidates([frames[0],frames[4]],frames,5);
    expect(result.map((frame) => frame.path)).toEqual(frames.map((frame) => frame.path));
    expect(augmentTextFirstOcrCandidates([frames[0],frames[4]],frames,3)).toHaveLength(3);
    const extractorFrames = frames.map(({ path, timestampSec }) => ({ path, timestamp_sec: timestampSec }));
    expect(augmentTextFirstOcrCandidates([frames[0],frames[4]],extractorFrames,5).map((frame) => frame.path)).toEqual(frames.map((frame) => frame.path));
  });
});

describe('closed source quantities remain independent of model uncertainty', () => {
  function run(source: string, ingredients: object[], ocr: object[] = []) {
    const ledger = buildSinglePassEvidenceLedger({ sourceText: source, sourceAnchored: true });
    ledger.push(...ocr);
    return validateSourceAnchoredResult({ recipes: [{ title: '요리', ingredients, steps: [] }] },ledger,{ preferSpokenQuantities: true });
  }
  const row = (name: string) => ({ sourceName: name, name, amount: null, unit: null, quantityState: 'conflicting', optional: false,
    evidence: [{ id: 'S0001', quote: '된장과 고추장을 반 컵씩 넣어 줘' }] });
  it('recovers each named shared quantity without converting an observed metric alternative', () => {
    const result = run('[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘',[row('된장'),row('고추장')]);
    expect(result.json.recipes[0].ingredients.map((item: {amount: string; unit: string}) => [item.amount,item.unit])).toEqual([['1/2','컵'],['1/2','컵']]);
  });
  it('keeps contradictory caption quantities unresolved', () => {
    const result = run('[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘\n[00:02] 된장과 고추장을 한 컵씩 넣어 줘',[row('된장')]);
    expect(result.json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not override a closed authored quantity with a spoken one', () => {
    const source = '[SOURCE: description]\n[재료]\n된장 20g\n소금 2g\n[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘';
    const result = run(source,[{...row('된장'),evidence:[{id:'S0002',quote:'된장 20g'}]}]);
    expect(result.json.recipes[0].ingredients[0]).toMatchObject({amount:'20',unit:'g'});
  });
  it('joins a missing prepared noun only to a nearby OCR noun with the same explicit count', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 크게 한 숟가락 넣고';
    const ocr = { id: 'O1', kind: 'ocr', source_method: 'visual', source_provider: 'macos-vision-ocr', text: '다진양파 1', timestampSec: 11 };
    const result = run(source,[],[ocr]);
    expect(result.json.recipes[0].ingredients).toMatchObject([{originalName:'다진양파',amount:'1',unit:'숟가락',amountRawText:'크게 한 숟가락'}]);
    expect(run(source,[],[{...ocr,text:'다진양파 2'}]).json.recipes[0].ingredients).toEqual([]);
    expect(run(source,[],[{...ocr,timestampSec:20}]).json.recipes[0].ingredients).toEqual([]);
    expect(run(source.replace('넣고','넣지 마세요'),[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it('refuses competing OCR noun identities for the same missing clause', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고';
    const ocr = { id: 'O1', kind: 'ocr', source_method: 'visual', source_provider: 'macos-vision-ocr', text: '다진양파 1', timestampSec: 11 };
    expect(run(source,[],[ocr,{...ocr,id:'O2',text:'다진생강 1'}]).json.recipes[0].ingredients).toEqual([]);
  });
  it('recovers a literal metric pair without estimating a count or converting units', () => {
    const source = '[SOURCE: description]\n[재료]\n호박 큰거 반개 120g';
    const raw = {sourceName:'호박',name:'호박',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'호박 큰거 반개 120g'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:'120',unit:'g'});
    expect(run(source.replace('120g','120g~'),[raw]).json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not borrow a metric amount from a different use role', () => {
    const source = '[SOURCE: description]\n[소스]\n맛술을 넣는다.\n[양념]\n맛술 40ml';
    const raw = {sourceName:'맛술',name:'맛술',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'맛술을 넣는다.'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:null,groupLabel:'소스'});
  });
  it('retains a written procedure even when the model paraphrases its sentences', () => {
    const source = '[SOURCE: description]\n[재료]\n호박 1개\n[만드는 방법]\n1. 호박을 썰어주세요.\n2. 호박을 볶으면 완성이에요.\n#홍보\n구독해주세요';
    const ledger = buildSinglePassEvidenceLedger({sourceText:source,sourceAnchored:true});
    const raw = {recipes:[{title:'호박요리',ingredients:[{sourceName:'호박',name:'호박',amount:'1',unit:'개',quantityState:'explicit',optional:false,evidence:[{id:'S0002',quote:'호박 1개'}]}],
      steps:['호박을 잘라서 익힌다.'],stepEvidence:[{stepIndex:0,evidence:[{id:'S0004',quote:'1. 호박을 썰어주세요.'}]}],ingredientsComplete:true,stepsComplete:true}]};
    const checked = validateSourceAnchoredResult(raw,ledger);
    const coverage = assessTextCoverage(raw,checked,ledger,{description:{status:'present'},authorComments:{status:'empty'}});
    expect(coverage.stepsComplete).toBe(true);
    expect(coverage.steps.map((step: {text:string}) => step.text)).toEqual(['1. 호박을 썰어주세요.','2. 호박을 볶으면 완성이에요.']);
    const unfinished = ledger.map((entry: {text:string}) => ({...entry,text:entry.text.replace('2. 호박을 볶으면 완성이에요.','다음 편에서 호박을 볶아 완성할 예정입니다.')}));
    expect(assessTextCoverage({...raw,recipes:[{...raw.recipes[0],stepsComplete:false}]},checked,unfinished,
      {description:{status:'present'},authorComments:{status:'empty'}}).stepsComplete).toBe(false);
  });
  it('restores only a literal vague quantity, leaving unspecified use unknown', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 들기름\n[00:12] 조금 넣고 마무리해 줘';
    const raw = {sourceName:'들기름',name:'들기름',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'조금 넣고 마무리해 줘'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:null,unit:null,quantityState:'to_taste',amountRawText:'조금'});
    expect(run(source.replace('조금 ',''),[{...raw,evidence:[{id:'S0002',quote:'넣고 마무리해 줘'}]}]).json.recipes[0].ingredients[0].quantityState).toBe('unknown');
  });
  it('does not borrow a similar ingredient name from a following qualitative clause', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 오일을 두르고\n[00:12] 고추오일 조금 넣어 줘';
    const raw = {sourceName:'오일',name:'오일',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0001',quote:'오일을 두르고'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0].quantityState).toBe('unknown');
  });
  it.each(['다진양파는 넣지 않습니다.', '다진양파 약간', '다진양파는 선택입니다.'])('does not bypass an authored instruction: %s', (instruction) => {
    const source = '[SOURCE: description]\n'+instruction+'\n[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고';
    const ocr = { id:'O1',kind:'ocr',source_method:'visual',source_provider:'macos-vision-ocr',text:'다진양파 1',timestampSec:11 };
    expect(run(source,[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it('refuses a restored noun when another named caption contradicts its quantity', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고\n[00:12] 다진양파 두 숟가락 넣는다';
    const ocr = {id:'O1',kind:'ocr',source_method:'visual',source_provider:'macos-vision-ocr',text:'다진양파 1',timestampSec:11};
    expect(run(source,[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it.each(['된장은 넣지 않습니다.', '된장 약간'])('does not promote a caption quantity over authored %s', (instruction) => {
    const source = '[SOURCE: description]\n'+instruction+'\n[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘';
    const result = run(source,[row('된장')]);
    expect(result.json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not hide malformed or multi-recipe proposals while selecting spoken quantities', () => {
    const ledger = buildSinglePassEvidenceLedger({ sourceText:'[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘',sourceAnchored:true });
    const recipe = {title:'요리',ingredients:[row('된장')],steps:[]};
    expect(() => validateSourceAnchoredResult({recipes:[recipe,recipe]},ledger,{preferSpokenQuantities:true})).toThrow();
    expect(() => validateSourceAnchoredResult({recipes:[{...recipe,ingredients:[{...row('된장'),evidence:[]}]}]},ledger,{preferSpokenQuantities:true})).toThrow();
  });
});
